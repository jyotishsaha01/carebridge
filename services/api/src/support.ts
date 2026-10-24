import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { prisma } from "./server";
import { getAuthenticatedUser, requireRole } from "./auth";
import { recordAudit } from "./audit";
import { createNotification, notifyUsersByRole, type NotificationRole } from "./notificationsPrototype";
import { MAX_DOCUMENT_BYTES } from "./storage";
import { saveDocument, readDocument, deleteDocument } from "./documentStoragePrototype";

const ticketInput = z.object({
  category: z.string().trim().min(2).max(80),
  message: z.string().trim().min(5).max(5000),
});

const priorityInput = z.enum(["LOW", "NORMAL", "HIGH"]);
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
    const createdAt = new Date();
    const ticket = await prisma.supportTicket.create({ data: { userId: user.id, ...input, priority: "NORMAL", slaDueAt: slaDueAt("NORMAL", createdAt) } });
    await recordAudit(request, { actorUserId: user.id, action: "SUPPORT_TICKET_CREATED", resourceType: "SupportTicket", resourceId: ticket.id, outcome: "SUCCESS" });
    await notifyUsersByRole("ADMIN", "SUPPORT", "New support request", "A user submitted a support request that needs review.");
    return reply.code(201).send(ticket);
  });

  app.get("/v1/support/tickets/:ticketId/messages", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { ticketId } = z.object({ ticketId: z.string().min(1) }).parse(request.params);
    const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId }, select: { id: true, userId: true } });
    if (!ticket) return reply.code(404).send({ error: "Support ticket not found" });
    if (ticket.userId !== user.id && user.role !== "ADMIN") return reply.code(403).send({ error: "You cannot access this support conversation" });
    return prisma.supportMessage.findMany({
      where: { ticketId },
      include: { author: { select: { id: true, role: true } } },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
  });

  app.post("/v1/support/tickets/:ticketId/messages", async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const { ticketId } = z.object({ ticketId: z.string().min(1) }).parse(request.params);
    const input = z.object({ message: z.string().trim().min(1).max(5000) }).parse(request.body);
    const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) return reply.code(404).send({ error: "Support ticket not found" });
    if (ticket.userId !== user.id && user.role !== "ADMIN") return reply.code(403).send({ error: "You cannot reply to this support conversation" });
    const message = await prisma.supportMessage.create({
      data: { ticketId, userId: user.id, message: input.message },
      include: { author: { select: { id: true, role: true } } },
    });
    await prisma.supportTicket.update({ where: { id: ticketId }, data: { updatedAt: new Date() } });
    await recordAudit(request, { actorUserId: user.id, action: user.role === "ADMIN" ? "ADMIN_SUPPORT_MESSAGE_SENT" : "SUPPORT_MESSAGE_SENT", resourceType: "SupportTicket", resourceId: ticketId, outcome: "SUCCESS" });
    if (user.role === "ADMIN") {
      const owner = await prisma.user.findUnique({ where: { id: ticket.userId }, select: { id: true, role: true } });
      if (owner && ["PATIENT", "DOCTOR", "ADMIN"].includes(owner.role)) {
        await createNotification({ userId: owner.id, role: owner.role as NotificationRole, type: "SUPPORT", title: "Support team replied", body: "The support team replied to your request." });
      }
    } else {
      await notifyUsersByRole("ADMIN", "SUPPORT", "Support request updated", "A user added a message to a support conversation.");
    }
    return reply.code(201).send(message);
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
    return prisma.supportAttachment.findMany({
      where: { ticketId },
      select: { id: true, ticketId: true, uploadedBy: true, fileName: true, contentType: true, sizeBytes: true, createdAt: true },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
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
      contentBase64: z.string().min(1),
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

    const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "attachment";
    const storageKey = `support/${ticketId}/${randomUUID()}-${safeName}`;
    try {
      await saveDocument({ storageKey, content: bytes, contentType: input.contentType });
      const attachment = await prisma.supportAttachment.create({
        data: { ticketId, uploadedBy: user.id, fileName: input.fileName, contentType: input.contentType, sizeBytes: bytes.length, storageKey },
        select: { id: true, ticketId: true, uploadedBy: true, fileName: true, contentType: true, sizeBytes: true, createdAt: true },
      });
      await recordAudit(request, { actorUserId: user.id, action: "SUPPORT_ATTACHMENT_UPLOADED", resourceType: "SupportAttachment", resourceId: attachment.id, outcome: "SUCCESS", metadata: { ticketId, contentType: input.contentType, sizeBytes: bytes.length } });
      await prisma.supportTicket.update({ where: { id: ticketId }, data: { updatedAt: new Date() } });
      if (user.role !== "ADMIN") await notifyUsersByRole("ADMIN", "SUPPORT", "Support attachment uploaded", "A user attached a file to a support ticket.");
      return reply.code(201).send(attachment);
    } catch (error) {
      await deleteDocument(storageKey).catch(() => undefined);
      request.log.error({ err: error, ticketId }, "Failed to store support attachment");
      return reply.code(500).send({ error: "Support attachment could not be saved" });
    }
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
      const bytes = await readDocument(attachment.storageKey);
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
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.escalated === true ? { escalatedAt: { not: null } } : query.escalated === false ? { escalatedAt: null } : {}),
      AND: [
        ...(query.status ? [{ status: query.status }] : []),
        ...(query.overdue === true
          ? [{ slaDueAt: { lt: now }, status: { notIn: ["RESOLVED", "CLOSED"] } }]
          : query.overdue === false
            ? [{ OR: [{ slaDueAt: null }, { slaDueAt: { gte: now } }] }]
            : []),
      ],
    };
    return prisma.supportTicket.findMany({
      where,
      include: { user: { select: { id: true, email: true, role: true } } },
      orderBy: [{ escalatedAt: "desc" }, { slaDueAt: "asc" }, { updatedAt: "desc" }],
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
    }).refine((value) => value.status !== undefined || value.priority !== undefined || value.escalated !== undefined, { message: "At least one field must be provided" }).parse(request.body);
    const existing = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!existing) return reply.code(404).send({ error: "Support ticket not found" });
    const now = new Date();
    const nextPriority = input.priority ?? (existing.priority as "LOW" | "NORMAL" | "HIGH");
    const ticket = await prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        ...(input.status ? { status: input.status, resolvedAt: ["RESOLVED", "CLOSED"].includes(input.status) ? now : null } : {}),
        ...(input.priority ? { priority: input.priority, slaDueAt: slaDueAt(nextPriority, now) } : {}),
        ...(input.escalated !== undefined ? { escalatedAt: input.escalated ? (existing.escalatedAt ?? now) : null } : {}),
      },
    });
    await recordAudit(request, { actorUserId: user.id, action: "ADMIN_SUPPORT_TICKET_UPDATED", resourceType: "SupportTicket", resourceId: ticket.id, outcome: "SUCCESS", metadata: { status: input.status, priority: input.priority, escalated: input.escalated } });
    if (input.escalated === true && !existing.escalatedAt) {
      await notifyUsersByRole("ADMIN", "SUPPORT", "Support ticket escalated", "A support ticket was escalated and requires priority review.");
      const owner = await prisma.user.findUnique({ where: { id: existing.userId }, select: { id: true, role: true } });
      if (owner && ["PATIENT", "DOCTOR", "ADMIN"].includes(owner.role)) {
        await createNotification({ userId: owner.id, role: owner.role as NotificationRole, type: "SUPPORT", title: "Support request escalated", body: "Your support request has been escalated for additional review." });
      }
    }
    const ticketOwner = await prisma.user.findUnique({ where: { id: ticket.userId }, select: { role: true } });
    if (ticketOwner && ["PATIENT", "DOCTOR", "ADMIN"].includes(ticketOwner.role) && input.status) {
      await createNotification({
        userId: ticket.userId,
        role: ticketOwner.role as NotificationRole,
        type: "SUPPORT",
        title: "Support request updated",
        body: "Your support request status is now " + input.status + ".",
      });
    }
    return ticket;
  });
}
