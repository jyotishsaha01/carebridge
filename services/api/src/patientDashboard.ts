import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getAuthenticatedUser } from "./auth";
import { prisma } from "./server";

export async function registerPatientDashboardRoutes(app: FastifyInstance) {
  app.get("/v1/patient/dashboard", async (request, reply) => {
    const user = await getAuthenticatedUser(request);
    if (!user?.patient || user.role !== "PATIENT") return reply.code(401).send({ error: "Patient authentication required" });

    const patientId = user.patient.id;
    const upcomingWhere = { patientId, status: "BOOKED", scheduledAt: { gte: new Date() } };
    const [appointments, documents, consultations, appointmentCount, documentCount, consultationCount] = await Promise.all([
      prisma.appointment.findMany({
        where: upcomingWhere,
        include: { doctor: { select: { id: true, name: true, slug: true, specialty: { select: { name: true } } } } },
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
        include: { doctor: { select: { id: true, name: true, slug: true, specialty: { select: { name: true } } } }, prescription: { include: { items: true } }, followUps: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.appointment.count({ where: upcomingWhere }),
      prisma.medicalDocument.count({ where: { patientId } }),
      prisma.consultation.count({ where: { patientId } }),
    ]);

    return {
      patient: { id: patientId, firstName: user.patient.firstName, lastName: user.patient.lastName, country: user.patient.country },
      appointmentCount,
      documentCount,
      consultationCount,
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

  app.get("/v1/patient/appointments", async (request, reply) => {
    const user = await getAuthenticatedUser(request);
    if (!user?.patient || user.role !== "PATIENT") return reply.code(401).send({ error: "Patient authentication required" });
    const query = z.object({ view: z.enum(["upcoming", "all"]).default("all"), status: z.enum(["BOOKED", "COMPLETED", "CANCELLED"]).optional(), limit: z.coerce.number().int().min(1).max(100).default(20), offset: z.coerce.number().int().min(0).max(1_000_000).default(0) }).parse(request.query);
    const where = { patientId: user.patient.id, ...(query.view === "upcoming" ? { status: "BOOKED", scheduledAt: { gte: new Date() } } : query.status ? { status: query.status } : {}) };
    const [appointments, total] = await Promise.all([
      prisma.appointment.findMany({ where, select: { id: true, scheduledAt: true, durationMin: true, status: true, doctor: { select: { id: true, name: true, slug: true, specialty: { select: { name: true } } } }, consultation: { select: { id: true, status: true } } }, orderBy: [{ scheduledAt: query.view === "upcoming" ? "asc" : "desc" }, { id: "asc" }], take: query.limit, skip: query.offset }),
      prisma.appointment.count({ where }),
    ]);
    return { appointments, total, limit: query.limit, offset: query.offset };
  });

  app.get("/v1/patient/appointments/:id", async (request, reply) => {
    const user = await getAuthenticatedUser(request);
    if (!user?.patient || user.role !== "PATIENT") return reply.code(401).send({ error: "Patient authentication required" });
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const appointment = await prisma.appointment.findFirst({
      where: { id, patientId: user.patient.id },
      include: { doctor: { select: { id: true, name: true, slug: true, specialty: { select: { name: true } } } }, medicalIntake: true, consultation: { include: { prescription: { include: { items: true } }, followUps: true } } },
    });
    if (!appointment) return reply.code(404).send({ error: "Appointment not found" });
    return appointment;
  });
}
