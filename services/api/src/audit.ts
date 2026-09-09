import type { FastifyRequest } from "fastify";
import { prisma } from "./server";

export async function recordAudit(request: FastifyRequest, input: {
  actorUserId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  outcome: "SUCCESS" | "FAILURE";
  metadata?: Record<string, unknown>;
}) {
  const forwarded = request.headers["x-forwarded-for"];
  const ipAddress = typeof forwarded === "string" ? forwarded.split(",")[0]?.trim() : request.ip;
  const userAgent = typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : undefined;

  return prisma.auditLog.create({
    data: {
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      outcome: input.outcome,
      metadata: input.metadata,
      ipAddress,
      userAgent,
    },
  });
}
