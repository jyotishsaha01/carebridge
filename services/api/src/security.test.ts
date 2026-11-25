import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { registerSecurity, serializeRequestForLog, parseTrustedProxyCidrs } from "./security";

const apps: ReturnType<typeof Fastify>[] = [];
function createApp() {
  const app = Fastify();
  registerSecurity(app, ["https://app.carebridge.example"]);
  apps.push(app);
  return app;
}
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); vi.unstubAllEnvs(); });

describe("API transport protections", () => {
  it("rejects a cross-origin mutation before executing its handler", async () => {
    const app = createApp();
    const mutate = vi.fn(() => ({ ok: true }));
    app.post("/v1/profile", mutate);
    expect((await app.inject({ method: "POST", url: "/v1/profile", headers: { origin: "https://attacker.example" } })).statusCode).toBe(403);
    expect(mutate).not.toHaveBeenCalled();
    expect((await app.inject({ method: "POST", url: "/v1/profile", headers: { origin: "https://app.carebridge.example" } })).statusCode).toBe(200);
  });

  it("requires an Origin for cookie-authenticated production mutations", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const app = createApp();
    app.post("/v1/profile", () => ({ ok: true }));
    const response = await app.inject({ method: "POST", url: "/v1/profile", headers: { cookie: "carebridge_session=example" } });
    expect(response.statusCode).toBe(403);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["strict-transport-security"]).toContain("max-age=");
  });

  it("returns 400 for invalid input without echoing the supplied patient data", async () => {
    const app = createApp();
    app.post("/v1/example", (request) => z.object({ email: z.string().email() }).parse(request.body));
    const response = await app.inject({ method: "POST", url: "/v1/example", payload: { email: "sensitive-patient-input" } });
    expect(response.statusCode).toBe(400);
    expect(response.json().issues[0].path).toBe("email");
    expect(response.body).not.toContain("sensitive-patient-input");
  });

  it("never returns database errors or secrets to the caller", async () => {
    const app = createApp();
    app.get("/v1/example", () => { throw new Error("postgres://secret-password patient-chart"); });
    const response = await app.inject("/v1/example");
    expect(response.statusCode).toBe(500);
    expect(response.json().requestId).toBeTruthy();
    expect(response.body).not.toContain("secret-password");
    expect(response.body).not.toContain("patient-chart");
  });

  it("limits repeated authentication attempts and provides a retry delay", async () => {
    const app = createApp();
    const login = vi.fn(() => ({ ok: true }));
    app.post("/v1/auth/login", login);
    for (let i = 0; i < 30; i++) expect((await app.inject({ method: "POST", url: "/v1/auth/login" })).statusCode).toBe(200);
    const response = await app.inject({ method: "POST", url: "/v1/auth/login" });
    expect(response.statusCode).toBe(429);
    expect(Number(response.headers["retry-after"])).toBeGreaterThan(0);
    expect(login).toHaveBeenCalledTimes(30);
  });
  it("applies one authentication limit to every encoded spelling of the matched route", async () => {
    const app = createApp();
    const login = vi.fn(() => ({ ok: true }));
    app.post("/v1/auth/login", login);
    const urls = ["/v1/auth/login", "/v1/auth/%6cogin", "/v1/%61uth/login", "/%761/auth/login"];
    for (let i = 0; i < 30; i++) {
      expect((await app.inject({ method: "POST", url: urls[i % urls.length] })).statusCode).toBe(200);
    }
    for (const url of urls) expect((await app.inject({ method: "POST", url })).statusCode).toBe(429);
    expect(login).toHaveBeenCalledTimes(30);
  });

  it("records route templates rather than patient identifiers, tokens or raw URLs", async () => {
    const records: string[] = [];
    const app = Fastify({ logger: { stream: { write(record: string) { records.push(record); } }, serializers: { req: serializeRequestForLog } } });
    apps.push(app);
    registerSecurity(app, ["https://app.carebridge.example"]);
    app.get("/v1/documents/:id/content", () => ({ ok: true }));
    await app.inject("/v1/documents/sensitive-patient-document-id/content?token=private-reset-token");
    await app.inject("/unmatched/sensitive-resource-id?token=another-private-token");
    const output = records.join("");
    expect(output).toContain("/v1/documents/:id/content");
    expect(output).not.toContain("sensitive-patient-document-id");
    expect(output).not.toContain("private-reset-token");
    expect(output).not.toContain("sensitive-resource-id");
    expect(output).not.toContain("another-private-token");
  });

  it("ignores forged forwarding headers by default and trusts only the configured proxy network", async () => {
    const untrusted = Fastify({ trustProxy: parseTrustedProxyCidrs() }); apps.push(untrusted);
    const configured = Fastify({ trustProxy: parseTrustedProxyCidrs("10.10.0.0/24,2001:db8:1234::/48") }); apps.push(configured);
    for (const app of [untrusted, configured]) app.get("/ip", (request) => ({ ip: request.ip }));
    const options = { url: "/ip", remoteAddress: "10.10.0.7", headers: { "x-forwarded-for": "198.51.100.8" } };
    expect((await untrusted.inject(options)).json().ip).toBe("10.10.0.7");
    expect((await configured.inject(options)).json().ip).toBe("198.51.100.8");
    expect((await configured.inject({ ...options, remoteAddress: "203.0.113.9" })).json().ip).toBe("203.0.113.9");
  });

  it("rejects trust-all proxy values, hostnames, invalid masks and wildcard addresses", () => {
    for (const value of ["true", "*", "0.0.0.0/0", "::/0", "proxy.example.com", "10.10.0.1/33", "::1/129", "10.10.0.1,", "10.10.0.1/-1", "10.10.0.1/24/1"]) {
      expect(() => parseTrustedProxyCidrs(value)).toThrow("TRUSTED_PROXY_CIDRS");
    }
    expect(parseTrustedProxyCidrs("127.0.0.1, ::1/128")).toEqual(["127.0.0.1", "::1/128"]);
  });

  it("preserves an active authentication limit when the source-address table fills", async () => {
    const app = createApp();
    app.post("/v1/auth/login", () => ({ ok: true }));
    const target = { method: "POST" as const, url: "/v1/auth/login", remoteAddress: "198.51.100.200" };
    for (let i = 0; i < 30; i++) await app.inject(target);
    expect((await app.inject(target)).statusCode).toBe(429);
    for (let i = 0; i < 10_000; i++) {
      await app.inject({ method: "POST", url: "/v1/auth/login", remoteAddress: `192.0.${Math.floor(i / 256)}.${i % 256}` });
    }
    expect((await app.inject(target)).statusCode).toBe(429);
  }, 15_000);

  it("does not treat a third-party error's code string as an authenticated account-change assertion", async () => {
    const app = createApp();
    app.get("/external-error", () => { throw Object.assign(new Error("sensitive provider detail"), { code: "ACCOUNT_CHANGED" }); });
    const response = await app.inject("/external-error");
    expect(response.statusCode).toBe(500);
    expect(response.json().code).toBeUndefined();
    expect(response.body).not.toContain("sensitive provider detail");
  });

});
