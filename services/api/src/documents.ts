import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "./server";
import { createUploadIntent, documentStorage } from "./storage";
import { requireRole } from "./auth";
import { recordAudit } from "./audit";
import { createNotification } from "./notificationsPrototype";
import { Buffer } from "node:buffer";

async function requirePatient(request: FastifyRequest, reply: FastifyReply) { const user=await requireRole(request,reply,["PATIENT"]); if(!user?.patient)return null; return {user,patient:user.patient}; }
export async function registerDocumentRoutes(app: FastifyInstance){
 app.get("/v1/documents",async(request,reply)=>{const auth=await requirePatient(request,reply);if(!auth)return;const documents=await prisma.medicalDocument.findMany({where:{patientId:auth.patient.id},select:{id:true,originalFileName:true,contentType:true,sizeBytes:true,appointmentId:true,createdAt:true},orderBy:{createdAt:"desc"}});await recordAudit(request,{actorUserId:auth.user.id,action:"PATIENT_DOCUMENT_LIST_VIEWED",resourceType:"Patient",resourceId:auth.patient.id,outcome:"SUCCESS"});return documents;});
 app.get("/v1/documents/:documentId",async(request,reply)=>{const auth=await requirePatient(request,reply);if(!auth)return;const{documentId}=z.object({documentId:z.string().min(1)}).parse(request.params);const document=await prisma.medicalDocument.findFirst({where:{id:documentId,patientId:auth.patient.id},select:{id:true,originalFileName:true,contentType:true,sizeBytes:true,appointmentId:true,storageKey:true,createdAt:true}});if(!document){await recordAudit(request,{actorUserId:auth.user.id,action:"PATIENT_DOCUMENT_ACCESS_DENIED",resourceType:"MedicalDocument",resourceId:documentId,outcome:"FAILURE"});return reply.code(404).send({error:"Document not found"});}const access=await documentStorage.createDownloadAccess({storageKey:document.storageKey});await recordAudit(request,{actorUserId:auth.user.id,action:"PATIENT_DOCUMENT_VIEWED",resourceType:"MedicalDocument",resourceId:document.id,outcome:"SUCCESS"});return{document,access};});
 app.put("/v1/documents/:documentId/content",async(request,reply)=>{
  const auth=await requirePatient(request,reply);if(!auth)return;
  const {documentId}=z.object({documentId:z.string().min(1)}).parse(request.params);
  const input=z.object({contentBase64:z.string().min(1).max(14_000_000)}).parse(request.body);
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

  try {
    await documentStorage.writeDocument({ storageKey: document.storageKey, content, contentType: document.contentType });
  } catch (error) {
    request.log.error({ err: error, documentId: document.id }, "Failed to store uploaded document");
    return reply.code(500).send({ error: "Document upload could not be completed. Please retry." });
  }
  await recordAudit(request,{actorUserId:auth.user.id,action:"PATIENT_DOCUMENT_UPLOADED",resourceType:"MedicalDocument",resourceId:document.id,outcome:"SUCCESS"});
  if (document.appointmentId) {
    const appointment = await prisma.appointment.findUnique({ where: { id: document.appointmentId }, include: { doctor: { select: { userId: true, name: true } } } });
    if (appointment) await createNotification({ userId: appointment.doctor.userId, role: "DOCTOR", type: "DOCUMENT", title: "Patient document uploaded", body: "A patient uploaded a document for your consultation with " + appointment.doctor.name + "." });
  }
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
 app.post("/v1/documents/upload-intent",async(request,reply)=>{const auth=await requirePatient(request,reply);if(!auth)return;const parsedInput=z.object({fileName:z.string().trim().min(1).max(200),contentType:z.enum(["application/pdf","image/jpeg","image/png"]),sizeBytes:z.number().int().positive().max(10*1024*1024),appointmentId:z.string().min(1).optional()}).safeParse(request.body);if(!parsedInput.success)return reply.code(400).send({error:"Invalid document upload request",issues:parsedInput.error.issues.map(issue=>({field:issue.path.map(String).join("."),message:issue.message}))});const input=parsedInput.data;if(input.appointmentId){const appointment=await prisma.appointment.findFirst({where:{id:input.appointmentId,patientId:auth.patient.id},select:{id:true}});if(!appointment)return reply.code(404).send({error:"Appointment not found"});}try{const intent=createUploadIntent({patientId:auth.patient.id,...input});const provider=await documentStorage.createUploadIntent({storageKey:intent.storageKey,contentType:intent.contentType,sizeBytes:input.sizeBytes});const document=await prisma.medicalDocument.create({data:{patientId:auth.patient.id,appointmentId:input.appointmentId,originalFileName:input.fileName,storageKey:intent.storageKey,contentType:input.contentType,sizeBytes:input.sizeBytes},select:{id:true,originalFileName:true,contentType:true,sizeBytes:true,storageKey:true,appointmentId:true,createdAt:true}});await recordAudit(request,{actorUserId:auth.user.id,action:"PATIENT_DOCUMENT_UPLOAD_INTENT_CREATED",resourceType:"MedicalDocument",resourceId:document.id,outcome:"SUCCESS"});return reply.code(201).send({document,upload:provider});}catch(error){return reply.code(400).send({error:error instanceof Error?error.message:"Invalid document"});}});
}
