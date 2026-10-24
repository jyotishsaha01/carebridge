"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
type Appointment = {
  id: string;
  scheduledAt: string;
  status: string;
  patient: { firstName: string | null; lastName: string | null; country: string };
  medicalIntake: { status: string } | null;
  consultation: { status: string } | null;
};
type Doctor = { name: string; status?: string; isVerified?: boolean; specialty?: { name: string } };
type Slot = { id: string; status: string; startsAt: string };

function patientName(a: Appointment) {
  return [a.patient.firstName, a.patient.lastName].filter(Boolean).join(" ") || "Patient";
}
function Bell() {
  return <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></svg>;
}

export default function DoctorDashboard() {
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [availableSlots, setAvailableSlots] = useState(0);
  const [unread, setUnread] = useState(0);
  const [filter, setFilter] = useState("ALL");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const upcomingCount = appointments.filter((appointment) => new Date(appointment.scheduledAt) >= new Date() && !["CANCELLED", "COMPLETED"].includes(appointment.status)).length;
  const inProgressCount = appointments.filter((appointment) => appointment.consultation?.status === "IN_PROGRESS").length;
  const completedCount = appointments.filter((appointment) => appointment.consultation?.status === "COMPLETED" || appointment.status === "COMPLETED").length;

  useEffect(() => {
    let stream: EventSource | null = null;
    let cancelled = false;

    async function load() {
      try {
        const [doctorResponse, appointmentResponse, slotResponse] = await Promise.all([
          fetch(API_URL + "/v1/doctor/me", { credentials: "include" }),
          fetch(API_URL + "/v1/doctor/appointments", { credentials: "include" }),
          fetch(API_URL + "/v1/doctor/availability", { credentials: "include" }),
        ]);
        if ([doctorResponse, appointmentResponse, slotResponse].some((response) => !response.ok)) {
          throw new Error("Sign in as a doctor to view your live workspace.");
        }
        const [doctorData, appointmentData, slotData] = await Promise.all([
          doctorResponse.json() as Promise<Doctor>,
          appointmentResponse.json() as Promise<Appointment[]>,
          slotResponse.json() as Promise<Slot[]>,
        ]);
        if (cancelled) return;
        setDoctor(doctorData);
        setAppointments(Array.isArray(appointmentData) ? appointmentData : []);
        setAvailableSlots(Array.isArray(slotData) ? slotData.filter((slot) => slot.status === "AVAILABLE").length : 0);

        const notificationResponse = await fetch(API_URL + "/v1/notifications?limit=1", { credentials: "include" });
        if (notificationResponse.ok && !cancelled) {
          const notifications = await notificationResponse.json();
          setUnread(Number(notifications.unreadCount) || 0);
        }
        if (!cancelled) {
          stream = new EventSource(API_URL + "/v1/notifications/stream", { withCredentials: true });
          stream.addEventListener("notification", () => setUnread((count) => count + 1));
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load doctor workspace.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
      stream?.close();
    };
  }, [refreshKey]);

  async function cancelAppointment(appointmentId: string) {
    const reason = window.prompt("Enter a cancellation reason for the patient (3–1,000 characters):");
    if (reason === null) return;
    if (reason.trim().length < 3 || reason.trim().length > 1000) {
      setError("Cancellation reason must be between 3 and 1,000 characters.");
      return;
    }
    setError("");
    try {
      const response = await fetch(API_URL + "/v1/doctor/appointments/" + encodeURIComponent(appointmentId) + "/cancel", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Unable to cancel appointment.");
      setAppointments((current) => current.map((appointment) =>
        appointment.id === appointmentId ? { ...appointment, status: "CANCELLED" } : appointment
      ));
      const slotsResponse = await fetch(API_URL + "/v1/doctor/availability", { credentials: "include" });
      if (slotsResponse.ok) {
        const slots = await slotsResponse.json() as Slot[];
        setAvailableSlots(Array.isArray(slots) ? slots.filter((slot) => slot.status === "AVAILABLE").length : 0);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to cancel appointment.");
    }
  }

  const visible = useMemo(() => {
    const sorted = [...appointments].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    return filter === "ALL" ? sorted : sorted.filter((appointment) => (appointment.consultation?.status ?? appointment.status) === filter);
  }, [appointments, filter]);

  return (
    <main style={{ minHeight: "100vh", background: "#f6f9fc", color: "#142235", padding: "42px 24px", fontFamily: "Inter,system-ui,sans-serif" }}>
      <div style={{ maxWidth: 1150, margin: "auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, marginBottom: 30, flexWrap: "wrap" }}>
          <div>
            <p style={{ color: "#5f7891", fontWeight: 800, letterSpacing: ".12em", fontSize: 12, textTransform: "uppercase" }}>CareBridge · Doctor Workspace</p>
            <h1 style={{ fontSize: 42, margin: "8px 0" }}>{doctor?.name ?? "Doctor workspace"}</h1>
            <p style={{ color: "#64788d", fontSize: 17 }}>{doctor?.specialty?.name ?? "Live clinical workspace"}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Link href="/notifications" aria-label="Notifications" title="Notifications" style={{ position: "relative", display: "grid", placeItems: "center", width: 42, height: 42, borderRadius: "50%", background: "white", border: "1px solid #dfe8f0", color: "#1672b8" }}>
              <Bell />
              {unread > 0 && <span style={{ position: "absolute", right: -3, top: -3, minWidth: 18, height: 18, borderRadius: 99, background: "#d84d45", color: "white", fontSize: 9, fontWeight: 800, display: "grid", placeItems: "center" }}>{unread > 99 ? "99+" : unread}</span>}
            </Link>
            <div style={{ padding: "14px 18px", background: "white", border: "1px solid #dfe8f0", borderRadius: 16 }}>
              <b>{appointments.length}</b><div style={{ color: "#64788d", marginTop: 4 }}>Appointments</div>
            </div>
            <div style={{ padding: "14px 18px", background: "white", border: "1px solid #dfe8f0", borderRadius: 16 }}>
              <b>{availableSlots}</b><div style={{ color: "#64788d", marginTop: 4 }}>Open slots</div>
            </div>
          </div>
        </header>

        <nav style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
          <Link href="/" style={{ padding: "10px 14px", borderRadius: 10, background: "white", border: "1px solid #dfe8f0", color: "#1672b8", textDecoration: "none" }}>Clinical workspace</Link>
          <Link href="/operations" style={{ padding: "10px 14px", borderRadius: 10, background: "white", border: "1px solid #dfe8f0", color: "#1672b8", textDecoration: "none" }}>Availability</Link>
          <Link href="/profile" style={{ padding: "10px 14px", borderRadius: 10, background: "white", border: "1px solid #dfe8f0", color: "#1672b8", textDecoration: "none" }}>Profile & credentials</Link>
        </nav>

        {error && <div role="alert" style={{ padding: 14, background: "#fff7ed", borderRadius: 14, marginBottom: 18, color: "#9a3412", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}><span>{error}</span><button onClick={() => { setError(""); setLoading(true); setRefreshKey((value) => value + 1); }} style={{ padding: "9px 12px", background: "white", border: "1px solid #e6c49b", borderRadius: 10, fontWeight: 700, color: "#9a3412" }}>Retry loading</button></div>}
        {doctor && !doctor.isVerified && <section role="status" style={{ background: doctor.status === "REJECTED" ? "#fff7f7" : "#fff9ec", border: "1px solid " + (doctor.status === "REJECTED" ? "#f1caca" : "#f2d9a6"), borderRadius: 18, padding: 20, marginBottom: 20 }}>
          <h2 style={{ margin: "0 0 7px", fontSize: 18 }}>{doctor.status === "REJECTED" ? "Credential review needs attention" : "Your profile is awaiting verification"}</h2>
          <p style={{ color: "#6b7280", margin: "0 0 12px" }}>Patients can only find verified, active doctors. Review your submitted license or submit corrected details so the admin team can complete verification.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}><Link href="/profile" style={{ color: "#1672b8", fontWeight: 700 }}>View credential status</Link><Link href="/onboarding" style={{ color: "#1672b8", fontWeight: 700 }}>Submit / resubmit license</Link></div>
        </section>}
        <section aria-label="Doctor performance overview" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 20 }}>
          {[[ "Upcoming", upcomingCount ], [ "In progress", inProgressCount ], [ "Completed", completedCount ], [ "Open slots", availableSlots ]].map(([label, value]) => <div key={label} style={{ background: "white", border: "1px solid #e1e9f1", borderRadius: 16, padding: 17 }}><strong style={{ fontSize: 27 }}>{value}</strong><div style={{ color: "#64788d", marginTop: 4, fontSize: 13 }}>{label}</div></div>)}
        </section>
        <section style={{ background: "white", border: "1px solid #e1e9f1", borderRadius: 24, padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, flexWrap: "wrap", marginBottom: 18 }}>
            <div><h2 style={{ margin: 0 }}>Appointment queue</h2><p style={{ color: "#718398", margin: "6px 0 0" }}>Appointments assigned to your doctor account.</p></div>
            <select aria-label="Filter appointments" value={filter} onChange={(event) => setFilter(event.target.value)} style={{ padding: 10, borderRadius: 12, border: "1px solid #cfdbe6" }}>
              <option value="ALL">All appointments</option><option value="BOOKED">Booked</option><option value="SCHEDULED">Scheduled</option><option value="IN_PROGRESS">In progress</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option>
            </select>
          </div>
          {loading ? <p style={{ color: "#718398" }}>Loading appointments…</p> : visible.length === 0 ? <div style={{ padding: 24, textAlign: "center", background: "#f8fafc", borderRadius: 16 }}><b>No appointments found</b><p style={{ color: "#718398" }}>New bookings assigned to you will appear here.</p><Link href="/operations" style={{ color: "#1672b8" }}>Manage availability</Link></div> : (
            <div style={{ display: "grid", gap: 10 }}>
              {visible.map((appointment) => <div key={appointment.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap", padding: 17, border: "1px solid #e4ebf2", borderRadius: 16 }}>
                <div><b>{patientName(appointment)}</b><div style={{ color: "#718398", marginTop: 4 }}>{new Date(appointment.scheduledAt).toLocaleString()} · {appointment.patient.country}</div><div style={{ color: "#718398", marginTop: 4 }}>Intake: {appointment.medicalIntake?.status ?? "Not started"}</div></div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}><span style={{ fontSize: 12, fontWeight: 800, color: "#58718b" }}>{appointment.consultation?.status ?? appointment.status}</span><Link href={"/?appointmentId=" + encodeURIComponent(appointment.id)} style={{ padding: "9px 12px", borderRadius: 10, background: "#1672b8", color: "white", textDecoration: "none", fontWeight: 700 }}>Open workspace</Link>{appointment.status === "BOOKED" && <button onClick={() => void cancelAppointment(appointment.id)} style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid #e6b8b8", background: "#fff7f7", color: "#a12c2c", fontWeight: 700 }}>Cancel</button>}</div>
              </div>)}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
