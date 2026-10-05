import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  getNotificationPreferences,
  setNotificationPreference,
  listNotifications,
  unreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  seedNotificationPrototype,
  type NotificationRole,
  type NotificationType,
} from "./notificationsPrototype";
import { requireRole } from "./auth";

const allowedRoles = ["PATIENT", "DOCTOR", "ADMIN"] as const;
const notificationTypes = ["CONSULTATION", "PRESCRIPTION", "FOLLOW_UP", "CARE_PLAN", "DOCUMENT", "SUPPORT", "SYSTEM"] as const;

export async function registerNotificationPrototypeRoutes(app: FastifyInstance) {
  const list = async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await requireRole(request, reply, [...allowedRoles]);
    if (!user) return;
    const role = user.role as NotificationRole;
    await seedNotificationPrototype(user.id, role);
    return { notifications: await listNotifications(user.id), unreadCount: await unreadCount(user.id), source: "persistent" };
  };

  app.get("/v1/notifications", list);
  app.get("/v1/prototype/notifications", list);

  const markRead = async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await requireRole(request, reply, [...allowedRoles]);
    if (!user) return;
    const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const item = await markNotificationRead(user.id, id);
    if (!item) return reply.code(404).send({ error: "Notification not found" });
    return item;
  };
  app.post("/v1/notifications/:id/read", markRead);
  app.post("/v1/prototype/notifications/:id/read", markRead);

  const markAllRead = async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await requireRole(request, reply, [...allowedRoles]);
    if (!user) return;
    return { updated: await markAllNotificationsRead(user.id) };
  };
  app.post("/v1/notifications/read-all", markAllRead);
  app.post("/v1/prototype/notifications/read-all", markAllRead);

  const preferences = async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await requireRole(request, reply, [...allowedRoles]);
    if (!user) return;
    return getNotificationPreferences(user.id);
  };
  app.get("/v1/notification-preferences", preferences);
  app.get("/v1/prototype/notification-preferences", preferences);

  const updatePreference = async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await requireRole(request, reply, [...allowedRoles]);
    if (!user) return;
    const { type } = z.object({ type: z.enum(notificationTypes) }).parse(request.params);
    const { enabled } = z.object({ enabled: z.boolean() }).parse(request.body);
    return setNotificationPreference(user.id, type as NotificationType, enabled);
  };
  app.patch("/v1/notification-preferences/:type", updatePreference);
  app.patch("/v1/prototype/notification-preferences/:type", updatePreference);
}
