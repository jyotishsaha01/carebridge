export type SessionScope = Readonly<{ userId: string | null; role: string | null; generation: number; signal: AbortSignal }>;
let controller = new AbortController();
let current: SessionScope = { userId: null, role: null, generation: 0, signal: controller.signal };

export class SessionChangedError extends Error {
  constructor() { super("This view changed while the request was in progress. Please try again."); this.name = "SessionChangedError"; }
}
function rotate(userId: string | null, role: string | null) {
  controller.abort(); controller = new AbortController();
  current = { userId, role, generation: current.generation + 1, signal: controller.signal };
  return current;
}
export function captureSessionScope() { return current; }
export function assertSessionScope(scope: SessionScope) {
  if (scope !== current || scope.signal.aborted) throw new SessionChangedError();
}
export function bindSession(userId: string, role: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(userId)) throw new SessionChangedError();
  return current.userId === userId && current.role === role ? current : rotate(userId, role);
}
export function invalidateSession() { if (current.userId !== null) rotate(null, null); }
/** A departed view must not finish an old request under a newly mounted view. */
export function releaseSessionScope(scope: SessionScope | null) {
  if (scope && scope === current) return rotate(scope.userId, scope.role);
  return current;
}
export function isSessionBoundPath(path: string) {
  return !/^\/v1\/(specialties(?:[/?]|$)|doctors(?:[/?]|$))/.test(path) && !new Set([
    "/v1/auth/me", "/v1/auth/login", "/v1/auth/signup", "/v1/auth/verify-email", "/v1/auth/resend-verification", "/v1/auth/request-password-reset", "/v1/auth/reset-password",
  ]).has(path);
}
