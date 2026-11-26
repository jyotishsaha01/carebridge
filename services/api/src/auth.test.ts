import { scryptSync } from "node:crypto";
import Fastify, { type FastifyRequest } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  session: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  emailVerificationToken: { findUnique: vi.fn(), deleteMany: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  passwordResetToken: { findUnique: vi.fn(), deleteMany: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("./server", () => ({ prisma: db }));
import { registerSecurity } from "./security";
import { getAuthenticatedUser, registerAuthRoutes, requireVerifiedDoctor, requireRole } from "./auth";
const apps: ReturnType<typeof Fastify>[] = [];
beforeEach(() => { vi.resetAllMocks(); db.$transaction.mockImplementation((fn) => fn(db)); });
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); vi.unstubAllEnvs(); });
function session(user: Record<string, unknown>) {
  db.session.findUnique.mockResolvedValue({ id: "session", expiresAt: new Date(Date.now() + 60000), revokedAt: null, lastSeenAt: new Date(), user });
}
function app() { const instance = Fastify(); apps.push(instance); return instance; }
const cookie = `carebridge_session=${"a".repeat(43)}`;

describe("authentication regressions", () => {
  it("treats malformed cookies as unauthenticated", async () => {
    expect(await getAuthenticatedUser({ headers: { cookie: "carebridge_session=%E0%A4%A" } } as FastifyRequest)).toBeNull();
    expect(db.session.findUnique).not.toHaveBeenCalled();
  });

  it("rejects an existing unverified session when verification is required", async () => {
    vi.stubEnv("REQUIRE_EMAIL_VERIFICATION", "true");
    session({ id: "user", emailVerifiedAt: null });
    expect(await getAuthenticatedUser({ headers: { cookie } } as FastifyRequest)).toBeNull();
  });

  it("does not create a session at signup before required email verification", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("REQUIRE_EMAIL_VERIFICATION", "true");
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockResolvedValue({ id: "new-user", email: "patient@example.com", role: "PATIENT", patient: { id: "patient" } });
    const instance = app();
    await registerAuthRoutes(instance);
    const response = await instance.inject({ method: "POST", url: "/v1/auth/signup", payload: { email: "patient@example.com", password: "a-long-password-for-testing" } });
    expect(response.statusCode).toBe(201);
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(db.session.create).not.toHaveBeenCalled();
    expect(response.json().emailVerificationRequired).toBe(true);
  });

  it("consumes a verification token only once under simultaneous requests", async () => {
    const token = { id: "token", userId: "user", usedAt: null, expiresAt: new Date(Date.now() + 60000) };
    db.emailVerificationToken.findUnique.mockResolvedValue(token);
    db.emailVerificationToken.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const instance = app();
    await registerAuthRoutes(instance);
    const responses = await Promise.all([1, 2].map(() => instance.inject({ method: "POST", url: "/v1/auth/verify-email", payload: { token: "a".repeat(43) } })));
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 400]);
    expect(db.user.update).toHaveBeenCalledTimes(1);
  });

  it("blocks pending doctors from clinical authorization", async () => {
    session({ id: "doctor-user", role: "DOCTOR", emailVerifiedAt: new Date(), doctor: { isVerified: false, isActive: false } });
    const instance = app();
    instance.get("/clinical", async (request, reply) => {
      const doctor = await requireVerifiedDoctor(request, reply);
      if (doctor) return { allowed: true };
    });
    const response = await instance.inject({ url: "/clinical", headers: { cookie } });
    expect(response.statusCode).toBe(403);
  });
  it("does not issue a new session from a stale password snapshot after a reset", async () => {
    const password = "old-password-before-concurrent-reset";
    const salt = Buffer.alloc(16, 7);
    const encoded = `scrypt$16384$8$1$${salt.toString("base64url")}$${scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString("base64url")}`;
    let currentPasswordHash = encoded;
    db.user.findUnique.mockImplementation(async () => {
      const snapshot = { id: "user", email: "patient@example.com", role: "PATIENT", passwordHash: currentPasswordHash, emailVerifiedAt: new Date(), patient: { id: "patient" } };
      // The password-reset transaction commits after login reads the hash, before its KDF completes.
      currentPasswordHash = "hash-installed-by-the-password-reset";
      return snapshot;
    });
    db.user.updateMany.mockImplementation(async (input) => ({ count: input.where.passwordHash === currentPasswordHash ? 1 : 0 }));
    const instance = app();
    await registerAuthRoutes(instance);
    const response = await instance.inject({ method: "POST", url: "/v1/auth/login", payload: { email: "patient@example.com", password } });
    expect(response.statusCode).toBe(401);
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(db.session.create).not.toHaveBeenCalled();
  });

  it("issues a secure session when the password is still current inside the login transaction", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const password = "unchanged-long-password-for-testing";
    const salt = Buffer.alloc(16, 9);
    const encoded = `scrypt$16384$8$1$${salt.toString("base64url")}$${scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString("base64url")}`;
    db.user.findUnique.mockResolvedValue({ id: "user", email: "patient@example.com", role: "PATIENT", passwordHash: encoded, emailVerifiedAt: new Date(), patient: { id: "patient" } });
    db.user.updateMany.mockResolvedValue({ count: 1 });
    const instance = app();
    await registerAuthRoutes(instance);
    const response = await instance.inject({ method: "POST", url: "/v1/auth/login", payload: { email: "patient@example.com", password } });
    expect(response.statusCode).toBe(200);
    const cookie = String(response.headers["set-cookie"]);
    expect(cookie).toMatch(/^__Host-carebridge_session=[A-Za-z0-9_-]{43};/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("Path=/;");
    expect(cookie).not.toContain("Domain=");
    expect(db.$transaction).toHaveBeenCalledOnce();
    expect(db.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "user", passwordHash: encoded } }));
    expect(db.session.create).toHaveBeenCalledOnce();
  });

  it("rejects duplicate session cookies rather than selecting an attacker-controlled duplicate", async () => {
    session({ id: "attacker-account", emailVerifiedAt: new Date() });
    const headers = { cookie: `${cookie}; carebridge_session=${"b".repeat(43)}` };
    expect(await getAuthenticatedUser({ headers } as FastifyRequest)).toBeNull();
    expect(db.session.findUnique).not.toHaveBeenCalled();
  });

  it("bounds cookie processing before querying a session", async () => {
    session({ id: "user", emailVerifiedAt: new Date() });
    const headers = { cookie: `unrelated=${"x".repeat(8192)}; ${cookie}` };
    expect(await getAuthenticatedUser({ headers } as FastifyRequest)).toBeNull();
    expect(db.session.findUnique).not.toHaveBeenCalled();
  });

  it("only accepts the browser-enforced host-prefixed session cookie in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    session({ id: "user", emailVerifiedAt: new Date() });
    expect(await getAuthenticatedUser({ headers: { cookie } } as FastifyRequest)).toBeNull();
    expect(db.session.findUnique).not.toHaveBeenCalled();
    expect(await getAuthenticatedUser({ headers: { cookie: `__Host-${cookie}` } } as FastifyRequest)).toMatchObject({ id: "user" });
  });

  it("does not mutate recovery tokens or reveal account existence while production email is unavailable", async () => {
    vi.stubEnv("NODE_ENV", "production");
    db.user.findUnique.mockResolvedValue({ id: "user", email: "patient@example.com" });
    const instance = app();
    await registerAuthRoutes(instance);
    for (const url of ["/v1/auth/request-password-reset", "/v1/auth/resend-verification"]) {
      const known = await instance.inject({ method: "POST", url, payload: { email: "patient@example.com" } });
      const unknown = await instance.inject({ method: "POST", url, payload: { email: "absent@example.com" } });
      expect(known.statusCode).toBe(503);
      expect(unknown.statusCode).toBe(503);
      expect(known.json()).toEqual(unknown.json());
    }
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(db.passwordResetToken.deleteMany).not.toHaveBeenCalled();
    expect(db.passwordResetToken.create).not.toHaveBeenCalled();
    expect(db.emailVerificationToken.deleteMany).not.toHaveBeenCalled();
    expect(db.emailVerificationToken.create).not.toHaveBeenCalled();
  });

  it("does not authorize a client's stale account expectation or write session/activity data", async () => {
    const now = new Date();
    db.session.findUnique.mockResolvedValue({ id: "session", expiresAt: new Date(Date.now() + 60_000), revokedAt: null, lastSeenAt: new Date(Date.now() - 600_000), user: { id: "actual-user", role: "PATIENT", emailVerifiedAt: now } });
    const instance = app(); registerSecurity(instance, []);
    const write = vi.fn(() => ({ ok: true }));
    instance.post("/sensitive-write", async (request, reply) => {
      const user = await requireRole(request, reply, ["PATIENT"]);
      if (user) return write();
    });
    for (const expectation of ["previous-user", "actual-user,actual-user", "bad user", "", "a".repeat(129)]) {
      const response = await instance.inject({ method: "POST", url: "/sensitive-write", headers: { cookie, "x-carebridge-expected-user": expectation } });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ error: "Your signed-in account changed. Reload or sign in again.", code: "ACCOUNT_CHANGED" });
      expect(response.body).not.toContain("actual-user");
    }
    const duplicate = await instance.inject({ method: "POST", url: "/sensitive-write", headers: { cookie, "x-carebridge-expected-user": ["actual-user", "actual-user"] } });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().code).toBe("ACCOUNT_CHANGED");
    expect(write).not.toHaveBeenCalled();
    expect(db.session.updateMany).not.toHaveBeenCalled();
  });

  it("accepts a matching account expectation without granting authority to unauthenticated requests", async () => {
    session({ id: "actual-user", role: "PATIENT", emailVerifiedAt: new Date() });
    const instance = app(); registerSecurity(instance, []); await registerAuthRoutes(instance);
    const matching = await instance.inject({ url: "/v1/auth/me", headers: { cookie, "x-carebridge-expected-user": "actual-user" } });
    expect(matching.statusCode).toBe(200);
    expect(matching.json().user.id).toBe("actual-user");
    db.session.findUnique.mockClear();
    const missing = await instance.inject({ url: "/v1/auth/me", headers: { "x-carebridge-expected-user": "actual-user" } });
    expect(missing.statusCode).toBe(401);
    expect(db.session.findUnique).not.toHaveBeenCalled();
    const absent = await instance.inject({ url: "/v1/auth/me", headers: { cookie } });
    expect(absent.statusCode).toBe(200);
  });

  it("rejects replay of expired and revoked sessions", async () => {
    const request = { headers: { cookie } } as FastifyRequest;
    for (const fields of [{ expiresAt: new Date(Date.now() - 1), revokedAt: null }, { expiresAt: new Date(Date.now() + 60_000), revokedAt: new Date() }]) {
      db.session.findUnique.mockResolvedValue({ id: "session", ...fields, lastSeenAt: new Date(), user: { id: "user", emailVerifiedAt: new Date() } });
      expect(await getAuthenticatedUser(request)).toBeNull();
    }
    expect(db.session.updateMany).not.toHaveBeenCalled();
  });

});
