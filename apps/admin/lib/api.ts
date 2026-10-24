export type AuthUser = { id: string; email: string; role: "PATIENT" | "DOCTOR" | "ADMIN" };
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { ...init, cache: "no-store", credentials: "include" });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? `Admin API request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}
export function signIn(email: string, password: string) {
  return apiFetch<{ user: AuthUser }>("/v1/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
}
export function getCurrentUser() { return apiFetch<{ user: AuthUser }>("/v1/auth/me"); }
export function signOut() { return apiFetch<{ ok: true }>("/v1/auth/logout", { method: "POST" }); }

export type Overview = { patients: number; doctors: number; verifiedDoctors: number; appointments: number; openSessions: number; pendingCareRequests: number };
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
export function getAuditLogs() { return apiFetch<AuditLog[]>("/v1/admin/audit-logs?limit=40"); }
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
export function updateCareRequestStatus(id: string, status: AdminCareRequestStatus) {
  return apiFetch<AdminCareRequest>(`/v1/admin/care-requests/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
}
export function getSupportTickets(limit = 20) { return apiFetch<AdminSupportTicket[]>(`/v1/admin/support/tickets?limit=${limit}`); }
