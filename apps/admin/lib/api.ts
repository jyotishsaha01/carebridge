export type AuthUser = { id: string; email: string; role: "PATIENT" | "DOCTOR" | "ADMIN" };
import { apiFetch } from "./request";
import { bindSession } from "./session-binding";
export async function signIn(email:string,password:string,signal?:AbortSignal) {
  const result=await apiFetch<{user:AuthUser}>("/v1/auth/login",{method:"POST",signal,headers:{"content-type":"application/json"},body:JSON.stringify({email,password,role:"ADMIN"})});
  if(result.user?.role!=="ADMIN") throw new Error("This account is not registered as an administrator. Choose Patient or Doctor sign-in instead.");
  bindSession(result.user.id,result.user.role);return result;
}
export function getCurrentUser(){return apiFetch<{user:AuthUser}>("/v1/auth/me");}
export function signOut(){return apiFetch<{ok:true}>("/v1/auth/logout",{method:"POST"});}

export type Overview = { patients: number; doctors: number; verifiedDoctors: number; appointments: number; openSessions: number; pendingCareRequests: number };
export type AnalyticsOverview = { patients: number; doctors: number; verifiedDoctors: number; appointments: number; consultations: number; completedConsultations: number; careRequests: number; unreadNotifications: number; recentAuditEvents: number; consultationCompletionRate: number };
export type AdminDoctor = { id: string; name: string; slug: string; location: string; status: string; isVerified: boolean; isActive: boolean; pendingCredentials: number; specialty: { name: string } };
export type AuditLog = { id: string; actorUserId: string | null; action: string; resourceType: string; resourceId: string | null; outcome: string; metadata: Record<string, unknown> | null; createdAt: string };
export type AdminCredential = { id: string; doctorId: string; type: string; licenseNumber: string; jurisdiction: string; documentName: string | null; status: "PENDING" | "APPROVED" | "REJECTED"; createdAt: string; reviewedAt: string | null };
export type AdminPatient = { id: string; firstName: string | null; lastName: string | null; country: string; createdAt: string; user: { email: string; isEmailVerified: boolean } };
export type AdminAppointment = { id: string; scheduledAt: string; status: string; durationMin: number; patient: { id: string; firstName: string | null; lastName: string | null; country: string }; doctor: { id: string; name: string; specialty: { name: string } }; consultation: { id: string; status: string; startedAt: string | null; endedAt: string | null } | null };
export type AdminSession = { id: string; createdAt: string; lastSeenAt: string; expiresAt: string; user: { email: string; role: "PATIENT" | "DOCTOR" | "ADMIN" } };
export type AdminCareRequestStatus = "REQUESTED" | "REVIEWING" | "APPROVED" | "SCHEDULED" | "COMPLETED" | "CANCELLED";
export type AdminCareRequest = { id: string; patientId: string; type: string; status: AdminCareRequestStatus; title: string; description: string | null; country: string | null; targetDate: string | null; createdAt: string; updatedAt: string; patient: { id: string; firstName: string | null; lastName: string | null; country: string } };
export type AdminSupportTicket = { id: string; category: string; message: string; status: string; createdAt: string; user: { email: string; role: string } };

export function getOverview() { return apiFetch<Overview>("/v1/admin/overview"); }
export function getDoctors() { return apiFetch<AdminDoctor[]>("/v1/admin/doctors?verified=all"); }
export function verifyDoctor(doctorId: string, verified: boolean) { return apiFetch<AdminDoctor>(`/v1/admin/doctors/${encodeURIComponent(doctorId)}/verification`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ verified }) }); }
export function getAuditLogs(limit = 40) { return apiFetch<AuditLog[]>(`/v1/admin/audit-logs?limit=${limit}`); }
export function getAnalyticsOverview() { return apiFetch<AnalyticsOverview>("/v1/admin/analytics/overview"); }
export function getCredentials(doctorId: string) { return apiFetch<AdminCredential[]>(`/v1/admin/doctors/${encodeURIComponent(doctorId)}/credentials`); }
export function reviewCredential(credentialId: string, status: AdminCredential["status"]) { return apiFetch<AdminCredential>(`/v1/admin/credentials/${encodeURIComponent(credentialId)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) }); }
export function getPatients() { return apiFetch<AdminPatient[]>("/v1/admin/patients?limit=100"); }
export function getAppointments() { return apiFetch<AdminAppointment[]>("/v1/admin/appointments?limit=100"); }
export function getActiveSessions() { return apiFetch<AdminSession[]>("/v1/admin/sessions?limit=100"); }
export function getCareRequests(status?: AdminCareRequestStatus) {
  const query = new URLSearchParams({ limit: "100" });
  if (status) query.set("status", status);
  return apiFetch<AdminCareRequest[]>(`/v1/admin/care-requests?${query.toString()}`);
}
export function updateCareRequestStatus(id: string, status: AdminCareRequestStatus, expected?: { expectedStatus: AdminCareRequestStatus; expectedUpdatedAt: string }) {
  return apiFetch<AdminCareRequest>(`/v1/admin/care-requests/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status, ...expected }) });
}
export function getSupportTickets(limit = 20) { return apiFetch<AdminSupportTicket[]>(`/v1/admin/support/tickets?limit=${limit}`); }
