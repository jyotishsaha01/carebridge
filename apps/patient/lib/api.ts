import { assertSessionScope, bindSession, captureSessionScope, invalidateSession, isSessionBoundPath, SessionChangedError, type SessionScope } from "./session-binding";
export type ApiDoctor = {
  id: string;
  name: string;
  initials: string;
  specialty: string;
  location: string;
  rating: number;
  experience: number;
  price: number;
  usLow: number | null;
  usHigh: number | null;
  expertise: string[];
  bio: string;
  verified: boolean;
  listedAt?: string | null;
  isNew?: boolean;
};

export type ApiSlot = {
  id: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
};

export type AuthUser = {
  id: string;
  email: string;
  role: "PATIENT" | "DOCTOR" | "ADMIN";
  patientId?: string | null;
  doctorId?: string | null;
};

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

export type ApiRequestInit = RequestInit & { sessionScope?: SessionScope };
export async function apiFetch<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const { sessionScope = captureSessionScope(), ...requestInit } = init;
  const bound = isSessionBoundPath(path);
  if (bound) assertSessionScope(sessionScope);
  const headers = new Headers(requestInit.headers);
  if (bound && sessionScope.userId) headers.set("X-CareBridge-Expected-User", sessionScope.userId);
  else headers.delete("X-CareBridge-Expected-User");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  const abort = () => controller.abort(requestInit.signal?.reason);
  const expire = () => controller.abort(new SessionChangedError());
  requestInit.signal?.addEventListener("abort", abort, { once: true });
  if (bound) sessionScope.signal.addEventListener("abort", expire, { once: true });
  if (requestInit.signal?.aborted) abort();
  try {
    const response = await fetch(`${API_URL}${path}`, { ...requestInit, headers, signal: controller.signal, cache: "no-store", credentials: "include" });
    if (requestInit.signal?.aborted) throw requestInit.signal.reason;
    if (bound) assertSessionScope(sessionScope);
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      if (bound) assertSessionScope(sessionScope);
      const changed = body && typeof body === "object" && "code" in body && body.code === "ACCOUNT_CHANGED";
      if (changed) {
        invalidateSession();
        if (typeof window !== "undefined") window.dispatchEvent(new Event("carebridge:session-expired"));
      } else if (bound && response.status === 401 && typeof window !== "undefined") {
        // A feature failure is not proof that the API session ended. The guard
        // hides private content while /auth/me checks the current identity.
        window.dispatchEvent(new Event("carebridge:session-recheck"));
      }
      const message = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : response.status === 401 ? "This request could not be authorized. Please try again." : "CareBridge is temporarily unavailable. Please try again.";
      throw new ApiError(message, response.status);
    }
    const result = response.status === 204 ? undefined : await response.json();
    if (requestInit.signal?.aborted) throw requestInit.signal.reason;
    if (bound) assertSessionScope(sessionScope);
    return result as T;
  } catch (error) {
    if (bound && sessionScope.signal.aborted && !(error instanceof ApiError)) throw new SessionChangedError();
    if (controller.signal.aborted && !requestInit.signal?.aborted && !(error instanceof ApiError)) throw new Error("The request took too long. Check your connection and try again.");
    if (error instanceof TypeError) throw new Error("Unable to connect to CareBridge. Check your connection and try again.");
    throw error;
  } finally {
    clearTimeout(timeout);
    requestInit.signal?.removeEventListener("abort", abort);
    sessionScope.signal.removeEventListener("abort", expire);
  }
}

export function getSpecialties() { return apiFetch<Array<{ id: string; name: string }>>("/v1/specialties"); }
export function getDoctors(params: { specialty?: string; q?: string; limit?: number } = {}) {
  const search = new URLSearchParams();
  if (params.specialty && params.specialty !== "All specialties") search.set("specialty", params.specialty);
  if (params.q?.trim()) search.set("q", params.q.trim());
  const requested = params.limit;
  const limit = typeof requested === "number" && Number.isFinite(requested) ? Math.trunc(requested) : 50;
  search.set("limit", String(Math.min(50, Math.max(1, limit))));
  return apiFetch<ApiDoctor[]>(`/v1/doctors?${search.toString()}`);
}
export function getDoctor(slug: string) {
  return apiFetch<ApiDoctor & { costComparison: { patientCountry: string; comparableLowUsd: number; comparableHighUsd: number; sourceLabel: string; disclaimer: string } | null }>(`/v1/doctors/${encodeURIComponent(slug)}`);
}
export function getAvailability(slug: string, from: Date, to: Date) {
  const search = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
  return apiFetch<ApiSlot[]>(`/v1/doctors/${encodeURIComponent(slug)}/availability?${search.toString()}`);
}
export async function bookAppointment(doctorSlug: string, scheduledAt: string) {
  let scope = captureSessionScope();
  if (!scope.userId) { const { user } = await getCurrentUser(); scope = bindSession(user.id, user.role); }
  return apiFetch<{ id: string; scheduledAt: string; durationMin: number; status: string }>("/v1/appointments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ doctorSlug, scheduledAt }),
    sessionScope: scope,
  });
}
export async function signIn(email: string, password: string, role?: AuthUser["role"], signal?: AbortSignal) { const result = await apiFetch<{ user: AuthUser; emailVerified?: boolean }>("/v1/auth/login", { method: "POST", signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password, ...(role ? { role } : {}) }) }); bindSession(result.user.id, result.user.role); return result; }
export function signUp(email: string, password: string, options: { role?: "PATIENT" | "DOCTOR"; doctorProfile?: { name: string; specialtyId: string; location: string; experienceYears: number } } = {}, signal?: AbortSignal) { return apiFetch<{ user: AuthUser; emailVerificationRequired: boolean; devVerificationToken?: string }>("/v1/auth/signup", { method: "POST", signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password, ...options }) }); }
export function verifyEmail(token: string) { return apiFetch<{ ok: true }>("/v1/auth/verify-email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) }); }
export function resendVerification(email: string) { return apiFetch<{ accepted: true; message: string; devVerificationToken?: string }>("/v1/auth/resend-verification", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) }); }
export function requestPasswordReset(email: string) { return apiFetch<{ accepted: true; message: string; devResetToken?: string }>("/v1/auth/request-password-reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) }); }
export function resetPassword(token: string, password: string) { return apiFetch<{ ok: true }>("/v1/auth/reset-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, password }) }); }
export function getCurrentUser() { return apiFetch<{ user: AuthUser; emailVerified?: boolean }>("/v1/auth/me"); }
export function getSessions() { return apiFetch<{ sessions: Array<{ id: string; createdAt: string; lastSeenAt: string; expiresAt: string; current: boolean }> }>("/v1/auth/sessions"); }
export function revokeSession(sessionId: string) { return apiFetch<{ ok: true }>(`/v1/auth/sessions/${encodeURIComponent(sessionId)}/revoke`, { method: "POST" }); }
export async function signOut() { const result = await apiFetch<{ ok: true }>("/v1/auth/logout", { method: "POST" }); invalidateSession(); if (typeof window !== "undefined") window.dispatchEvent(new Event("carebridge:session-expired")); return result; }

export type PaymentSummary = {
  id: string;
  appointmentId: string;
  amountMinor: number;
  currency: string;
  status: "PENDING" | "REQUIRES_ACTION" | "SUCCEEDED" | "FAILED" | "CANCELLED" | "REFUNDED";
  provider: string;
  checkoutUrl?: string;
  scheduledAt?: string;
  doctorName?: string;
  doctorSlug?: string;
};

export function createPaymentIntent(appointmentId: string) {
  const idempotencyKey = `patient_${appointmentId}_${crypto.randomUUID()}`;
  return apiFetch<PaymentSummary>("/v1/payments/intents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ appointmentId, idempotencyKey }) });
}
export function getPayment(appointmentId: string) { return apiFetch<PaymentSummary | null>(`/v1/payments/${encodeURIComponent(appointmentId)}`); }
export function getPayments() { return apiFetch<PaymentSummary[]>("/v1/payments"); }
