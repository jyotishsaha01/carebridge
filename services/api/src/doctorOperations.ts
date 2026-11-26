import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "./server";
import { requireRole, requireVerifiedDoctor } from "./auth";
import { recordAudit } from "./audit";
import { DoctorStateError, withLockedDoctor } from "./doctorState";
import { notifyUsersByRole, createNotification } from "./notificationsPrototype";

const slotInput = z.object({ startsAt: z.coerce.date(), endsAt: z.coerce.date() }).refine((v) => v.endsAt > v.startsAt, { message: "endsAt must be after startsAt" });

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
    const user = await requireVerifiedDoctor(request, reply);
    if (!user?.doctor) return;
    const query = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() }).parse(request.query);
    return prisma.availabilitySlot.findMany({ where: { doctorId: user.doctor.id, startsAt: query.from ? { gte: query.from, ...(query.to ? { lte: query.to } : {}) } : undefined }, orderBy: { startsAt: "asc" }, take: 200 });
  });

  app.post("/v1/doctor/availability", async (request, reply) => {
    const user = await requireVerifiedDoctor(request, reply);
    if (!user?.doctor) return;
    const input = slotInput.parse(request.body);
    if (input.startsAt <= new Date()) return reply.code(400).send({ error: "Availability must be in the future" });
    let slot;
    try {
      slot = await prisma.$transaction(async (tx) => {
        const overlap = await tx.availabilitySlot.findFirst({ where: { doctorId: user.doctor!.id, startsAt: { lt: input.endsAt }, endsAt: { gt: input.startsAt } } });
        if (overlap) return null;
        return tx.availabilitySlot.create({ data: { doctorId: user.doctor!.id, startsAt: input.startsAt, endsAt: input.endsAt, status: "AVAILABLE" } });
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (["P2002", "P2034"].includes((error as { code?: string }).code ?? "")) return reply.code(409).send({ error: "Availability changed while saving. Refresh and try again." });
      throw error;
    }
    if (!slot) return reply.code(409).send({ error: "Availability overlaps an existing slot" });
    await recordAudit(request, { actorUserId: user.id, action: "DOCTOR_AVAILABILITY_CREATED", resourceType: "AvailabilitySlot", resourceId: slot.id, outcome: "SUCCESS" });
    return reply.code(201).send(slot);
  });

  app.get("/v1/doctor/credentials", async (request, reply) => {
    const user = await requireRole(request, reply, ["DOCTOR"]);
    if (!user?.doctor) return;
    return prisma.doctorCredential.findMany({ where: { doctorId: user.doctor.id }, orderBy: { createdAt: "desc" } });
  });

  app.post("/v1/doctor/credentials", async (request, reply) => {
    const user = await requireRole(request, reply, ["DOCTOR"]);
    if (!user?.doctor) return;
    const input = z.object({
      type: z.string().trim().min(2).max(80),
      licenseNumber: z.string().trim().min(2).max(120),
      jurisdiction: z.string().trim().min(2).max(120),
      documentName: z.string().trim().max(200).optional(),
    }).parse(request.body);
    let result;
    try {
      result = await withLockedDoctor(user.doctor.id, async (tx) => {
        const existing = await tx.doctorCredential.findFirst({ where: { doctorId: user.doctor!.id, type: input.type, licenseNumber: input.licenseNumber, jurisdiction: input.jurisdiction }, orderBy: { createdAt: "desc" } });
        const credential = existing
          ? await tx.doctorCredential.update({ where: { id: existing.id }, data: { documentName: input.documentName ?? existing.documentName, status: "PENDING", reviewedAt: null, reviewedByUserId: null } })
          : await tx.doctorCredential.create({ data: { doctorId: user.doctor!.id, ...input } });
        await tx.doctor.update({ where: { id: user.doctor!.id }, data: { isVerified: false, isActive: false, status: "PENDING" } });
        await recordAudit(request, { actorUserId: user.id, action: "DOCTOR_CREDENTIAL_SUBMITTED", resourceType: "DoctorCredential", resourceId: credential.id, outcome: "SUCCESS", metadata: { resubmitted: Boolean(existing) } }, tx);
        return { credential, resubmitted: Boolean(existing) };
      });
    } catch (error) {
      if (error instanceof DoctorStateError) return reply.code(error.statusCode).send({ error: error.message });
      throw error;
    }
    try { await notifyUsersByRole("ADMIN", "DOCUMENT", "Doctor credential submitted", `${user.doctor.name ?? "A doctor"} submitted a credential for review.`); }
    catch { request.log.warn({ resourceType: "DoctorCredential" }, "Credential submission committed; notification delivery failed"); }
    return reply.code(result.resubmitted ? 200 : 201).send(result.credential);
  });

  app.delete("/v1/doctor/availability/:slotId", async (request, reply) => {
    const user = await requireVerifiedDoctor(request, reply);
    if (!user?.doctor) return;
    const { slotId } = z.object({ slotId: z.string().min(1) }).parse(request.params);
    const slot = await prisma.availabilitySlot.findFirst({ where: { id: slotId, doctorId: user.doctor.id } });
    if (!slot) return reply.code(404).send({ error: "Availability slot not found" });
    if (slot.status !== "AVAILABLE") return reply.code(409).send({ error: "Booked slots cannot be removed" });
    const deleted = await prisma.availabilitySlot.deleteMany({ where: { id: slot.id, doctorId: user.doctor.id, status: "AVAILABLE" } });
    if (deleted.count !== 1) return reply.code(409).send({ error: "Availability changed while removing it. Refresh and try again." });
    await recordAudit(request, { actorUserId: user.id, action: "DOCTOR_AVAILABILITY_DELETED", resourceType: "AvailabilitySlot", resourceId: slot.id, outcome: "SUCCESS" });
    return { ok: true };
  });
}
