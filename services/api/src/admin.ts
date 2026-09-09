import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "./server";
import { requireRole } from "./auth";
import { recordAudit } from "./audit";

async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  return requireRole(request, reply, ["ADMIN"]);
}

export async function registerAdminRoutes(app: FastifyInstance) {
  app.get("/v1/admin/overview", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const [patients, doctors, verifiedDoctors, appointments, openSessions] = await Promise.all([
      prisma.patient.count(),
      prisma.doctor.count(),
      prisma.doctor.count({ where: { isVerified: true, isActive: true } }),
      prisma.appointment.count(),
      prisma.session.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
    ]);
    return { patients, doctors, verifiedDoctors, appointments, openSessions };
  });

  app.get("/v1/admin/doctors", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const query = z.object({ verified: z.enum(["true", "false", "all"]).default("all") }).parse(request.query);
    return prisma.doctor.findMany({
      where: query.verified === "all" ? undefined : { isVerified: query.verified === "true" },
      select: { id: true, name: true, slug: true, location: true, status: true, isVerified: true, isActive: true, specialty: { select: { name: true } } },
      orderBy: { name: "asc" },
    });
  });

  app.post("/v1/admin/doctors/:doctorId/verification", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const { doctorId } = z.object({ doctorId: z.string().min(1) }).parse(request.params);
    const { verified } = z.object({ verified: z.boolean() }).parse(request.body);
    const doctor = await prisma.doctor.update({ where: { id: doctorId }, data: { isVerified: verified, status: verified ? "VERIFIED" : "PENDING" }, select: { id: true, isVerified: true, status: true } });
    await recordAudit(request, { actorUserId: user.id, action: "ADMIN_DOCTOR_VERIFICATION", resourceType: "Doctor", resourceId: doctorId, outcome: "SUCCESS", metadata: { verified } });
    return doctor;
  });

  app.get("/v1/admin/audit-logs", async (request, reply) => {
    const user = await requireAdmin(request, reply);
    if (!user) return;
    const query = z.object({ action: z.string().trim().min(1).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(request.query);
    return prisma.auditLog.findMany({
      where: query.action ? { action: query.action } : undefined,
      orderBy: { createdAt: "desc" },
      take: query.limit,
      select: { id: true, actorUserId: true, action: true, resourceType: true, resourceId: true, outcome: true, metadata: true, createdAt: true },
    });
  });
}
