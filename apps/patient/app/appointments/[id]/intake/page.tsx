"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { apiFetch } from "../../../../lib/api";
const fields = [
  ["reasonForVisit", "Reason for visit", "Briefly describe why you are seeking this consultation."],
  ["symptoms", "Current symptoms", "Describe your symptoms, timing and anything that makes them better or worse."],
  ["allergies", "Allergies", "List medication, food or other allergies, or write none."],
  ["medications", "Current medications", "Include prescription medicines, over-the-counter medicines and supplements."],
  ["medicalHistory", "Relevant medical history", "Conditions, diagnoses or important previous medical history."],
  ["surgeries", "Previous surgeries", "List relevant surgeries and approximate dates, or write none."],
  ["familyHistory", "Family history", "Relevant family medical history."],
] as const;

type Intake = {
  reasonForVisit?: string | null;
  symptoms?: string | null;
  allergies?: string | null;
  medications?: string | null;
  medicalHistory?: string | null;
  surgeries?: string | null;
  familyHistory?: string | null;
  consentToConsult?: boolean;
  status?: string;
};

export default function IntakePage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Intake>({});
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"success" | "error">("success");
  const [reload, setReload] = useState(0);
  const [dirty, setDirty] = useState(false);
  const pending = useRef(false);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function load() {
      try {
        const intake = await apiFetch<Intake>(`/v1/appointments/${encodeURIComponent(id)}/intake`, { signal: controller.signal });
        if (!active) return;
        setData(intake);
        setConsent(Boolean(intake.consentToConsult));
      } catch (cause) {
        if (active) setLoadError(cause instanceof Error ? cause.message : "The questionnaire could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    }
    if (id) void load();
    return () => { active = false; controller.abort(); };
  }, [id, reload]);

  async function save() {
    if (pending.current || loadError) return;
    pending.current = true;
    setSaving(true);
    setMessage("");
    setMessageKind("success");
    try {
      const saved = await apiFetch<Intake>(`/v1/appointments/${encodeURIComponent(id)}/intake`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reasonForVisit: data.reasonForVisit ?? "", symptoms: data.symptoms ?? "",
          allergies: data.allergies ?? "", medications: data.medications ?? "",
          medicalHistory: data.medicalHistory ?? "", surgeries: data.surgeries ?? "",
          familyHistory: data.familyHistory ?? "", consentToConsult: consent,
        }),
      });
      setData(saved);
      setConsent(Boolean(saved.consentToConsult));
      setDirty(false);
      setMessage(saved.consentToConsult && saved.status === "COMPLETED" ? "Questionnaire submitted successfully." : "Draft saved successfully. You can return to finish it later.");
      setMessageKind("success");
    } catch (cause) {
      const timedOut = cause instanceof DOMException && cause.name === "AbortError";
      setMessage(timedOut
        ? "Saving took too long. Your answers are still on this page. Check your connection, then try again."
        : cause instanceof Error ? cause.message : "The questionnaire could not be saved. Your answers remain on this page.");
      setMessageKind("error");
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  if (loading) return <main style={{ padding: 48, fontFamily: "system-ui" }} role="status">Loading questionnaire…</main>;

  return (
    <main style={{ maxWidth: 900, margin: "auto", padding: "24px 24px 48px", fontFamily: "Inter,system-ui,sans-serif", color: "#172334" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "8px 0 22px", marginBottom: 22, borderBottom: "1px solid #dce7e3" }}>
        <Link href="/dashboard" aria-label="CareBridge patient dashboard" style={{ display: "inline-flex", alignItems: "center", gap: 12, textDecoration: "none", color: "#19312c", fontSize: 24, fontWeight: 800 }}>
          <span aria-hidden="true" style={{ display: "grid", placeItems: "center", width: 42, height: 42, borderRadius: 12, background: "#e8f5ef" }}>C</span>
          CareBridge
        </Link>
        <Link href="/dashboard" style={{ color: "#1672b8", fontWeight: 700 }}>Dashboard</Link>
      </header>
      <Link href={`/appointments/${encodeURIComponent(id)}`} style={{ color: "#1672b8" }}>← Appointment</Link>
      <p style={{ marginTop: 28, fontSize: 12, fontWeight: 800, letterSpacing: ".12em", color: "#64748b" }}>CAREBRIDGE · MEDICAL INTAKE</p>
      <h1>Prepare for your consultation.</h1>
      <p style={{ color: "#64748b", fontSize: 17, lineHeight: 1.6 }}>This is the standard medical intake for this appointment. Your draft stays private until you submit consent. Submitted answers are shared with the authorized care team for this appointment. Only provide information relevant to your care.</p>
      {loadError && <div role="alert" style={{ margin: "18px 0", padding: 14, borderRadius: 14, background: "#fff1f0", color: "#9f3029" }}>{loadError} <button onClick={() => { setLoadError(""); setLoading(true); setReload(current => current + 1); }}>Retry questionnaire</button></div>}
      {message && <div role={messageKind === "error" ? "alert" : "status"} style={{ margin: "18px 0", padding: 14, borderRadius: 14, background: messageKind === "error" ? "#fff1f0" : "#ecfdf5", color: messageKind === "error" ? "#9f3029" : "#166534" }}>{message}</div>}
      {dirty && <p style={{ color: "#9a5b11" }}>Unsaved questionnaire changes</p>}
      <section style={{ marginTop: 24, padding: 26, border: "1px solid #e2e8f0", borderRadius: 24 }}>
        {fields.map(([key, label, help]) => (
          <div key={key} style={{ display: "grid", gap: 7, fontWeight: 700, marginBottom: 18 }}>
            <label htmlFor={`intake-${key}`}>{label}</label>
            <span id={`intake-${key}-help`} style={{ fontSize: 13, fontWeight: 400, color: "#64748b" }}>{help}</span>
            <textarea id={`intake-${key}`} aria-describedby={`intake-${key}-help`}
              rows={key === "reasonForVisit" ? 3 : 4}
              maxLength={key === "reasonForVisit" ? 2000 : key === "symptoms" || key === "medicalHistory" ? 5000 : 3000}
              value={data[key] ?? ""}
              disabled={Boolean(loadError) || saving}
              onChange={(event) => { setData((current) => ({ ...current, [key]: event.target.value })); setDirty(true); setMessage(""); }}
              style={{ padding: 13, border: "1px solid #cbd5e1", borderRadius: 12, resize: "vertical" }}
            />
          </div>
        ))}
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: 16, borderRadius: 14, background: "#f8fafc" }}>
          <input type="checkbox" checked={consent} disabled={Boolean(loadError) || saving} onChange={(event) => { setConsent(event.target.checked); setDirty(true); setMessage(""); }} />
          <span><b>I consent to this consultation</b><small style={{ display: "block", color: "#64748b", marginTop: 4 }}>I confirm that the information provided is intended to help the CareBridge specialist prepare for my consultation.</small></span>
        </label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 20 }}>
          <button onClick={() => void save()} disabled={saving || Boolean(loadError)} style={{ padding: "12px 17px", border: 0, borderRadius: 12, background: "#1672b8", color: "white", fontWeight: 800, opacity: saving || loadError ? 0.65 : 1 }}>{saving ? "Saving…" : consent ? "Submit questionnaire" : "Save draft"}</button>
          <Link href="/documents" style={{ padding: "12px 17px", border: "1px solid #cbd5e1", borderRadius: 12 }}>Upload records</Link>
        </div>
      </section>
    </main>
  );
}
