import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "./server";
import { requireRole } from "./auth";
import { recordAudit } from "./audit";

const slotInput = z.object({ startAt: z.coerce.date(), endAt: z.coerce.date() }).refine((v) => v.endAt > v.startAt, { message: "endAt must be after startAt" });

export async function registerDoctorOperationsRoutes(app: FastifyInstance) {
  app.get("/v1/doctor/me", async (request, reply) => {
    const user = await requireRole(request, reply, ["DOCTOR"]);
    if (!user?.doctor) return;
    const doctor = await prisma.doctor.findUnique({ where: { id: user.doctor.id }, include: { specialty: true } });
    if (!doctor) return reply.code(404).send({ error: "Doctor profile not found" });
    return doctor;
  });

  app.patch("/v1/doctor/me/profile", async (request, reply) => {
    const user = await requireRole(request, reply, ["DOCTOR"]);
    if (!user?.doctor) return;
    const input = z.object({ bio: z.string().trim().max(4000).optional(), expertise: z.array(z.string().trim().min(2).max(120)).max(30).optional(), location: z.string().trim().max(160).optional(), consultationPriceUsd: z.coerce.number().positive().max(5000).optional() }).parse(request.body);
    const doctor = await prisma.doctor.update({ where: { id: user.doctor.id }, data: input, include: { specialty: true } });
    await recordAudit(request, { actorUserId: user.id, action: "DOCTOR_PROFILE_UPDATED", resourceType: "Doctor", resourceId: doctor.id, outcome: "SUCCESS" });
    return doctor;
  });

  app.get("/v1/doctor/availability", async (request, reply) => {
    const user = await requireRole(request, reply, ["DOCTOR"]);
    if (!user?.doctor) return;
    const query = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() }).parse(request.query);
    return prisma.availabilitySlot.findMany({ where: { doctorId: user.doctor.id, startAt: query.from ? { gte: query.from, ...(query.to ? { lte: query.to } : {}) } : undefined }, orderBy: { startAt: "asc" }, take: 200 });
  });

  app.post("/v1/doctor/availability", async (request, reply) => {
    const user = await requireRole(request, reply, ["DOCTOR"]);
    if (!user?.doctor) return;
    const input = slotInput.parse(request.body);
    if (input.startAt <= new Date()) return reply.code(400).send({ error: "Availability must be in the future" });
    const overlap = await prisma.availabilitySlot.findFirst({ where: { doctorId: user.doctor.id, startAt: { lt: input.endAt }, endAt: { gt: input.startAt } } });
    if (overlap) return reply.code(409).send({ error: "Availability overlaps an existing slot" });
    const slot = await prisma.availabilitySlot.create({ data: { doctorId: user.doctor.id, startAt: input.startAt, endAt: input.endAt, status: "OPEN" } });
    await recordAudit(request, { actorUserId: user.id, action: "DOCTOR_AVAILABILITY_CREATED", resourceType: "AvailabilitySlot", resourceId: slot.id, outcome: "SUCCESS" });
    return reply.code(201).send(slot);
  });

  app.delete("/v1/doctor/availability/:slotId", async (request, reply) => {
    const user = await requireRole(request, reply, ["DOCTOR"]);
    if (!user?.doctor) return;
    const { slotId } = z.object({ slotId: z.string().min(1) }).parse(request.params);
    const slot = await prisma.availabilitySlot.findFirst({ where: { id: slotId, doctorId: user.doctor.id } });
    if (!slot) return reply.code(404).send({ error: "Availability slot not found" });
    if (slot.status !== "OPEN") return reply.code(409).send({ error: "Booked slots cannot be removed" });
    await prisma.availabilitySlot.delete({ where: { id: slot.id } });
    await recordAudit(request, { actorUserId: user.id, action: "DOCTOR_AVAILABILITY_DELETED", resourceType: "AvailabilitySlot", resourceId: slot.id, outcome: "SUCCESS" });
    return { ok: true };
  });
}
