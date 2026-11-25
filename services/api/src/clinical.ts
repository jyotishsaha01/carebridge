import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "./server";
import { requireVerifiedDoctor } from "./auth";
import { recordAudit } from "./audit";
import { createNotification } from "./notificationsPrototype";
import { AppointmentStateError, withLockedAppointment } from "./appointmentState";

const consultationPayload = z.object({ status: z.enum(["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]), summary: z.string().trim().max(10000).optional().nullable() });
const notePayload = z.object({ assessment: z.string().trim().max(10000).optional().nullable(), findings: z.string().trim().max(10000).optional().nullable(), recommendations: z.string().trim().max(10000).optional().nullable(), privateNotes: z.string().trim().max(10000).optional().nullable() });
const prescriptionPayload = z.object({ instructions: z.string().trim().max(5000).optional().nullable(), items: z.array(z.object({ medication: z.string().trim().min(1).max(300), dose: z.string().trim().max(200).optional().nullable(), frequency: z.string().trim().max(200).optional().nullable(), duration: z.string().trim().max(200).optional().nullable(), route: z.string().trim().max(100).optional().nullable(), instructions: z.string().trim().max(1000).optional().nullable() })).max(25) });
const followUpPayload = z.object({ dueAt: z.coerce.date().optional().nullable(), instructions: z.string().trim().max(5000).optional().nullable(), status: z.enum(["RECOMMENDED", "SCHEDULED", "COMPLETED", "CANCELLED"]).default("RECOMMENDED") });

async function requireDoctor(request: FastifyRequest, reply: FastifyReply) {
  const user = await requireVerifiedDoctor(request, reply);
  if (!user?.doctor) return null;
  return user;
}

async function notifyPatient(request: FastifyRequest, patientId: string, type: "CONSULTATION" | "PRESCRIPTION" | "FOLLOW_UP", title: string, body: string) {
  try {
    const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { userId: true } });
    if (!patient?.userId) return;
    await createNotification({ userId: patient.userId, role: "PATIENT", type, title, body });
  } catch { request.log.warn({ resourceType: "Consultation" }, "Clinical change committed; notification delivery failed"); }
}

const consentSelection = { select: { consentToConsult: true, status: true } } as const;
function hasConsent(intake: { consentToConsult: boolean; status: string } | null | undefined) {
  return intake?.consentToConsult === true && intake.status === "COMPLETED";
}

export async function registerClinicalRoutes(app: FastifyInstance) {
  app.get("/v1/doctor/appointments", async (request, reply) => {
    const user = await requireDoctor(request, reply);
    if (!user?.doctor) return;
    const appointments = await prisma.appointment.findMany({
      where: { doctorId: user.doctor.id, status: { not: "CANCELLED" } },
      orderBy: { scheduledAt: "asc" },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, country: true } },
        medicalIntake: { select: { status: true, consentToConsult: true, reasonForVisit: true, symptoms: true, allergies: true, medications: true } },
        consultation: { select: { id: true, status: true, startedAt: true, endedAt: true, summary: true, notes: { orderBy: { createdAt: "desc" }, take: 10 }, prescription: { include: { items: true } }, followUps: { orderBy: { createdAt: "desc" } } } },
        documents: { select: { id: true, originalFileName: true, contentType: true, sizeBytes: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 50 },
      },
    });
    return appointments.map(({ medicalIntake, ...appointment }) => ({
      ...appointment,
      // Saving an intake draft does not submit its health details to the care team.
      medicalIntake: hasConsent(medicalIntake) ? medicalIntake : null,
    }));
  });

  app.put("/v1/doctor/appointments/:appointmentId/consultation", async (request, reply) => {
    const user = await requireDoctor(request, reply);
    if (!user?.doctor) return;
    const { appointmentId } = z.object({ appointmentId: z.string().min(1) }).parse(request.params);
    const input = consultationPayload.parse(request.body);
    let consultation;
    try {
      consultation = await withLockedAppointment({ id: appointmentId, doctorId: user.doctor.id }, async (tx) => {
        const appointment = await tx.appointment.findFirst({ where: { id: appointmentId, doctorId: user.doctor!.id }, include: { medicalIntake: consentSelection, consultation: { select: { status: true, startedAt: true, endedAt: true } } } });
        if (!appointment) throw new AppointmentStateError(404, "Appointment not found");
        if (appointment.status === "CANCELLED") throw new AppointmentStateError(409, "A cancelled appointment cannot have an active consultation");
        if (["IN_PROGRESS", "COMPLETED"].includes(input.status) && !hasConsent(appointment.medicalIntake)) throw new AppointmentStateError(409, "The patient must submit their consultation consent before clinical care can begin");
        if (appointment.consultation && ["COMPLETED", "CANCELLED"].includes(appointment.consultation.status) && input.status !== appointment.consultation.status) throw new AppointmentStateError(409, "A completed or cancelled consultation cannot be reopened");
        if (appointment.consultation?.status === "IN_PROGRESS" && input.status === "SCHEDULED") throw new AppointmentStateError(409, "A started consultation cannot return to an editable intake state");

        const now = new Date();
        const updated = await tx.consultation.upsert({
          where: { appointmentId },
          update: {
            status: input.status,
            summary: input.summary,
            startedAt: input.status === "IN_PROGRESS" && !appointment.consultation?.startedAt ? now : undefined,
            endedAt: input.status === "COMPLETED" && !appointment.consultation?.endedAt ? now : undefined,
          },
          create: {
            appointmentId,
            patientId: appointment.patientId,
            doctorId: appointment.doctorId,
            status: input.status,
            summary: input.summary,
            startedAt: input.status === "IN_PROGRESS" ? now : null,
            endedAt: input.status === "COMPLETED" ? now : null,
          },
        });
        await recordAudit(request, { actorUserId: user.id, action: "CLINICAL_CONSULTATION_STATUS", resourceType: "Consultation", resourceId: updated.id, outcome: "SUCCESS", metadata: { status: input.status } }, tx);
        return updated;
      });
    } catch (error) {
      if (error instanceof AppointmentStateError) return reply.code(error.statusCode).send({ error: error.message });
      throw error;
    }

    if (input.status === "COMPLETED") {
      await notifyPatient(
        request,
        consultation.patientId,
        "CONSULTATION",
        "Consultation completed",
        "Your specialist consultation is complete. Review your consultation summary and any follow-up recommendations."
      );
    }

    return consultation;
  });

  app.put("/v1/doctor/consultations/:consultationId/note", async (request, reply) => {
    const user = await requireDoctor(request, reply);
    if (!user?.doctor) return;
    const { consultationId } = z.object({ consultationId: z.string().min(1) }).parse(request.params);
    const input = notePayload.parse(request.body);
    const consultation = await prisma.consultation.findFirst({ where: { id: consultationId, doctorId: user.doctor.id, status: { not: "CANCELLED" }, appointment: { status: { not: "CANCELLED" } } }, include: { appointment: { select: { medicalIntake: consentSelection } } } });
    if (!consultation) return reply.code(404).send({ error: "Consultation not found" });
    if (!["IN_PROGRESS", "COMPLETED"].includes(consultation.status)) return reply.code(409).send({ error: "The consultation must be started before clinical records can be changed" });
    if (!hasConsent(consultation.appointment.medicalIntake)) return reply.code(409).send({ error: "The patient must submit their consultation consent before clinical records can be changed" });
    const note = await prisma.$transaction(async (tx) => {
      const created = await tx.clinicalNote.create({ data: { consultationId, ...input } });
      await recordAudit(request, { actorUserId: user.id, action: "CLINICAL_NOTE_CREATED", resourceType: "ClinicalNote", resourceId: created.id, outcome: "SUCCESS" }, tx);
      return created;
    });
    return note;
  });

  app.put("/v1/doctor/consultations/:consultationId/prescription", async (request, reply) => {
    const user = await requireDoctor(request, reply);
    if (!user?.doctor) return;
    const { consultationId } = z.object({ consultationId: z.string().min(1) }).parse(request.params);
    const input = prescriptionPayload.parse(request.body);
    const consultation = await prisma.consultation.findFirst({ where: { id: consultationId, doctorId: user.doctor.id, status: { not: "CANCELLED" }, appointment: { status: { not: "CANCELLED" } } }, include: { appointment: { select: { medicalIntake: consentSelection } } } });
    if (!consultation) return reply.code(404).send({ error: "Consultation not found" });
    if (!["IN_PROGRESS", "COMPLETED"].includes(consultation.status)) return reply.code(409).send({ error: "The consultation must be started before clinical records can be changed" });
    if (!hasConsent(consultation.appointment.medicalIntake)) return reply.code(409).send({ error: "The patient must submit their consultation consent before clinical records can be changed" });
    const prescription = await prisma.$transaction(async tx => {
      await tx.prescriptionItem.deleteMany({ where: { prescription: { consultationId } } });
      const updated = await tx.prescription.upsert({ where: { consultationId }, update: { instructions: input.instructions, items: { create: input.items } }, create: { consultationId, instructions: input.instructions, items: { create: input.items } }, include: { items: true } });
      await recordAudit(request, { actorUserId: user.id, action: "CLINICAL_PRESCRIPTION_SAVED", resourceType: "Prescription", resourceId: updated.id, outcome: "SUCCESS" }, tx);
      return updated;
    });
    await notifyPatient(request, consultation.patientId, "PRESCRIPTION", "Prescription available", "Your specialist has added or updated a prescription. Review it in your CareBridge records.");
    return prescription;
  });

  app.post("/v1/doctor/consultations/:consultationId/follow-up", async (request, reply) => {
    const user = await requireDoctor(request, reply);
    if (!user?.doctor) return;
    const { consultationId } = z.object({ consultationId: z.string().min(1) }).parse(request.params);
    const input = followUpPayload.parse(request.body);
    const consultation = await prisma.consultation.findFirst({ where: { id: consultationId, doctorId: user.doctor.id, status: { not: "CANCELLED" }, appointment: { status: { not: "CANCELLED" } } }, include: { appointment: { select: { medicalIntake: consentSelection } } } });
    if (!consultation) return reply.code(404).send({ error: "Consultation not found" });
    if (!["IN_PROGRESS", "COMPLETED"].includes(consultation.status)) return reply.code(409).send({ error: "The consultation must be started before clinical records can be changed" });
    if (!hasConsent(consultation.appointment.medicalIntake)) return reply.code(409).send({ error: "The patient must submit their consultation consent before clinical records can be changed" });
    const followUp = await prisma.$transaction(async (tx) => {
      const created = await tx.followUp.create({ data: { consultationId, ...input } });
      await recordAudit(request, { actorUserId: user.id, action: "CLINICAL_FOLLOWUP_CREATED", resourceType: "FollowUp", resourceId: created.id, outcome: "SUCCESS" }, tx);
      return created;
    });
    await notifyPatient(request, consultation.patientId, "FOLLOW_UP", "Follow-up recommendation", input.instructions ?? "Your specialist has added a follow-up recommendation.");
    return followUp;
  });
}
