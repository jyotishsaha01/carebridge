"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type Appointment = {
  id: string;
  scheduledAt: string;
  durationMin: number;
  status: string;
  doctor: { name: string; slug: string; specialty: { name: string } };
  medicalIntake?: { status?: string; consentToConsult?: boolean } | null;
  consultation?: any;
};

export default function AppointmentPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Appointment | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch(`${API}/v1/patient/appointments/${encodeURIComponent(id)}`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok) throw new Error(response.status === 401 || response.status === 403
          ? "Sign in to view this appointment."
          : "This appointment could not be loaded. Check the appointment link and try again.");
        const appointment = (await response.json()) as Appointment;
        if (active) setData(appointment);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "This appointment could not be loaded.");
      }
    }
    if (id) void load();
    return () => { active = false; };
  }, [id]);

  if (error) return <main style={{ maxWidth: 850, margin: "auto", padding: 48, fontFamily: "system-ui" }}><p role="alert">{error}</p><Link href="/dashboard">← Dashboard</Link></main>;
  if (!data) return <main style={{ maxWidth: 850, margin: "auto", padding: 48, fontFamily: "system-ui" }} role="status">Loading appointment…</main>;

  const consultation = data.consultation;
  const intakeComplete = data.medicalIntake?.status === "COMPLETED" || data.medicalIntake?.consentToConsult === true;

  return (
    <main style={{ maxWidth: 950, margin: "auto", padding: "48px 24px", fontFamily: "Inter,system-ui,sans-serif", color: "#172334" }}>
      <Link href="/dashboard" style={{ color: "#1672b8" }}>← Dashboard</Link>
      <div style={{ marginTop: 24 }}>
        <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".12em", color: "#64748b" }}>CAREBRIDGE · APPOINTMENT</p>
        <h1>{data.doctor.name}</h1>
        <p style={{ fontSize: 18, color: "#64748b", lineHeight: 1.6 }}>{data.doctor.specialty.name} · {new Date(data.scheduledAt).toLocaleString()} · {data.durationMin} minutes</p>
        <span style={{ display: "inline-block", padding: "7px 11px", borderRadius: 999, background: "#eef6ff", color: "#185ea8", fontWeight: 800 }}>{data.status}</span>
      </div>

      <section style={{ marginTop: 28, padding: 24, border: "1px solid #e2e8f0", borderRadius: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 280px", minWidth: 0 }}>
            <h2 style={{ marginTop: 0 }}>Before your consultation</h2>
            <p style={{ color: "#64748b", lineHeight: 1.65, overflowWrap: "anywhere" }}>Complete the medical intake for this appointment and make relevant records available to your care team. Your answers are saved separately for this appointment.</p>
            <span style={{ display: "inline-block", padding: "7px 10px", borderRadius: 999, background: intakeComplete ? "#ecfdf5" : "#fff7ed", color: intakeComplete ? "#166534" : "#9a5b11", fontSize: 12, fontWeight: 800 }}>
              {intakeComplete ? "QUESTIONNAIRE COMPLETE" : "QUESTIONNAIRE NOT COMPLETE"}
            </span>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", maxWidth: "100%" }}>
            <Link href={`/appointments/${encodeURIComponent(data.id)}/intake`} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "12px 16px", borderRadius: 12, background: "#1672b8", color: "white", fontWeight: 800, whiteSpace: "normal", overflowWrap: "anywhere" }}>
              {intakeComplete ? "Review questionnaire →" : "Complete questionnaire →"}
            </Link>
            <Link href={`/checkout/${encodeURIComponent(data.id)}`} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "12px 16px", borderRadius: 12, border: "1px solid #cbd5e1" }}>View payment</Link>
            <Link href="/documents" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "12px 16px", borderRadius: 12, border: "1px solid #cbd5e1" }}>Manage documents</Link>
          </div>
        </div>
      </section>

      {consultation && (
        <section style={{ marginTop: 22, padding: 24, border: "1px solid #e2e8f0", borderRadius: 22 }}>
          <p style={{ fontSize: 12, fontWeight: 800, color: "#64748b" }}>CONSULTATION SUMMARY</p>
          <h2>{consultation.status}</h2>
          <p style={{ whiteSpace: "pre-wrap" }}>{consultation.summary || "Your clinician has not added a consultation summary yet."}</p>
          {consultation.prescription && <><h3>Prescription</h3>{consultation.prescription.items.map((item: any) => <div key={item.id} style={{ padding: "10px 0", borderTop: "1px solid #eef2f7" }}><b>{item.medication}</b><div>{item.dose} · {item.frequency} · {item.duration}</div><small>{item.instructions}</small></div>)}</>}
          {consultation.followUps?.length > 0 && <><h3>Follow-up</h3>{consultation.followUps.map((followUp: any) => <div key={followUp.id} style={{ padding: "10px 0", borderTop: "1px solid #eef2f7" }}>{followUp.instructions || "Follow-up recommended"}{followUp.dueAt && <small> · {new Date(followUp.dueAt).toLocaleDateString()}</small>}</div>)}</>}
        </section>
      )}
    </main>
  );
}
