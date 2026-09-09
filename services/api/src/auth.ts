import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./server";
import { recordAudit } from "./audit";
import { createSecurityEmailProvider } from "./email";

const SESSION_COOKIE = "carebridge_session";
const SESSION_DAYS = 30;
const EMAIL_TOKEN_HOURS = 24;
const RESET_TOKEN_MINUTES = 30;

type Role = "PATIENT" | "DOCTOR" | "ADMIN";

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(12).max(128),
});

const securityEmailProvider = createSecurityEmailProvider();

function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

function verifyPassword(password: string, encoded: string) {
  const [algorithm, n, r, p, saltText, hashText] = encoded.split("$");
  if (algorithm !== "scrypt" || !n || !r || !p || !saltText || !hashText) return false;
  try {
    const expected = Buffer.from(hashText, "base64url");
    const actual = scryptSync(password, Buffer.from(saltText, "base64url"), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function parseCookies(header?: string) {
  const cookies = new Map<string, string>();
  for (const part of (header ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    cookies.set(part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim()));
  }
  return cookies;
}

function setSessionCookie(reply: FastifyReply, token: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  reply.header("Set-Cookie", `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_DAYS * 86400}; HttpOnly; SameSite=Lax${secure}`);
}

function clearSessionCookie(reply: FastifyReply) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  reply.header("Set-Cookie", `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`);
}

function createOneTimeToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400 * 1000);
  await prisma.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt } });
  return token;
}

async function issueEmailVerification(userId: string) {
  const { token, tokenHash } = createOneTimeToken();
  await prisma.emailVerificationToken.deleteMany({ where: { userId, usedAt: null } });
  await prisma.emailVerificationToken.create({ data: { userId, tokenHash, expiresAt: new Date(Date.now() + EMAIL_TOKEN_HOURS * 60 * 60 * 1000) } });
  return token;
}

async function issuePasswordReset(userId: string) {
  const { token, tokenHash } = createOneTimeToken();
  await prisma.passwordResetToken.deleteMany({ where: { userId, usedAt: null } });
  await prisma.passwordResetToken.create({ data: { userId, tokenHash, expiresAt: new Date(Date.now() + RESET_TOKEN_MINUTES * 60 * 1000) } });
  return token;
}

export async function getAuthenticatedUser(request: FastifyRequest) {
  const token = parseCookies(request.headers.cookie).get(SESSION_COOKIE);
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: { include: { patient: true, doctor: true } } } });
  if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;
  await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  return session.user;
}

export async function requireRole(request: FastifyRequest, reply: FastifyReply, allowed: UserRole[] | Role[]) {
  const user = await getAuthenticatedUser(request);
  if (!user) { void reply.code(401).send({ error: "Authentication required" }); return null; }
  if (!(allowed as Role[]).includes(user.role as Role)) { void reply.code(403).send({ error: "Insufficient permissions" }); return null; }
  return user;
}

async function deliverSecurityEmail(request: FastifyRequest, userId: string, recipient: string, kind: "EMAIL_VERIFICATION" | "PASSWORD_RESET", token: string) {
  try {
    return await securityEmailProvider.send({ kind, recipient, token });
  } catch (error) {
    await recordAudit(request, { actorUserId: userId, action: "AUTH_SECURITY_EMAIL_DELIVERY", resourceType: "User", resourceId: userId, outcome: "FAILURE", metadata: { kind, reason: error instanceof Error ? error.message : "delivery_error" } });
    return { delivered: false, provider: "unavailable" };
  }
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post("/v1/auth/signup", async (request, reply) => {
    const input = credentialsSchema.parse(request.body);
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) return reply.code(409).send({ error: "An account with this email already exists" });

    const user = await prisma.user.create({ data: { email: input.email, passwordHash: hashPassword(input.password), role: "PATIENT", patient: { create: { country: "US" } } }, include: { patient: true } });
    const verificationToken = await issueEmailVerification(user.id);
    await deliverSecurityEmail(request, user.id, user.email, "EMAIL_VERIFICATION", verificationToken);
    const sessionToken = await createSession(user.id);
    setSessionCookie(reply, sessionToken);
    await recordAudit(request, { actorUserId: user.id, action: "AUTH_SIGNUP", resourceType: "User", resourceId: user.id, outcome: "SUCCESS" });

    const response: Record<string, unknown> = { user: { id: user.id, email: user.email, role: user.role, patientId: user.patient?.id ?? null }, emailVerificationRequired: true };
    if (process.env.NODE_ENV !== "production" && process.env.ALLOW_DEMO_AUTH === "true") response.devVerificationToken = verificationToken;
    return reply.code(201).send(response);
  });

  app.post("/v1/auth/login", async (request, reply) => {
    const input = credentialsSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { email: input.email }, include: { patient: true, doctor: true } });
    if (!user?.passwordHash || !verifyPassword(input.password, user.passwordHash)) {
      await recordAudit(request, { action: "AUTH_LOGIN", resourceType: "User", outcome: "FAILURE", metadata: { reason: "invalid_credentials" } });
      return reply.code(401).send({ error: "Invalid email or password" });
    }
    const requireVerification = process.env.NODE_ENV === "production" || process.env.REQUIRE_EMAIL_VERIFICATION === "true";
    if (requireVerification && !user.emailVerifiedAt) {
      await recordAudit(request, { actorUserId: user.id, action: "AUTH_LOGIN", resourceType: "User", resourceId: user.id, outcome: "FAILURE", metadata: { reason: "email_not_verified" } });
      return reply.code(403).send({ error: "Email verification required" });
    }
    const token = await createSession(user.id);
    setSessionCookie(reply, token);
    await recordAudit(request, { actorUserId: user.id, action: "AUTH_LOGIN", resourceType: "User", resourceId: user.id, outcome: "SUCCESS" });
    return { user: { id: user.id, email: user.email, role: user.role, patientId: user.patient?.id ?? null, doctorId: user.doctor?.id ?? null }, emailVerified: Boolean(user.emailVerifiedAt) };
  });

  app.post("/v1/auth/verify-email", async (request, reply) => {
    const { token } = z.object({ token: z.string().min(20).max(200) }).parse(request.body);
    const record = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!record || record.usedAt || record.expiresAt <= new Date()) return reply.code(400).send({ error: "Invalid or expired verification token" });
    const now = new Date();
    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: now } }),
      prisma.emailVerificationToken.update({ where: { id: record.id }, data: { usedAt: now } }),
    ]);
    await recordAudit(request, { actorUserId: record.userId, action: "AUTH_EMAIL_VERIFIED", resourceType: "User", resourceId: record.userId, outcome: "SUCCESS" });
    return { ok: true };
  });

  app.post("/v1/auth/resend-verification", async (request, reply) => {
    const { email } = z.object({ email: z.string().trim().toLowerCase().email() }).parse(request.body);
    const user = await prisma.user.findUnique({ where: { email } });
    const response: Record<string, unknown> = { accepted: true, message: "If an account exists and needs verification, instructions will be sent." };
    if (user && !user.emailVerifiedAt) {
      const token = await issueEmailVerification(user.id);
      await deliverSecurityEmail(request, user.id, user.email, "EMAIL_VERIFICATION", token);
      await recordAudit(request, { actorUserId: user.id, action: "AUTH_EMAIL_VERIFICATION_RESENT", resourceType: "User", resourceId: user.id, outcome: "SUCCESS" });
      if (process.env.NODE_ENV !== "production" && process.env.ALLOW_DEMO_AUTH === "true") response.devVerificationToken = token;
    }
    return reply.code(202).send(response);
  });

  app.post("/v1/auth/request-password-reset", async (request, reply) => {
    const { email } = z.object({ email: z.string().trim().toLowerCase().email() }).parse(request.body);
    const user = await prisma.user.findUnique({ where: { email } });
    let devResetToken: string | undefined;
    if (user) {
      devResetToken = await issuePasswordReset(user.id);
      await deliverSecurityEmail(request, user.id, user.email, "PASSWORD_RESET", devResetToken);
      await recordAudit(request, { actorUserId: user.id, action: "AUTH_PASSWORD_RESET_REQUEST", resourceType: "User", resourceId: user.id, outcome: "SUCCESS" });
    } else {
      await recordAudit(request, { action: "AUTH_PASSWORD_RESET_REQUEST", resourceType: "User", outcome: "SUCCESS", metadata: { reason: "unknown_email" } });
    }
    const response: Record<string, unknown> = { accepted: true, message: "If an account exists, reset instructions will be sent." };
    if (process.env.NODE_ENV !== "production" && process.env.ALLOW_DEMO_AUTH === "true" && devResetToken) response.devResetToken = devResetToken;
    return reply.code(202).send(response);
  });

  app.post("/v1/auth/reset-password", async (request, reply) => {
    const input = z.object({ token: z.string().min(20).max(200), password: z.string().min(12).max(128) }).parse(request.body);
    const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(input.token) } });
    if (!record || record.usedAt || record.expiresAt <= new Date()) return reply.code(400).send({ error: "Invalid or expired reset token" });
    const now = new Date();
    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { passwordHash: hashPassword(input.password) } }),
      prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: now } }),
      prisma.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: now } }),
    ]);
    await recordAudit(request, { actorUserId: record.userId, action: "AUTH_PASSWORD_RESET", resourceType: "User", resourceId: record.userId, outcome: "SUCCESS" });
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get("/v1/auth/sessions", async (request, reply) => {
    const user = await getAuthenticatedUser(request);
    if (!user) return reply.code(401).send({ error: "Authentication required" });
    const currentToken = parseCookies(request.headers.cookie).get(SESSION_COOKIE);
    const currentTokenHash = currentToken ? hashToken(currentToken) : "";
    const sessions = await prisma.session.findMany({ where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: "desc" }, select: { id: true, createdAt: true, lastSeenAt: true, expiresAt: true, tokenHash: true } });
    return { sessions: sessions.map(({ tokenHash, ...session }) => ({ ...session, current: tokenHash === currentTokenHash })) };
  });

  app.post("/v1/auth/sessions/:sessionId/revoke", async (request, reply) => {
    const user = await getAuthenticatedUser(request);
    if (!user) return reply.code(401).send({ error: "Authentication required" });
    const { sessionId } = z.object({ sessionId: z.string().min(1) }).parse(request.params);
    const result = await prisma.session.updateMany({ where: { id: sessionId, userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    if (result.count === 0) return reply.code(404).send({ error: "Session not found" });
    await recordAudit(request, { actorUserId: user.id, action: "AUTH_SESSION_REVOKED", resourceType: "Session", resourceId: sessionId, outcome: "SUCCESS" });
    return { ok: true };
  });

  app.get("/v1/auth/me", async (request, reply) => {
    const user = await getAuthenticatedUser(request);
    if (!user) return reply.code(401).send({ error: "Authentication required" });
    return { user: { id: user.id, email: user.email, role: user.role, patientId: user.patient?.id ?? null, doctorId: user.doctor?.id ?? null }, emailVerified: Boolean(user.emailVerifiedAt) };
  });

  app.post("/v1/auth/logout", async (request, reply) => {
    const token = parseCookies(request.headers.cookie).get(SESSION_COOKIE);
    const user = await getAuthenticatedUser(request);
    if (token) await prisma.session.updateMany({ where: { tokenHash: hashToken(token), revokedAt: null }, data: { revokedAt: new Date() } });
    if (user) await recordAudit(request, { actorUserId: user.id, action: "AUTH_LOGOUT", resourceType: "User", resourceId: user.id, outcome: "SUCCESS" });
    clearSessionCookie(reply);
    return { ok: true };
  });
}
