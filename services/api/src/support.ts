import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { prisma } from "./server";
import { getAuthenticatedUser, requireRole } from "./auth";
import { recordAudit } from "./audit";
import { createNotification, notifyUsersByRole, type NotificationRole } from "./notificationsPrototype";
import { MAX_DOCUMENT_BYTES, documentStorage } from "./storage";
import { scanUploadedFile } from "./malwareScanner";
import type { Prisma } from "@prisma/client";

const ticketInput = z.object({
  category: z.string().trim().min(2).max(80),
  message: z.string().trim().min(5).max(5000),
});

const priorityInput = z.enum(["LOW", "NORMAL", "HIGH"]);
const supportOwner = { select: { id: true, email: true, role: true } } as const;
class SupportStateError extends Error {
  constructor(public readonly statusCode: 403 | 404 | 409, message: string) { super(message); }
}
class SupportRetryError extends Error {}
async function supportWrite<T>(reply: FastifyReply, operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T | undefined> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await prisma.$transaction(operation); }
    catch (error) {
      if (error instanceof SupportStateError) { reply.code(error.statusCode).send({ error: error.message }); return; }
      if (!(error instanceof SupportRetryError) && (error as { code?: string }).code !== "P2034") throw error;
      if (attempt === 2) { reply.code(409).send({ error: "This support request changed while saving. Refresh and try again." }); return; }
    }
  }
}
async function supportNotification(request: FastifyRequest, actorUserId: string, ticketId: string, deliver: () => Promise<unknown>) {
  try { await deliver(); }
  catch {
    request.log.warn({ resourceType: "SupportTicket", resourceId: ticketId }, "Support change committed; notification delivery failed");
    try { await recordAudit(request, { actorUserId, action: "SUPPORT_NOTIFICATION_FAILED", resourceType: "SupportTicket", resourceId: ticketId, outcome: "FAILURE" }); }
    catch { request.log.warn({ resourceType: "SupportTicket" }, "Support notification failure audit unavailable"); }
  }
}
function slaDueAt(priority: "LOW" | "NORMAL" | "HIGH", from = new Date()) {
  const hours = priority === "HIGH" ? 4 : priority === "LOW" ? 72 : 24;
  return new Date(from.getTime() + hours * 60 * 60 * 1000);
}

async function requireUser(request: FastifyRequest, reply: FastifyReply) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    reply.code(401).send({ error: "Authentication required" });
    return null;
  }
  return user;
}

export async function registerSupportRoutes(app: FastifyInstance) {
  app.get("/v1/support/tickets", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    return prisma.supportTicket.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 });
  });

  app.post("/v1/support/tickets", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const input = ticketInput.parse(request.body);
    const saved = await supportWrite(reply, async (tx) => {
      // Serialize retries for the submitting account before the duplicate check.
      await tx.user.update({ where: { id: user.id }, data: { updatedAt: new Date() } });
      const duplicate = await tx.supportTicket.findFirst({ where: { userId: user.id, ...input, createdAt: { gte: new Date(Date.now() - 30_000) } }, orderBy: { createdAt: "desc" } });
      if (duplicate) return { ticket: duplicate, created: false };
      const ticket = await tx.supportTicket.create({ data: { userId: user.id, ...input, priority: "NORMAL", slaDueAt: slaDueAt("NORMAL") } });
      await recordAudit(request, { actorUserId: user.id, action: "SUPPORT_TICKET_CREATED", resourceType: "SupportTicket", resourceId: ticket.id, outcome: "SUCCESS" }, tx);
      return { ticket, created: true };
    });
    if (!saved) return;
    if (saved.created) await supportNotification(request, user.id, saved.ticket.id, () => notifyUsersByRole("ADMIN", "SUPPORT", "New support request", "A user submitted a support request that needs review."));
    return reply.code(saved.created ? 201 : 200).send(saved.ticket);
  });

  app.get("/v1/support/tickets/:ticketId/messages", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { ticketId } = z.object({ ticketId: z.string().min(1) }).parse(request.params);
    const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId }, select: { id: true, userId: true } });
    if (!ticket) return reply.code(404).send({ error: "Support ticket not found" });
    if (ticket.userId !== user.id && user.role !== "ADMIN") return reply.code(403).send({ error: "You cannot access this support conversation" });
    const messages = await prisma.supportMessage.findMany({
      where: { ticketId },
      include: { author: { select: { id: true, role: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 200,
    });
    return messages.reverse();
  });

  app.post("/v1/support/tickets/:ticketId/messages", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { ticketId } = z.object({ ticketId: z.string().min(1) }).parse(request.params);
    const input = z.object({ message: z.string().trim().min(1).max(5000) }).parse(request.body);
    const saved = await supportWrite(reply, async (tx) => {
      const ticket = await tx.supportTicket.findUnique({ where: { id: ticketId } });
      if (!ticket) throw new SupportStateError(404, "Support ticket not found");
      if (ticket.userId !== user.id && user.role !== "ADMIN") throw new SupportStateError(403, "You cannot reply to this support conversation");
      const locked = await tx.supportTicket.updateMany({ where: { id: ticketId, updatedAt: ticket.updatedAt }, data: { updatedAt: new Date(Math.max(Date.now(), ticket.updatedAt.getTime() + 1)) } });
      if (locked.count !== 1) throw new SupportRetryError();
      const duplicate = await tx.supportMessage.findFirst({ where: { ticketId, userId: user.id, message: input.message, createdAt: { gte: new Date(Date.now() - 30_000) } }, include: { author: { select: { id: true, role: true } } }, orderBy: { createdAt: "desc" } });
      if (duplicate) return { ticket, message: duplicate, created: false };
      const message = await tx.supportMessage.create({ data: { ticketId, userId: user.id, message: input.message }, include: { author: { select: { id: true, role: true } } } });
      await recordAudit(request, { actorUserId: user.id, action: user.role === "ADMIN" ? "ADMIN_SUPPORT_MESSAGE_SENT" : "SUPPORT_MESSAGE_SENT", resourceType: "SupportTicket", resourceId: ticketId, outcome: "SUCCESS" }, tx);
      return { ticket, message, created: true };
    });
    if (!saved) return;
    if (saved.created) await supportNotification(request, user.id, ticketId, async () => {
      if (user.role === "ADMIN") {
        const owner = await prisma.user.findUnique({ where: { id: saved.ticket.userId }, select: { id: true, role: true } });
        if (owner && ["PATIENT", "DOCTOR", "ADMIN"].includes(owner.role)) await createNotification({ userId: owner.id, role: owner.role as NotificationRole, type: "SUPPORT", title: "Support team replied", body: "The support team replied to your request." });
      } else await notifyUsersByRole("ADMIN", "SUPPORT", "Support request updated", "A user added a message to a support conversation.");
    });
    return reply.code(saved.created ? 201 : 200).send(saved.message);
  });


  // Attachments are stored outside the public web root. Only the ticket owner and admins
  // can list or retrieve attachment content.
  app.get("/v1/support/tickets/:ticketId/attachments", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { ticketId } = z.object({ ticketId: z.string().min(1) }).parse(request.params);
    const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId }, select: { id: true, userId: true } });
    if (!ticket) return reply.code(404).send({ error: "Support ticket not found" });
    if (ticket.userId !== user.id && user.role !== "ADMIN") {
      return reply.code(403).send({ error: "You cannot access attachments for this support ticket" });
    }
    const attachments = await prisma.supportAttachment.findMany({
      where: { ticketId },
      select: { id: true, ticketId: true, uploadedBy: true, fileName: true, contentType: true, sizeBytes: true, createdAt: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
    });
    return attachments.reverse();
  });

  app.post("/v1/support/tickets/:ticketId/attachments", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { ticketId } = z.object({ ticketId: z.string().min(1) }).parse(request.params);
    const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId }, select: { id: true, userId: true } });
    if (!ticket) return reply.code(404).send({ error: "Support ticket not found" });
    if (ticket.userId !== user.id && user.role !== "ADMIN") {
      return reply.code(403).send({ error: "You cannot attach files to this support ticket" });
    }
    const parsed = z.object({
      fileName: z.string().trim().min(1).max(200),
      contentType: z.enum(["application/pdf", "image/png", "image/jpeg"]),
      contentBase64: z.string().min(1).max(4 * Math.ceil(5 * 1024 * 1024 / 3)),
    }).safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid support attachment",
        issues: parsed.error.issues.map((issue) => ({ field: issue.path.map(String).join("."), message: issue.message })),
      });
    }
    const input = parsed.data;
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.contentBase64)) {
      return reply.code(400).send({ error: "Invalid attachment encoding" });
    }
    const bytes = Buffer.from(input.contentBase64, "base64");
    if (!bytes.length || bytes.length > Math.min(MAX_DOCUMENT_BYTES, 5 * 1024 * 1024) || bytes.toString("base64") !== input.contentBase64) {
      return reply.code(400).send({ error: "Attachment size or encoding is invalid" });
    }
    const validSignature =
      (input.contentType === "application/pdf" && bytes.subarray(0, 5).toString("ascii") === "%PDF-") ||
      (input.contentType === "image/png" && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
      (input.contentType === "image/jpeg" && bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff);
    if (!validSignature) return reply.code(400).send({ error: "Attachment content does not match the declared file type" });

    const scan = await scanUploadedFile({ content: bytes, contentType: input.contentType, fileName: input.fileName });
    if (scan.status !== "clean") return reply.code(scan.status === "infected" ? 422 : 503).send({ error: scan.status === "infected" ? "Attachment was rejected by malware scanning" : "Attachment scanning is temporarily unavailable" });
    const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "attachment";
    const storageKey = `support/${ticketId}/${randomUUID()}-${safeName}`;
    let attachment;
    try {
      await documentStorage.writeDocument({ storageKey, content: bytes, contentType: input.contentType });
      attachment = await prisma.$transaction(async (tx) => {
        const saved = await tx.supportAttachment.create({ data: { ticketId, uploadedBy: user.id, fileName: input.fileName, contentType: input.contentType, sizeBytes: bytes.length, storageKey }, select: { id: true, ticketId: true, uploadedBy: true, fileName: true, contentType: true, sizeBytes: true, createdAt: true } });
        await recordAudit(request, { actorUserId: user.id, action: "SUPPORT_ATTACHMENT_UPLOADED", resourceType: "SupportAttachment", resourceId: saved.id, outcome: "SUCCESS", metadata: { ticketId, contentType: input.contentType, sizeBytes: bytes.length } }, tx);
        await tx.supportTicket.update({ where: { id: ticketId }, data: { updatedAt: new Date() } });
        return saved;
      });
    } catch (error) {
      await documentStorage.deleteDocument(storageKey).catch(() => undefined);
      request.log.error({ resourceType: "SupportAttachment" }, "Support attachment storage or metadata commit failed");
      if ((error as { statusCode?: number }).statusCode === 503) return reply.code(503).send({ error: "Encrypted attachment storage is not configured" });
      throw error;
    }
    try {
      if (user.role !== "ADMIN") await notifyUsersByRole("ADMIN", "SUPPORT", "Support attachment uploaded", "A user attached a file to a support ticket.");
    } catch { request.log.warn({ resourceType: "SupportAttachment" }, "Support attachment committed; notification delivery failed"); }
    return reply.code(201).send(attachment);
  });

  app.get("/v1/support/tickets/:ticketId/attachments/:attachmentId/content", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { ticketId, attachmentId } = z.object({ ticketId: z.string().min(1), attachmentId: z.string().min(1) }).parse(request.params);
    const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId }, select: { id: true, userId: true } });
    if (!ticket) return reply.code(404).send({ error: "Support ticket not found" });
    if (ticket.userId !== user.id && user.role !== "ADMIN") {
      await recordAudit(request, { actorUserId: user.id, action: "SUPPORT_ATTACHMENT_ACCESS_DENIED", resourceType: "SupportAttachment", resourceId: attachmentId, outcome: "FAILURE" });
      return reply.code(403).send({ error: "You cannot access this support attachment" });
    }
    const attachment = await prisma.supportAttachment.findFirst({
      where: { id: attachmentId, ticketId },
      select: { id: true, fileName: true, contentType: true, sizeBytes: true, storageKey: true },
    });
    if (!attachment) return reply.code(404).send({ error: "Support attachment not found" });
    try {
      const bytes = await documentStorage.readDocument(attachment.storageKey);
      await recordAudit(request, { actorUserId: user.id, action: "SUPPORT_ATTACHMENT_DOWNLOADED", resourceType: "SupportAttachment", resourceId: attachment.id, outcome: "SUCCESS" });
      return { attachment: { id: attachment.id, fileName: attachment.fileName, contentType: attachment.contentType, sizeBytes: attachment.sizeBytes }, contentBase64: bytes.toString("base64") };
    } catch {
      return reply.code(404).send({ error: "Attachment content is not available" });
    }
  });

  app.get("/v1/admin/support/tickets", async (request, reply) => {
    const user = await requireRole(request, reply, ["ADMIN"]);
    if (!user) return;
    const query = z.object({
      status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
      priority: priorityInput.optional(),
      overdue: z.enum(["true", "false"]).optional().transform((value) => value === undefined ? undefined : value === "true"),
      escalated: z.enum(["true", "false"]).optional().transform((value) => value === undefined ? undefined : value === "true"),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }).parse(request.query);
    const now = new Date();
    const where = {
      AND: [
        ...(query.status ? [{ status: query.status }] : []),
        ...(query.priority ? [{ priority: query.priority }] : []),
        ...(query.escalated !== undefined ? [{ escalatedAt: query.escalated ? { not: null } : null }] : []),
        ...(query.overdue === undefined ? [] : query.overdue
          ? [{ slaDueAt: { lt: now }, status: { notIn: ["RESOLVED", "CLOSED"] } }]
          : [{ OR: [{ slaDueAt: null }, { slaDueAt: { gte: now } }, { status: { in: ["RESOLVED", "CLOSED"] } }] }]),
      ],
    };
    return prisma.supportTicket.findMany({
      where,
      include: { user: { select: { id: true, email: true, role: true } } },
      orderBy: [{ escalatedAt: { sort: "desc", nulls: "last" } }, { slaDueAt: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }],
      take: query.limit,
    });
  });

  app.patch("/v1/admin/support/tickets/:ticketId", async (request, reply) => {
    const user = await requireRole(request, reply, ["ADMIN"]);
    if (!user) return;
    const { ticketId } = z.object({ ticketId: z.string().min(1) }).parse(request.params);
    const input = z.object({
      status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
      priority: priorityInput.optional(),
      escalated: z.boolean().optional(),
      expectedUpdatedAt: z.string().datetime({ offset: true }).transform((value) => new Date(value)).optional(),
    }).refine((value) => value.status !== undefined || value.priority !== undefined || value.escalated !== undefined, { message: "At least one field must be provided" }).parse(request.body);
    const saved = await supportWrite(reply, async (tx) => {
      const existing = await tx.supportTicket.findUnique({ where: { id: ticketId }, include: { user: supportOwner } });
      if (!existing) throw new SupportStateError(404, "Support ticket not found");
      if (input.expectedUpdatedAt && input.expectedUpdatedAt.getTime() !== existing.updatedAt.getTime()) throw new SupportStateError(409, "This support request changed while you were editing. Refresh and try again.");
      const statusChanged = input.status !== undefined && input.status !== existing.status;
      const priorityChanged = input.priority !== undefined && input.priority !== existing.priority;
      const escalationChanged = input.escalated !== undefined && input.escalated !== Boolean(existing.escalatedAt);
      if (!statusChanged && !priorityChanged && !escalationChanged) return { ticket: existing, statusChanged: false, escalated: false };
      const now = new Date(Math.max(Date.now(), existing.updatedAt.getTime() + 1));
      const changed = await tx.supportTicket.updateMany({ where: { id: ticketId, updatedAt: existing.updatedAt }, data: {
        ...(statusChanged ? { status: input.status, resolvedAt: ["RESOLVED", "CLOSED"].includes(input.status!) ? now : null } : {}),
        ...(priorityChanged ? { priority: input.priority, slaDueAt: slaDueAt(input.priority!, now) } : {}),
        ...(escalationChanged ? { escalatedAt: input.escalated ? now : null } : {}),
        updatedAt: now,
      } });
      if (changed.count !== 1) throw new SupportStateError(409, "This support request changed while you were editing. Refresh and try again.");
      const ticket = await tx.supportTicket.findUnique({ where: { id: ticketId }, include: { user: supportOwner } });
      if (!ticket) throw new SupportStateError(404, "Support ticket not found");
      await recordAudit(request, { actorUserId: user.id, action: "ADMIN_SUPPORT_TICKET_UPDATED", resourceType: "SupportTicket", resourceId: ticket.id, outcome: "SUCCESS", metadata: { previousStatus: existing.status, status: ticket.status, previousPriority: existing.priority, priority: ticket.priority, escalated: Boolean(ticket.escalatedAt) } }, tx);
      return { ticket, statusChanged, escalated: escalationChanged && input.escalated === true };
    });
    if (!saved) return;
    if (saved.escalated) {
      await supportNotification(request, user.id, ticketId, () => notifyUsersByRole("ADMIN", "SUPPORT", "Support ticket escalated", "A support ticket was escalated and requires priority review."));
      if (["PATIENT", "DOCTOR", "ADMIN"].includes(saved.ticket.user.role)) await supportNotification(request, user.id, ticketId, () => createNotification({ userId: saved.ticket.userId, role: saved.ticket.user.role as NotificationRole, type: "SUPPORT", title: "Support request escalated", body: "Your support request has been escalated for additional review." }));
    }
    if (saved.statusChanged && ["PATIENT", "DOCTOR", "ADMIN"].includes(saved.ticket.user.role)) await supportNotification(request, user.id, ticketId, () => createNotification({ userId: saved.ticket.userId, role: saved.ticket.user.role as NotificationRole, type: "SUPPORT", title: "Support request updated", body: "Your support request status is now " + saved.ticket.status + "." }));
    return saved.ticket;
  });

  app.get("/v1/admin/support/tickets/:ticketId", async (request, reply) => {
    const user = await requireRole(request, reply, ["ADMIN"]);
    if (!user) return;
    const { ticketId } = z.object({ ticketId: z.string().min(1) }).parse(request.params);
    const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId }, include: { user: supportOwner } });
    if (!ticket) return reply.code(404).send({ error: "Support ticket not found" });
    return ticket;
  });
}
