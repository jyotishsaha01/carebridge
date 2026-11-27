"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, jsonRequest } from "../../lib/request";

const types = ["CONSULTATION", "PRESCRIPTION", "FOLLOW_UP", "CARE_PLAN", "DOCUMENT", "SUPPORT", "SYSTEM"] as const;
type PreferenceType = typeof types[number];
type Preferences = Record<PreferenceType, boolean>;
const labels: Record<PreferenceType, string> = { CONSULTATION: "Consultations", PRESCRIPTION: "Prescriptions", FOLLOW_UP: "Follow-up reminders", CARE_PLAN: "Care plans", DOCUMENT: "Documents", SUPPORT: "Support", SYSTEM: "System updates" };

export default function NotificationPreferences() {
  const [saved, setSaved] = useState<Preferences | null>(null);
  const [drafts, setDrafts] = useState<Partial<Preferences>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<PreferenceType | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const saving = useRef(false);
  const version = useRef(0);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (saving.current) return;
    const current = ++version.current;
    setLoading(true);
    try {
      const data = await apiFetch<Preferences>("/v1/notification-preferences", { signal });
      if (signal?.aborted || current !== version.current) return;
      if (!types.every((type) => typeof data[type] === "boolean")) throw new Error("Notification preferences could not be read. Try again.");
      setSaved(data); setError("");
    } catch (cause) { if (!signal?.aborted && current === version.current) setError(cause instanceof Error ? cause.message : "Unable to load notification preferences."); }
    finally { if (!signal?.aborted && current === version.current) setLoading(false); }
  }, []);
  useEffect(() => { const controller = new AbortController(); const timer = window.setTimeout(() => void load(controller.signal), 0); return () => { window.clearTimeout(timer); controller.abort(); }; }, [load]);

  async function save(type: PreferenceType) {
    if (saving.current || !saved || drafts[type] === undefined || drafts[type] === saved[type]) return;
    saving.current = true; version.current++; setBusy(type); setError(""); setNotice("");
    try {
      const data = await apiFetch<Preferences>(`/v1/notification-preferences/${type}`, jsonRequest("PATCH", { enabled: drafts[type] }));
      setSaved(data);
      setDrafts((current) => { const next = { ...current }; delete next[type]; return next; });
      setNotice(`${labels[type]} notifications ${data[type] ? "enabled" : "disabled"}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save notification preferences."); }
    finally { saving.current = false; setBusy(null); }
  }

  return <section aria-labelledby="notification-preferences-heading" style={{ marginTop: 28, padding: 22, background: "white", border: "1px solid #e1e9f1", borderRadius: 18 }}>
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12 }}><h2 id="notification-preferences-heading" style={{ margin: 0 }}>Notification preferences</h2><button disabled={loading || busy !== null} onClick={() => void load()}>Refresh preferences</button></div>
    <p>Choose which updates are created for your account, then save each change. Existing notifications remain in your inbox.</p>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {loading && <p role="status">Loading notification preferences…</p>}
    {saved && types.map((type) => <div key={type} style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "12px 0", borderTop: "1px solid #e1e9f1" }}>
      <label><input type="checkbox" disabled={loading || busy !== null} checked={drafts[type] ?? saved[type]} onChange={(event) => { setDrafts((current) => ({ ...current, [type]: event.target.checked })); setNotice(""); }} /> {labels[type]} notifications <small>Saved: {saved[type] ? "On" : "Off"}</small></label>
      <button disabled={loading || busy !== null || drafts[type] === undefined || drafts[type] === saved[type]} onClick={() => void save(type)} aria-label={`Save ${labels[type].toLowerCase()} notification preference`}>{busy === type ? "Saving…" : "Save preference"}</button>
    </div>)}
  </section>;
}
