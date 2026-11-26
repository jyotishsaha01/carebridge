"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiFetch } from "./request";

import { bindSession, captureSessionScope, invalidateSession, releaseSessionScope, type SessionScope } from "./session-binding";

type Role = "PATIENT" | "DOCTOR" | "ADMIN";
/** Mask background/private views during revalidation without discarding the same user's drafts. */
export function usePrivateSession(role: Role, redirectOnInvalid: string | null = "/login") {
  const router = useRouter();
  const expectedId = useRef<string | null>(null);
  const active = useRef(false);
  const request = useRef<AbortController | null>(null);
  const scope = useRef<SessionScope | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const clearSession = useCallback(() => {
    invalidateSession();
    request.current?.abort(); request.current = null;
    expectedId.current = null;
    setAuthorized(false); setUserId(null); setChecking(false);
    setError("Please sign in again to access this workspace.");
    if (redirectOnInvalid) router.replace(redirectOnInvalid);
  }, [redirectOnInvalid, router]);

  const verify = useCallback(async (restart = false) => {
    if (request.current && !restart) return;
    if (request.current) { request.current.abort(); request.current = null; }
    // Abort outgoing private work before access becomes uncertain; the mounted draft remains intact.
    scope.current = releaseSessionScope(captureSessionScope());
    const controller = new AbortController(); request.current = controller;
    setChecking(true); setError("");
    let verified = false;
    try {
      const { user } = await apiFetch<{ user: { id: string; role: string } }>("/v1/auth/me", { signal: controller.signal });
      if (!active.current || controller.signal.aborted) return;
      if (!user?.id || user.role !== role || (expectedId.current && expectedId.current !== user.id)) {
        clearSession(); return;
      }
      scope.current = bindSession(user.id, user.role);
      expectedId.current = user.id; setUserId(user.id); setAuthorized(true); verified = true;
    } catch (cause) {
      if (!active.current || controller.signal.aborted) return;
      if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) clearSession();
      else setError("We could not verify your session. Your workspace is hidden until access can be confirmed.");
    } finally {
      if (request.current === controller) {
        request.current = null;
        if (active.current && !controller.signal.aborted) setChecking(!verified || document.visibilityState === "hidden");
      }
    }
  }, [clearSession, role]);

  useEffect(() => {
    active.current = true;
    const timer = window.setTimeout(() => void verify(), 0);
    const focus = () => { void verify(true); };
    const visibility = () => { if (document.visibilityState === "hidden") { request.current?.abort(); request.current = null; scope.current = releaseSessionScope(captureSessionScope()); setChecking(true); } else void verify(true); };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("carebridge:session-expired", clearSession);
    window.addEventListener("carebridge:session-recheck", focus);
    return () => {
      active.current = false; window.clearTimeout(timer); request.current?.abort(); request.current = null;
      releaseSessionScope(scope.current); scope.current = null;
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("carebridge:session-expired", clearSession);
      window.removeEventListener("carebridge:session-recheck", focus);
    };
  }, [clearSession, verify]);

  return { authorized, checking, userId, error, verify, clearSession };
}
