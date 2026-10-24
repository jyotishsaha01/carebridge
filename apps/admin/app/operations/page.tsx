"use client";

import Link from "next/link";
import { getCurrentUser } from "../../lib/api";
import { useEffect, useState } from "react";
import {
  getAppointments,
  getActiveSessions,
  getCredentials,
  getDoctors,
  getPatients,
  reviewCredential,
  type AdminAppointment,
  type AdminCredential,
  type AdminDoctor,
  type AdminPatient,
  type AdminSession,
} from "../../lib/api";

export default function Operations() {
  const [doctors, setDoctors] = useState<AdminDoctor[]>([]);
  const [patients, setPatients] = useState<AdminPatient[]>([]);
  const [appointments, setAppointments] = useState<AdminAppointment[]>([]);
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<AdminDoctor | null>(null);
  const [credentials, setCredentials] = useState<AdminCredential[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  async function load() {
    try {
      const session = await getCurrentUser();
      if (session.user.role !== "ADMIN") throw new Error("Administrator access required.");
      const [d, p, a, s] = await Promise.all([getDoctors(), getPatients(), getAppointments(), getActiveSessions()]);
      setDoctors(d);
      setPatients(p);
      setAppointments(a);
      setSessions(s);
      setLoaded(true);
      const requestedDoctorId = new URLSearchParams(window.location.search).get("doctor");
      const requestedDoctor = requestedDoctorId ? d.find((doctor) => doctor.id === requestedDoctorId) : undefined;
      if (requestedDoctor) await selectDoctor(requestedDoctor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load operations.");
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const timer = window.setTimeout(() => {
      const sectionId = decodeURIComponent(window.location.hash.slice(1));
      if (sectionId) document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [loaded]);

  async function selectDoctor(doctor: AdminDoctor) {
    setSelected(doctor);
    try {
      setCredentials(await getCredentials(doctor.id));
    } catch {
      setError("Unable to load credentials.");
    }
  }

  async function review(id: string, status: "APPROVED" | "REJECTED") {
    setBusy(id);
    try {
      await reviewCredential(id, status);
      if (selected) setCredentials(await getCredentials(selected.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Credential review failed.");
    } finally {
      setBusy("");
    }
  }

  function patientName(patient: Pick<AdminPatient, "firstName" | "lastName">) {
    return [patient.firstName, patient.lastName].filter(Boolean).join(" ") || "Patient";
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f7f9fc", padding: "40px 24px", fontFamily: "Inter,system-ui,sans-serif", color: "#172334" }}>
      <div style={{ maxWidth: 1200, margin: "auto" }}>
        <Link href="/dashboard" style={{ color: "#1672b8" }}>← Operations center</Link>
        <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".12em", color: "#64748b", marginTop: 28 }}>CAREBRIDGE · ADMIN CONTROL</p>
        <h1>Operational management</h1>
        <p style={{ color: "#64748b" }}>Review providers, inspect patients and monitor appointment activity.</p>
        <nav aria-label="Operational details" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 18 }}>
          {[["patients", "Patients"], ["doctors", "Doctors"], ["verified-doctors", "Verified doctors"], ["appointments", "Appointments"], ["sessions", "Active sessions"]].map(([id, label]) => <Link key={id} href={"/operations#" + id} style={{ padding: "8px 11px", borderRadius: 10, background: "white", border: "1px solid #dfe8f0", color: "#1672b8", textDecoration: "none", fontSize: 13, fontWeight: 700 }}>{label}</Link>)}
        </nav>
        {error && <div style={{ padding: 14, background: "#fff7ed", borderRadius: 12 }}>{error}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "1.1fr .9fr", gap: 20, marginTop: 26 }}>
          <section id="doctors" style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 22, padding: 22, scrollMarginTop: 24 }}>
            <h2>Provider credentials</h2>
            {doctors.map((doctor) => (
              <button key={doctor.id} onClick={() => void selectDoctor(doctor)} style={{ display: "block", width: "100%", textAlign: "left", padding: 14, border: 0, borderTop: "1px solid #eef2f7", background: selected?.id === doctor.id ? "#f0f7fc" : "white" }}>
                <b>{doctor.name}</b>
                <div style={{ color: "#718096" }}>{doctor.specialty.name} · {doctor.isVerified ? "Verified" : "Pending"} · {doctor.location}</div>
              </button>
            ))}
            {selected && (
              <div style={{ marginTop: 18, padding: 18, borderRadius: 16, background: "#f8fafc" }}>
                <h3>{selected.name} credentials</h3>
                {credentials.length === 0 ? <p>No credentials.</p> : credentials.map((credential) => (
                  <div key={credential.id} style={{ padding: "12px 0", borderTop: "1px solid #e2e8f0" }}>
                    <b>{credential.type}</b>
                    <div style={{ fontSize: 13, color: "#64748b" }}>{credential.licenseNumber} · {credential.jurisdiction} · {credential.status}</div>
                    {credential.status === "PENDING" && (
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button disabled={busy === credential.id} onClick={() => void review(credential.id, "APPROVED")}>Approve</button>
                        <button disabled={busy === credential.id} onClick={() => void review(credential.id, "REJECTED")}>Reject</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section id="patients" style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 22, padding: 22, scrollMarginTop: 24 }}>
            <h2>Patients</h2>
            {patients.map((patient) => (
              <div key={patient.id} style={{ padding: "12px 0", borderTop: "1px solid #eef2f7" }}>
                <b>{patientName(patient)}</b>
                <div style={{ fontSize: 13, color: "#64748b" }}>{patient.user.email} · {patient.country} · {patient.user.isEmailVerified ? "Email verified" : "Email pending"}</div>
              </div>
            ))}
            {!patients.length && <p>No patients.</p>}
          </section>
        </div>

        <section id="verified-doctors" style={{ marginTop: 20, background: "white", border: "1px solid #e2e8f0", borderRadius: 22, padding: 22, scrollMarginTop: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <h2>Verified doctors</h2>
            <span style={{ color: "#64748b", fontSize: 13 }}>{doctors.filter((doctor) => doctor.isVerified && doctor.isActive).length} active and verified</span>
          </div>
          <p style={{ color: "#64748b", fontSize: 13 }}>These are the active verified provider profiles counted in the dashboard summary.</p>
          {doctors.filter((doctor) => doctor.isVerified && doctor.isActive).map((doctor) => (
            <button key={doctor.id} onClick={() => void selectDoctor(doctor)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, width: "100%", textAlign: "left", padding: 14, border: 0, borderTop: "1px solid #eef2f7", background: selected?.id === doctor.id ? "#f0f7fc" : "white" }}>
              <span><b>{doctor.name}</b><span style={{ display: "block", marginTop: 4, color: "#718096", fontSize: 13 }}>{doctor.specialty.name} · {doctor.location}</span></span>
              <span style={{ color: "#1672b8", whiteSpace: "nowrap", fontSize: 13 }}>Inspect credentials →</span>
            </button>
          ))}
          {!doctors.some((doctor) => doctor.isVerified && doctor.isActive) && <p>No active verified doctors.</p>}
        </section>

        <section id="sessions" style={{ marginTop: 20, background: "white", border: "1px solid #e2e8f0", borderRadius: 22, padding: 22, scrollMarginTop: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <h2>Active account sessions</h2>
            <span style={{ color: "#64748b", fontSize: 13 }}>{sessions.length} shown</span>
          </div>
          <p style={{ color: "#64748b", fontSize: 13 }}>Current authenticated sign-ins, ordered by most recent activity. Session tokens are never exposed here.</p>
          {sessions.map((session) => (
            <div key={session.id} style={{ display: "grid", gridTemplateColumns: "1.3fr .6fr 1.2fr 1fr", gap: 12, alignItems: "center", padding: "14px 0", borderTop: "1px solid #eef2f7" }}>
              <b>{session.user.email}</b>
              <span style={{ color: "#64748b" }}>{session.user.role}</span>
              <span style={{ color: "#64748b", fontSize: 13 }}>Last active: {new Date(session.lastSeenAt).toLocaleString()}</span>
              <span style={{ color: "#64748b", fontSize: 13 }}>Expires: {new Date(session.expiresAt).toLocaleString()}</span>
            </div>
          ))}
          {!sessions.length && <p>No active account sessions.</p>}
        </section>

        <section id="appointments" style={{ marginTop: 20, background: "white", border: "1px solid #e2e8f0", borderRadius: 22, padding: 22, scrollMarginTop: 24 }}>
          <h2>Appointment operations</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {appointments.map((appointment) => (
              <div key={appointment.id} style={{ display: "grid", gridTemplateColumns: "1.2fr 1.2fr 1fr 1fr", gap: 12, padding: 13, borderTop: "1px solid #eef2f7" }}>
                <span>{patientName(appointment.patient)} · {appointment.patient.country}</span>
                <span>{appointment.doctor.name} · {appointment.doctor.specialty.name}</span>
                <span>{new Date(appointment.scheduledAt).toLocaleString()}</span>
                <b>{appointment.consultation?.status ?? appointment.status}</b>
              </div>
            ))}
            {!appointments.length && <p>No appointments.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
