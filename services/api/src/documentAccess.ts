import type { FastifyInstance } from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "./server";
import { requireRole } from "./auth";
import { recordAudit } from "./audit";

export async function registerDocumentAccessRoutes(app: FastifyInstance) {
  app.get("/v1/doctor/patients/:patientId/documents", async (request, reply) => {
    const doctor = await requireRole(request, reply, ["DOCTOR"]);
    if (!doctor?.doctor) return;
    const { patientId } = z.object({ patientId: z.string().min(1) }).parse(request.params);
    const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { id: true } });
    if (!patient) return reply.code(404).send({ error: "Patient not found" });
    const relationship = await prisma.appointment.findFirst({ where: { patientId, doctorId: doctor.doctor.id }, select: { id: true } });
    if (!relationship) {
      await recordAudit(request, { actorUserId: doctor.id, action: "DOCTOR_DOCUMENT_ACCESS_DENIED", resourceType: "Patient", resourceId: patientId, outcome: "FAILURE" });
      return reply.code(403).send({ error: "Doctor is not authorized for this patient" });
    }
    const documents = await prisma.medicalDocument.findMany({ where: { patientId }, select: { id:true, originalFileName:true, contentType:true, sizeBytes:true, appointmentId:true, createdAt:true }, orderBy: { createdAt: "desc" }, take: 100 });
    await recordAudit(request, { actorUserId: doctor.id, action: "DOCTOR_DOCUMENT_LIST_VIEWED", resourceType: "Patient", resourceId: patientId, outcome: "SUCCESS" });
    return documents;
  });

  app.get("/v1/doctor/documents/:documentId", async (request, reply) => {
    const doctor = await requireRole(request, reply, ["DOCTOR"]);
    if (!doctor?.doctor) return;
    const { documentId } = z.object({ documentId: z.string().min(1) }).parse(request.params);
    const document = await prisma.medicalDocument.findUnique({ where: { id: documentId }, select: { id:true,patientId:true,appointmentId:true,originalFileName:true,contentType:true,sizeBytes:true,storageKey:true,createdAt:true } });
    if (!document) return reply.code(404).send({ error: "Document not found" });
    const relationship = await prisma.appointment.findFirst({ where: { patientId: document.patientId, doctorId: doctor.doctor.id }, select: { id:true } });
    if (!relationship) {
      await recordAudit(request, { actorUserId: doctor.id, action: "DOCTOR_DOCUMENT_ACCESS_DENIED", resourceType: "MedicalDocument", resourceId: documentId, outcome: "FAILURE" });
      return reply.code(403).send({ error: "Doctor is not authorized for this document" });
    }
    await recordAudit(request, { actorUserId: doctor.id, action: "DOCTOR_DOCUMENT_VIEWED", resourceType: "MedicalDocument", resourceId: documentId, outcome: "SUCCESS" });
    return { document, access: { mode: "provider-adapter-pending", storageKey: document.storageKey } };
  });
}
