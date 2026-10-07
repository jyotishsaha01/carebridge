import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getAuthenticatedUser } from "./auth";
import { prisma } from "./server";

const profilePatch = z.object({
  bio: z.string().trim().max(5000).optional(),
  location: z.string().trim().max(200).optional(),
  consultationPriceUsd: z.coerce.number().positive().max(5000).optional(),
}).strict();

export async function registerDoctorPlatformRoutes(app: FastifyInstance) {
  app.get("/v1/doctor/me", async (request, reply) => {
    const user = await getAuthenticatedUser(request);
    if (!user?.doctor) return reply.code(403).send({ error: "Doctor access required" });
    const doctor = await prisma.doctor.findUnique({ where: { id: user.doctor.id }, include: { specialty: true } });
    if (!doctor) return reply.code(404).send({ error: "Doctor profile not found" });
    return {
      id: doctor.id,
      name: doctor.name,
      slug: doctor.slug,
      specialty: doctor.specialty.name,
      location: doctor.location,
      bio: doctor.bio,
      consultationPriceUsd: Number(doctor.consultationPriceUsd),
      verified: doctor.isVerified,
      active: doctor.isActive,
    };
  });

  app.patch("/v1/doctor/me", async (request, reply) => {
    const user = await getAuthenticatedUser(request);
    if (!user?.doctor) return reply.code(403).send({ error: "Doctor access required" });
    const input = profilePatch.parse(request.body);
    const doctor = await prisma.doctor.update({
      where: { id: user.doctor.id },
      data: {
        ...(input.bio !== undefined ? { bio: input.bio } : {}),
        ...(input.location !== undefined ? { location: input.location } : {}),
        ...(input.consultationPriceUsd !== undefined ? { consultationPriceUsd: input.consultationPriceUsd } : {}),
      },
      include: { specialty: true },
    });
    return { id: doctor.id, name: doctor.name, specialty: doctor.specialty.name, location: doctor.location, bio: doctor.bio, consultationPriceUsd: Number(doctor.consultationPriceUsd) };
  });

  app.get("/v1/doctor/queue", async (request, reply) => {
    const user = await getAuthenticatedUser(request);
    if (!user?.doctor) return reply.code(403).send({ error: "Doctor access required" });
    const appointments = await prisma.appointment.findMany({
      where: { doctorId: user.doctor.id },
      orderBy: { scheduledAt: "asc" },
      take: 50,
      select: { id: true, scheduledAt: true, status: true, patientId: true, consultation: { select: { status: true } } },
    });
    return appointments.map((item) => ({ ...item, queueState: item.consultation?.status ?? item.status }));
  });
}
