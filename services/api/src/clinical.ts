import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "./server";
import { requireRole } from "./auth";
import { recordAudit } from "./audit";

const consultationPayload = z.object({ status: z.enum(["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]), summary: z.string().trim().max(10000).optional().nullable() });
const notePayload = z.object({ assessment: z.string().trim().max(10000).optional().nullable(), findings: z.string().trim().max(10000).optional().nullable(), recommendations: z.string().trim().max(10000).optional().nullable(), privateNotes: z.string().trim().max(10000).optional().nullable() });
const prescriptionPayload = z.object({ instructions: z.string().trim().max(5000).optional().nullable(), items: z.array(z.object({ medication: z.string().trim().min(1).max(300), dose: z.string().trim().max(200).optional().nullable(), frequency: z.string().trim().max(200).optional().nullable(), duration: z.string().trim().max(200).optional().nullable(), route: z.string().trim().max(100).optional().nullable(), instructions: z.string().trim().max(1000).optional().nullable() })).max(25) });
const followUpPayload = z.object({ dueAt: z.coerce.date().optional().nullable(), instructions: z.string().trim().max(5000).optional().nullable(), status: z.enum(["RECOMMENDED", "SCHEDULED", "COMPLETED", "CANCELLED"]).default("RECOMMENDED") });

async function requireDoctor(request: FastifyRequest, reply: FastifyReply) {
  const user = await requireRole(request, reply, ["DOCTOR"]);
  if (!user?.doctor) return null;
  return user;
}

export async function registerClinicalRoutes(app: FastifyInstance) {
  app.get("/v1/doctor/appointments", async (request, reply) => {
    const user = await requireDoctor(request, reply);
    if (!user?.doctor) return;
    return prisma.appointment.findMany({ where: { doctorId: user.doctor.id }, orderBy: { scheduledAt: "asc" }, include: { patient: { select: { id: true, firstName: true, lastName: true, country: true } }, medicalIntake: { select: { status: true, reasonForVisit: true, symptoms: true, allergies: true, medications: true } }, consultation: { select: { id: true, status: true, startedAt: true, endedAt: true, summary: true } } } });
  });

  app.put("/v1/doctor/appointments/:appointmentId/consultation", async (request, reply) => {
    const user = await requireDoctor(request, reply); if (!user?.doctor) return;
    const { appointmentId } = z.object({ appointmentId: z.string().min(1) }).parse(request.params); const input = consultationPayload.parse(request.body);
    const appointment = await prisma.appointment.findFirst({ where: { id: appointmentId, doctorId: user.doctor.id } }); if (!appointment) return reply.code(404).send({ error: "Appointment not found" });
    const now = new Date(); const consultation = await prisma.consultation.upsert({ where: { appointmentId }, update: { status: input.status, summary: input.summary, startedAt: input.status === "IN_PROGRESS" ? now : undefined, endedAt: input.status === "COMPLETED" ? now : undefined }, create: { appointmentId, patientId: appointment.patientId, doctorId: appointment.doctorId, status: input.status, summary: input.summary, startedAt: input.status === "IN_PROGRESS" ? now : null, endedAt: input.status === "COMPLETED" ? now : null } });
    await recordAudit(request, { actorUserId: user.id, action: "CLINICAL_CONSULTATION_STATUS", resourceType: "Consultation", resourceId: consultation.id, outcome: "SUCCESS", metadata: { status: input.status } });
    return consultation;
  });

  app.put("/v1/doctor/consultations/:consultationId/note", async (request, reply) => {
    const user = await requireDoctor(request, reply); if (!user?.doctor) return;
    const { consultationId } = z.object({ consultationId: z.string().min(1) }).parse(request.params); const input = notePayload.parse(request.body);
    const consultation = await prisma.consultation.findFirst({ where: { id: consultationId, doctorId: user.doctor.id } }); if (!consultation) return reply.code(404).send({ error: "Consultation not found" });
    const note = await prisma.clinicalNote.create({ data: { consultationId, ...input } });
    await recordAudit(request, { actorUserId: user.id, action: "CLINICAL_NOTE_CREATED", resourceType: "ClinicalNote", resourceId: note.id, outcome: "SUCCESS" });
    return note;
  });

  app.put("/v1/doctor/consultations/:consultationId/prescription", async (request, reply) => {
    const user = await requireDoctor(request, reply); if (!user?.doctor) return;
    const { consultationId } = z.object({ consultationId: z.string().min(1) }).parse(request.params); const input = prescriptionPayload.parse(request.body);
    const consultation = await prisma.consultation.findFirst({ where: { id: consultationId, doctorId: user.doctor.id } }); if (!consultation) return reply.code(404).send({ error: "Consultation not found" });
    const prescription = await prisma.$transaction(async tx => { await tx.prescriptionItem.deleteMany({ where: { prescription: { consultationId } } }); return tx.prescription.upsert({ where: { consultationId }, update: { instructions: input.instructions, items: { create: input.items } }, create: { consultationId, instructions: input.instructions, items: { create: input.items } }, include: { items: true } }); });
    await recordAudit(request, { actorUserId: user.id, action: "CLINICAL_PRESCRIPTION_SAVED", resourceType: "Prescription", resourceId: prescription.id, outcome: "SUCCESS" });
    return prescription;
  });

  app.post("/v1/doctor/consultations/:consultationId/follow-up", async (request, reply) => {
    const user = await requireDoctor(request, reply); if (!user?.doctor) return;
    const { consultationId } = z.object({ consultationId: z.string().min(1) }).parse(request.params); const input = followUpPayload.parse(request.body);
    const consultation = await prisma.consultation.findFirst({ where: { id: consultationId, doctorId: user.doctor.id } }); if (!consultation) return reply.code(404).send({ error: "Consultation not found" });
    const followUp = await prisma.followUp.create({ data: { consultationId, ...input } });
    await recordAudit(request, { actorUserId: user.id, action: "CLINICAL_FOLLOWUP_CREATED", resourceType: "FollowUp", resourceId: followUp.id, outcome: "SUCCESS" });
    return followUp;
  });
}
