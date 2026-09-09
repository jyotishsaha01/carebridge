import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "./server";
import { createUploadIntent } from "./storage";
import { requireRole } from "./auth";

async function requirePatient(request: FastifyRequest, reply: FastifyReply) {
  const user = await requireRole(request, reply, ["PATIENT"]);
  if (!user?.patient) return null;
  return user.patient;
}

export async function registerDocumentRoutes(app: FastifyInstance) {
  app.get("/v1/documents", async (request, reply) => {
    const patient = await requirePatient(request, reply);
    if (!patient) return;
    return prisma.medicalDocument.findMany({ where: { patientId: patient.id }, select: { id: true, originalFileName: true, contentType: true, sizeBytes: true, appointmentId: true, createdAt: true }, orderBy: { createdAt: "desc" } });
  });

  app.post("/v1/documents/upload-intent", async (request, reply) => {
    const patient = await requirePatient(request, reply);
    if (!patient) return;
    const input = z.object({ fileName: z.string().trim().min(1).max(200), contentType: z.string().min(1), sizeBytes: z.number().int().positive(), appointmentId: z.string().min(1).optional() }).parse(request.body);
    if (input.appointmentId) {
      const appointment = await prisma.appointment.findFirst({ where: { id: input.appointmentId, patientId: patient.id }, select: { id: true } });
      if (!appointment) return reply.code(404).send({ error: "Appointment not found" });
    }
    try {
      const intent = createUploadIntent({ patientId: patient.id, ...input });
      const document = await prisma.medicalDocument.create({ data: { patientId: patient.id, appointmentId: input.appointmentId, originalFileName: input.fileName, storageKey: intent.storageKey, contentType: input.contentType, sizeBytes: input.sizeBytes }, select: { id: true, originalFileName: true, contentType: true, sizeBytes: true, storageKey: true, appointmentId: true, createdAt: true } });
      return reply.code(201).send({ document, upload: { mode: "provider-adapter-pending", storageKey: intent.storageKey, maxBytes: intent.maxBytes } });
    } catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "Invalid document" }); }
  });
}
