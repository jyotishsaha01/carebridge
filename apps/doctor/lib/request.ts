import { assertSessionScope, captureSessionScope, invalidateSession, isSessionBoundPath, SessionChangedError, type SessionScope } from "./session-binding";
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
  const signals = [AbortSignal.timeout(20_000)];
  if (requestInit.signal) signals.push(requestInit.signal);
  if (bound) signals.push(sessionScope.signal);
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...requestInit, headers, cache: "no-store", credentials: "include", signal: AbortSignal.any(signals) });
  } catch (error) {
    if (bound && sessionScope.signal.aborted) throw new SessionChangedError();
    if (requestInit.signal?.aborted) throw error;
    throw new Error("Unable to reach CareBridge. Check your connection and try again.");
  }
  if (requestInit.signal?.aborted) throw requestInit.signal.reason;
  if (bound) assertSessionScope(sessionScope);
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    if (bound) assertSessionScope(sessionScope);
    const changed = body && typeof body === "object" && "code" in body && body.code === "ACCOUNT_CHANGED";
    if (changed || (response.status === 401 && path !== "/v1/auth/login" && path !== "/v1/auth/me")) {
      invalidateSession();
      if (typeof window !== "undefined") window.dispatchEvent(new Event("carebridge:session-expired"));
    }
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error
      : response.status === 401 ? "Your session has expired. Sign in again."
      : response.status === 403 ? "You do not have access to this action." : "Unable to complete this request. Please try again.";
    throw new ApiError(message, response.status);
  }
  const result = response.status === 204 ? undefined : await response.json();
  if (requestInit.signal?.aborted) throw requestInit.signal.reason;
  if (bound) assertSessionScope(sessionScope);
  return result as T;
}

export function jsonRequest(method: string, body: unknown): RequestInit {
  return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}
