import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "./server";
import { requireRole } from "./auth";
import { recordAudit } from "./audit";
import { AppointmentStateError, withLockedAppointment } from "./appointmentState";

const intakePayload = z.object({
  reasonForVisit: z.string().trim().max(2000).optional().nullable(),
  symptoms: z.string().trim().max(5000).optional().nullable(),
  allergies: z.string().trim().max(3000).optional().nullable(),
  medications: z.string().trim().max(3000).optional().nullable(),
  medicalHistory: z.string().trim().max(5000).optional().nullable(),
  surgeries: z.string().trim().max(3000).optional().nullable(),
  familyHistory: z.string().trim().max(3000).optional().nullable(),
  consentToConsult: z.boolean(),
});
async function requirePatient(request: FastifyRequest, reply: FastifyReply) {
  const user = await requireRole(request, reply, ["PATIENT"]);
  return user?.patient ?? null;
}
async function getAuthorizedAppointment(patientId: string, appointmentId: string, database: Pick<Prisma.TransactionClient, "appointment"> = prisma) {
  return database.appointment.findFirst({ where: { id: appointmentId, patientId }, select: { id: true, patientId: true, doctorId: true, scheduledAt: true, status: true, consultation: { select: { status: true, startedAt: true, endedAt: true } } } });
}

export async function registerMedicalIntakeRoutes(app: FastifyInstance) {
  app.get("/v1/appointments/:appointmentId/intake", async (request, reply) => {
    const patient = await requirePatient(request, reply);
    if (!patient) return;
    const { appointmentId } = z.object({ appointmentId: z.string().min(1).max(200) }).parse(request.params);
    const appointment = await getAuthorizedAppointment(patient.id, appointmentId);
    if (!appointment) return reply.code(404).send({ error: "Appointment not found" });
    const intake = await prisma.medicalIntake.findUnique({ where: { appointmentId } });
    await recordAudit(request, { actorUserId: patient.userId, action: "PATIENT_INTAKE_VIEWED", resourceType: "Appointment", resourceId: appointmentId, outcome: "SUCCESS" });
    return intake ?? { appointmentId, status: "DRAFT", consentToConsult: false };
  });
  app.put("/v1/appointments/:appointmentId/intake", async (request, reply) => {
    const patient = await requirePatient(request, reply);
    if (!patient) return;
    const { appointmentId } = z.object({ appointmentId: z.string().min(1).max(200) }).parse(request.params);
    const input = intakePayload.parse(request.body);
    try {
      return await withLockedAppointment({ id: appointmentId, patientId: patient.id }, async (tx) => {
        const appointment = await getAuthorizedAppointment(patient.id, appointmentId, tx);
        if (!appointment) throw new AppointmentStateError(404, "Appointment not found");
        if (appointment.status === "CANCELLED") throw new AppointmentStateError(409, "Intake cannot be changed for a cancelled appointment");
        if (appointment.consultation && (appointment.consultation.status !== "SCHEDULED" || appointment.consultation.startedAt || appointment.consultation.endedAt)) throw new AppointmentStateError(409, "Intake is part of an existing clinical record and can no longer be changed. Contact your care team to add a correction.");
        const now = new Date();
        const values = { ...input, consentedAt: input.consentToConsult ? now : null, status: input.consentToConsult ? "COMPLETED" : "DRAFT", completedAt: input.consentToConsult ? now : null };
        const intake = await tx.medicalIntake.upsert({ where: { appointmentId }, update: values, create: { appointmentId, patientId: patient.id, ...values } });
        await tx.auditLog.create({ data: { actorUserId: patient.userId, action: "PATIENT_INTAKE_UPDATED", resourceType: "MedicalIntake", resourceId: intake.id, outcome: "SUCCESS", ipAddress: request.ip } });
        return intake;
      });
    } catch (error) {
      if (error instanceof AppointmentStateError) return reply.code(error.statusCode).send({ error: error.message });
      throw error;
    }
  });
}
