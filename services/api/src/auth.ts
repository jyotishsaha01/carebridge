import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./server";

const SESSION_COOKIE = "carebridge_session";
const SESSION_DAYS = 30;

type Role = "PATIENT" | "DOCTOR" | "ADMIN";

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(12).max(128),
});

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
    const actual = scryptSync(password, Buffer.from(saltText, "base64url"), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
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
  reply.header("Set-Cookie", `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
}

async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400 * 1000);
  await prisma.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt } });
  return token;
}

export async function getAuthenticatedUser(request: FastifyRequest) {
  const token = parseCookies(request.headers.cookie).get(SESSION_COOKIE);
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { patient: true, doctor: true } } },
  });

  if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;
  await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  return session.user;
}

export async function requireRole(request: FastifyRequest, reply: FastifyReply, allowed: UserRole[] | Role[]) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    void reply.code(401).send({ error: "Authentication required" });
    return null;
  }
  if (!(allowed as Role[]).includes(user.role as Role)) {
    void reply.code(403).send({ error: "Insufficient permissions" });
    return null;
  }
  return user;
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post("/v1/auth/signup", async (request, reply) => {
    const input = credentialsSchema.parse(request.body);
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) return reply.code(409).send({ error: "An account with this email already exists" });

    const user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash: hashPassword(input.password),
        role: "PATIENT",
        patient: { create: { country: "US" } },
      },
      include: { patient: true },
    });

    const token = await createSession(user.id);
    setSessionCookie(reply, token);
    return reply.code(201).send({ user: { id: user.id, email: user.email, role: user.role, patientId: user.patient?.id ?? null } });
  });

  app.post("/v1/auth/login", async (request, reply) => {
    const input = credentialsSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { email: input.email }, include: { patient: true, doctor: true } });
    if (!user?.passwordHash || !verifyPassword(input.password, user.passwordHash)) {
      return reply.code(401).send({ error: "Invalid email or password" });
    }

    const token = await createSession(user.id);
    setSessionCookie(reply, token);
    return { user: { id: user.id, email: user.email, role: user.role, patientId: user.patient?.id ?? null, doctorId: user.doctor?.id ?? null } };
  });

  app.get("/v1/auth/me", async (request, reply) => {
    const user = await getAuthenticatedUser(request);
    if (!user) return reply.code(401).send({ error: "Authentication required" });
    return { user: { id: user.id, email: user.email, role: user.role, patientId: user.patient?.id ?? null, doctorId: user.doctor?.id ?? null } };
  });

  app.post("/v1/auth/logout", async (request, reply) => {
    const token = parseCookies(request.headers.cookie).get(SESSION_COOKIE);
    if (token) await prisma.session.updateMany({ where: { tokenHash: hashToken(token), revokedAt: null }, data: { revokedAt: new Date() } });
    clearSessionCookie(reply);
    return { ok: true };
  });
}
