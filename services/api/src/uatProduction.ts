import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

if (process.env.NODE_ENV !== "test" || !process.env.CAREBRIDGE_UAT_PASSWORD) throw new Error("Production-mode smoke requires synthetic NODE_ENV=test fixtures and CAREBRIDGE_UAT_PASSWORD");
const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname)) throw new Error("Production-mode smoke requires an isolated loopback PostgreSQL database");
const port = Number(process.env.PRODUCTION_SMOKE_PORT ?? 4192);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid production smoke port");
const origin = "https://app.carebridge.test";
const api = `http://127.0.0.1:${port}`;
const password = process.env.CAREBRIDGE_UAT_PASSWORD;
const database = new PrismaClient();
let phase = "startup";
let logs = "";

async function main() {
  const server = spawn(process.execPath, ["dist/server.js"], {
    cwd: resolve(__dirname, ".."),
    env: { ...process.env, NODE_ENV: "production", HOST: "127.0.0.1", PORT: String(port), CORS_ORIGIN: origin, ALLOW_DEMO_AUTH: "false", TRUSTED_PROXY_CIDRS: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const exited = new Promise<void>((resolve) => server.once("exit", () => resolve()));
  const capture = (chunk: Buffer) => { logs += chunk.toString(); if (logs.length > 1_000_000) server.kill("SIGTERM"); };
  server.stdout.on("data", capture); server.stderr.on("data", capture);
  const request = async (path: string, method = "GET", cookie?: string, payload?: unknown, extra: Record<string, string> = {}) => {
    const headers: Record<string, string> = { origin, ...extra };
    if (cookie) headers.cookie = cookie;
    if (payload !== undefined) headers["content-type"] = "application/json";
    const response = await fetch(api + path, { method, headers, body: payload === undefined ? undefined : JSON.stringify(payload), signal: AbortSignal.timeout(10_000) });
    return { response, body: await response.json() as any };
  };
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) break;
      if (logs.includes(`Server listening at ${api}`)) {
        try { if ((await fetch(api + "/health")).ok) { ready = true; break; } } catch { /* Wait for this child to bind. */ }
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(ready, "The compiled production-mode API must start");
    phase = "approved cross-origin mutation preflight";
    const preflight = await fetch(api + "/v1/patient/profile", { method: "OPTIONS", headers: { origin, "access-control-request-method": "PATCH", "access-control-request-headers": "content-type,x-carebridge-expected-user" } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
    assert.ok((preflight.headers.get("access-control-allow-methods") ?? "").includes("PATCH"));
    assert.ok((preflight.headers.get("access-control-allow-headers") ?? "").toLowerCase().includes("x-carebridge-expected-user"));
    phase = "production readiness and cookies";
    let result = await request("/v1/ops/readiness");
    assert.equal(result.response.status, 503); assert.equal(result.body.ready, false); assert.equal(result.body.gates.database, true); assert.equal(result.body.gates.identityMfa, false);
    result = await request("/v1/auth/login", "POST", undefined, { email: "demo-admin@demo.carebridge.local", password, role: "ADMIN" });
    assert.equal(result.response.status, 200);
    const setCookie = result.response.headers.get("set-cookie") ?? "";
    assert.ok(setCookie.startsWith("__Host-carebridge_session="), "Production must issue the protected cookie name");
    assert.ok(setCookie.includes("; Secure") && setCookie.includes("; HttpOnly") && setCookie.includes("; Path=/;") && setCookie.includes("; SameSite=Lax") && !/;\s*Domain=/i.test(setCookie), "Production cookie flags must preserve the host-only boundary");
    const cookie = setCookie.split(";")[0];
    const token = cookie.slice(cookie.indexOf("=") + 1);
    const userId = result.body.user.id as string;
    result = await request("/v1/auth/me", "GET", cookie); assert.equal(result.response.status, 200);
    result = await request("/v1/auth/me", "GET", cookie.replace("__Host-carebridge_session=", "carebridge_session=")); assert.equal(result.response.status, 401);
    result = await request("/v1/auth/me", "GET", `${cookie}; ${cookie}`); assert.equal(result.response.status, 401);
    result = await request("/v1/auth/logout", "POST", cookie, undefined, { "X-CareBridge-Expected-User": "other-synthetic-account" });
    assert.equal(result.response.status, 409); assert.equal(result.body.code, "ACCOUNT_CHANGED");
    result = await request("/v1/auth/me", "GET", cookie); assert.equal(result.response.status, 200);
    phase = "unavailable production recovery must not mutate tokens";
    const before = await Promise.all([database.passwordResetToken.count(), database.emailVerificationToken.count()]);
    for (const email of ["demo-admin@demo.carebridge.local", `missing-${randomUUID()}@example.test`]) {
      for (const path of ["/v1/auth/request-password-reset", "/v1/auth/resend-verification"]) {
        result = await request(path, "POST", undefined, { email }); assert.equal(result.response.status, 503);
      }
    }
    assert.deepEqual(await Promise.all([database.passwordResetToken.count(), database.emailVerificationToken.count()]), before);
    result = await request("/v1/auth/signup", "POST", undefined, { email: `signup-${randomUUID()}@example.test`, password }); assert.equal(result.response.status, 503);
    phase = "origin, logout and log privacy";
    result = await request("/v1/auth/logout", "POST", cookie, undefined, { origin: "https://untrusted.invalid" }); assert.equal(result.response.status, 403);
    const marker = `private-log-marker-${randomUUID()}`;
    result = await request(`/unmatched/${marker}?token=${marker}`); assert.equal(result.response.status, 404);
    result = await request("/v1/auth/logout", "POST", cookie, undefined, { "X-CareBridge-Expected-User": userId }); assert.equal(result.response.status, 200);
    result = await request("/v1/auth/me", "GET", cookie); assert.equal(result.response.status, 401);
    assert.ok(!logs.includes(marker) && !logs.includes(token) && !logs.includes(password), "Production logs must omit credentials and raw path/query values");
    console.log("CAREBRIDGE PRODUCTION SMOKE PASS: protected cookies, account binding, recovery no-mutation, origins, revocation and redacted logs");
  } finally {
    server.kill("SIGTERM");
    const timer = setTimeout(() => server.kill("SIGKILL"), 5000);
    await exited; clearTimeout(timer); await database.$disconnect();
  }
}
main().catch(() => { console.error(`CAREBRIDGE PRODUCTION SMOKE FAIL during ${phase}; no credentials or response bodies were logged.`); process.exitCode = 1; });
