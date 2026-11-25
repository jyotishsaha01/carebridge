import type { FastifyRequest } from "fastify";
import { Prisma } from "@prisma/client";
import { prisma } from "./server";

export async function recordAudit(request: FastifyRequest, input: {
  actorUserId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  outcome: "SUCCESS" | "FAILURE";
  metadata?: Record<string, unknown>;
}, database: Pick<Prisma.TransactionClient, "auditLog"> = prisma) {
  // request.ip respects Fastify's trusted proxy configuration; raw forwarding headers are spoofable.
  const ipAddress = request.ip;
  const userAgent = typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : undefined;

  return database.auditLog.create({
    data: {
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      outcome: input.outcome,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
      ipAddress,
      userAgent,
    },
  });
}
