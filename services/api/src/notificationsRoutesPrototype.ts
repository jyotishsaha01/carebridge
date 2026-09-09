import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getNotificationPreferences, setNotificationPreference, listNotifications, unreadCount, markNotificationRead, markAllNotificationsRead, seedNotificationPrototype, type NotificationRole, type NotificationType } from "./notificationsPrototype";
import { requireRole } from "./auth";

export async function registerNotificationPrototypeRoutes(app:FastifyInstance){
  app.get("/v1/prototype/notifications",async(request,reply)=>{const user=await requireRole(request,reply,["PATIENT","DOCTOR","ADMIN"]);if(!user)return;const role=user.role as NotificationRole;seedNotificationPrototype(user.id,role);return{notifications:listNotifications(user.id),unreadCount:unreadCount(user.id),source:"prototype-memory"};});
  app.post("/v1/prototype/notifications/:id/read",async(request,reply)=>{const user=await requireRole(request,reply,["PATIENT","DOCTOR","ADMIN"]);if(!user)return;const{id}=z.object({id:z.string().min(1)}).parse(request.params);const item=markNotificationRead(user.id,id);if(!item)return reply.code(404).send({error:"Notification not found"});return item;});
  app.post("/v1/prototype/notifications/read-all",async(request,reply)=>{const user=await requireRole(request,reply,["PATIENT","DOCTOR","ADMIN"]);if(!user)return;return{updated:markAllNotificationsRead(user.id)};});
  app.get("/v1/prototype/notification-preferences",async(request,reply)=>{const user=await requireRole(request,reply,["PATIENT","DOCTOR","ADMIN"]);if(!user)return;return getNotificationPreferences(user.id);});
  app.patch("/v1/prototype/notification-preferences/:type",async(request,reply)=>{const user=await requireRole(request,reply,["PATIENT","DOCTOR","ADMIN"]);if(!user)return;const{type}=z.object({type:z.enum(["CONSULTATION","PRESCRIPTION","FOLLOW_UP","CARE_PLAN","DOCUMENT","SUPPORT","SYSTEM"])}).parse(request.params);const{enabled}=z.object({enabled:z.boolean()}).parse(request.body);return setNotificationPreference(user.id,type as NotificationType,enabled);});
}
