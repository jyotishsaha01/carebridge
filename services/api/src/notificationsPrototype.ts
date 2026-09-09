export type NotificationRole = "PATIENT" | "DOCTOR" | "ADMIN";
export type NotificationType = "CONSULTATION" | "PRESCRIPTION" | "FOLLOW_UP" | "CARE_PLAN" | "DOCUMENT" | "SUPPORT" | "SYSTEM";
export type NotificationStatus = "UNREAD" | "READ";
export type Notification = { id:string; userId:string; role:NotificationRole; type:NotificationType; title:string; body:string; status:NotificationStatus; createdAt:string; readAt?:string };
export type NotificationPreferences = Record<NotificationType, boolean>;

const store = new Map<string, Notification>();
const preferences = new Map<string, NotificationPreferences>();

const defaults = ():NotificationPreferences => ({CONSULTATION:true,PRESCRIPTION:true,FOLLOW_UP:true,CARE_PLAN:true,DOCUMENT:true,SUPPORT:true,SYSTEM:true});

export function getNotificationPreferences(userId:string){ return preferences.get(userId) ?? defaults(); }
export function setNotificationPreference(userId:string,type:NotificationType,enabled:boolean){ const next={...getNotificationPreferences(userId),[type]:enabled}; preferences.set(userId,next); return next; }
export function createNotification(input:{userId:string;role:NotificationRole;type:NotificationType;title:string;body:string}){ if(!getNotificationPreferences(input.userId)[input.type]) return null; const item:Notification={id:crypto.randomUUID(),...input,status:"UNREAD",createdAt:new Date().toISOString()}; store.set(item.id,item); return item; }
export function listNotifications(userId:string,limit=100){ return [...store.values()].filter(n=>n.userId===userId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,Math.min(limit,100)); }
export function unreadCount(userId:string){ return listNotifications(userId,100).filter(n=>n.status==="UNREAD").length; }
export function markNotificationRead(userId:string,id:string){ const item=store.get(id); if(!item||item.userId!==userId)return null; item.status="READ";item.readAt=new Date().toISOString();store.set(id,item);return item; }
export function markAllNotificationsRead(userId:string){ const now=new Date().toISOString();let count=0;for(const item of store.values())if(item.userId===userId&&item.status==="UNREAD"){item.status="READ";item.readAt=now;store.set(item.id,item);count++;}return count; }

export function seedNotificationPrototype(userId:string,role:NotificationRole){ if(listNotifications(userId).length)return; const samples:[NotificationType,string,string][]=[["CONSULTATION","Consultation update","Your care team has an update for your consultation."],["PRESCRIPTION","Prescription available","A prescription is ready to review in your medical records."],["CARE_PLAN","Care plan updated","Your care team has added a new treatment task."],["DOCUMENT","Medical document added","A new document is available in your secure records."],["FOLLOW_UP","Follow-up reminder","Your care plan includes a recommended follow-up."]]; for(const [type,title,body] of samples)createNotification({userId,role,type,title,body}); }
