"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type AvailabilitySlot = { id: string; startsAt: string; endsAt: string; timezone?: string };

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
  const [availableSlots, setAvailableSlots] = useState<AvailabilitySlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [cancelReason, setCancelReason] = useState("");

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

  useEffect(() => {
    let active = true;
    const cancellable = Boolean(
      data &&
      data.status === "BOOKED" &&
      new Date(data.scheduledAt) > new Date() &&
      (!data.consultation || !["IN_PROGRESS", "COMPLETED", "CANCELLED"].includes(data.consultation.status)),
    );
    if (!data || !cancellable) {
      setAvailableSlots([]);
      setSelectedSlot("");
      setSlotsLoading(false);
      return () => { active = false; };
    }

    setSlotsLoading(true);
    setActionError("");
    const from = new Date().toISOString();
    const to = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
    const url = API + "/v1/doctors/" + encodeURIComponent(data.doctor.slug) +
      "/availability?from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to);
    fetch(url, { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "Unable to load available times.");
        return payload as AvailabilitySlot[];
      })
      .then((slots) => {
        if (!active) return;
        const usable = slots.filter((slot) =>
          slot.startsAt !== data.scheduledAt &&
          new Date(slot.startsAt) > new Date() &&
          new Date(slot.endsAt).getTime() - new Date(slot.startsAt).getTime() >= data.durationMin * 60_000,
        );
        setAvailableSlots(usable);
        setSelectedSlot((current) => usable.some((slot) => slot.startsAt === current) ? current : (usable[0]?.startsAt ?? ""));
      })
      .catch((cause) => {
        if (active) setActionError(cause instanceof Error ? cause.message : "Unable to load available times.");
      })
      .finally(() => { if (active) setSlotsLoading(false); });
    return () => { active = false; };
  }, [data?.id, data?.status, data?.scheduledAt, data?.doctor.slug, data?.consultation?.status]);

  async function cancelAppointment() {
    if (!data || actionPending) return;
    setActionPending(true);
    setActionError("");
    setActionMessage("");
    try {
      const response = await fetch(API + "/v1/patient/appointments/" + encodeURIComponent(data.id) + "/cancel", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: cancelReason.trim() || undefined }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "Unable to cancel this appointment.");
      setData((current) => current ? {
        ...current,
        status: "CANCELLED",
        consultation: current.consultation?.status === "SCHEDULED"
          ? { ...current.consultation, status: "CANCELLED" }
          : current.consultation,
      } : current);
      setCancelReason("");
      setActionMessage("Appointment cancelled. Its available time has been released.");
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Unable to cancel this appointment.");
    } finally {
      setActionPending(false);
    }
  }

  async function rescheduleAppointment() {
    if (!data || actionPending) return;
    if (!selectedSlot) {
      setActionError("Choose an available time before rescheduling.");
      return;
    }
    setActionPending(true);
    setActionError("");
    setActionMessage("");
    try {
      const response = await fetch(API + "/v1/patient/appointments/" + encodeURIComponent(data.id) + "/reschedule", {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scheduledAt: selectedSlot }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "Unable to reschedule this appointment.");
      setData((current) => current ? {
        ...current,
        scheduledAt: payload.scheduledAt,
        status: payload.status,
      } : current);
      setActionMessage("Appointment rescheduled successfully.");
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Unable to reschedule this appointment.");
    } finally {
      setActionPending(false);
    }
  }

  if (error) return <main style={{ maxWidth: 850, margin: "auto", padding: 48, fontFamily: "system-ui" }}><p role="alert">{error}</p><Link href="/dashboard">← Dashboard</Link></main>;
  if (!data) return <main style={{ maxWidth: 850, margin: "auto", padding: 48, fontFamily: "system-ui" }} role="status">Loading appointment…</main>;

  const consultation = data.consultation;
  const intakeComplete = data.medicalIntake?.status === "COMPLETED" || data.medicalIntake?.consentToConsult === true;
  const canManageAppointment = data.status === "BOOKED" && new Date(data.scheduledAt) > new Date() && (!consultation || !["IN_PROGRESS", "COMPLETED", "CANCELLED"].includes(consultation.status));

  return (
    <main style={{ maxWidth: 950, margin: "auto", padding: "48px 24px", fontFamily: "Inter,system-ui,sans-serif", color: "#172334" }}>
      <Link href="/dashboard" style={{ color: "#1672b8" }}>← Dashboard</Link>
      <div style={{ marginTop: 24 }}>
        <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".12em", color: "#64748b" }}>CAREBRIDGE · APPOINTMENT</p>
        <h1>{data.doctor.name}</h1>
        <p style={{ fontSize: 18, color: "#64748b", lineHeight: 1.6 }}>{data.doctor.specialty.name} · {new Date(data.scheduledAt).toLocaleString()} · {data.durationMin} minutes</p>
        <span style={{ display: "inline-block", padding: "7px 11px", borderRadius: 999, background: "#eef6ff", color: "#185ea8", fontWeight: 800 }}>{data.status}</span>
      </div>

      {(actionError || actionMessage) && <div role={actionError ? "alert" : "status"} style={{ marginTop: 20, padding: 14, borderRadius: 12, background: actionError ? "#fff1f2" : "#ecfdf5", color: actionError ? "#9f1239" : "#166534" }}>{actionError || actionMessage}</div>}

      {canManageAppointment && (
        <section style={{ marginTop: 22, padding: 24, border: "1px solid #e2e8f0", borderRadius: 22 }}>
          <h2 style={{ marginTop: 0 }}>Manage your appointment</h2>
          <p style={{ color: "#64748b", lineHeight: 1.6 }}>You can cancel or choose another available time before the consultation starts.</p>
          <div style={{ display: "grid", gap: 12, maxWidth: 560 }}>
            <label style={{ display: "grid", gap: 8, fontWeight: 700 }}>
              Choose another time
              <select value={selectedSlot} disabled={actionPending || slotsLoading || availableSlots.length === 0} onChange={(event) => setSelectedSlot(event.target.value)} style={{ minHeight: 44, border: "1px solid #cbd5e1", borderRadius: 10, padding: "9px 12px", background: "white" }}>
                <option value="">{slotsLoading ? "Loading available times…" : availableSlots.length ? "Select an available time" : "No available times found"}</option>
                {availableSlots.map((slot) => <option key={slot.id} value={slot.startsAt}>{new Date(slot.startsAt).toLocaleString()} ({slot.timezone ?? "UTC"})</option>)}
              </select>
            </label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" disabled={actionPending || slotsLoading || !selectedSlot} onClick={rescheduleAppointment} style={{ padding: "12px 16px", borderRadius: 12, border: 0, background: "#1672b8", color: "white", fontWeight: 800, cursor: actionPending || slotsLoading || !selectedSlot ? "not-allowed" : "pointer", opacity: actionPending || slotsLoading || !selectedSlot ? 0.6 : 1 }}>
                {actionPending ? "Updating…" : "Reschedule appointment"}
              </button>
            </div>
            <label style={{ display: "grid", gap: 8, fontWeight: 700 }}>
              Cancellation reason (optional)
              <textarea maxLength={1000} rows={2} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} disabled={actionPending} placeholder="Tell the care team why you are cancelling" style={{ border: "1px solid #cbd5e1", borderRadius: 10, padding: 12, resize: "vertical" }} />
            </label>
            <button type="button" disabled={actionPending} onClick={cancelAppointment} style={{ alignSelf: "flex-start", padding: "12px 16px", borderRadius: 12, border: "1px solid #fecaca", background: "white", color: "#b91c1c", fontWeight: 800, cursor: actionPending ? "not-allowed" : "pointer", opacity: actionPending ? 0.6 : 1 }}>
              {actionPending ? "Updating…" : "Cancel appointment"}
            </button>
            {slotsLoading && <p role="status" style={{ color: "#64748b", margin: 0 }}>Loading available times…</p>}
          </div>
        </section>
      )}

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
