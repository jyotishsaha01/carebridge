import type { UserRole } from "@prisma/client";
import type { FastifyReply, FastifyRequest } from "fastify";

export type AuthContext = {
  userId: string;
  role: UserRole;
};

export function requireRole(request: FastifyRequest, reply: FastifyReply, allowed: UserRole[]): AuthContext | null {
  const context = (request as FastifyRequest & { auth?: AuthContext }).auth;
  if (!context || !allowed.includes(context.role)) {
    void reply.code(403).send({ error: "Forbidden" });
    return null;
  }
  return context;
}
