import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "./server";
import { requireRole } from "./auth";
import { recordAudit } from "./audit";
import { createNotification } from "./notificationsPrototype";

const consultationPayload = z.object({ status: z.enum(["IN_PROGRESS", "COMPLETED"]), summary: z.string().trim().max(10000).optional().nullable() });
const notePayload = z.object({ assessment: z.string().trim().max(10000).optional().nullable(), findings: z.string().trim().max(10000).optional().nullable(), recommendations: z.string().trim().max(10000).optional().nullable(), privateNotes: z.string().trim().max(10000).optional().nullable() });
const prescriptionPayload = z.object({ instructions: z.string().trim().max(5000).optional().nullable(), items: z.array(z.object({ medication: z.string().trim().min(1).max(300), dose: z.string().trim().max(200).optional().nullable(), frequency: z.string().trim().max(200).optional().nullable(), duration: z.string().trim().max(200).optional().nullable(), route: z.string().trim().max(100).optional().nullable(), instructions: z.string().trim().max(1000).optional().nullable() })).max(25) });
const followUpPayload = z.object({ dueAt: z.coerce.date().optional().nullable(), instructions: z.string().trim().max(5000).optional().nullable(), status: z.enum(["RECOMMENDED", "SCHEDULED", "COMPLETED", "CANCELLED"]).default("RECOMMENDED") });

async function requireDoctor(request: FastifyRequest, reply: FastifyReply) {
  const user = await requireRole(request, reply, ["DOCTOR"]);
  if (!user?.doctor) return null;
  return user;
}

async function notifyPatient(patientId: string, type: "CONSULTATION" | "PRESCRIPTION" | "FOLLOW_UP", title: string, body: string) {
  const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { userId: true } });
  if (!patient?.userId) return;
  await createNotification({ userId: patient.userId, role: "PATIENT", type, title, body });
}

export async function registerClinicalRoutes(app: FastifyInstance) {
  app.get("/v1/doctor/appointments", async (request, reply) => {
    const user = await requireDoctor(request, reply);
    if (!user?.doctor) return;
    return prisma.appointment.findMany({
      where: { doctorId: user.doctor.id },
      orderBy: { scheduledAt: "asc" },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, country: true } },
        medicalIntake: { select: { status: true, reasonForVisit: true, symptoms: true, allergies: true, medications: true } },
        consultation: { select: { id: true, status: true, startedAt: true, endedAt: true, summary: true } },
        documents: { select: { id: true, originalFileName: true, contentType: true, sizeBytes: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 50 },
      },
    });
  });

  app.post("/v1/doctor/appointments/:appointmentId/cancel", async (request, reply) => {
    const user = await requireDoctor(request, reply);
    if (!user?.doctor) return;
    const { appointmentId } = z.object({ appointmentId: z.string().trim().min(1) }).parse(request.params);
    const input = z.object({ reason: z.string().trim().min(3).max(1000) }).parse(request.body);

    const appointment = await prisma.appointment.findFirst({
      where: { id: appointmentId, doctorId: user.doctor.id },
      include: { patient: { select: { userId: true } }, consultation: { select: { status: true } } },
    });
    if (!appointment) return reply.code(404).send({ error: "Appointment not found" });
    if (appointment.status !== "BOOKED") {
      return reply.code(409).send({ error: "Only booked appointments can be cancelled" });
    }
    if (appointment.scheduledAt <= new Date()) {
      return reply.code(409).send({ error: "Past or in-progress appointments cannot be cancelled" });
    }
    if (appointment.consultation && ["IN_PROGRESS", "COMPLETED"].includes(appointment.consultation.status)) {
      return reply.code(409).send({ error: "A started or completed consultation cannot be cancelled" });
    }

    try {
      await prisma.$transaction(async (tx) => {
        const changed = await tx.appointment.updateMany({
          where: { id: appointmentId, doctorId: user.doctor!.id, status: "BOOKED", scheduledAt: { gt: new Date() } },
          data: { status: "CANCELLED" },
        });
        if (changed.count !== 1) throw new Error("APPOINTMENT_NOT_CANCELLABLE");
        await tx.availabilitySlot.updateMany({
          where: { doctorId: user.doctor!.id, startsAt: appointment.scheduledAt, status: "BOOKED" },
          data: { status: "AVAILABLE" },
        });
      });
    } catch (error) {
      if (error instanceof Error && error.message === "APPOINTMENT_NOT_CANCELLABLE") {
        return reply.code(409).send({ error: "Appointment status changed; refresh and try again" });
      }
      throw error;
    }

    await recordAudit(request, {
      actorUserId: user.id,
      action: "DOCTOR_APPOINTMENT_CANCELLED",
      resourceType: "Appointment",
      resourceId: appointment.id,
      outcome: "SUCCESS",
      metadata: { reason: input.reason },
    });
    if (appointment.patient.userId) {
      await createNotification({
        userId: appointment.patient.userId,
        role: "PATIENT",
        type: "CONSULTATION",
        title: "Appointment cancelled by your doctor",
        body: "Your appointment scheduled for " + appointment.scheduledAt.toISOString() + " was cancelled. Reason: " + input.reason,
      });
    }
    return { id: appointment.id, status: "CANCELLED" };
  });

  app.put("/v1/doctor/appointments/:appointmentId/consultation", async (request, reply) => {
    const user = await requireDoctor(request, reply);
    if (!user?.doctor) return;
    const { appointmentId } = z.object({ appointmentId: z.string().trim().min(1) }).parse(request.params);
    const input = consultationPayload.parse(request.body);
    const appointment = await prisma.appointment.findFirst({
      where: { id: appointmentId, doctorId: user.doctor.id },
      include: { consultation: true },
    });
    if (!appointment) return reply.code(404).send({ error: "Appointment not found" });

    const currentConsultationStatus = appointment.consultation?.status ?? null;
    if (input.status === "IN_PROGRESS") {
      if (appointment.status !== "BOOKED" || (currentConsultationStatus !== null && currentConsultationStatus !== "SCHEDULED")) {
        return reply.code(409).send({ error: "Only a booked appointment with no started consultation can be started" });
      }
    } else if (currentConsultationStatus !== "IN_PROGRESS") {
      return reply.code(409).send({ error: "Start the consultation before completing it" });
    }

    const now = new Date();
    let consultation;
    try {
      consultation = await prisma.$transaction(async (tx) => {
        const allowedAppointmentStatuses = input.status === "IN_PROGRESS" ? ["BOOKED"] : ["BOOKED", "IN_PROGRESS"];
        const changed = await tx.appointment.updateMany({
          where: { id: appointmentId, doctorId: user.doctor!.id, status: { in: allowedAppointmentStatuses } },
          data: { status: input.status },
        });
        if (changed.count !== 1) throw new Error("APPOINTMENT_STATE_CHANGED");

        if (appointment.consultation) {
          const allowedConsultationStatuses = input.status === "IN_PROGRESS" ? ["SCHEDULED"] : ["IN_PROGRESS"];
          const updated = await tx.consultation.updateMany({
            where: { id: appointment.consultation.id, doctorId: user.doctor!.id, status: { in: allowedConsultationStatuses } },
            data: {
              status: input.status,
              summary: input.summary,
              startedAt: input.status === "IN_PROGRESS" ? now : undefined,
              endedAt: input.status === "COMPLETED" ? now : undefined,
            },
          });
          if (updated.count !== 1) throw new Error("CONSULTATION_STATE_CHANGED");
          return tx.consultation.findUniqueOrThrow({ where: { id: appointment.consultation.id } });
        }

        if (input.status !== "IN_PROGRESS") throw new Error("CONSULTATION_NOT_STARTED");
        return tx.consultation.create({
          data: {
            appointmentId,
            patientId: appointment.patientId,
            doctorId: appointment.doctorId,
            status: "IN_PROGRESS",
            summary: input.summary,
            startedAt: now,
          },
        });
      });
    } catch (error) {
      if (error instanceof Error && ["APPOINTMENT_STATE_CHANGED", "CONSULTATION_STATE_CHANGED", "CONSULTATION_NOT_STARTED"].includes(error.message)) {
        return reply.code(409).send({ error: "Appointment or consultation status changed. Refresh the workspace and try again." });
      }
      throw error;
    }

    await recordAudit(request, { actorUserId: user.id, action: "CLINICAL_CONSULTATION_STATUS", resourceType: "Consultation", resourceId: consultation.id, outcome: "SUCCESS", metadata: { status: input.status } });

    if (input.status === "COMPLETED") {
      await notifyPatient(
        appointment.patientId,
        "CONSULTATION",
        "Consultation completed",
        "Your specialist consultation is complete. Review your consultation summary and any follow-up recommendations."
      );
    }

    return consultation;
  });

  app.get("/v1/doctor/appointments/:appointmentId/clinical-record", async (request, reply) => {
    const user = await requireDoctor(request, reply);
    if (!user?.doctor) return;
    const { appointmentId } = z.object({ appointmentId: z.string().trim().min(1) }).parse(request.params);
    const appointment = await prisma.appointment.findFirst({
      where: { id: appointmentId, doctorId: user.doctor.id },
      select: { id: true },
    });
    if (!appointment) return reply.code(404).send({ error: "Appointment not found" });

    const consultation = await prisma.consultation.findFirst({
      where: { appointmentId, doctorId: user.doctor.id },
    });
    if (!consultation) return { consultation: null, notes: [], prescription: null, followUps: [] };

    const [notes, prescription, followUps] = await Promise.all([
      prisma.clinicalNote.findMany({ where: { consultationId: consultation.id }, orderBy: { createdAt: "desc" } }),
      prisma.prescription.findUnique({ where: { consultationId: consultation.id }, include: { items: true } }),
      prisma.followUp.findMany({ where: { consultationId: consultation.id }, orderBy: { createdAt: "desc" } }),
    ]);
    return { consultation, notes, prescription, followUps };
  });

  app.put("/v1/doctor/consultations/:consultationId/note", async (request, reply) => {
    const user = await requireDoctor(request, reply);
    if (!user?.doctor) return;
    const { consultationId } = z.object({ consultationId: z.string().min(1) }).parse(request.params);
    const input = notePayload.parse(request.body);
    const consultation = await prisma.consultation.findFirst({ where: { id: consultationId, doctorId: user.doctor.id } });
    if (!consultation) return reply.code(404).send({ error: "Consultation not found" });
    if (consultation.status !== "IN_PROGRESS") return reply.code(409).send({ error: "Clinical notes can only be saved while the consultation is in progress" });
    const note = await prisma.$transaction(async tx => {
      const existing = await tx.clinicalNote.findFirst({
        where: { consultationId },
        orderBy: { createdAt: "desc" },
      });
      if (existing) {
        return tx.clinicalNote.update({ where: { id: existing.id }, data: input });
      }
      return tx.clinicalNote.create({ data: { consultationId, ...input } });
    });
    await recordAudit(request, { actorUserId: user.id, action: "CLINICAL_NOTE_SAVED", resourceType: "ClinicalNote", resourceId: note.id, outcome: "SUCCESS" });
    return note;
  });

  app.put("/v1/doctor/consultations/:consultationId/prescription", async (request, reply) => {
    const user = await requireDoctor(request, reply);
    if (!user?.doctor) return;
    const { consultationId } = z.object({ consultationId: z.string().min(1) }).parse(request.params);
    const input = prescriptionPayload.parse(request.body);
    const consultation = await prisma.consultation.findFirst({ where: { id: consultationId, doctorId: user.doctor.id } });
    if (!consultation) return reply.code(404).send({ error: "Consultation not found" });
    if (consultation.status !== "IN_PROGRESS" && consultation.status !== "COMPLETED") return reply.code(409).send({ error: "Prescriptions can only be saved for an active or completed consultation" });
    const prescription = await prisma.$transaction(async tx => {
      await tx.prescriptionItem.deleteMany({ where: { prescription: { consultationId } } });
      return tx.prescription.upsert({ where: { consultationId }, update: { instructions: input.instructions, items: { create: input.items } }, create: { consultationId, instructions: input.instructions, items: { create: input.items } }, include: { items: true } });
    });
    await recordAudit(request, { actorUserId: user.id, action: "CLINICAL_PRESCRIPTION_SAVED", resourceType: "Prescription", resourceId: prescription.id, outcome: "SUCCESS" });
    await notifyPatient(consultation.patientId, "PRESCRIPTION", "Prescription available", "Your specialist has added or updated a prescription. Review it in your CareBridge records.");
    return prescription;
  });

  app.post("/v1/doctor/consultations/:consultationId/follow-up", async (request, reply) => {
    const user = await requireDoctor(request, reply);
    if (!user?.doctor) return;
    const { consultationId } = z.object({ consultationId: z.string().min(1) }).parse(request.params);
    const input = followUpPayload.parse(request.body);
    const consultation = await prisma.consultation.findFirst({ where: { id: consultationId, doctorId: user.doctor.id } });
    if (!consultation) return reply.code(404).send({ error: "Consultation not found" });
    if (consultation.status !== "IN_PROGRESS" && consultation.status !== "COMPLETED") return reply.code(409).send({ error: "Follow-ups can only be added for an active or completed consultation" });
    const followUp = await prisma.followUp.create({ data: { consultationId, ...input } });
    await recordAudit(request, { actorUserId: user.id, action: "CLINICAL_FOLLOWUP_CREATED", resourceType: "FollowUp", resourceId: followUp.id, outcome: "SUCCESS" });
    await notifyPatient(consultation.patientId, "FOLLOW_UP", "Follow-up recommendation", input.instructions ?? "Your specialist has added a follow-up recommendation.");
    return followUp;
  });
}
