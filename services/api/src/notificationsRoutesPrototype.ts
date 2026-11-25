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
import { getAuthenticatedUser, requireRole } from "./auth";
import { subscribeNotifications } from "./notificationRealtime";

const allowedRoles = ["PATIENT", "DOCTOR", "ADMIN"] as const;
const notificationTypes = ["CONSULTATION", "PRESCRIPTION", "FOLLOW_UP", "CARE_PLAN", "DOCUMENT", "SUPPORT", "SYSTEM"] as const;

export async function registerNotificationPrototypeRoutes(app: FastifyInstance) {
  const activeStreams = new Set<() => void>();
  const userStreamCounts = new Map<string, number>();
  const MAX_STREAMS_PER_USER = 3;
  const MAX_STREAMS_TOTAL = 500;
  app.addHook("preClose", async () => {
    for (const close of [...activeStreams]) close();
  });
  const list = async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await requireRole(request, reply, [...allowedRoles]);
    if (!user) return;
    const role = user.role as NotificationRole;
    if (process.env.NODE_ENV !== "production" && process.env.ALLOW_DEMO_AUTH === "true") await seedNotificationPrototype(user.id, role);
    return { notifications: await listNotifications(user.id), unreadCount: await unreadCount(user.id), source: "persistent" };
  };

  app.get("/v1/notifications", list);

  app.get("/v1/notifications/stream", async (request, reply) => {
    const user = await requireRole(request, reply, [...allowedRoles]);
    if (!user) return;
    const allowedOrigin = reply.getHeader("access-control-allow-origin");
    if (request.headers.origin && allowedOrigin !== request.headers.origin) return reply.code(403).send({ error: "Request origin is not allowed" });
    if ((userStreamCounts.get(user.id) ?? 0) >= MAX_STREAMS_PER_USER || activeStreams.size >= MAX_STREAMS_TOTAL) {
      return reply.header("Retry-After", "30").code(429).send({ error: "Too many notification streams" });
    }
    const raw = reply.raw;
    reply.hijack();
    raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Content-Type-Options": "nosniff",
      "Vary": "Origin",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
      ...(typeof allowedOrigin === "string" ? { "Access-Control-Allow-Origin": allowedOrigin, "Access-Control-Allow-Credentials": "true" } : {}),
    });
    raw.write(`event: ready\ndata: ${JSON.stringify({ connected: true })}\n\n`);
    userStreamCounts.set(user.id, (userStreamCounts.get(user.id) ?? 0) + 1);
    await new Promise<void>((resolve) => {
      let closed = false;
      let unsubscribe = () => {};
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(revalidation);
        clearTimeout(lifetime);
        unsubscribe();
        activeStreams.delete(close);
        const remaining = (userStreamCounts.get(user.id) ?? 1) - 1;
        if (remaining > 0) userStreamCounts.set(user.id, remaining);
        else userStreamCounts.delete(user.id);
        raw.end();
        resolve();
      };
      const stillAuthorized = async () => {
        try {
          const current = await getAuthenticatedUser(request);
          if (closed) return false;
          if (current?.id !== user.id) { close(); return false; }
          return true;
        } catch { close(); return false; }
      };
      // Revalidate idle streams as well as every event; revoked sessions receive no later payload.
      const revalidation = setInterval(() => {
        void stillAuthorized().then((authorized) => {
          if (authorized && !raw.write(": heartbeat\n\n")) close();
        });
      }, 15_000);
      const lifetime = setTimeout(close, 5 * 60_000);
      revalidation.unref();
      lifetime.unref();
      unsubscribe = subscribeNotifications(user.id, (notification) => {
        void stillAuthorized().then((authorized) => {
          // A slow client must reconnect instead of accumulating an unbounded buffer.
          if (authorized && !raw.write(`event: notification\ndata: ${JSON.stringify(notification)}\n\n`)) close();
        });
      });
      activeStreams.add(close);
      raw.once("close", close);
      raw.once("error", close);
    });
  });
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
