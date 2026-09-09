export type Overview = { patients: number; doctors: number; verifiedDoctors: number; appointments: number; openSessions: number };
export type AdminDoctor = { id: string; name: string; slug: string; location: string; status: string; isVerified: boolean; isActive: boolean; specialty: { name: string } };
export type AuditLog = { id: string; actorUserId: string | null; action: string; resourceType: string; resourceId: string | null; outcome: string; metadata: Record<string, unknown> | null; createdAt: string };

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { ...init, cache: "no-store", credentials: "include" });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? `Admin API request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function getOverview() { return apiFetch<Overview>("/v1/admin/overview"); }
export function getDoctors() { return apiFetch<AdminDoctor[]>("/v1/admin/doctors?verified=all"); }
export function verifyDoctor(doctorId: string, verified: boolean) { return apiFetch<AdminDoctor>(`/v1/admin/doctors/${doctorId}/verification`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ verified }) }); }
export function getAuditLogs() { return apiFetch<AuditLog[]>("/v1/admin/audit-logs?limit=40"); }
