import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "./server";
import { requireRole } from "./auth";

const appointmentParams = z.object({ appointmentId: z.string().trim().min(1).max(128) });
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

async function getAuthorizedAppointment(patientId: string, appointmentId: string) {
  return prisma.appointment.findFirst({
    where: { id: appointmentId, patientId },
    select: { id: true, patientId: true },
  });
}

function validationError(reply: FastifyReply, message: string, issues: Array<{ path: PropertyKey[]; message: string }>) {
  return reply.code(400).send({
    error: message,
    issues: issues.map((issue) => ({ field: issue.path.map(String).join("."), message: issue.message })),
  });
}

export async function registerMedicalIntakeRoutes(app: FastifyInstance) {
  app.get("/v1/appointments/:appointmentId/intake", async (request, reply) => {
    const patient = await requirePatient(request, reply);
    if (!patient) return;

    const params = appointmentParams.safeParse(request.params);
    if (!params.success) return validationError(reply, "Invalid appointment ID", params.error.issues);

    const appointment = await getAuthorizedAppointment(patient.id, params.data.appointmentId);
    if (!appointment) return reply.code(404).send({ error: "Appointment not found for this patient" });

    const intake = await prisma.medicalIntake.findUnique({ where: { appointmentId: appointment.id } });
    return intake ?? {
      appointmentId: appointment.id,
      patientId: patient.id,
      status: "DRAFT",
      consentToConsult: false,
      reasonForVisit: "",
      symptoms: "",
      allergies: "",
      medications: "",
      medicalHistory: "",
      surgeries: "",
      familyHistory: "",
    };
  });

  app.put("/v1/appointments/:appointmentId/intake", async (request, reply) => {
    const patient = await requirePatient(request, reply);
    if (!patient) return;

    const params = appointmentParams.safeParse(request.params);
    if (!params.success) return validationError(reply, "Invalid appointment ID", params.error.issues);

    const parsed = intakePayload.safeParse(request.body);
    if (!parsed.success) return validationError(reply, "Please check the questionnaire fields and try again", parsed.error.issues);

    const appointment = await getAuthorizedAppointment(patient.id, params.data.appointmentId);
    if (!appointment) return reply.code(404).send({ error: "Appointment not found for this patient" });

    const input = {
      reasonForVisit: parsed.data.reasonForVisit ?? "",
      symptoms: parsed.data.symptoms ?? "",
      allergies: parsed.data.allergies ?? "",
      medications: parsed.data.medications ?? "",
      medicalHistory: parsed.data.medicalHistory ?? "",
      surgeries: parsed.data.surgeries ?? "",
      familyHistory: parsed.data.familyHistory ?? "",
      consentToConsult: parsed.data.consentToConsult,
    };
    const now = new Date();
    const completed = input.consentToConsult;

    try {
      const saved = await prisma.medicalIntake.upsert({
        where: { appointmentId: appointment.id },
        update: {
          ...input,
          consentedAt: completed ? now : null,
          status: completed ? "COMPLETED" : "DRAFT",
          completedAt: completed ? now : null,
        },
        create: {
          appointmentId: appointment.id,
          patientId: patient.id,
          ...input,
          consentedAt: completed ? now : null,
          status: completed ? "COMPLETED" : "DRAFT",
          completedAt: completed ? now : null,
        },
      });
      return reply.code(200).send(saved);
    } catch (error) {
      request.log.error({ err: error, appointmentId: appointment.id }, "Failed to persist medical intake");
      return reply.code(500).send({ error: "Your questionnaire could not be saved right now. Your answers remain on this page; please retry." });
    }
  });
}
