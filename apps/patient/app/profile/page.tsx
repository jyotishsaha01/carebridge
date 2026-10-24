"use client";

import { useEffect, useState } from "react";
import { getSessions, revokeSession } from "../../lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
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
  const [sessions, setSessions] = useState<any[]>([]);
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

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [sessionResult, profileResponse, preferencesResponse] = await Promise.all([
          getSessions().catch(() => ({ sessions: [] })),
          fetch(`${API_URL}/v1/patient/profile`, { credentials: "include", cache: "no-store" }),
          fetch(`${API_URL}/v1/prototype/notification-preferences`, { credentials: "include", cache: "no-store" }),
        ]);
        if (!profileResponse.ok) throw new Error(profileResponse.status === 401 || profileResponse.status === 403 ? "Sign in to load your profile." : "Unable to load your profile.");
        const data = (await profileResponse.json()) as Profile;
        if (!active) return;
        setProfile(data);
        setFirst(data.firstName ?? "");
        setLast(data.lastName ?? "");
        setCountry(data.country ?? "US");
        setPhone(data.phone ?? "");
        setEmergencyName(data.emergencyContactName ?? "");
        setEmergencyPhone(data.emergencyContactPhone ?? "");
        setSessions(sessionResult.sessions ?? []);
        if (preferencesResponse.ok) {
          const preferences = await preferencesResponse.json();
          if (active && Array.isArray(preferences)) {
            setPrefs(Object.fromEntries(preferences.map((item: { type: string; enabled: boolean }) => [item.type, item.enabled])));
          }
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load your profile.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  async function save() {
    setError("");
    setSaved(false);
    if (first.trim().length > 120 || last.trim().length > 120 || emergencyName.trim().length > 120) {
      setError("Names must be 120 characters or fewer.");
      return;
    }
    if (phone.length > 30 || emergencyPhone.length > 30) {
      setError("Phone numbers must be 30 characters or fewer.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/v1/patient/profile`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          firstName: first.trim() || null,
          lastName: last.trim() || null,
          country,
          phone: phone.trim() || null,
          emergencyContactName: emergencyName.trim() || null,
          emergencyContactPhone: emergencyPhone.trim() || null,
        }),
      });
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "Your session expired. Sign in and try again." : "Unable to save your profile. Check the fields and retry.");
      setProfile(await response.json());
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save your profile.");
    } finally {
      setSaving(false);
    }
  }

  async function updatePreference(type: string, enabled: boolean) {
    const previous = prefs[type] !== false;
    setBusyPreference(type);
    setPreferenceError("");
    setPrefs((current) => ({ ...current, [type]: enabled }));
    try {
      const response = await fetch(`${API_URL}/v1/prototype/notification-preferences/${encodeURIComponent(type)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!response.ok) throw new Error("Preference could not be saved. Please retry.");
    } catch (cause) {
      setPrefs((current) => ({ ...current, [type]: previous }));
      setPreferenceError(cause instanceof Error ? cause.message : "Preference could not be saved.");
    } finally {
      setBusyPreference("");
    }
  }

  if (loading) return <main style={{ minHeight: "100vh", padding: 44, fontFamily: "Inter,system-ui,sans-serif" }} role="status">Loading profile…</main>;

  return (
    <main style={{ minHeight: "100vh", background: "#f7fafc", padding: "44px 24px", fontFamily: "Inter,system-ui,sans-serif", color: "#172334" }}>
      <div style={{ maxWidth: 900, margin: "auto" }}>
        <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".12em", color: "#64748b" }}>CAREBRIDGE · PROFILE</p>
        <h1 style={{ fontSize: 40, margin: "8px 0" }}>Your profile & settings</h1>
        <p style={{ color: "#64748b", fontSize: 17 }}>Manage your personal information, active sessions, and in-app notification preferences.</p>
        {error && <div role="alert" style={{ marginTop: 18, padding: 13, borderRadius: 14, background: "#fff7ed", color: "#9a3412" }}>{error}</div>}
        {saved && <div role="status" style={{ marginTop: 18, padding: 13, borderRadius: 14, background: "#ecfdf5", color: "#166534" }}>Changes saved.</div>}

        <section style={{ marginTop: 26, background: "white", border: "1px solid #e2e8f0", borderRadius: 24, padding: 26 }}>
          <h2>Personal information</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 16 }}>
            <label style={{ display: "grid", gap: 7, fontWeight: 700 }}>First name<input maxLength={120} value={first} onChange={(event) => setFirst(event.target.value)} autoComplete="given-name" style={{ padding: 13, border: "1px solid #cbd5e1", borderRadius: 12 }} /></label>
            <label style={{ display: "grid", gap: 7, fontWeight: 700 }}>Last name<input maxLength={120} value={last} onChange={(event) => setLast(event.target.value)} autoComplete="family-name" style={{ padding: 13, border: "1px solid #cbd5e1", borderRadius: 12 }} /></label>
            <label style={{ display: "grid", gap: 7, fontWeight: 700 }}>Email<input value={profile?.user?.email ?? ""} readOnly aria-readonly="true" style={{ padding: 13, border: "1px solid #cbd5e1", borderRadius: 12, background: "#f8fafc" }} /></label>
            <label style={{ display: "grid", gap: 7, fontWeight: 700 }}>Country<select value={country} onChange={(event) => setCountry(event.target.value)} style={{ padding: 13, border: "1px solid #cbd5e1", borderRadius: 12 }}><option value="US">United States</option><option value="IN">India</option><option value="GB">United Kingdom</option><option value="CA">Canada</option></select></label>
            <label style={{ display: "grid", gap: 7, fontWeight: 700 }}>Phone<input type="tel" maxLength={30} value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" placeholder="+1 555 0100" style={{ padding: 13, border: "1px solid #cbd5e1", borderRadius: 12 }} /></label>
            <label style={{ display: "grid", gap: 7, fontWeight: 700 }}>Emergency contact name<input maxLength={120} value={emergencyName} onChange={(event) => setEmergencyName(event.target.value)} style={{ padding: 13, border: "1px solid #cbd5e1", borderRadius: 12 }} /></label>
            <label style={{ display: "grid", gap: 7, fontWeight: 700 }}>Emergency contact phone<input type="tel" maxLength={30} value={emergencyPhone} onChange={(event) => setEmergencyPhone(event.target.value)} style={{ padding: 13, border: "1px solid #cbd5e1", borderRadius: 12 }} /></label>
          </div>
        </section>

        <section style={{ marginTop: 24, background: "white", border: "1px solid #e2e8f0", borderRadius: 24, padding: 26 }}>
          <h2>Security & sessions</h2>
          <p style={{ color: "#64748b" }}>Review active sessions and revoke sessions you no longer recognize.</p>
          {sessions.length === 0 ? <p style={{ color: "#64748b" }}>No session details available.</p> : sessions.map((session) => (
            <div key={session.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: "14px 0", borderTop: "1px solid #eef2f7" }}>
              <div><b>{session.current ? "Current session" : "CareBridge session"}</b><div style={{ fontSize: 13, color: "#64748b" }}>Last active {new Date(session.lastSeenAt).toLocaleString()}</div></div>
              {!session.current && <button onClick={async () => { try { await revokeSession(session.id); setSessions((current) => current.filter((item) => item.id !== session.id)); } catch { setError("Unable to revoke that session. Please retry."); } }} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #cbd5e1", background: "white" }}>Revoke</button>}
            </div>
          ))}
        </section>

        <section style={{ marginTop: 24, background: "white", border: "1px solid #e2e8f0", borderRadius: 24, padding: 26 }}>
          <h2>Notification preferences</h2>
          <p style={{ color: "#64748b" }}>Choose which in-app care updates you want to receive.</p>
          {preferenceError && <p role="alert" style={{ color: "#b42318" }}>{preferenceError}</p>}
          {notificationTypes.map((type) => (
            <label key={type} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "12px 0", borderTop: "1px solid #eef2f7" }}>
              <span>{type.replaceAll("_", " ")}</span>
              <input type="checkbox" checked={prefs[type] !== false} disabled={busyPreference === type} onChange={(event) => void updatePreference(type, event.target.checked)} />
            </label>
          ))}
        </section>
        <button onClick={() => void save()} disabled={saving} style={{ marginTop: 20, padding: "13px 20px", border: 0, borderRadius: 13, background: "#1672b8", color: "white", fontWeight: 800, opacity: saving ? 0.7 : 1 }}>{saving ? "Saving…" : "Save changes"}</button>
      </div>
    </main>
  );
}
