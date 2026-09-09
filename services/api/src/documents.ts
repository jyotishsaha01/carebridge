import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "./server";
import { createUploadIntent } from "./storage";
import { requireRole } from "./auth";
import { recordAudit } from "./audit";

async function requirePatient(request: FastifyRequest, reply: FastifyReply) {
  const user = await requireRole(request, reply, ["PATIENT"]);
  if (!user?.patient) return null;
  return { user, patient: user.patient };
}

export async function registerDocumentRoutes(app: FastifyInstance) {
  app.get("/v1/documents", async (request, reply) => {
    const auth = await requirePatient(request, reply); if (!auth) return;
    const documents = await prisma.medicalDocument.findMany({ where: { patientId: auth.patient.id }, select: { id:true, originalFileName:true, contentType:true, sizeBytes:true, appointmentId:true, createdAt:true }, orderBy:{createdAt:"desc"} });
    await recordAudit(request,{actorUserId:auth.user.id,action:"PATIENT_DOCUMENT_LIST_VIEWED",resourceType:"Patient",resourceId:auth.patient.id,outcome:"SUCCESS"});
    return documents;
  });

  app.get("/v1/documents/:documentId", async (request, reply) => {
    const auth = await requirePatient(request, reply); if (!auth) return;
    const { documentId } = z.object({documentId:z.string().min(1)}).parse(request.params);
    const document = await prisma.medicalDocument.findFirst({ where:{id:documentId,patientId:auth.patient.id}, select:{id:true,originalFileName:true,contentType:true,sizeBytes:true,appointmentId:true,storageKey:true,createdAt:true} });
    if (!document) { await recordAudit(request,{actorUserId:auth.user.id,action:"PATIENT_DOCUMENT_ACCESS_DENIED",resourceType:"MedicalDocument",resourceId:documentId,outcome:"FAILURE"}); return reply.code(404).send({error:"Document not found"}); }
    await recordAudit(request,{actorUserId:auth.user.id,action:"PATIENT_DOCUMENT_VIEWED",resourceType:"MedicalDocument",resourceId:document.id,outcome:"SUCCESS"});
    return { document, access:{mode:"provider-adapter-pending",storageKey:document.storageKey} };
  });

  app.post("/v1/documents/upload-intent", async (request, reply) => {
    const auth = await requirePatient(request, reply); if (!auth) return;
    const input = z.object({fileName:z.string().trim().min(1).max(200),contentType:z.string().min(1),sizeBytes:z.number().int().positive(),appointmentId:z.string().min(1).optional()}).parse(request.body);
    if (input.appointmentId) { const appointment=await prisma.appointment.findFirst({where:{id:input.appointmentId,patientId:auth.patient.id},select:{id:true}}); if(!appointment)return reply.code(404).send({error:"Appointment not found"}); }
    try { const intent=createUploadIntent({patientId:auth.patient.id,...input}); const document=await prisma.medicalDocument.create({data:{patientId:auth.patient.id,appointmentId:input.appointmentId,originalFileName:input.fileName,storageKey:intent.storageKey,contentType:input.contentType,sizeBytes:input.sizeBytes},select:{id:true,originalFileName:true,contentType:true,sizeBytes:true,storageKey:true,appointmentId:true,createdAt:true}}); await recordAudit(request,{actorUserId:auth.user.id,action:"PATIENT_DOCUMENT_UPLOAD_INTENT_CREATED",resourceType:"MedicalDocument",resourceId:document.id,outcome:"SUCCESS"}); return reply.code(201).send({document,upload:{mode:"provider-adapter-pending",storageKey:intent.storageKey,maxBytes:intent.maxBytes}}); } catch(error){return reply.code(400).send({error:error instanceof Error?error.message:"Invalid document"});}
  });
}
