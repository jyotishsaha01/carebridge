import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "./server";

const demoDoctorEmail = "dr-anil-sharma@demo.carebridge.local";

const consultationPayload = z.object({
  status: z.enum(["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]),
  summary: z.string().trim().max(10000).optional().nullable(),
});

const notePayload = z.object({
  assessment: z.string().trim().max(10000).optional().nullable(),
  findings: z.string().trim().max(10000).optional().nullable(),
  recommendations: z.string().trim().max(10000).optional().nullable(),
  privateNotes: z.string().trim().max(10000).optional().nullable(),
});

const prescriptionPayload = z.object({
  instructions: z.string().trim().max(5000).optional().nullable(),
  items: z.array(z.object({
    medication: z.string().trim().min(1).max(300),
    dose: z.string().trim().max(200).optional().nullable(),
    frequency: z.string().trim().max(200).optional().nullable(),
    duration: z.string().trim().max(200).optional().nullable(),
    route: z.string().trim().max(100).optional().nullable(),
    instructions: z.string().trim().max(1000).optional().nullable(),
  })).max(25),
});

const followUpPayload = z.object({
  dueAt: z.coerce.date().optional().nullable(),
  instructions: z.string().trim().max(5000).optional().nullable(),
  status: z.enum(["RECOMMENDED", "SCHEDULED", "COMPLETED", "CANCELLED"]).default("RECOMMENDED"),
});

async function getDemoDoctor() {
  const user = await prisma.user.findUnique({ where: { email: demoDoctorEmail } });
  if (!user || user.role !== "DOCTOR") return null;
  return prisma.doctor.findUnique({ where: { userId: user.id } });
}

export async function registerClinicalRoutes(app: FastifyInstance, allowDemoAuth: boolean) {
  app.get("/v1/doctor/appointments", async (_request, reply) => {
    if (!allowDemoAuth) return reply.code(401).send({ error: "Authentication required" });
    const doctor = await getDemoDoctor();
    if (!doctor) return reply.code(404).send({ error: "Doctor not found" });

    return prisma.appointment.findMany({
      where: { doctorId: doctor.id },
      orderBy: { scheduledAt: "asc" },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, country: true } },
        medicalIntake: { select: { status: true, reasonForVisit: true, symptoms: true, allergies: true, medications: true } },
        consultation: { select: { id: true, status: true, startedAt: true, endedAt: true, summary: true } },
      },
    });
  });

  app.put("/v1/doctor/appointments/:appointmentId/consultation", async (request, reply) => {
    if (!allowDemoAuth) return reply.code(401).send({ error: "Authentication required" });
    const doctor = await getDemoDoctor();
    if (!doctor) return reply.code(404).send({ error: "Doctor not found" });

    const { appointmentId } = z.object({ appointmentId: z.string().min(1) }).parse(request.params);
    const input = consultationPayload.parse(request.body);
    const appointment = await prisma.appointment.findFirst({ where: { id: appointmentId, doctorId: doctor.id } });
    if (!appointment) return reply.code(404).send({ error: "Appointment not found" });

    const now = new Date();
    const consultation = await prisma.consultation.upsert({
      where: { appointmentId },
      update: {
        status: input.status,
        summary: input.summary,
        startedAt: input.status === "IN_PROGRESS" ? now : undefined,
        endedAt: input.status === "COMPLETED" ? now : undefined,
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

    return consultation;
  });

  app.put("/v1/doctor/consultations/:consultationId/note", async (request, reply) => {
    if (!allowDemoAuth) return reply.code(401).send({ error: "Authentication required" });
    const doctor = await getDemoDoctor();
    if (!doctor) return reply.code(404).send({ error: "Doctor not found" });

    const { consultationId } = z.object({ consultationId: z.string().min(1) }).parse(request.params);
    const input = notePayload.parse(request.body);
    const consultation = await prisma.consultation.findFirst({ where: { id: consultationId, doctorId: doctor.id } });
    if (!consultation) return reply.code(404).send({ error: "Consultation not found" });

    return prisma.clinicalNote.create({
      data: { consultationId, ...input },
    });
  });

  app.put("/v1/doctor/consultations/:consultationId/prescription", async (request, reply) => {
    if (!allowDemoAuth) return reply.code(401).send({ error: "Authentication required" });
    const doctor = await getDemoDoctor();
    if (!doctor) return reply.code(404).send({ error: "Doctor not found" });

    const { consultationId } = z.object({ consultationId: z.string().min(1) }).parse(request.params);
    const input = prescriptionPayload.parse(request.body);
    const consultation = await prisma.consultation.findFirst({ where: { id: consultationId, doctorId: doctor.id } });
    if (!consultation) return reply.code(404).send({ error: "Consultation not found" });

    return prisma.$transaction(async (tx) => {
      await tx.prescriptionItem.deleteMany({ where: { prescription: { consultationId } } });
      return tx.prescription.upsert({
        where: { consultationId },
        update: {
          instructions: input.instructions,
          items: { create: input.items },
        },
        create: {
          consultationId,
          instructions: input.instructions,
          items: { create: input.items },
        },
        include: { items: true },
      });
    });
  });

  app.post("/v1/doctor/consultations/:consultationId/follow-up", async (request, reply) => {
    if (!allowDemoAuth) return reply.code(401).send({ error: "Authentication required" });
    const doctor = await getDemoDoctor();
    if (!doctor) return reply.code(404).send({ error: "Doctor not found" });

    const { consultationId } = z.object({ consultationId: z.string().min(1) }).parse(request.params);
    const input = followUpPayload.parse(request.body);
    const consultation = await prisma.consultation.findFirst({ where: { id: consultationId, doctorId: doctor.id } });
    if (!consultation) return reply.code(404).send({ error: "Consultation not found" });

    return prisma.followUp.create({ data: { consultationId, ...input } });
  });
}
