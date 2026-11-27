import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "./server";
import { requireVerifiedDoctor, requireRole } from "./auth";
import { recordAudit } from "./audit";
import { createNotification, notifyUsersByRole } from "./notificationsPrototype";

const taskStatus = z.enum(["TODO", "IN_PROGRESS", "DONE", "SKIPPED"]);
const careRequestStatus = z.enum(["REQUESTED", "REVIEWING", "APPROVED", "SCHEDULED", "COMPLETED", "CANCELLED"]);
const careRequestPatient = { id: true, firstName: true, lastName: true, country: true } as const;

class CareRequestStateError extends Error {
  constructor(public readonly statusCode: 404 | 409, message: string) {
    super(message);
  }
}

async function sendCareRequestNotification(
  request: FastifyRequest,
  actorUserId: string,
  resourceId: string,
  recipientRole: "PATIENT" | "ADMIN",
  deliver: () => Promise<unknown>,
) {
  try {
    await deliver();
  } catch {
    // A notification outage must never make an already committed save look failed.
    request.log.error({ careRequestId: resourceId, recipientRole }, "Care request notification failed after save");
    try {
      await recordAudit(request, { actorUserId, action: "CARE_REQUEST_NOTIFICATION_FAILED", resourceType: "CareRequest", resourceId, outcome: "FAILURE", metadata: { recipientRole } });
    } catch {
      request.log.error({ careRequestId: resourceId, recipientRole }, "Could not audit care request notification failure");
    }
  }
}

async function requirePatient(request: FastifyRequest, reply: FastifyReply) {
  const user = await requireRole(request, reply, ["PATIENT"]);
  if (!user || !user.patient) return null;
  return user;
}

export async function registerCarePlatformRoutes(app: FastifyInstance) {
  app.get("/v1/patient/care-plans", async (request, reply) => {
    const user = await requirePatient(request, reply);
    if (!user?.patient) return;
    return prisma.carePlan.findMany({ where: { patientId: user.patient.id }, include: { tasks: { orderBy: [{ status: "asc" }, { dueAt: "asc" }] } }, orderBy: { updatedAt: "desc" } });
  });

  app.patch("/v1/patient/care-plans/:planId/tasks/:taskId", async (request, reply) => {
    const user = await requirePatient(request, reply);
    if (!user?.patient) return;
    const { planId, taskId } = z.object({ planId: z.string().min(1), taskId: z.string().min(1) }).parse(request.params);
    const input = z.object({ status: taskStatus, expectedStatus: z.string().min(1).max(80).optional(), expectedUpdatedAt: z.string().datetime({ offset: true }).transform((value) => new Date(value)).optional() }).parse(request.body);
    try {
      return await prisma.$transaction(async (tx) => {
        const where = { id: taskId, carePlanId: planId, carePlan: { patientId: user.patient!.id } };
        const task = await tx.carePlanTask.findFirst({ where });
        if (!task) throw new CareRequestStateError(404, "Care task not found");
        if ((input.expectedStatus !== undefined && input.expectedStatus !== task.status) || (input.expectedUpdatedAt !== undefined && input.expectedUpdatedAt.getTime() !== task.updatedAt.getTime())) throw new CareRequestStateError(409, "This care task changed while you were editing. Refresh and try again.");
        if (task.status === input.status) return task;
        const result = await tx.carePlanTask.updateMany({ where: { ...where, status: task.status, updatedAt: task.updatedAt }, data: { status: input.status, updatedAt: new Date(Math.max(Date.now(), task.updatedAt.getTime() + 1)) } });
        if (result.count !== 1) throw new CareRequestStateError(409, "This care task changed while you were editing. Refresh and try again.");
        const saved = await tx.carePlanTask.findFirst({ where });
        if (!saved) throw new CareRequestStateError(404, "Care task not found");
        await recordAudit(request, { actorUserId: user.id, action: "CARE_PLAN_TASK_UPDATED", resourceType: "CarePlanTask", resourceId: saved.id, outcome: "SUCCESS", metadata: { previousStatus: task.status, status: saved.status } }, tx);
        return saved;
      });
    } catch (error) {
      if (error instanceof CareRequestStateError) return reply.code(error.statusCode).send({ error: error.message });
      if ((error as { code?: string }).code === "P2034") return reply.code(409).send({ error: "This care task changed while saving. Refresh and try again." });
      throw error;
    }
  });

  app.post("/v1/patient/care-requests", async (request, reply) => {
    const user = await requirePatient(request, reply);
    if (!user?.patient) return;
    const input = z.object({ type: z.enum(["DIAGNOSTIC", "PROCEDURE", "SURGERY", "MEDICATION", "COORDINATION"]), title: z.string().trim().min(3).max(160), description: z.string().trim().max(2000).optional(), country: z.string().trim().max(80).optional(), targetDate: z.coerce.date().optional() }).parse(request.body);
    const patientId = user.patient.id;
    let saved;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        saved = await prisma.$transaction(async (tx) => {
          // Serialize submissions for this patient before checking the retry window.
          // PostgreSQL locks this row until commit; SQLite serializes writers.
          const locked = await tx.patient.updateMany({ where: { id: patientId, userId: user.id }, data: { updatedAt: new Date() } });
          if (locked.count !== 1) throw new CareRequestStateError(404, "Patient not found");
          const duplicate = await tx.careRequest.findFirst({
            where: {
              patientId, type: input.type, title: input.title,
              description: input.description ?? null, country: input.country ?? null,
              targetDate: input.targetDate ?? null,
              createdAt: { gte: new Date(Date.now() - 30_000) },
            },
            orderBy: { createdAt: "desc" },
          });
          if (duplicate) return { record: duplicate, created: false };
          const record = await tx.careRequest.create({ data: { patientId, ...input } });
          await recordAudit(request, { actorUserId: user.id, action: "CARE_REQUEST_CREATED", resourceType: "CareRequest", resourceId: record.id, outcome: "SUCCESS", metadata: { type: input.type, status: record.status } }, tx);
          return { record, created: true };
        });
        break;
      } catch (error) {
        if (error instanceof CareRequestStateError) return reply.code(error.statusCode).send({ error: error.message });
        if ((error as { code?: string }).code !== "P2034") throw error;
        if (attempt === 2) return reply.code(409).send({ error: "Care requests changed while saving. Please try again." });
      }
    }
    if (!saved) throw new Error("Care request transaction did not complete");
    const { record, created } = saved;
    if (!created) return reply.code(200).send(record);
    await sendCareRequestNotification(request, user.id, record.id, "PATIENT", () => createNotification({ userId: user.id, role: "PATIENT", type: "SYSTEM", title: "Care request received", body: `Your ${input.type.toLowerCase()} request has been received and will be reviewed by CareBridge.` }));
    await sendCareRequestNotification(request, user.id, record.id, "ADMIN", () => notifyUsersByRole("ADMIN", "SYSTEM", "New care request", `A patient submitted a new ${input.type.toLowerCase()} care request.`));
    return reply.code(201).send(record);
  });

  app.get("/v1/patient/care-requests", async (request, reply) => {
    const user = await requirePatient(request, reply);
    if (!user?.patient) return;
    return prisma.careRequest.findMany({ where: { patientId: user.patient.id }, orderBy: { createdAt: "desc" } });
  });

  app.get("/v1/admin/care-requests", async (request, reply) => {
    const user = await requireRole(request, reply, ["ADMIN"]);
    if (!user) return;
    const query = z.object({ status: careRequestStatus.optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(request.query);
    return prisma.careRequest.findMany({ where: query.status ? { status: query.status } : undefined, include: { patient: { select: careRequestPatient } }, orderBy: { createdAt: "desc" }, take: query.limit });
  });

  app.get("/v1/admin/care-requests/:requestId", async (request, reply) => {
    const user = await requireRole(request, reply, ["ADMIN"]);
    if (!user) return;
    const { requestId } = z.object({ requestId: z.string().min(1) }).parse(request.params);
    const record = await prisma.careRequest.findUnique({ where: { id: requestId }, include: { patient: { select: careRequestPatient } } });
    if (!record) return reply.code(404).send({ error: "Care request not found" });
    return record;
  });

  app.patch("/v1/admin/care-requests/:requestId", async (request, reply) => {
    const user = await requireRole(request, reply, ["ADMIN"]);
    if (!user) return;
    const { requestId } = z.object({ requestId: z.string().min(1) }).parse(request.params);
    const input = z.object({ status: careRequestStatus, targetDate: z.coerce.date().nullable().optional(), expectedStatus: z.string().min(1).max(80).optional(), expectedUpdatedAt: z.string().datetime({ offset: true }).transform((value) => new Date(value)).optional() }).parse(request.body);
    let saved;
    try {
      saved = await prisma.$transaction(async (tx) => {
        const previous = await tx.careRequest.findUnique({ where: { id: requestId }, include: { patient: { select: careRequestPatient } } });
        if (!previous) throw new CareRequestStateError(404, "Care request not found");
        if ((input.expectedStatus !== undefined && input.expectedStatus !== previous.status) || (input.expectedUpdatedAt !== undefined && input.expectedUpdatedAt.getTime() !== previous.updatedAt.getTime())) {
          throw new CareRequestStateError(409, "This care request changed while you were editing. Refresh and try again.");
        }
        const nextDate = input.targetDate === undefined ? previous.targetDate : input.targetDate;
        const changed = input.status !== previous.status || (nextDate?.getTime() ?? null) !== (previous.targetDate?.getTime() ?? null);
        if (!changed) return { record: previous, changed: false };
        // These are coordination stages. Administrators may correct or reopen them;
        // no appointment, clinical record, doctor assignment, or charge is implied.
        // Match the version read above even for older clients without a precondition.
        const updatedAt = new Date(Math.max(Date.now(), previous.updatedAt.getTime() + 1));
        const result = await tx.careRequest.updateMany({ where: { id: requestId, status: previous.status, updatedAt: previous.updatedAt }, data: { status: input.status, updatedAt, ...(input.targetDate === undefined ? {} : { targetDate: input.targetDate }) } });
        if (result.count !== 1) throw new CareRequestStateError(409, "This care request changed while you were editing. Refresh and try again.");
        const record = await tx.careRequest.findUnique({ where: { id: requestId }, include: { patient: { select: careRequestPatient } } });
        if (!record) throw new CareRequestStateError(404, "Care request not found");
        await recordAudit(request, { actorUserId: user.id, action: "CARE_REQUEST_UPDATED", resourceType: "CareRequest", resourceId: record.id, outcome: "SUCCESS", metadata: { previousStatus: previous.status, status: record.status, previousTargetDate: previous.targetDate?.toISOString() ?? null, targetDate: record.targetDate?.toISOString() ?? null } }, tx);
        return { record, changed: true };
      });
    } catch (error) {
      if (error instanceof CareRequestStateError) return reply.code(error.statusCode).send({ error: error.message });
      if ((error as { code?: string }).code === "P2034") return reply.code(409).send({ error: "This care request changed while saving. Refresh and try again." });
      throw error;
    }
    if (saved.changed) await sendCareRequestNotification(request, user.id, saved.record.id, "PATIENT", async () => {
      const patient = await prisma.patient.findUnique({ where: { id: saved.record.patientId }, select: { userId: true } });
      if (!patient) throw new Error("Care request recipient not found");
      return createNotification({ userId: patient.userId, role: "PATIENT", type: "SYSTEM", title: "Care request updated", body: `Your care request is now ${saved.record.status.toLowerCase().replaceAll("_", " ")}.` });
    });
    return saved.record;
  });

  app.post("/v1/admin/care-plans", async (request, reply) => {
    const user = await requireRole(request, reply, ["ADMIN", "DOCTOR"]);
    if (!user) return;
    const input = z.object({ patientId: z.string().min(1), title: z.string().trim().min(3).max(160), description: z.string().trim().max(2000).optional(), coordinatorNote: z.string().trim().max(4000).optional(), tasks: z.array(z.object({ title: z.string().trim().min(2).max(160), description: z.string().trim().max(1000).optional(), dueAt: z.coerce.date().optional() })).max(50).default([]) }).parse(request.body);
    if (user.role === "DOCTOR") {
      const doctor = await requireVerifiedDoctor(request, reply);
      if (!doctor?.doctor) return;
      const relationship = await prisma.appointment.findFirst({ where: { doctorId: doctor.doctor.id, patientId: input.patientId, status: { not: "CANCELLED" } }, select: { id: true } });
      if (!relationship) return reply.code(403).send({ error: "Doctor is not authorized for this patient" });
    }
    const plan = await prisma.$transaction(async (tx) => {
      const saved = await tx.carePlan.create({ data: { patientId: input.patientId, title: input.title, description: input.description, coordinatorNote: input.coordinatorNote, status: "ACTIVE", tasks: { create: input.tasks } }, include: { tasks: true } });
      await recordAudit(request, { actorUserId: user.id, action: "CARE_PLAN_CREATED", resourceType: "CarePlan", resourceId: saved.id, outcome: "SUCCESS", metadata: { patientId: input.patientId } }, tx);
      return saved;
    });
    try {
      const patient = await prisma.patient.findUnique({ where: { id: input.patientId }, select: { userId: true } });
      if (patient) await createNotification({ userId: patient.userId, role: "PATIENT", type: "CARE_PLAN", title: "Your care plan is ready", body: `A new care plan, “${plan.title}”, is available in your CareBridge dashboard.` });
    } catch { request.log.warn({ resourceType: "CarePlan" }, "Care plan committed; notification delivery failed"); }
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
      prisma.careRequest.count({ where: { status: { in: ["REQUESTED", "REVIEWING", "APPROVED", "SCHEDULED"] } } }),
      prisma.notification.count({ where: { userId: user.id, status: "UNREAD" } }),
      prisma.auditLog.count({ where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
    ]);
    return { patients, doctors, verifiedDoctors, appointments, consultations, completedConsultations, careRequests, unreadNotifications, recentAuditEvents, consultationCompletionRate: consultations ? Math.round((completedConsultations / consultations) * 100) : 0 };
  });
}
