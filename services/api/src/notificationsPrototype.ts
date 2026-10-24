import { prisma } from "./server";
import { publishNotification } from "./notificationRealtime";

export type NotificationRole = "PATIENT" | "DOCTOR" | "ADMIN";
export type NotificationType = "CONSULTATION" | "PRESCRIPTION" | "FOLLOW_UP" | "CARE_PLAN" | "DOCUMENT" | "SUPPORT" | "SYSTEM";
export type NotificationStatus = "UNREAD" | "READ";
export type Notification = { id:string; userId:string; role:NotificationRole; type:NotificationType; title:string; body:string; status:NotificationStatus; createdAt:string; readAt?:string };
export type NotificationPreferences = Record<NotificationType, boolean>;

const TYPES: NotificationType[] = ["CONSULTATION","PRESCRIPTION","FOLLOW_UP","CARE_PLAN","DOCUMENT","SUPPORT","SYSTEM"];
const defaults = ():NotificationPreferences => ({CONSULTATION:true,PRESCRIPTION:true,FOLLOW_UP:true,CARE_PLAN:true,DOCUMENT:true,SUPPORT:true,SYSTEM:true});
const dbType = (type: NotificationType) => type === "CONSULTATION" ? "APPOINTMENT" : type === "DOCUMENT" ? "DOCUMENT" : type === "SYSTEM" ? "SYSTEM" : type === "SUPPORT" ? "SECURITY" : "CLINICAL";
const apiType = (type: string, title: string): NotificationType => {
  if (type === "APPOINTMENT") return "CONSULTATION";
  if (type === "DOCUMENT") return "DOCUMENT";
  if (type === "SYSTEM") return "SYSTEM";
  if (type === "SECURITY") return "SUPPORT";
  if (title.toLowerCase().includes("prescription")) return "PRESCRIPTION";
  if (title.toLowerCase().includes("follow")) return "FOLLOW_UP";
  if (title.toLowerCase().includes("care plan")) return "CARE_PLAN";
  return "CONSULTATION";
};

export async function getNotificationPreferences(userId:string):Promise<NotificationPreferences>{
  const rows = await prisma.notificationPreference.findMany({where:{userId}});
  const result = defaults();
  for (const row of rows) if (TYPES.includes(row.type as NotificationType)) result[row.type as NotificationType] = row.enabled;
  return result;
}

export async function setNotificationPreference(userId:string,type:NotificationType,enabled:boolean){
  await prisma.notificationPreference.upsert({where:{userId_type:{userId,type}},update:{enabled},create:{userId,type,enabled}});
  return getNotificationPreferences(userId);
}

export async function createNotification(input:{userId:string;role:NotificationRole;type:NotificationType;title:string;body:string}){
  const preferences = await getNotificationPreferences(input.userId);
  if (!preferences[input.type]) return null;
  const item = await prisma.notification.create({data:{userId:input.userId,type:dbType(input.type) as never,title:input.title,body:input.body,status:"UNREAD"}});
  const notification = {id:item.id,userId:item.userId,role:input.role,type:input.type,title:item.title,body:item.body,status:item.status,createdAt:item.createdAt.toISOString(),readAt:item.readAt?.toISOString()};
  publishNotification(input.userId, notification);
  return notification;
}

export async function listNotifications(userId:string,limit=100){
  const rows = await prisma.notification.findMany({where:{userId},include:{user:true},orderBy:{createdAt:"desc"},take:Math.min(limit,100)});
  return rows.map(item=>({id:item.id,userId:item.userId,role:item.user.role as NotificationRole,type:apiType(item.type,item.title),title:item.title,body:item.body,status:item.status,createdAt:item.createdAt.toISOString(),readAt:item.readAt?.toISOString()}));
}

export async function unreadCount(userId:string){ return prisma.notification.count({where:{userId,status:"UNREAD"}}); }

export async function markNotificationRead(userId:string,id:string){
  const item = await prisma.notification.findFirst({where:{id,userId}});
  if(!item) return null;
  const updated = await prisma.notification.update({where:{id},include:{user:true},data:{status:"READ",readAt:new Date()}});
  return {id:updated.id,userId:updated.userId,role:updated.user.role as NotificationRole,type:apiType(updated.type,updated.title),title:updated.title,body:updated.body,status:updated.status,createdAt:updated.createdAt.toISOString(),readAt:updated.readAt?.toISOString()};
}

export async function markAllNotificationsRead(userId:string){
  const result = await prisma.notification.updateMany({where:{userId,status:"UNREAD"},data:{status:"READ",readAt:new Date()}});
  return result.count;
}

export async function seedNotificationPrototype(userId:string,role:NotificationRole){
  const count = await prisma.notification.count({where:{userId}});
  if(count) return;
  const samples:[NotificationType,string,string][] = [
    ["CONSULTATION","Consultation update","Your care team has an update for your consultation."],
    ["PRESCRIPTION","Prescription available","A prescription is ready to review in your medical records."],
    ["CARE_PLAN","Care plan updated","Your care team has added a new treatment task."],
    ["DOCUMENT","Medical document added","A new document is available in your secure records."],
    ["FOLLOW_UP","Follow-up reminder","Your care plan includes a recommended follow-up."],
  ];
  for(const [type,title,body] of samples) await createNotification({userId,role,type,title,body});
}
