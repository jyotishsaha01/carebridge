import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "./server";

const demoEmail = "demo-patient@demo.carebridge.local";

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

async function getDemoPatient() {
  const user = await prisma.user.findUnique({ where: { email: demoEmail } });
  if (!user || user.role !== "PATIENT") return null;
  return prisma.patient.findUnique({ where: { userId: user.id } });
}

async function getAuthorizedAppointment(appointmentId: string) {
  const patient = await getDemoPatient();
  if (!patient) return null;
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, patientId: patient.id },
    select: { id: true, patientId: true, doctorId: true, scheduledAt: true, status: true },
  });
  return appointment ? { patient, appointment } : null;
}

export async function registerMedicalIntakeRoutes(app: FastifyInstance, allowDemoAuth: boolean) {
  app.get("/v1/appointments/:appointmentId/intake", async (request, reply) => {
    if (!allowDemoAuth) return reply.code(401).send({ error: "Authentication required" });

    const { appointmentId } = z.object({ appointmentId: z.string().min(1) }).parse(request.params);
    const authorized = await getAuthorizedAppointment(appointmentId);
    if (!authorized) return reply.code(404).send({ error: "Appointment not found" });

    const intake = await prisma.medicalIntake.findUnique({ where: { appointmentId } });
    return intake ?? { appointmentId, status: "DRAFT", consentToConsult: false };
  });

  app.put("/v1/appointments/:appointmentId/intake", async (request, reply) => {
    if (!allowDemoAuth) return reply.code(401).send({ error: "Authentication required" });

    const { appointmentId } = z.object({ appointmentId: z.string().min(1) }).parse(request.params);
    const input = intakePayload.parse(request.body);
    const authorized = await getAuthorizedAppointment(appointmentId);
    if (!authorized) return reply.code(404).send({ error: "Appointment not found" });

    const completed = input.consentToConsult;
    const now = new Date();
    const intake = await prisma.medicalIntake.upsert({
      where: { appointmentId },
      update: {
        ...input,
        consentedAt: input.consentToConsult ? now : null,
        status: completed ? "COMPLETED" : "DRAFT",
        completedAt: completed ? now : null,
      },
      create: {
        appointmentId,
        patientId: authorized.patient.id,
        ...input,
        consentedAt: input.consentToConsult ? now : null,
        status: completed ? "COMPLETED" : "DRAFT",
        completedAt: completed ? now : null,
      },
    });

    return reply.code(200).send(intake);
  });
}
