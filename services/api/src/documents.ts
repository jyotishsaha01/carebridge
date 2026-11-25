import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "./server";
import { createUploadIntent, documentStorage, MAX_DOCUMENT_BYTES } from "./storage";
import { requireRole } from "./auth";
import { recordAudit } from "./audit";
import { createNotification } from "./notificationsPrototype";
import { scanUploadedFile } from "./malwareScanner";
import { Buffer } from "node:buffer";

async function requirePatient(request: FastifyRequest, reply: FastifyReply) { const user=await requireRole(request,reply,["PATIENT"]); if(!user?.patient)return null; return {user,patient:user.patient}; }
export async function registerDocumentRoutes(app: FastifyInstance){
 app.get("/v1/documents",async(request,reply)=>{const auth=await requirePatient(request,reply);if(!auth)return;const documents=await prisma.medicalDocument.findMany({where:{patientId:auth.patient.id},select:{id:true,originalFileName:true,contentType:true,sizeBytes:true,appointmentId:true,createdAt:true},orderBy:{createdAt:"desc"}});await recordAudit(request,{actorUserId:auth.user.id,action:"PATIENT_DOCUMENT_LIST_VIEWED",resourceType:"Patient",resourceId:auth.patient.id,outcome:"SUCCESS"});return documents;});
 app.get("/v1/documents/:documentId",async(request,reply)=>{const auth=await requirePatient(request,reply);if(!auth)return;const{documentId}=z.object({documentId:z.string().min(1)}).parse(request.params);const document=await prisma.medicalDocument.findFirst({where:{id:documentId,patientId:auth.patient.id},select:{id:true,originalFileName:true,contentType:true,sizeBytes:true,appointmentId:true,storageKey:true,createdAt:true}});if(!document){await recordAudit(request,{actorUserId:auth.user.id,action:"PATIENT_DOCUMENT_ACCESS_DENIED",resourceType:"MedicalDocument",resourceId:documentId,outcome:"FAILURE"});return reply.code(404).send({error:"Document not found"});}const access=await documentStorage.createDownloadAccess({storageKey:document.storageKey});await recordAudit(request,{actorUserId:auth.user.id,action:"PATIENT_DOCUMENT_VIEWED",resourceType:"MedicalDocument",resourceId:document.id,outcome:"SUCCESS"});const{storageKey:_storageKey,...metadata}=document;return{document:metadata,access};});
 app.put("/v1/documents/:documentId/content",async(request,reply)=>{
  const auth=await requirePatient(request,reply);if(!auth)return;
  const {documentId}=z.object({documentId:z.string().min(1)}).parse(request.params);
  const input=z.object({contentBase64:z.string().min(1).max(4 * Math.ceil(MAX_DOCUMENT_BYTES / 3)).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)}).parse(request.body);
  const document=await prisma.medicalDocument.findFirst({where:{id:documentId,patientId:auth.patient.id}});
  if(!document)return reply.code(404).send({error:"Document not found"});
  // Buffer.from(base64) is permissive; reject malformed encodings before writing bytes.
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.contentBase64)) {
    return reply.code(400).send({ error: "Invalid document content encoding" });
  }
  const content = Buffer.from(input.contentBase64, "base64");
  if (content.toString("base64") !== input.contentBase64) {
    return reply.code(400).send({ error: "Invalid document content encoding" });
  }
  if (content.length !== document.sizeBytes) {
    return reply.code(400).send({ error: "Document size does not match upload metadata" });
  }

  // Do not trust the declared MIME type alone: verify the file signature.
  const matchesContentType =
    (document.contentType === "application/pdf" && content.subarray(0, 5).toString("ascii") === "%PDF-") ||
    (document.contentType === "image/png" && content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (document.contentType === "image/jpeg" && content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff);
  if (!matchesContentType) {
    return reply.code(400).send({ error: "Document content does not match the declared file type" });
  }

  const scan = await scanUploadedFile({ content, contentType: document.contentType, fileName: document.originalFileName });
  if (scan.status !== "clean") {
    await recordAudit(request, {
      actorUserId: auth.user.id,
      action: scan.status === "infected" ? "PATIENT_DOCUMENT_MALWARE_REJECTED" : "PATIENT_DOCUMENT_SCAN_UNAVAILABLE",
      resourceType: "MedicalDocument",
      resourceId: document.id,
      outcome: "FAILURE",
      metadata: { scanStatus: scan.status, reason: scan.reason },
    });
    // Preserve existing metadata: retrying a previously clean upload must not
    // delete its record when the new payload is rejected or scanning is offline.
    return reply.code(scan.status === "infected" ? 422 : 503).send({
      error: scan.status === "infected"
        ? "Document was rejected by malware scanning"
        : "Document scanning is temporarily unavailable; upload was not stored",
    });
  }

  try {
    await documentStorage.writeDocument({ storageKey: document.storageKey, content, contentType: document.contentType });
  } catch (error) {
    // Preserve typed storage conflicts/unavailability and keep provider details out of logs.
    throw error;
  }
  await recordAudit(request,{actorUserId:auth.user.id,action:"PATIENT_DOCUMENT_UPLOADED",resourceType:"MedicalDocument",resourceId:document.id,outcome:"SUCCESS"});
  try { if (document.appointmentId) {
    const appointment = await prisma.appointment.findUnique({ where: { id: document.appointmentId }, include: { doctor: { select: { userId: true, name: true } } } });
    if (appointment) await createNotification({ userId: appointment.doctor.userId, role: "DOCTOR", type: "DOCUMENT", title: "Patient document uploaded", body: "A patient uploaded a document for your consultation with " + appointment.doctor.name + "." });
  }
  } catch { request.log.warn({ resourceType: "MedicalDocument" }, "Document committed; notification delivery failed"); }
  return {ok:true,documentId:document.id};
 });
 app.get("/v1/documents/:documentId/content",async(request,reply)=>{
  const auth=await requirePatient(request,reply);if(!auth)return;
  const {documentId}=z.object({documentId:z.string().min(1)}).parse(request.params);
  const document=await prisma.medicalDocument.findFirst({where:{id:documentId,patientId:auth.patient.id}});
  if(!document)return reply.code(404).send({error:"Document not found"});
  try{
    const content=await documentStorage.readDocument(document.storageKey);
    await recordAudit(request,{actorUserId:auth.user.id,action:"PATIENT_DOCUMENT_CONTENT_VIEWED",resourceType:"MedicalDocument",resourceId:document.id,outcome:"SUCCESS"});
    return {contentBase64:content.toString("base64"),contentType:document.contentType,originalFileName:document.originalFileName};
  }catch{return reply.code(404).send({error:"Document content is not available"});}
 });
 app.post("/v1/documents/upload-intent",async(request,reply)=>{const auth=await requirePatient(request,reply);if(!auth)return;const input=z.object({fileName:z.string().trim().min(1).max(200),contentType:z.enum(["application/pdf","image/jpeg","image/png"]),sizeBytes:z.number().int().positive().max(MAX_DOCUMENT_BYTES),appointmentId:z.string().min(1).optional()}).parse(request.body);if(input.appointmentId){const appointment=await prisma.appointment.findFirst({where:{id:input.appointmentId,patientId:auth.patient.id},select:{id:true}});if(!appointment)return reply.code(404).send({error:"Appointment not found"});}try{const intent=createUploadIntent({patientId:auth.patient.id,...input});const provider=await documentStorage.createUploadIntent({storageKey:intent.storageKey,contentType:intent.contentType,sizeBytes:input.sizeBytes});const document=await prisma.medicalDocument.create({data:{patientId:auth.patient.id,appointmentId:input.appointmentId,originalFileName:input.fileName,storageKey:intent.storageKey,contentType:input.contentType,sizeBytes:input.sizeBytes},select:{id:true,originalFileName:true,contentType:true,sizeBytes:true,storageKey:true,appointmentId:true,createdAt:true}});await recordAudit(request,{actorUserId:auth.user.id,action:"PATIENT_DOCUMENT_UPLOAD_INTENT_CREATED",resourceType:"MedicalDocument",resourceId:document.id,outcome:"SUCCESS"});const{storageKey:_storageKey,...metadata}=document;const{storageKey:_providerKey,...upload}=provider;return reply.code(201).send({document:metadata,upload});}catch(error){if((error as {statusCode?:number}).statusCode===503)return reply.code(503).send({error:"Encrypted document storage is not configured"});if(error instanceof Error && /Unsupported document type|Document size is invalid/.test(error.message))return reply.code(400).send({error:error.message});throw error;}});
}
