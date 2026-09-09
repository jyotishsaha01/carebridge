import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { getAuthenticatedUser } from "./auth";
import { prisma } from "./server";

async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const user = await getAuthenticatedUser(request);
  if (!user) { await reply.code(401).send({ error: "Authentication required" }); return null; }
  if (user.role !== "ADMIN") { await reply.code(403).send({ error: "Admin access required" }); return null; }
  return user;
}

export async function registerAdminRoutes(app: FastifyInstance) {
  app.get("/v1/admin/overview", async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    const [patients, doctors, appointments, verifiedDoctors] = await Promise.all([
      prisma.patient.count(),
      prisma.doctor.count(),
      prisma.appointment.count(),
      prisma.doctor.count({ where: { isVerified: true, isActive: true } }),
    ]);
    return { patients, doctors, verifiedDoctors, appointments };
  });

  app.get("/v1/admin/doctors", async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    const query = z.object({ verified: z.enum(["true", "false", "all"]).default("all") }).parse(request.query);
    return prisma.doctor.findMany({
      where: query.verified === "all" ? undefined : { isVerified: query.verified === "true" },
      select: { id: true, name: true, slug: true, location: true, isVerified: true, isActive: true, specialty: { select: { name: true } } },
      orderBy: { name: "asc" },
    });
  });

  app.post("/v1/admin/doctors/:doctorId/verification", async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    const { doctorId } = z.object({ doctorId: z.string().min(1) }).parse(request.params);
    const { verified } = z.object({ verified: z.boolean() }).parse(request.body);
    return prisma.doctor.update({ where: { id: doctorId }, data: { isVerified: verified }, select: { id: true, isVerified: true } });
  });
}
