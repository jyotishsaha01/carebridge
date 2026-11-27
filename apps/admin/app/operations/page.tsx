"use client";

import Link from "next/link";
import CareRequestEditor, { careRequestStatusLabel } from "../../components/care-request-editor";
import { getCurrentUser } from "../../lib/api";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getAppointments,
  getActiveSessions,
  getCareRequests,
  getCareRequest,
  getCredentials,
  getDoctors,
  getPatients,
  reviewCredential,
  type AdminAppointment,
  type AdminCareRequest,
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
  const reviewingCredential = useRef(false);
  const selectedDoctorId=useRef("");
  const [credentialsLoading,setCredentialsLoading]=useState(false);
  const [requestsRefreshing, setRequestsRefreshing] = useState(false);
  const [requestsSaving, setRequestsSaving] = useState(false);
  const savingRequests = useRef(new Set<string>());
  const refreshingRequests = useRef(false);
  const [requestFilter, setRequestFilter] = useState("ALL");

  const selectDoctor=useCallback(async(doctor:AdminDoctor)=>{
    selectedDoctorId.current=doctor.id;setSelected(doctor);setCredentials([]);setCredentialsLoading(true);setError("");
    try { const rows=await getCredentials(doctor.id);if(selectedDoctorId.current===doctor.id)setCredentials(rows); }
    catch(cause){if(selectedDoctorId.current===doctor.id)setError(cause instanceof Error?cause.message:"Unable to load credentials.");}
    finally{if(selectedDoctorId.current===doctor.id)setCredentialsLoading(false);}
  },[]);

  const load=useCallback(async()=>{
    try {
      setError("");
      const session = await getCurrentUser();
      if (session.user.role !== "ADMIN") throw new Error("Administrator access required.");
      const [d, p, a, s, requests] = await Promise.all([getDoctors(), getPatients(), getAppointments(), getActiveSessions(), getCareRequests()]);
      setDoctors(d);
      setPatients(p);
      setAppointments(a);
      setSessions(s);
      const requestedId = new URLSearchParams(window.location.search).get("request");
      const requested = requestedId && !requests.some((row) => row.id === requestedId) ? await getCareRequest(requestedId) : null;
      setCareRequests(requested ? [requested, ...requests] : requests);
      setLoaded(true);
      const requestedDoctorId = new URLSearchParams(window.location.search).get("doctor");
      const requestedDoctor = requestedDoctorId ? d.find((doctor) => doctor.id === requestedDoctorId) : undefined;
      if (requestedDoctor) await selectDoctor(requestedDoctor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load operations.");
    }
  },[selectDoctor]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!loaded) return;
    const timer = window.setTimeout(() => {
      let sectionId="";try{sectionId=decodeURIComponent(window.location.hash.slice(1));}catch{return;}
      const requestedId = new URLSearchParams(window.location.search).get("request");
      const target = requestedId ? document.getElementById("care-request-" + requestedId) : null;
      (target ?? (sectionId ? document.getElementById(sectionId) : null))?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [loaded]);


  async function review(id: string, status: "APPROVED" | "REJECTED" | "PENDING") {
    let committed = false;
    if (!selected || reviewingCredential.current) return;
    reviewingCredential.current = true;
    setBusy(id);
    setError("");
    setNotice("");
    const doctorId = selected.id;
    try {
      const confirmed = await reviewCredential(id, status);
      committed = true;
      setCredentials((current) => current.map((credential) => credential.id === confirmed.id ? confirmed : credential));
      setNotice(`Credential ${confirmed.id} saved as ${status.toLowerCase()}.`);
      const [latestDoctors, latestCredentials] = await Promise.all([getDoctors(), getCredentials(doctorId)]);
      if(selectedDoctorId.current!==doctorId)return;
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
      setError((committed ? "Credential saved. Latest provider details could not be refreshed. " : "") + (e instanceof Error ? e.message : "Credential review failed.") + (committed ? " Use Refresh credentials to confirm the latest state." : ""));
    } finally {
      setBusy("");
      reviewingCredential.current = false;
    }
  }

  async function refreshCareRequests() {
    if (refreshingRequests.current || savingRequests.current.size) return;
    refreshingRequests.current = true;
    setRequestsRefreshing(true);
    setError("");
    try {
      setCareRequests(await getCareRequests());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to refresh patient care requests.");
    } finally {
      refreshingRequests.current = false;
      setRequestsRefreshing(false);
    }
  }

  async function refreshCredentials() {
    if (!selected || reviewingCredential.current) return;
    const doctorId = selected.id;
    setCredentialsLoading(true); setError("");
    try {
      const [latestDoctors, latestCredentials] = await Promise.all([getDoctors(), getCredentials(doctorId)]);
      if (selectedDoctorId.current !== doctorId) return;
      setDoctors(latestDoctors); setCredentials(latestCredentials);
      setSelected(latestDoctors.find((doctor) => doctor.id === doctorId) ?? null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to refresh provider details."); }
    finally { if (selectedDoctorId.current === doctorId) setCredentialsLoading(false); }
  }

  function requestSavingChanged(requestId: string, saving: boolean) {
    if (saving) savingRequests.current.add(requestId);
    else savingRequests.current.delete(requestId);
    setRequestsSaving(savingRequests.current.size > 0);
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
        {!loaded && !error && <p role="status">Loading operational details…</p>}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 20, marginTop: 26 }}>
          <section id="doctors" style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 22, padding: 22, scrollMarginTop: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <h2>Provider license review</h2>
              <span style={{ color: "#64748b", fontSize: 13 }}>{doctors.filter((doctor) => doctor.pendingCredentials > 0 || !doctor.isVerified || !doctor.isActive).length} need review</span>
            </div>
            <input aria-label="Search doctors" value={doctorSearch} onChange={(event) => setDoctorSearch(event.target.value)} placeholder="Search by doctor name or specialty" style={{ width: "100%", margin: "12px 0", padding: 12, border: "1px solid #cbd5e1", borderRadius: 12 }} />
            {doctors.filter((doctor) => (doctor.name + " " + doctor.specialty.name + " " + doctor.location).toLowerCase().includes(doctorSearch.trim().toLowerCase())).sort((a, b) => Number(!(a.pendingCredentials > 0 || !a.isVerified || !a.isActive)) - Number(!(b.pendingCredentials > 0 || !b.isVerified || !b.isActive))).map((doctor) => (
              <button key={doctor.id} disabled={Boolean(busy)} onClick={() => void selectDoctor(doctor)} style={{ display: "block", width: "100%", textAlign: "left", padding: 14, border: 0, borderTop: "1px solid #eef2f7", background: selected?.id === doctor.id ? "#f0f7fc" : "white" }}>
                <b>{doctor.name}</b>
                <div style={{ color: "#718096" }}>{doctor.specialty.name} · {doctor.status} · {doctor.location}</div>
              </button>
            ))}
            {selected && (
              <div style={{ marginTop: 18, padding: 18, borderRadius: 16, background: "#f8fafc" }}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}><h3>{selected.name} credentials</h3><button disabled={Boolean(busy) || credentialsLoading} onClick={() => void refreshCredentials()}>Refresh credentials</button></div>
                <p style={{ color: "#64748b", fontSize: 13 }}>Approve only after independently checking the license with the issuing authority. The onboarding form stores license details and a reference; it does not upload the actual license document.</p>
                {credentialsLoading?<p role="status">Loading credentials…</p>:credentials.length === 0 ? <p>No credentials submitted by this doctor yet.</p> : credentials.map((credential) => (
                  <div key={credential.id} style={{ padding: "12px 0", borderTop: "1px solid #e2e8f0" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><b>{credential.type}</b><span style={{ fontSize: 12, fontWeight: 800, color: credential.status === "APPROVED" ? "#17653f" : credential.status === "REJECTED" ? "#a12c2c" : "#9a5b11" }}>{credential.status}</span></div>
                    <div style={{ fontSize: 13, color: "#64748b", marginTop: 6 }}>License: {credential.licenseNumber} · Issued by: {credential.jurisdiction}</div>
                    {credential.documentName && <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>Document reference: {credential.documentName}</div>}
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>Submitted: {new Date(credential.createdAt).toLocaleString()}{credential.reviewedAt ? " · Reviewed: " + new Date(credential.reviewedAt).toLocaleString() : ""}</div>
                    {credential.status === "PENDING" && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                      <button disabled={Boolean(busy)} onClick={() => void review(credential.id, "APPROVED")} style={{ padding: "9px 12px", border: 0, borderRadius: 10, background: "#1672b8", color: "white", fontWeight: 800 }}>{busy === credential.id ? "Saving…" : "Approve license"}</button>
                      <button disabled={Boolean(busy)} onClick={() => void review(credential.id, "REJECTED")} style={{ padding: "9px 12px", border: "1px solid #e3b8b8", borderRadius: 10, background: "#fff7f7", color: "#a12c2c", fontWeight: 800 }}>Reject license</button>
                    </div>}
                    {credential.status === "REJECTED" && <button disabled={Boolean(busy)} onClick={() => void review(credential.id, "PENDING")} style={{ marginTop: 10, padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: 10, background: "white", fontWeight: 700 }}>Return to review</button>}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section id="patients" style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 22, padding: 22, scrollMarginTop: 24 }}>
            <h2>Patients</h2>
            <p style={{ color: "#64748b", fontSize: 13 }}>Latest {patients.length} accounts shown, up to 100. Account details are limited to operational information.</p>
            {patients.map((patient) => (
              <div key={patient.id} style={{ padding: "12px 0", borderTop: "1px solid #eef2f7" }}>
                <b>{patientName(patient)}</b>
                <div style={{ fontSize: 13, color: "#64748b" }}>{patient.user.email} · {patient.country} · {patient.user.isEmailVerified ? "Email verified" : "Email pending"}</div>
              </div>
            ))}
            {loaded && !patients.length && <p>No patients.</p>}
          </section>
        </div>

        <section id="verified-doctors" style={{ marginTop: 20, background: "white", border: "1px solid #e2e8f0", borderRadius: 22, padding: 22, scrollMarginTop: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <h2>Verified doctors</h2>
            <span style={{ color: "#64748b", fontSize: 13 }}>{doctors.filter((doctor) => doctor.isVerified && doctor.isActive).length} active and verified</span>
          </div>
          <p style={{ color: "#64748b", fontSize: 13 }}>These are the active verified provider profiles counted in the dashboard summary.</p>
          {doctors.filter((doctor) => doctor.isVerified && doctor.isActive).map((doctor) => (
            <button key={doctor.id} disabled={Boolean(busy)} onClick={() => { void selectDoctor(doctor); document.getElementById("doctors")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, width: "100%", textAlign: "left", padding: 14, border: 0, borderTop: "1px solid #eef2f7", background: selected?.id === doctor.id ? "#f0f7fc" : "white" }}>
              <span><b>{doctor.name}</b><span style={{ display: "block", marginTop: 4, color: "#718096", fontSize: 13 }}>{doctor.specialty.name} · {doctor.location}</span></span>
              <span style={{ color: "#1672b8", whiteSpace: "nowrap", fontSize: 13 }}>Inspect credentials →</span>
            </button>
          ))}
          {loaded && !doctors.some((doctor) => doctor.isVerified && doctor.isActive) && <p>No active verified doctors.</p>}
        </section>

        <section id="sessions" style={{ marginTop: 20, background: "white", border: "1px solid #e2e8f0", borderRadius: 22, padding: 22, scrollMarginTop: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <h2>Active account sessions</h2>
            <span style={{ color: "#64748b", fontSize: 13 }}>{sessions.length} shown</span>
          </div>
          <p style={{ color: "#64748b", fontSize: 13 }}>Up to 100 current authenticated sign-ins, ordered by most recent activity. Session tokens are never exposed here.</p>
          {sessions.map((session) => (
            <div key={session.id} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, alignItems: "center", padding: "14px 0", borderTop: "1px solid #eef2f7" }}>
              <b>{session.user.email}</b>
              <span style={{ color: "#64748b" }}>{session.user.role}</span>
              <span style={{ color: "#64748b", fontSize: 13 }}>Last active: {new Date(session.lastSeenAt).toLocaleString()}</span>
              <span style={{ color: "#64748b", fontSize: 13 }}>Expires: {new Date(session.expiresAt).toLocaleString()}</span>
            </div>
          ))}
          {loaded && !sessions.length && <p>No active account sessions.</p>}
        </section>

        <section id="patient-requests" style={{ marginTop: 20, background: "white", border: "1px solid #e2e8f0", borderRadius: 22, padding: 22, scrollMarginTop: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}><h2>Patient care requests</h2><span style={{ color: "#64748b", fontSize: 13 }}>{careRequests.filter((item) => item.status === "REQUESTED" || item.status === "REVIEWING").length} awaiting review</span></div>
          <p style={{ color: "#64748b", fontSize: 13 }}>Review the latest 100 patient requests. Choose a stage and save it to update the patient’s tracker. Changes are audited and generate a patient notification when enabled. These coordination stages do not automatically book appointments, assign doctors or change treatment.</p>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
            <label>Show requests <select aria-label="Filter patient care requests" value={requestFilter} disabled={requestsSaving || requestsRefreshing} onChange={(event) => setRequestFilter(event.target.value)} style={{ padding: 8, marginLeft: 8 }}>
              <option value="ALL">All stages</option><option value="OPEN">Open requests</option>
              {["REQUESTED", "REVIEWING", "APPROVED", "SCHEDULED", "COMPLETED", "CANCELLED"].map((status) => <option key={status} value={status}>{status.charAt(0) + status.slice(1).toLowerCase()}</option>)}
            </select></label>
            <button type="button" disabled={!loaded || requestsSaving || requestsRefreshing} onClick={() => void refreshCareRequests()} style={{ padding: "8px 12px" }}>{requestsRefreshing ? "Refreshing…" : "Refresh latest requests"}</button>
          </div>
          {careRequests.filter((request) => requestFilter === "ALL" || (requestFilter === "OPEN" ? !["COMPLETED", "CANCELLED"].includes(request.status) : request.status === requestFilter)).map((request) => (
            <CareRequestEditor key={request.id} request={request} disabled={requestsRefreshing} onSavingChange={requestSavingChanged} onSaved={(updated) => {
              setCareRequests((current) => current.map((item) => item.id === updated.id ? updated : item));
              setNotice(`Request ${updated.id} saved as ${careRequestStatusLabel(updated.status)}. The patient can see the saved stage in their care requests.`);
            }} />
          ))}
          {loaded && !careRequests.some((request) => requestFilter === "ALL" || (requestFilter === "OPEN" ? !["COMPLETED", "CANCELLED"].includes(request.status) : request.status === requestFilter)) && <p>No patient care requests in this selection.</p>}
        </section>

        <section id="appointments" style={{ marginTop: 20, background: "white", border: "1px solid #e2e8f0", borderRadius: 22, padding: 22, scrollMarginTop: 24 }}>
          <h2>Appointment operations</h2>
          <p style={{ color: "#64748b", fontSize: 13 }}>Latest {appointments.length} appointments shown, up to 100. Appointment and consultation statuses are managed separately from patient care requests.</p>
          <div style={{ display: "grid", gap: 8 }}>
            {appointments.map((appointment) => (
              <div key={appointment.id} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, padding: 13, borderTop: "1px solid #eef2f7" }}>
                <span>{patientName(appointment.patient)} · {appointment.patient.country}</span>
                <span>{appointment.doctor.name} · {appointment.doctor.specialty.name}</span>
                <span>{new Date(appointment.scheduledAt).toLocaleString()}</span>
                <b>{appointment.consultation?.status ?? appointment.status}</b>
              </div>
            ))}
            {loaded && !appointments.length && <p>No appointments.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
