import { z } from "zod";

export const notification = z.object({
  id: z.string().min(1),
  recipientUserId: z.string().min(1),
  type: z.enum(["APPOINTMENT_REMINDER", "CONSULTATION_READY", "DOCUMENT_READY", "PRESCRIPTION_READY", "FOLLOW_UP_DUE", "SYSTEM"]),
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(2000),
  readAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type Notification = z.infer<typeof notification>;

export function notificationKey(type: Notification["type"], referenceId: string) {
  return `${type}:${referenceId}`;
}
