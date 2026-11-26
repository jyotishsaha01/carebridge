import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "./server";
import { recordAudit } from "./audit";
import { createSecurityEmailProvider } from "./email";
import { AccountChangedError } from "./security";

const SESSION_COOKIE = "carebridge_session";
const MAX_COOKIE_HEADER_LENGTH = 8192;
function sessionCookieName() {
  // Browsers prohibit Domain cookies with this prefix, preventing a sibling
  // origin from planting a session cookie for the API's host.
  return process.env.NODE_ENV === "production" ? `__Host-${SESSION_COOKIE}` : SESSION_COOKIE;
}
const SESSION_DAYS = 30;
const EMAIL_TOKEN_HOURS = 24;
const RESET_TOKEN_MINUTES = 30;

type Role = "PATIENT" | "DOCTOR" | "ADMIN";

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(12).max(128),
});

const loginSchema = credentialsSchema.extend({
  role: z.enum(["PATIENT", "DOCTOR", "ADMIN"]).optional(),
});

const signupSchema = credentialsSchema.extend({
  role: z.enum(["PATIENT", "DOCTOR"]).default("PATIENT"),
  doctorProfile: z.object({
    name: z.string().trim().min(2).max(100),
    specialtyId: z.string().min(1),
    location: z.string().trim().min(2).max(120),
    experienceYears: z.number().int().min(0).max(70),
  }).optional(),
}).superRefine((input, context) => {
  if (input.role === "DOCTOR" && !input.doctorProfile) {
    context.addIssue({ code: "custom", path: ["doctorProfile"], message: "Doctor profile is required" });
  }
});

const securityEmailProvider = createSecurityEmailProvider();

function derivePassword(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (error, derived) => error ? reject(error) : resolve(derived));
  });
}

async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = await derivePassword(password, salt);
  return `scrypt$16384$8$1$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

async function verifyPassword(password: string, encoded: string) {
  const [algorithm, n, r, p, saltText, hashText] = encoded.split("$");
  if (algorithm !== "scrypt" || n !== "16384" || r !== "8" || p !== "1" || !saltText || !hashText) return false;
  try {
    const salt = Buffer.from(saltText, "base64url");
    const expected = Buffer.from(hashText, "base64url");
    if (salt.length !== 16 || expected.length !== 64) return false;
    const actual = await derivePassword(password, salt);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

const DUMMY_PASSWORD_HASH = `scrypt$16384$8$1$${Buffer.alloc(16).toString("base64url")}$${Buffer.alloc(64).toString("base64url")}`;

function requiresEmailVerification() {
  return process.env.NODE_ENV === "production" || process.env.REQUIRE_EMAIL_VERIFICATION === "true";
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function readSessionToken(header?: string) {
  if (!header || header.length > MAX_COOKIE_HEADER_LENGTH) return null;
  const expectedName = sessionCookieName();
  let token: string | null = null;
  let found = false;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index <= 0 || part.slice(0, index).trim() !== expectedName) continue;
    // Duplicate names do not carry their Domain/Path scope in a Cookie header.
    // Selecting either value would let an injected cookie select an account.
    if (found) return null;
    found = true;
    const value = part.slice(index + 1).trim();
    // Issued tokens are canonical unpadded base64url; decoding aliases is unnecessary.
    if (!/^[A-Za-z0-9_-]{43}$/.test(value)) return null;
    token = value;
  }
  return token;
}

function setSessionCookie(reply: FastifyReply, token: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  reply.header("Set-Cookie", `${sessionCookieName()}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_DAYS * 86400}; HttpOnly; SameSite=Lax${secure}`);
}

function clearSessionCookie(reply: FastifyReply) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  reply.header("Set-Cookie", `${sessionCookieName()}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`);
}

function createOneTimeToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

function createSession(userId: string): Promise<string>;
function createSession(userId: string, expectedPasswordHash: string): Promise<string | null>;
async function createSession(userId: string, expectedPasswordHash?: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400 * 1000);
  const data = { userId, tokenHash: hashToken(token), expiresAt };
  if (expectedPasswordHash !== undefined) {
    return prisma.$transaction(async (tx) => {
      // A conditional write locks the user row until the session is committed.
      // Password reset takes the same lock before revoking sessions, so login
      // either sees the new password or its newly created session is revoked.
      const current = await tx.user.updateMany({ where: { id: userId, passwordHash: expectedPasswordHash }, data: { updatedAt: new Date() } });
      if (current.count !== 1) return null;
      await tx.session.create({ data });
      return token;
    });
  }
  await prisma.session.create({ data });
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
  const token = readSessionToken(request.headers.cookie);
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: { include: { patient: true, doctor: true } } } });
  if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;
  if (requiresEmailVerification() && !session.user.emailVerifiedAt) return null;
  const expectedUser = request.headers["x-carebridge-expected-user"];
  // This optional assertion narrows the request to the account displayed by the
  // client. It never authenticates the request or grants another user's access.
  if (expectedUser !== undefined && (typeof expectedUser !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(expectedUser) || expectedUser !== session.user.id)) {
    throw new AccountChangedError();
  }
  if (session.lastSeenAt.getTime() < Date.now() - 5 * 60 * 1000) {
    await prisma.session.updateMany({ where: { id: session.id, revokedAt: null }, data: { lastSeenAt: new Date() } });
  }
  return session.user;
}

export async function requireRole(request: FastifyRequest, reply: FastifyReply, allowed: Role[]) {
  const user = await getAuthenticatedUser(request);
  if (!user) { void reply.code(401).send({ error: "Authentication required" }); return null; }
  if (!(allowed as Role[]).includes(user.role as Role)) { void reply.code(403).send({ error: "Insufficient permissions" }); return null; }
  return user;
}

export async function requireVerifiedDoctor(request: FastifyRequest, reply: FastifyReply) {
  const user = await requireRole(request, reply, ["DOCTOR"]);
  if (!user) return null;
  if (!user.doctor?.isVerified || !user.doctor.isActive) {
    void reply.code(403).send({ error: "An active, verified doctor profile is required" });
    return null;
  }
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
    const input = signupSchema.parse(request.body);
    if (process.env.NODE_ENV === "production") return reply.code(503).send({ error: "Registration is unavailable until security email delivery is configured" });
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) return reply.code(409).send({ error: "An account with this email already exists" });

    if (input.role === "DOCTOR") {
      const specialty = await prisma.specialty.findUnique({ where: { id: input.doctorProfile!.specialtyId } });
      if (!specialty) return reply.code(400).send({ error: "Choose a valid specialty" });
    }
    const doctorProfile = input.role === "DOCTOR" ? input.doctorProfile! : null;
    const doctorSlug = doctorProfile ? `${input.email.split("@")[0].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "doctor"}-${randomBytes(4).toString("hex")}` : undefined;
    const user = await prisma.user.create({ data: {
      email: input.email,
      passwordHash: await hashPassword(input.password),
      role: input.role,
      ...(doctorProfile ? { doctor: { create: {
        specialtyId: doctorProfile.specialtyId,
        slug: doctorSlug!,
        name: doctorProfile.name,
        initials: doctorProfile.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 3).toUpperCase(),
        location: doctorProfile.location,
        rating: 0,
        experienceYears: doctorProfile.experienceYears,
        consultationPriceUsd: 0,
        expertise: [],
        bio: "Profile pending credential verification.",
        status: "PENDING",
        isVerified: false,
        isActive: false,
      } } } : { patient: { create: { country: "US" } } }),
    }, include: { patient: true, doctor: true } });
    const verificationToken = await issueEmailVerification(user.id);
    await deliverSecurityEmail(request, user.id, user.email, "EMAIL_VERIFICATION", verificationToken);
    if (!requiresEmailVerification()) {
      const sessionToken = await createSession(user.id);
      setSessionCookie(reply, sessionToken);
    }
    await recordAudit(request, { actorUserId: user.id, action: "AUTH_SIGNUP", resourceType: "User", resourceId: user.id, outcome: "SUCCESS" });

    const response: Record<string, unknown> = { user: { id: user.id, email: user.email, role: user.role, patientId: user.patient?.id ?? null, doctorId: user.doctor?.id ?? null }, emailVerificationRequired: true };
    if (process.env.NODE_ENV !== "production" && process.env.ALLOW_DEMO_AUTH === "true") response.devVerificationToken = verificationToken;
    return reply.code(201).send(response);
  });

  app.post("/v1/auth/login", async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { email: input.email }, include: { patient: true, doctor: true } });
    const passwordMatches = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user?.passwordHash || !passwordMatches) {
      await recordAudit(request, { action: "AUTH_LOGIN", resourceType: "User", outcome: "FAILURE", metadata: { reason: "invalid_credentials" } });
      return reply.code(401).send({ error: "Invalid email or password" });
    }
    if (input.role && user.role !== input.role) {
      await recordAudit(request, { actorUserId: user.id, action: "AUTH_LOGIN", resourceType: "User", resourceId: user.id, outcome: "FAILURE", metadata: { reason: "role_mismatch", requestedRole: input.role } });
      return reply.code(403).send({ error: `This account does not have access to the ${input.role.toLowerCase()} workspace.` });
    }
    if (requiresEmailVerification() && !user.emailVerifiedAt) {
      await recordAudit(request, { actorUserId: user.id, action: "AUTH_LOGIN", resourceType: "User", resourceId: user.id, outcome: "FAILURE", metadata: { reason: "email_not_verified" } });
      return reply.code(403).send({ error: "Email verification required" });
    }
    const token = await createSession(user.id, user.passwordHash);
    if (!token) {
      await recordAudit(request, { actorUserId: user.id, action: "AUTH_LOGIN", resourceType: "User", resourceId: user.id, outcome: "FAILURE", metadata: { reason: "credentials_changed_during_login" } });
      return reply.code(401).send({ error: "Invalid email or password" });
    }
    setSessionCookie(reply, token);
    await recordAudit(request, { actorUserId: user.id, action: "AUTH_LOGIN", resourceType: "User", resourceId: user.id, outcome: "SUCCESS" });
    return { user: { id: user.id, email: user.email, role: user.role, patientId: user.patient?.id ?? null, doctorId: user.doctor?.id ?? null }, emailVerified: Boolean(user.emailVerifiedAt) };
  });

  app.post("/v1/auth/verify-email", async (request, reply) => {
    const { token } = z.object({ token: z.string().min(20).max(200) }).parse(request.body);
    const record = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!record || record.usedAt || record.expiresAt <= new Date()) return reply.code(400).send({ error: "Invalid or expired verification token" });
    const now = new Date();
    const verified = await prisma.$transaction(async (tx) => {
      const claimed = await tx.emailVerificationToken.updateMany({ where: { id: record.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
      if (claimed.count !== 1) return false;
      await tx.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: now } });
      return true;
    });
    if (!verified) return reply.code(400).send({ error: "Invalid or expired verification token" });
    await recordAudit(request, { actorUserId: record.userId, action: "AUTH_EMAIL_VERIFIED", resourceType: "User", resourceId: record.userId, outcome: "SUCCESS" });
    return { ok: true };
  });

  app.post("/v1/auth/resend-verification", async (request, reply) => {
    const { email } = z.object({ email: z.string().trim().toLowerCase().email() }).parse(request.body);
    if (process.env.NODE_ENV === "production") return reply.code(503).send({ error: "Account recovery is unavailable until security email delivery is configured" });
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
    if (process.env.NODE_ENV === "production") return reply.code(503).send({ error: "Account recovery is unavailable until security email delivery is configured" });
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
    const passwordHash = await hashPassword(input.password);
    const reset = await prisma.$transaction(async (tx) => {
      const claimed = await tx.passwordResetToken.updateMany({ where: { id: record.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
      if (claimed.count !== 1) return false;
      await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
      await tx.passwordResetToken.updateMany({ where: { userId: record.userId, usedAt: null }, data: { usedAt: now } });
      await tx.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: now } });
      return true;
    });
    if (!reset) return reply.code(400).send({ error: "Invalid or expired reset token" });
    await recordAudit(request, { actorUserId: record.userId, action: "AUTH_PASSWORD_RESET", resourceType: "User", resourceId: record.userId, outcome: "SUCCESS" });
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get("/v1/auth/sessions", async (request, reply) => {
    const user = await getAuthenticatedUser(request);
    if (!user) return reply.code(401).send({ error: "Authentication required" });
    const currentToken = readSessionToken(request.headers.cookie);
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
    const token = readSessionToken(request.headers.cookie);
    const user = await getAuthenticatedUser(request);
    if (token) await prisma.session.updateMany({ where: { tokenHash: hashToken(token), revokedAt: null }, data: { revokedAt: new Date() } });
    if (user) await recordAudit(request, { actorUserId: user.id, action: "AUTH_LOGOUT", resourceType: "User", resourceId: user.id, outcome: "SUCCESS" });
    clearSessionCookie(reply);
    return { ok: true };
  });
}
