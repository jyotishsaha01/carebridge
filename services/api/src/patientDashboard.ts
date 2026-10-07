import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getAuthenticatedUser } from "./auth";
import { prisma } from "./server";

export async function registerPatientDashboardRoutes(app: FastifyInstance) {
  app.get("/v1/patient/dashboard", async (request, reply) => {
    const user = await getAuthenticatedUser(request);
    if (!user?.patient) return reply.code(401).send({ error: "Patient authentication required" });

    const patientId = user.patient.id;
    const [appointments, documents, consultations] = await Promise.all([
      prisma.appointment.findMany({
        where: { patientId },
        include: { doctor: { include: { specialty: true } } },
        orderBy: { scheduledAt: "asc" },
        take: 10,
      }),
      prisma.medicalDocument.findMany({
        where: { patientId },
        select: { id: true, originalFileName: true, contentType: true, sizeBytes: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.consultation.findMany({
        where: { patientId },
        include: { doctor: { include: { specialty: true } }, prescription: { include: { items: true } }, followUps: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    return {
      patient: { id: patientId, firstName: user.patient.firstName, lastName: user.patient.lastName, country: user.patient.country },
      appointments: appointments.map((item) => ({
        id: item.id,
        scheduledAt: item.scheduledAt,
        durationMin: item.durationMin,
        status: item.status,
        doctor: { name: item.doctor.name, specialty: item.doctor.specialty.name, slug: item.doctor.slug },
      })),
      documents,
      consultations: consultations.map((item) => ({
        id: item.id,
        status: item.status,
        startedAt: item.startedAt,
        endedAt: item.endedAt,
        summary: item.summary,
        doctor: { name: item.doctor.name, specialty: item.doctor.specialty.name, slug: item.doctor.slug },
        prescription: item.prescription ? { instructions: item.prescription.instructions, items: item.prescription.items } : null,
        followUps: item.followUps,
      })),
    };
  });

  app.get("/v1/patient/appointments/:id", async (request, reply) => {
    const user = await getAuthenticatedUser(request);
    if (!user?.patient) return reply.code(401).send({ error: "Patient authentication required" });
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const appointment = await prisma.appointment.findFirst({
      where: { id, patientId: user.patient.id },
      include: { doctor: { include: { specialty: true } }, medicalIntake: true, consultation: { include: { prescription: { include: { items: true } }, followUps: true } } },
    });
    if (!appointment) return reply.code(404).send({ error: "Appointment not found" });
    return appointment;
  });
}
