import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "./server";
import { getAuthenticatedUser, requireRole } from "./auth";
import { recordAudit } from "./audit";
import { createNotification, notifyUsersByRole, type NotificationRole } from "./notificationsPrototype";

const ticketInput = z.object({
  category: z.string().trim().min(2).max(80),
  message: z.string().trim().min(5).max(5000),
});

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
    const ticket = await prisma.supportTicket.create({ data: { userId: user.id, ...input } });
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

  app.get("/v1/admin/support/tickets", async (request, reply) => {
    const user = await requireRole(request, reply, ["ADMIN"]);
    if (!user) return;
    const query = z.object({ status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).parse(request.query);
    return prisma.supportTicket.findMany({
      where: query.status ? { status: query.status } : undefined,
      include: { user: { select: { id: true, email: true, role: true } } },
      orderBy: { updatedAt: "desc" },
      take: query.limit,
    });
  });

  app.patch("/v1/admin/support/tickets/:ticketId", async (request, reply) => {
    const user = await requireRole(request, reply, ["ADMIN"]);
    if (!user) return;
    const { ticketId } = z.object({ ticketId: z.string().min(1) }).parse(request.params);
    const input = z.object({ status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]) }).parse(request.body);
    const ticket = await prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: input.status, resolvedAt: ["RESOLVED", "CLOSED"].includes(input.status) ? new Date() : null },
    });
    await recordAudit(request, { actorUserId: user.id, action: "ADMIN_SUPPORT_TICKET_UPDATED", resourceType: "SupportTicket", resourceId: ticket.id, outcome: "SUCCESS", metadata: { status: input.status } });
    const ticketOwner = await prisma.user.findUnique({ where: { id: ticket.userId }, select: { role: true } });
    if (ticketOwner && ["PATIENT", "DOCTOR", "ADMIN"].includes(ticketOwner.role)) {
      await createNotification({ userId: ticket.userId, role: ticketOwner.role as NotificationRole, type: "SUPPORT", title: "Support request updated", body: "Your support request status is now " + input.status + "." });
    }
    return ticket;
  });
}
