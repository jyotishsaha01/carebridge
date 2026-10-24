import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "./server";
import { createUploadIntent, documentStorage } from "./storage";
import { requireRole } from "./auth";
import { recordAudit } from "./audit";
import { createNotification } from "./notificationsPrototype";
import { saveDocument } from "./documentStoragePrototype";
import { Buffer } from "node:buffer";

async function requirePatient(request: FastifyRequest, reply: FastifyReply) { const user=await requireRole(request,reply,["PATIENT"]); if(!user?.patient)return null; return {user,patient:user.patient}; }
export async function registerDocumentRoutes(app: FastifyInstance){
 app.get("/v1/documents",async(request,reply)=>{const auth=await requirePatient(request,reply);if(!auth)return;const documents=await prisma.medicalDocument.findMany({where:{patientId:auth.patient.id},select:{id:true,originalFileName:true,contentType:true,sizeBytes:true,appointmentId:true,createdAt:true},orderBy:{createdAt:"desc"}});await recordAudit(request,{actorUserId:auth.user.id,action:"PATIENT_DOCUMENT_LIST_VIEWED",resourceType:"Patient",resourceId:auth.patient.id,outcome:"SUCCESS"});return documents;});
 app.get("/v1/documents/:documentId",async(request,reply)=>{const auth=await requirePatient(request,reply);if(!auth)return;const{documentId}=z.object({documentId:z.string().min(1)}).parse(request.params);const document=await prisma.medicalDocument.findFirst({where:{id:documentId,patientId:auth.patient.id},select:{id:true,originalFileName:true,contentType:true,sizeBytes:true,appointmentId:true,storageKey:true,createdAt:true}});if(!document){await recordAudit(request,{actorUserId:auth.user.id,action:"PATIENT_DOCUMENT_ACCESS_DENIED",resourceType:"MedicalDocument",resourceId:documentId,outcome:"FAILURE"});return reply.code(404).send({error:"Document not found"});}const access=await documentStorage.createDownloadAccess({storageKey:document.storageKey});await recordAudit(request,{actorUserId:auth.user.id,action:"PATIENT_DOCUMENT_VIEWED",resourceType:"MedicalDocument",resourceId:document.id,outcome:"SUCCESS"});return{document,access};});
 app.put("/v1/documents/:documentId/content",async(request,reply)=>{
  const auth=await requirePatient(request,reply);if(!auth)return;
  const {documentId}=z.object({documentId:z.string().min(1)}).parse(request.params);
  const input=z.object({contentBase64:z.string().min(1).max(14_000_000).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)}).parse(request.body);
  const document=await prisma.medicalDocument.findFirst({where:{id:documentId,patientId:auth.patient.id}});
  if(!document)return reply.code(404).send({error:"Document not found"});
  let content:Buffer;
  try{content=Buffer.from(input.contentBase64,"base64");}catch{return reply.code(400).send({error:"Invalid document content"});}
  if(content.length!==document.sizeBytes)return reply.code(400).send({error:"Document size does not match upload metadata"});
  if(content.length>10*1024*1024)return reply.code(413).send({error:"Documents must be 10 MB or smaller"});
  const allowedTypes=["application/pdf","image/jpeg","image/png"];
  if(!allowedTypes.includes(document.contentType))return reply.code(415).send({error:"Unsupported document type"});
  await saveDocument({storageKey:document.storageKey,content,contentType:document.contentType});
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
    const content=await (await import("./documentStoragePrototype.js")).readDocument(document.storageKey);
    await recordAudit(request,{actorUserId:auth.user.id,action:"PATIENT_DOCUMENT_CONTENT_VIEWED",resourceType:"MedicalDocument",resourceId:document.id,outcome:"SUCCESS"});
    return {contentBase64:content.toString("base64"),contentType:document.contentType,originalFileName:document.originalFileName};
  }catch{return reply.code(404).send({error:"Document content is not available"});}
 });
 app.post("/v1/documents/upload-intent",async(request,reply)=>{const auth=await requirePatient(request,reply);if(!auth)return;const input=z.object({fileName:z.string().trim().min(1).max(200),contentType:z.enum(["application/pdf","image/jpeg","image/png"]),sizeBytes:z.number().int().positive().max(10*1024*1024),appointmentId:z.string().min(1).optional()}).parse(request.body);if(input.appointmentId){const appointment=await prisma.appointment.findFirst({where:{id:input.appointmentId,patientId:auth.patient.id},select:{id:true}});if(!appointment)return reply.code(404).send({error:"Appointment not found"});}try{const intent=createUploadIntent({patientId:auth.patient.id,...input});const provider=await documentStorage.createUploadIntent({storageKey:intent.storageKey,contentType:intent.contentType,sizeBytes:input.sizeBytes});const document=await prisma.medicalDocument.create({data:{patientId:auth.patient.id,appointmentId:input.appointmentId,originalFileName:input.fileName,storageKey:intent.storageKey,contentType:input.contentType,sizeBytes:input.sizeBytes},select:{id:true,originalFileName:true,contentType:true,sizeBytes:true,storageKey:true,appointmentId:true,createdAt:true}});await recordAudit(request,{actorUserId:auth.user.id,action:"PATIENT_DOCUMENT_UPLOAD_INTENT_CREATED",resourceType:"MedicalDocument",resourceId:document.id,outcome:"SUCCESS"});return reply.code(201).send({document,upload:provider});}catch(error){return reply.code(400).send({error:error instanceof Error?error.message:"Invalid document"});}});
}
