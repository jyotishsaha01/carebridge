import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "./server";
import { getAuthenticatedUser, requireRole } from "./auth";
import { recordAudit } from "./audit";

const notificationQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), unreadOnly: z.enum(["true", "false"]).default("false") });
const taskStatus = z.enum(["TODO", "IN_PROGRESS", "DONE", "SKIPPED"]);

async function requirePatient(request: FastifyRequest, reply: FastifyReply) {
  const user = await requireRole(request, reply, ["PATIENT"]);
  if (!user || !user.patient) return null;
  return user;
}

export async function registerCarePlatformRoutes(app: FastifyInstance) {
  app.get("/v1/notifications", async (request, reply) => {
    const user = await getAuthenticatedUser(request);
    if (!user) return reply.code(401).send({ error: "Authentication required" });
    const query = notificationQuery.parse(request.query);
    const notifications = await prisma.notification.findMany({
      where: { userId: user.id, ...(query.unreadOnly === "true" ? { status: "UNREAD" } : {}) },
      orderBy: { createdAt: "desc" },
      take: query.limit,
    });
    const unreadCount = await prisma.notification.count({ where: { userId: user.id, status: "UNREAD" } });
    return { unreadCount, notifications };
  });

  app.post("/v1/notifications/:notificationId/read", async (request, reply) => {
    const user = await getAuthenticatedUser(request);
    if (!user) return reply.code(401).send({ error: "Authentication required" });
    const { notificationId } = z.object({ notificationId: z.string().min(1) }).parse(request.params);
    const result = await prisma.notification.updateMany({ where: { id: notificationId, userId: user.id, status: "UNREAD" }, data: { status: "READ", readAt: new Date() } });
    if (result.count === 0) return reply.code(404).send({ error: "Notification not found" });
    return { ok: true };
  });

  app.post("/v1/notifications/read-all", async (request, reply) => {
    const user = await getAuthenticatedUser(request);
    if (!user) return reply.code(401).send({ error: "Authentication required" });
    const result = await prisma.notification.updateMany({ where: { userId: user.id, status: "UNREAD" }, data: { status: "READ", readAt: new Date() } });
    return { ok: true, updated: result.count };
  });

  app.get("/v1/patient/care-plans", async (request, reply) => {
    const user = await requirePatient(request, reply);
    if (!user?.patient) return;
    return prisma.carePlan.findMany({ where: { patientId: user.patient.id }, include: { tasks: { orderBy: [{ status: "asc" }, { dueAt: "asc" }] } }, orderBy: { updatedAt: "desc" } });
  });

  app.patch("/v1/patient/care-plans/:planId/tasks/:taskId", async (request, reply) => {
    const user = await requirePatient(request, reply);
    if (!user?.patient) return;
    const { planId, taskId } = z.object({ planId: z.string().min(1), taskId: z.string().min(1) }).parse(request.params);
    const { status } = z.object({ status: taskStatus }).parse(request.body);
    const task = await prisma.carePlanTask.findFirst({ where: { id: taskId, carePlanId: planId, carePlan: { patientId: user.patient.id } } });
    if (!task) return reply.code(404).send({ error: "Care task not found" });
    return prisma.carePlanTask.update({ where: { id: task.id }, data: { status } });
  });

  app.post("/v1/patient/care-requests", async (request, reply) => {
    const user = await requirePatient(request, reply);
    if (!user?.patient) return;
    const input = z.object({ type: z.enum(["DIAGNOSTIC", "PROCEDURE", "SURGERY", "MEDICATION", "COORDINATION"]), title: z.string().trim().min(3).max(160), description: z.string().trim().max(2000).optional(), country: z.string().trim().max(80).optional(), targetDate: z.coerce.date().optional() }).parse(request.body);
    const requestRecord = await prisma.careRequest.create({ data: { patientId: user.patient.id, ...input } });
    await prisma.notification.create({ data: { userId: user.id, type: "SYSTEM", title: "Care request received", body: `Your ${input.type.toLowerCase()} request has been received and will be reviewed by CareBridge.`, metadata: { careRequestId: requestRecord.id } } });
    await recordAudit(request, { actorUserId: user.id, action: "CARE_REQUEST_CREATED", resourceType: "CareRequest", resourceId: requestRecord.id, outcome: "SUCCESS", metadata: { type: input.type } });
    return reply.code(201).send(requestRecord);
  });

  app.get("/v1/patient/care-requests", async (request, reply) => {
    const user = await requirePatient(request, reply);
    if (!user?.patient) return;
    return prisma.careRequest.findMany({ where: { patientId: user.patient.id }, orderBy: { createdAt: "desc" } });
  });

  app.get("/v1/admin/care-requests", async (request, reply) => {
    const user = await requireRole(request, reply, ["ADMIN"]);
    if (!user) return;
    const query = z.object({ status: z.enum(["REQUESTED", "REVIEWING", "APPROVED", "SCHEDULED", "COMPLETED", "CANCELLED"]).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(request.query);
    return prisma.careRequest.findMany({ where: query.status ? { status: query.status } : undefined, include: { patient: { select: { id: true, firstName: true, lastName: true, country: true } } }, orderBy: { createdAt: "desc" }, take: query.limit });
  });

  app.patch("/v1/admin/care-requests/:requestId", async (request, reply) => {
    const user = await requireRole(request, reply, ["ADMIN"]);
    if (!user) return;
    const { requestId } = z.object({ requestId: z.string().min(1) }).parse(request.params);
    const input = z.object({ status: z.enum(["REQUESTED", "REVIEWING", "APPROVED", "SCHEDULED", "COMPLETED", "CANCELLED"]), targetDate: z.coerce.date().nullable().optional() }).parse(request.body);
    const updated = await prisma.careRequest.update({ where: { id: requestId }, data: input });
    const patient = await prisma.patient.findUnique({ where: { id: updated.patientId }, select: { userId: true } });
    if (patient) await prisma.notification.create({ data: { userId: patient.userId, type: "SYSTEM", title: "Care request updated", body: `Your care request is now ${updated.status.toLowerCase().replaceAll("_", " ")}.`, metadata: { careRequestId: updated.id } } });
    await recordAudit(request, { actorUserId: user.id, action: "CARE_REQUEST_UPDATED", resourceType: "CareRequest", resourceId: updated.id, outcome: "SUCCESS", metadata: { status: updated.status } });
    return updated;
  });

  app.post("/v1/admin/care-plans", async (request, reply) => {
    const user = await requireRole(request, reply, ["ADMIN", "DOCTOR"]);
    if (!user) return;
    const input = z.object({ patientId: z.string().min(1), title: z.string().trim().min(3).max(160), description: z.string().trim().max(2000).optional(), coordinatorNote: z.string().trim().max(4000).optional(), tasks: z.array(z.object({ title: z.string().trim().min(2).max(160), description: z.string().trim().max(1000).optional(), dueAt: z.coerce.date().optional() })).max(50).default([]) }).parse(request.body);
    const plan = await prisma.carePlan.create({ data: { patientId: input.patientId, title: input.title, description: input.description, coordinatorNote: input.coordinatorNote, status: "ACTIVE", tasks: { create: input.tasks } }, include: { tasks: true } });
    const patient = await prisma.patient.findUnique({ where: { id: input.patientId }, select: { userId: true } });
    if (patient) await prisma.notification.create({ data: { userId: patient.userId, type: "CLINICAL", title: "Your care plan is ready", body: `A new care plan, “${plan.title}”, is available in your CareBridge dashboard.`, metadata: { carePlanId: plan.id } } });
    await recordAudit(request, { actorUserId: user.id, action: "CARE_PLAN_CREATED", resourceType: "CarePlan", resourceId: plan.id, outcome: "SUCCESS", metadata: { patientId: input.patientId } });
    return reply.code(201).send(plan);
  });

  app.get("/v1/admin/analytics/overview", async (request, reply) => {
    const user = await requireRole(request, reply, ["ADMIN"]);
    if (!user) return;
    const [patients, doctors, verifiedDoctors, appointments, consultations, completedConsultations, careRequests, unreadNotifications, recentAuditEvents] = await Promise.all([
      prisma.patient.count(),
      prisma.doctor.count(),
      prisma.doctor.count({ where: { isVerified: true, isActive: true } }),
      prisma.appointment.count(),
      prisma.consultation.count(),
      prisma.consultation.count({ where: { status: "COMPLETED" } }),
      prisma.careRequest.count({ where: { status: { in: ["REQUESTED", "REVIEWING", "APPROVED"] } } }),
      prisma.notification.count({ where: { status: "UNREAD" } }),
      prisma.auditLog.count({ where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
    ]);
    return { patients, doctors, verifiedDoctors, appointments, consultations, completedConsultations, careRequests, unreadNotifications, recentAuditEvents, consultationCompletionRate: consultations ? Math.round((completedConsultations / consultations) * 100) : 0 };
  });
}
