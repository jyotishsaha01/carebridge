import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
const origin = "https://app.carebridge.test";
beforeAll(async () => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("CORS_ORIGIN", origin);
  vi.resetModules();
  const { buildApp } = await import("./server.js");
  app = await buildApp();
});
afterAll(async () => { await app?.close(); vi.unstubAllEnvs(); });

describe("real API cross-origin browser boundary", () => {
  it.each([
    ["PATCH", "/v1/patient/profile"],
    ["PUT", "/v1/appointments/synthetic/intake"],
    ["DELETE", "/v1/doctor/availability/synthetic"],
  ])("allows the approved frontend to preflight %s with account binding", async (method, url) => {
    const response = await app.inject({ method: "OPTIONS", url, headers: { origin, "access-control-request-method": method, "access-control-request-headers": "content-type,x-carebridge-expected-user" } });
    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(origin);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(String(response.headers["access-control-allow-methods"]).split(",").map(value => value.trim())).toContain(method);
    expect(String(response.headers["access-control-allow-headers"]).toLowerCase()).toContain("x-carebridge-expected-user");
  });
  it("does not grant the same preflight to an unapproved site", async () => {
    const response = await app.inject({ method: "OPTIONS", url: "/v1/patient/profile", headers: { origin: "https://untrusted.invalid", "access-control-request-method": "PATCH", "access-control-request-headers": "content-type,x-carebridge-expected-user" } });
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
