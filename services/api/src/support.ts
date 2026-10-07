import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "./server";
import { getAuthenticatedUser, requireRole } from "./auth";
import { recordAudit } from "./audit";

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
    return reply.code(201).send(ticket);
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
    return ticket;
  });
}
