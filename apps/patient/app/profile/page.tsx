"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, getSessions, revokeSession } from "../../lib/api";

const notificationTypes = ["CONSULTATION", "PRESCRIPTION", "FOLLOW_UP", "CARE_PLAN", "DOCUMENT", "SUPPORT", "SYSTEM"];

type Profile = {
  firstName?: string | null;
  lastName?: string | null;
  country?: string | null;
  phone?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  user?: { email?: string | null };
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessions, setSessions] = useState<Awaited<ReturnType<typeof getSessions>>["sessions"]>([]);
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [country, setCountry] = useState("US");
  const [phone, setPhone] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [preferenceError, setPreferenceError] = useState("");
  const [busyPreference, setBusyPreference] = useState("");
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [preferenceNotice, setPreferenceNotice] = useState("");
  const [sessionsError, setSessionsError] = useState("");
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [revoking, setRevoking] = useState("");
  const [sessionNotice, setSessionNotice] = useState("");
  const lifetime = useRef<AbortController | null>(null);
  const savingRef = useRef(false);
  const preferencePending = useRef(false);
  const revokingRef = useRef(false);
  const sessionLoad = useRef<AbortController | null>(null);
  const preferenceLoad = useRef<AbortController | null>(null);

  const applyProfile = useCallback((data: Profile) => {
    setProfile(current => ({ ...current, ...data, user: data.user ?? current?.user }));
    setFirst(data.firstName ?? ""); setLast(data.lastName ?? ""); setCountry(data.country ?? "US"); setPhone(data.phone ?? "");
    setEmergencyName(data.emergencyContactName ?? ""); setEmergencyPhone(data.emergencyContactPhone ?? "");
  }, []);
  const loadSessions = useCallback(async (requestSignal?: AbortSignal) => {
    sessionLoad.current?.abort(); const controller = new AbortController(); sessionLoad.current = controller;
    const signal = AbortSignal.any([controller.signal, ...(requestSignal ? [requestSignal] : [])]);
    setSessionsLoading(true);
    try { const result = await apiFetch<Awaited<ReturnType<typeof getSessions>>>("/v1/auth/sessions", { signal }); if (!signal?.aborted) { setSessions(result.sessions); setSessionsError(""); } }
    catch (cause) { if (!signal?.aborted) setSessionsError(cause instanceof Error ? cause.message : "Unable to load active sessions."); }
    finally { if (!signal?.aborted) setSessionsLoading(false); }
  }, []);
  const loadPreferences = useCallback(async (requestSignal?: AbortSignal) => {
    preferenceLoad.current?.abort(); const controller = new AbortController(); preferenceLoad.current = controller;
    const signal = AbortSignal.any([controller.signal, ...(requestSignal ? [requestSignal] : [])]);
    setPreferencesReady(false);
    try {
      const result = await apiFetch<Record<string, boolean>>("/v1/prototype/notification-preferences", { signal });
      if (signal?.aborted) return;
      if (!result || Array.isArray(result) || notificationTypes.some(type => typeof result[type] !== "boolean")) throw new Error("Notification preferences could not be loaded. Retry before changing them.");
      setPrefs(result); setPreferencesReady(true); setPreferenceError("");
    } catch (cause) { if (!signal?.aborted) setPreferenceError(cause instanceof Error ? cause.message : "Notification preferences could not be loaded."); }
  }, []);

  const loadProfile = useCallback(async (signal?: AbortSignal) => {
    try { const data = await apiFetch<Profile>("/v1/patient/profile", { signal }); if (!signal?.aborted) { applyProfile(data); setError(""); } }
    catch (cause) { if (!signal?.aborted) setError(cause instanceof Error ? cause.message : "Unable to load your profile."); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [applyProfile]);
  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    const timer = window.setTimeout(() => { void loadProfile(controller.signal); void loadSessions(controller.signal); void loadPreferences(controller.signal); }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [loadProfile, loadSessions, loadPreferences]);

  async function save() {
    if (savingRef.current || !profile) return;
    setError("");
    setSaved(false);
    if (first.trim().length > 100 || last.trim().length > 100 || emergencyName.trim().length > 120) {
      setError("First and last names must be 100 characters or fewer; emergency contact names must be 120 characters or fewer.");
      return;
    }
    if (phone.length > 30 || emergencyPhone.length > 30) {
      setError("Phone numbers must be 30 characters or fewer.");
      return;
    }
    const phonePattern = /^[+0-9().\s-]*$/;
    if ((phone.trim() && !phonePattern.test(phone.trim())) || (emergencyPhone.trim() && !phonePattern.test(emergencyPhone.trim()))) {
      setError("Phone numbers can contain digits, spaces, +, parentheses, hyphens, and periods only.");
      return;
    }
    if (Boolean(emergencyName.trim()) !== Boolean(emergencyPhone.trim())) {
      setError("Enter both the emergency contact name and phone number, or leave both blank.");
      return;
    }
    if (emergencyPhone.trim() && emergencyPhone.replace(/\D/g, "").length < 7) {
      setError("Enter a valid emergency contact phone number with at least 7 digits.");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const savedProfile = await apiFetch<Profile>("/v1/patient/profile", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ firstName: first.trim() || null, lastName: last.trim() || null, country, phone: phone.trim() || null, emergencyContactName: emergencyName.trim() || null, emergencyContactPhone: emergencyPhone.trim() || null }),
      });
      applyProfile(savedProfile);
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save your profile.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function updatePreference(type: string, enabled: boolean) {
    if (!preferencesReady || preferencePending.current) return;
    preferencePending.current = true; setBusyPreference(type); setPreferenceError(""); setPreferenceNotice("");
    try {
      const savedPreferences = await apiFetch<Record<string, boolean>>(`/v1/prototype/notification-preferences/${encodeURIComponent(type)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled }) });
      setPrefs(savedPreferences); setPreferenceNotice(`${type.replaceAll("_", " ")} notifications ${savedPreferences[type] ? "enabled" : "disabled"}.`);
    } catch (cause) { setPreferenceError(cause instanceof Error ? cause.message : "Preference could not be saved. Your saved setting is retained."); }
    finally { preferencePending.current = false; setBusyPreference(""); }
  }

  async function revoke(id: string) {
    if (revokingRef.current) return;
    revokingRef.current = true; setRevoking(id); setSessionsError(""); setSessionNotice("");
    try { await revokeSession(id); setSessions(current => current.filter(item => item.id !== id)); setSessionNotice("Session revoked."); }
    catch (cause) { setSessionsError(cause instanceof Error ? cause.message : "Unable to revoke that session. Please retry."); }
    finally { revokingRef.current = false; setRevoking(""); }
  }

  if (loading) return <main style={{ minHeight: "100vh", padding: 44, fontFamily: "Inter,system-ui,sans-serif" }} role="status">Loading profile…</main>;

  return (
    <main style={{ minHeight: "100vh", background: "#f7fafc", padding: "44px 24px", fontFamily: "Inter,system-ui,sans-serif", color: "#172334" }}>
      <div style={{ maxWidth: 900, margin: "auto" }}>
        <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".12em", color: "#64748b" }}>CAREBRIDGE · PROFILE</p>
        <h1 style={{ fontSize: 40, margin: "8px 0" }}>Your profile & settings</h1>
        <p style={{ color: "#64748b", fontSize: 17 }}>Manage your personal information, active sessions, and in-app notification preferences.</p>
        {error && <div role="alert" style={{ marginTop: 18, padding: 13, borderRadius: 14, background: "#fff7ed", color: "#9a3412" }}>{error} {!profile && <button onClick={() => { setLoading(true); void loadProfile(lifetime.current?.signal); }}>Retry profile</button>}</div>}
        {saved && <div role="status" style={{ marginTop: 18, padding: 13, borderRadius: 14, background: "#ecfdf5", color: "#166534" }}>Changes saved.</div>}

        <section style={{ marginTop: 26, background: "white", border: "1px solid #e2e8f0", borderRadius: 24, padding: 26 }}>
          <h2>Personal information</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 16 }}>
            <label style={{ display: "grid", gap: 7, fontWeight: 700 }}>First name<input maxLength={100} disabled={!profile || saving} value={first} onChange={(event) => { setFirst(event.target.value); setSaved(false); }} autoComplete="given-name" style={{ padding: 13, border: "1px solid #cbd5e1", borderRadius: 12 }} /></label>
            <label style={{ display: "grid", gap: 7, fontWeight: 700 }}>Last name<input maxLength={100} disabled={!profile || saving} value={last} onChange={(event) => { setLast(event.target.value); setSaved(false); }} autoComplete="family-name" style={{ padding: 13, border: "1px solid #cbd5e1", borderRadius: 12 }} /></label>
            <label style={{ display: "grid", gap: 7, fontWeight: 700 }}>Email<input value={profile?.user?.email ?? ""} readOnly aria-readonly="true" style={{ padding: 13, border: "1px solid #cbd5e1", borderRadius: 12, background: "#f8fafc" }} /></label>
            <div style={{ display: "grid", gap: 7, fontWeight: 700 }}><label htmlFor="profile-country">Country</label><select id="profile-country" disabled={!profile || saving} value={country} onChange={(event) => { setCountry(event.target.value); setSaved(false); }} style={{ padding: 13, border: "1px solid #cbd5e1", borderRadius: 12 }}><option value="US">United States</option><option value="IN">India</option><option value="GB">United Kingdom</option><option value="CA">Canada</option></select></div>
            <label style={{ display: "grid", gap: 7, fontWeight: 700 }}>Phone<input disabled={!profile || saving} type="tel" maxLength={30} value={phone} onChange={(event) => { setPhone(event.target.value); setSaved(false); }} autoComplete="tel" placeholder="+1 555 0100" style={{ padding: 13, border: "1px solid #cbd5e1", borderRadius: 12 }} /></label>
            <label style={{ display: "grid", gap: 7, fontWeight: 700 }}>Emergency contact name<input disabled={!profile || saving} maxLength={120} value={emergencyName} onChange={(event) => { setEmergencyName(event.target.value); setSaved(false); }} style={{ padding: 13, border: "1px solid #cbd5e1", borderRadius: 12 }} /></label>
            <label style={{ display: "grid", gap: 7, fontWeight: 700 }}>Emergency contact phone<input disabled={!profile || saving} type="tel" maxLength={30} value={emergencyPhone} onChange={(event) => { setEmergencyPhone(event.target.value); setSaved(false); }} style={{ padding: 13, border: "1px solid #cbd5e1", borderRadius: 12 }} /></label>
          </div>
        </section>

        <section style={{ marginTop: 24, background: "white", border: "1px solid #e2e8f0", borderRadius: 24, padding: 26 }}>
          <h2>Security & sessions</h2>
          <p style={{ color: "#64748b" }}>Review active sessions and revoke sessions you no longer recognize.</p>
          <button disabled={sessionsLoading || Boolean(revoking)} onClick={() => void loadSessions(lifetime.current?.signal)}>{sessionsLoading ? "Refreshing sessions…" : "Refresh sessions"}</button>
          {sessionsError && <p role="alert" style={{ color: "#b42318" }}>{sessionsError}</p>}
          {sessionNotice && <p role="status" style={{ color: "#166534" }}>{sessionNotice}</p>}
          {!sessionsLoading && !sessionsError && sessions.length === 0 && <p style={{ color: "#64748b" }}>No session details available.</p>}
          {sessions.map((session) => (
            <div key={session.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: "14px 0", borderTop: "1px solid #eef2f7" }}>
              <div><b>{session.current ? "Current session" : "CareBridge session"}</b><div style={{ fontSize: 13, color: "#64748b" }}>Last active {new Date(session.lastSeenAt).toLocaleString()}</div></div>
              {!session.current && <button disabled={Boolean(revoking) || sessionsLoading} onClick={() => void revoke(session.id)} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #cbd5e1", background: "white" }}>{revoking === session.id ? "Revoking…" : "Revoke"}</button>}
            </div>
          ))}
        </section>

        <section style={{ marginTop: 24, background: "white", border: "1px solid #e2e8f0", borderRadius: 24, padding: 26 }}>
          <h2>Notification preferences</h2>
          <p style={{ color: "#64748b" }}>Choose which in-app care updates you want to receive.</p>
          {preferenceError && <p role="alert" style={{ color: "#b42318" }}>{preferenceError} <button disabled={Boolean(busyPreference)} onClick={() => void loadPreferences(lifetime.current?.signal)}>Retry preferences</button></p>}
          {preferenceNotice && <p role="status" style={{ color: "#166534" }}>{preferenceNotice}</p>}
          {busyPreference && <p role="status">Saving notification preference…</p>}
          {notificationTypes.map((type) => (
            <label key={type} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "12px 0", borderTop: "1px solid #eef2f7" }}>
              <span>{type.replaceAll("_", " ")}</span>
              <input type="checkbox" checked={prefs[type] === true} disabled={busyPreference !== "" || !profile || !preferencesReady} onChange={(event) => void updatePreference(type, event.target.checked)} />
            </label>
          ))}
        </section>
        <button onClick={() => void save()} disabled={saving || loading || !profile} style={{ marginTop: 20, padding: "13px 20px", border: 0, borderRadius: 13, background: "#1672b8", color: "white", fontWeight: 800, opacity: saving ? 0.7 : 1 }}>{saving ? "Saving…" : "Save changes"}</button>
      </div>
    </main>
  );
}
