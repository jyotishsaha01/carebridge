"use client";

import Link from "next/link";
import { getCurrentUser } from "../../lib/api";
import { useEffect, useState } from "react";
import {
  getAppointments,
  getActiveSessions,
  getCareRequests,
  getCredentials,
  getDoctors,
  getPatients,
  reviewCredential,
  updateCareRequestStatus,
  type AdminAppointment,
  type AdminCareRequest,
  type AdminCareRequestStatus,
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
  const [careRequests, setCareRequests] = useState<AdminCareRequest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<AdminDoctor | null>(null);
  const [credentials, setCredentials] = useState<AdminCredential[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [doctorSearch, setDoctorSearch] = useState("");
  const [busy, setBusy] = useState("");
  const [busyCareRequest, setBusyCareRequest] = useState("");

  async function load() {
    try {
      const session = await getCurrentUser();
      if (session.user.role !== "ADMIN") throw new Error("Administrator access required.");
      const [d, p, a, s, requests] = await Promise.all([getDoctors(), getPatients(), getAppointments(), getActiveSessions(), getCareRequests()]);
      setDoctors(d);
      setPatients(p);
      setAppointments(a);
      setSessions(s);
      setCareRequests(requests);
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

  async function review(id: string, status: "APPROVED" | "REJECTED" | "PENDING") {
    if (!selected) return;
    setBusy(id);
    setError("");
    setNotice("");
    const doctorId = selected.id;
    try {
      await reviewCredential(id, status);
      const [latestDoctors, latestCredentials] = await Promise.all([getDoctors(), getCredentials(doctorId)]);
      const latestSelected = latestDoctors.find((doctor) => doctor.id === doctorId) ?? null;
      setDoctors(latestDoctors);
      setSelected(latestSelected);
      setCredentials(latestCredentials);
      setNotice(status === "REJECTED"
        ? "Credential rejected. This doctor remains hidden from patient search until every required credential is approved."
        : status === "PENDING"
          ? "Credential returned to pending review. The doctor remains hidden from patient search."
          : latestSelected?.isVerified
            ? "Credential approved and all submitted credentials are approved. The doctor can now appear in patient search."
            : "Credential approved. Other submitted credentials still need approval before this doctor appears in patient search.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Credential review failed.");
    } finally {
      setBusy("");
    }
  }

  async function changeCareRequestStatus(requestId: string, status: AdminCareRequestStatus) {
    setBusyCareRequest(requestId);
    setError("");
    setNotice("");
    try {
      const updated = await updateCareRequestStatus(requestId, status);
      setCareRequests((current) => current.map((item) => item.id === requestId ? updated : item));
      setNotice("Patient care request updated to " + status.toLowerCase().replaceAll("_", " ") + ".");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update patient care request.");
    } finally {
      setBusyCareRequest("");
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
          {[["patients", "Patients"], ["doctors", "Doctors"], ["verified-doctors", "Verified doctors"], ["patient-requests", "Patient requests"], ["appointments", "Appointments"], ["sessions", "Active sessions"]].map(([id, label]) => <Link key={id} href={"/operations#" + id} style={{ padding: "8px 11px", borderRadius: 10, background: "white", border: "1px solid #dfe8f0", color: "#1672b8", textDecoration: "none", fontSize: 13, fontWeight: 700 }}>{label}</Link>)}
        </nav>
        {error && <div role="alert" style={{ padding: 14, background: "#fff7ed", borderRadius: 12, color: "#9a3412" }}>{error}</div>}
        {notice && <div role="status" style={{ padding: 14, background: "#edf7f3", borderRadius: 12, color: "#17653f" }}>{notice}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 20, marginTop: 26 }}>
          <section id="doctors" style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 22, padding: 22, scrollMarginTop: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <h2>Provider license review</h2>
              <span style={{ color: "#64748b", fontSize: 13 }}>{doctors.filter((doctor) => !doctor.isVerified || !doctor.isActive).length} need review</span>
            </div>
            <input aria-label="Search doctors" value={doctorSearch} onChange={(event) => setDoctorSearch(event.target.value)} placeholder="Search by doctor name or specialty" style={{ width: "100%", margin: "12px 0", padding: 12, border: "1px solid #cbd5e1", borderRadius: 12 }} />
            {doctors.filter((doctor) => (doctor.name + " " + doctor.specialty.name + " " + doctor.location).toLowerCase().includes(doctorSearch.trim().toLowerCase())).sort((a, b) => Number(a.isVerified && a.isActive) - Number(b.isVerified && b.isActive)).map((doctor) => (
              <button key={doctor.id} onClick={() => void selectDoctor(doctor)} style={{ display: "block", width: "100%", textAlign: "left", padding: 14, border: 0, borderTop: "1px solid #eef2f7", background: selected?.id === doctor.id ? "#f0f7fc" : "white" }}>
                <b>{doctor.name}</b>
                <div style={{ color: "#718096" }}>{doctor.specialty.name} · {doctor.status} · {doctor.location}</div>
              </button>
            ))}
            {selected && (
              <div style={{ marginTop: 18, padding: 18, borderRadius: 16, background: "#f8fafc" }}>
                <h3>{selected.name} credentials</h3>
                <p style={{ color: "#64748b", fontSize: 13 }}>Approve only after independently checking the license with the issuing authority. The onboarding form stores license details and a reference; it does not upload the actual license document.</p>
                {credentials.length === 0 ? <p>No credentials submitted by this doctor yet.</p> : credentials.map((credential) => (
                  <div key={credential.id} style={{ padding: "12px 0", borderTop: "1px solid #e2e8f0" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><b>{credential.type}</b><span style={{ fontSize: 12, fontWeight: 800, color: credential.status === "APPROVED" ? "#17653f" : credential.status === "REJECTED" ? "#a12c2c" : "#9a5b11" }}>{credential.status}</span></div>
                    <div style={{ fontSize: 13, color: "#64748b", marginTop: 6 }}>License: {credential.licenseNumber} · Issued by: {credential.jurisdiction}</div>
                    {credential.documentName && <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>Document reference: {credential.documentName}</div>}
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>Submitted: {new Date(credential.createdAt).toLocaleString()}{credential.reviewedAt ? " · Reviewed: " + new Date(credential.reviewedAt).toLocaleString() : ""}</div>
                    {credential.status === "PENDING" && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                      <button disabled={busy === credential.id} onClick={() => void review(credential.id, "APPROVED")} style={{ padding: "9px 12px", border: 0, borderRadius: 10, background: "#1672b8", color: "white", fontWeight: 800 }}>{busy === credential.id ? "Saving…" : "Approve license"}</button>
                      <button disabled={busy === credential.id} onClick={() => void review(credential.id, "REJECTED")} style={{ padding: "9px 12px", border: "1px solid #e3b8b8", borderRadius: 10, background: "#fff7f7", color: "#a12c2c", fontWeight: 800 }}>Reject license</button>
                    </div>}
                    {credential.status === "REJECTED" && <button disabled={busy === credential.id} onClick={() => void review(credential.id, "PENDING")} style={{ marginTop: 10, padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: 10, background: "white", fontWeight: 700 }}>Return to review</button>}
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

        <section id="patient-requests" style={{ marginTop: 20, background: "white", border: "1px solid #e2e8f0", borderRadius: 22, padding: 22, scrollMarginTop: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}><h2>Patient care requests</h2><span style={{ color: "#64748b", fontSize: 13 }}>{careRequests.filter((item) => item.status === "REQUESTED" || item.status === "REVIEWING").length} awaiting review</span></div>
          <p style={{ color: "#64748b", fontSize: 13 }}>Review diagnostic, medication, procedure, surgery and coordination requests submitted by patients. Status updates notify the patient and are recorded in the audit log.</p>
          {!careRequests.length ? <p>No patient care requests.</p> : careRequests.map((request) => (
            <div key={request.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1.3fr) minmax(180px,.7fr)", gap: 16, padding: "16px 0", borderTop: "1px solid #eef2f7" }}>
              <div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}><b>{request.title}</b><span style={{ fontSize: 11, fontWeight: 800, color: "#1672b8" }}>{request.type}</span></div>
                <div style={{ color: "#64748b", fontSize: 13, marginTop: 5 }}>{[request.patient.firstName, request.patient.lastName].filter(Boolean).join(" ") || "Patient"} · {request.patient.country} · Submitted {new Date(request.createdAt).toLocaleString()}</div>
                {request.description && <p style={{ whiteSpace: "pre-wrap", margin: "8px 0", color: "#334155" }}>{request.description}</p>}
                {request.country && <div style={{ color: "#64748b", fontSize: 13 }}>Requested care country: {request.country}</div>}
                {request.targetDate && <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>Target date: {new Date(request.targetDate).toLocaleDateString()}</div>}
              </div>
              <label style={{ display: "grid", alignContent: "start", gap: 7, fontSize: 12, color: "#64748b", fontWeight: 700 }}>Request status
                <select aria-label={"Update patient request " + request.title} disabled={busyCareRequest === request.id} value={request.status} onChange={(event) => void changeCareRequestStatus(request.id, event.target.value as AdminCareRequestStatus)} style={{ width: "100%", padding: 10, border: "1px solid #cbd5e1", borderRadius: 10, background: "white", color: "#172334" }}>
                  <option value="REQUESTED">Requested</option><option value="REVIEWING">Reviewing</option><option value="APPROVED">Approved</option><option value="SCHEDULED">Scheduled</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled / declined</option>
                </select>
                {busyCareRequest === request.id && <span>Saving status…</span>}
              </label>
            </div>
          ))}
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
