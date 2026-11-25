"use client";

import Link from "next/link";
import { getCurrentUser } from "../../lib/api";
import { useEffect, useRef, useState } from "react";
import {
  getAppointments,
  getCredentials,
  getDoctors,
  getPatients,
  reviewCredential,
  type AdminAppointment,
  type AdminCredential,
  type AdminDoctor,
  type AdminPatient,
} from "../../lib/api";

export default function Operations() {
  const [doctors, setDoctors] = useState<AdminDoctor[]>([]);
  const [patients, setPatients] = useState<AdminPatient[]>([]);
  const [appointments, setAppointments] = useState<AdminAppointment[]>([]);
  const [selected, setSelected] = useState<AdminDoctor | null>(null);
  const [credentials, setCredentials] = useState<AdminCredential[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const selectedDoctorId = useRef("");
  const [credentialsLoading, setCredentialsLoading] = useState(false);

  async function load() {
    try {
      setError("");
      const session=await getCurrentUser();
      if(session.user.role!=="ADMIN")throw new Error("Administrator access required.");
      const [d, p, a] = await Promise.all([getDoctors(), getPatients(), getAppointments()]);
      setDoctors(d);
      setPatients(p);
      setAppointments(a);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load operations.");
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function selectDoctor(doctor: AdminDoctor) {
    selectedDoctorId.current = doctor.id;
    setSelected(doctor); setCredentials([]); setCredentialsLoading(true); setError("");
    try {
      const rows = await getCredentials(doctor.id);
      if (selectedDoctorId.current === doctor.id) setCredentials(rows);
    } catch {
      if (selectedDoctorId.current === doctor.id) setError("Unable to load credentials.");
    } finally { if (selectedDoctorId.current === doctor.id) setCredentialsLoading(false); }
  }

  async function review(id: string, status: "APPROVED" | "REJECTED") {
    setBusy(id);
    try {
      await reviewCredential(id, status);
      if (selected) { const rows = await getCredentials(selected.id); if (selectedDoctorId.current === selected.id) setCredentials(rows); }
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
        {error && <div role="alert" style={{ padding: 14, background: "#fff7ed", borderRadius: 12 }}>{error}</div>}

        <div className="workspace-columns" style={{ marginTop: 26 }}>
          <section style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 22, padding: 22 }}>
            <h2>Provider credentials</h2>
            {doctors.map((doctor) => (
              <button key={doctor.id} disabled={Boolean(busy)} onClick={() => void selectDoctor(doctor)} style={{ display: "block", width: "100%", textAlign: "left", padding: 14, border: 0, borderTop: "1px solid #eef2f7", background: selected?.id === doctor.id ? "#f0f7fc" : "white" }}>
                <b>{doctor.name}</b>
                <div style={{ color: "#718096" }}>{doctor.specialty.name} · {doctor.isVerified ? "Verified" : "Pending"} · {doctor.location}</div>
              </button>
            ))}
            {selected && (
              <div style={{ marginTop: 18, padding: 18, borderRadius: 16, background: "#f8fafc" }}>
                <h3>{selected.name} credentials</h3>
                {credentialsLoading ? <p role="status">Loading credentials…</p> : credentials.length === 0 ? <p>No credentials.</p> : credentials.map((credential) => (
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

          <section style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 22, padding: 22 }}>
            <h2>Patients</h2>
            {patients.slice(0, 15).map((patient) => (
              <div key={patient.id} style={{ padding: "12px 0", borderTop: "1px solid #eef2f7" }}>
                <b>{patientName(patient)}</b>
                <div style={{ fontSize: 13, color: "#64748b" }}>{patient.user.email} · {patient.country} · {patient.user.isEmailVerified ? "Email verified" : "Email pending"}</div>
              </div>
            ))}
            {!patients.length && <p>No patients.</p>}
          </section>
        </div>

        <section style={{ marginTop: 20, background: "white", border: "1px solid #e2e8f0", borderRadius: 22, padding: 22 }}>
          <h2>Appointment operations</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {appointments.slice(0, 20).map((appointment) => (
              <div key={appointment.id} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, padding: 13, borderTop: "1px solid #eef2f7" }}>
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
