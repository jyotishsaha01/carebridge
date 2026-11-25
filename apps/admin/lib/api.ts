import { bindSession } from "./session-binding";
import { apiFetch } from "./request";
export type AuthUser = { id:string; email:string; role:"PATIENT"|"DOCTOR"|"ADMIN"; };
export async function signIn(email:string,password:string,signal?:AbortSignal){const result=await apiFetch<{user:AuthUser}>("/v1/auth/login",{method:"POST",signal,headers:{"content-type":"application/json"},body:JSON.stringify({email,password})});bindSession(result.user.id,result.user.role);return result;}
export function getCurrentUser(){return apiFetch<{user:AuthUser}>("/v1/auth/me");}
export function signOut(){return apiFetch<{ok:true}>("/v1/auth/logout",{method:"POST"});}

export type Overview = { patients: number; doctors: number; verifiedDoctors: number; appointments: number; openSessions: number };
export type AdminDoctor = { id: string; name: string; slug: string; location: string; status: string; isVerified: boolean; isActive: boolean; specialty: { name: string } };
export type AuditLog = { id: string; actorUserId: string | null; action: string; resourceType: string; resourceId: string | null; outcome: string; metadata: Record<string, unknown> | null; createdAt: string };

export function getOverview() { return apiFetch<Overview>("/v1/admin/overview"); }
export function getDoctors() { return apiFetch<AdminDoctor[]>("/v1/admin/doctors?verified=all"); }
export function verifyDoctor(doctorId: string, verified: boolean) { return apiFetch<AdminDoctor>(`/v1/admin/doctors/${doctorId}/verification`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ verified }) }); }
export function getAuditLogs() { return apiFetch<AuditLog[]>("/v1/admin/audit-logs?limit=40"); }

export type AdminCredential = { id:string; doctorId:string; type:string; licenseNumber:string; jurisdiction:string; documentName:string|null; status:string; createdAt:string; reviewedAt:string|null };
export type AdminPatient = { id:string; firstName:string|null; lastName:string|null; country:string; createdAt:string; user:{email:string;isEmailVerified:boolean;status:string} };
export type AdminAppointment = { id:string; scheduledAt:string; status:string; durationMin:number; patient:{id:string;firstName:string|null;lastName:string|null;country:string}; doctor:{id:string;name:string;specialty:{name:string}}; consultation:{id:string;status:string;startedAt:string|null;endedAt:string|null}|null };
export function getCredentials(doctorId:string){return apiFetch<AdminCredential[]>(`/v1/admin/doctors/${doctorId}/credentials`);}
export function reviewCredential(credentialId:string,status:"APPROVED"|"REJECTED"|"PENDING"){return apiFetch<AdminCredential>(`/v1/admin/credentials/${credentialId}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({status})});}
export function getPatients(){return apiFetch<AdminPatient[]>("/v1/admin/patients?limit=50");}
export function getAppointments(){return apiFetch<AdminAppointment[]>("/v1/admin/appointments?limit=50");}
