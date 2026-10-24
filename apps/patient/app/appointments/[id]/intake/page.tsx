"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
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

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setLoadError("");
      try {
        const response = await fetch(`${API}/v1/appointments/${encodeURIComponent(id)}/intake`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) throw new Error("Your patient session is missing or expired. Sign in again, then reopen this questionnaire.");
          if (response.status === 404) throw new Error("This appointment was not found for your patient account.");
          throw new Error("The questionnaire could not be loaded. Please retry.");
        }
        const intake = (await response.json()) as Intake;
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
    return () => { active = false; };
  }, [id]);

  async function save() {
    if (saving || loadError) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`${API}/v1/appointments/${encodeURIComponent(id)}/intake`, {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reasonForVisit: data.reasonForVisit ?? "",
          symptoms: data.symptoms ?? "",
          allergies: data.allergies ?? "",
          medications: data.medications ?? "",
          medicalHistory: data.medicalHistory ?? "",
          surgeries: data.surgeries ?? "",
          familyHistory: data.familyHistory ?? "",
          consentToConsult: consent,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        if (response.status === 401 || response.status === 403) throw new Error("Your patient session has expired. Sign in and try again.");
        throw new Error(payload?.error ?? "The questionnaire was not saved. Please check your connection and retry.");
      }
      const saved = (await response.json()) as Intake;
      setData(saved);
      setConsent(Boolean(saved.consentToConsult));
      setMessage(consent ? "Questionnaire submitted successfully." : "Draft saved successfully. You can return to finish it later.");
      setMessageKind("success");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "The questionnaire could not be saved.");
      setMessageKind("error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main style={{ padding: 48, fontFamily: "system-ui" }} role="status">Loading questionnaire…</main>;

  return (
    <main style={{ maxWidth: 900, margin: "auto", padding: "48px 24px", fontFamily: "Inter,system-ui,sans-serif", color: "#172334" }}>
      <Link href={`/appointments/${encodeURIComponent(id)}`} style={{ color: "#1672b8" }}>← Appointment</Link>
      <p style={{ marginTop: 28, fontSize: 12, fontWeight: 800, letterSpacing: ".12em", color: "#64748b" }}>CAREBRIDGE · MEDICAL INTAKE</p>
      <h1>Prepare for your consultation.</h1>
      <p style={{ color: "#64748b", fontSize: 17, lineHeight: 1.6 }}>This is the standard medical intake for this appointment. Your answers are saved against this appointment and are available to the authorized care team. Only provide information relevant to your care.</p>
      {loadError && <div role="alert" style={{ margin: "18px 0", padding: 14, borderRadius: 14, background: "#fff1f0", color: "#9f3029" }}>{loadError}</div>}
      {message && <div role={messageKind === "error" ? "alert" : "status"} style={{ margin: "18px 0", padding: 14, borderRadius: 14, background: messageKind === "error" ? "#fff1f0" : "#ecfdf5", color: messageKind === "error" ? "#9f3029" : "#166534" }}>{message}</div>}
      <section style={{ marginTop: 24, padding: 26, border: "1px solid #e2e8f0", borderRadius: 24 }}>
        {fields.map(([key, label, help]) => (
          <label key={key} style={{ display: "grid", gap: 7, fontWeight: 700, marginBottom: 18 }}>
            {label}
            <span style={{ fontSize: 13, fontWeight: 400, color: "#64748b" }}>{help}</span>
            <textarea
              rows={key === "reasonForVisit" ? 3 : 4}
              maxLength={key === "reasonForVisit" ? 2000 : key === "symptoms" || key === "medicalHistory" ? 5000 : 3000}
              value={data[key] ?? ""}
              disabled={Boolean(loadError) || saving}
              onChange={(event) => setData((current) => ({ ...current, [key]: event.target.value }))}
              style={{ padding: 13, border: "1px solid #cbd5e1", borderRadius: 12, resize: "vertical" }}
            />
          </label>
        ))}
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: 16, borderRadius: 14, background: "#f8fafc" }}>
          <input type="checkbox" checked={consent} disabled={Boolean(loadError) || saving} onChange={(event) => setConsent(event.target.checked)} />
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
