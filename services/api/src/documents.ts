import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "./server";
import { createUploadIntent } from "./storage";

const demoEmail = "demo-patient@demo.carebridge.local";

async function getDemoPatient() {
  const user = await prisma.user.findUnique({ where: { email: demoEmail } });
  if (!user || user.role !== "PATIENT") return null;
  return prisma.patient.findUnique({ where: { userId: user.id } });
}

export async function registerDocumentRoutes(app: FastifyInstance, allowDemoAuth: boolean) {
  app.get("/v1/documents", async (request, reply) => {
    if (!allowDemoAuth) return reply.code(401).send({ error: "Authentication required" });
    const patient = await getDemoPatient();
    if (!patient) return reply.code(404).send({ error: "Patient not found" });

    return prisma.medicalDocument.findMany({
      where: { patientId: patient.id },
      select: { id: true, originalFileName: true, contentType: true, sizeBytes: true, appointmentId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
  });

  app.post("/v1/documents/upload-intent", async (request, reply) => {
    if (!allowDemoAuth) return reply.code(401).send({ error: "Authentication required" });
    const patient = await getDemoPatient();
    if (!patient) return reply.code(404).send({ error: "Patient not found" });

    const input = z.object({
      fileName: z.string().trim().min(1).max(200),
      contentType: z.string().min(1),
      sizeBytes: z.number().int().positive(),
      appointmentId: z.string().min(1).optional(),
    }).parse(request.body);

    if (input.appointmentId) {
      const appointment = await prisma.appointment.findFirst({ where: { id: input.appointmentId, patientId: patient.id }, select: { id: true } });
      if (!appointment) return reply.code(404).send({ error: "Appointment not found" });
    }

    try {
      const intent = createUploadIntent({ patientId: patient.id, ...input });
      const document = await prisma.medicalDocument.create({
        data: {
          patientId: patient.id,
          appointmentId: input.appointmentId,
          originalFileName: input.fileName,
          storageKey: intent.storageKey,
          contentType: input.contentType,
          sizeBytes: input.sizeBytes,
        },
        select: { id: true, originalFileName: true, contentType: true, sizeBytes: true, storageKey: true, appointmentId: true, createdAt: true },
      });

      return reply.code(201).send({
        document,
        upload: {
          mode: "provider-adapter-pending",
          storageKey: intent.storageKey,
          maxBytes: intent.maxBytes,
        },
      });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Invalid document" });
    }
  });
}
