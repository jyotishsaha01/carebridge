import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getAuthenticatedUser } from "./auth";
import { prisma } from "./server";
import { recordAudit } from "./audit";

export async function registerPatientRecordsRoutes(app: FastifyInstance) {
  app.get("/v1/patient/records", async (request, reply) => {
    const user = await getAuthenticatedUser(request);
    if (!user?.patient) return reply.code(401).send({ error: "Patient authentication required" });
    const patientId = user.patient.id;
    const [consultations, documents, carePlans] = await Promise.all([
      prisma.consultation.findMany({ where: { patientId }, include: { doctor: { include: { specialty: true } }, prescription: { include: { items: true } }, followUps: true }, orderBy: { createdAt: "desc" }, take: 50 }),
      prisma.medicalDocument.findMany({ where: { patientId }, select: { id: true, originalFileName: true, contentType: true, sizeBytes: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 50 }),
      prisma.carePlan.findMany({ where: { patientId }, include: { tasks: { orderBy: { dueAt: "asc" } } }, orderBy: { createdAt: "desc" }, take: 20 }).catch(() => []),
    ]);
    await recordAudit(request, { actorUserId: user.id, action: "PATIENT_RECORDS_VIEWED", resourceType: "Patient", resourceId: patientId, outcome: "SUCCESS" });
    return { consultations, documents, carePlans };
  });

  app.get("/v1/patient/records/:consultationId", async (request, reply) => {
    const user = await getAuthenticatedUser(request);
    if (!user?.patient) return reply.code(401).send({ error: "Patient authentication required" });
    const { consultationId } = z.object({ consultationId: z.string().min(1) }).parse(request.params);
    const consultation = await prisma.consultation.findFirst({ where: { id: consultationId, patientId: user.patient.id }, include: { doctor: { include: { specialty: true } }, prescription: { include: { items: true } }, followUps: true } });
    if (!consultation) return reply.code(404).send({ error: "Record not found" });
    await recordAudit(request, { actorUserId: user.id, action: "PATIENT_CONSULTATION_VIEWED", resourceType: "Consultation", resourceId: consultation.id, outcome: "SUCCESS" });
    return consultation;
  });
}
