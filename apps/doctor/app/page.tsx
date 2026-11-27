"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, jsonRequest } from "../lib/request";
import { prepareMedicalDownload } from "../lib/medical-document";

type Medication = { medication: string; dose: string | null; frequency: string | null; duration: string | null; route: string | null; instructions: string | null };
type Prescription = { instructions: string | null; items: Medication[] };
type ClinicalNote = { id: string; assessment: string | null; findings: string | null; recommendations: string | null; createdAt: string };
type FollowUp = { id: string; dueAt: string | null; instructions: string | null; status: string };
type Consultation = { id: string; status: string; summary: string | null; notes?: ClinicalNote[]; prescription?: Prescription | null; followUps?: FollowUp[] };
type Appointment = {
  id: string; scheduledAt: string; status: string;
  patient: { firstName: string | null; lastName: string | null; country: string };
  medicalIntake: { reasonForVisit: string | null; symptoms: string | null; allergies: string | null; medications: string | null } | null;
  documents: { id: string; originalFileName: string; sizeBytes: number }[];
  consultation: Consultation | null;
};
type ClinicalRecord={consultation:Consultation|null;notes:ClinicalNote[];prescription:Prescription|null;followUps:FollowUp[]};
type Draft = { summary: string; assessment: string; findings: string; recommendations: string; items: Medication[]; prescriptionInstructions: string; followDue: string; followInstructions: string };
const emptyMedication: Medication = { medication: "", dose: "", frequency: "", duration: "", route: "", instructions: "" };
const emptyDraft: Draft = { summary: "", assessment: "", findings: "", recommendations: "", items: [{ ...emptyMedication }], prescriptionInstructions: "", followDue: "", followInstructions: "" };
function initialDraft(appointment: Appointment): Draft {
  const note=appointment.consultation?.notes?.[0];
  return { ...emptyDraft, assessment:note?.assessment??"",findings:note?.findings??"",recommendations:note?.recommendations??"",summary: appointment.consultation?.summary ?? "", prescriptionInstructions: appointment.consultation?.prescription?.instructions ?? "", items: appointment.consultation?.prescription?.items.length ? appointment.consultation.prescription.items.map(item => ({ ...item })) : [{ ...emptyMedication }] };
}
function rebaseDraft(previous:Draft,saved:Draft,current:Draft):Draft {
  const comparable=(value:unknown)=>JSON.stringify(value,(_key,item)=>item===null?"":typeof item==="string"?item.trim():item);
  return Object.fromEntries((Object.keys(saved) as (keyof Draft)[]).map(key=>[key,comparable(current[key])===comparable(previous[key])?saved[key]:current[key]])) as Draft;
}
const patientName = (appointment: Appointment) => [appointment.patient.firstName, appointment.patient.lastName].filter(Boolean).join(" ") || "Patient";

export default function DoctorPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedId, setSelectedId] = useState("");
  // Keep each patient's unsaved fields separate, including when the queue selection changes.
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const actionLock=useRef(false);
  const downloadRequest = useRef<AbortController | null>(null);
  const appointmentLoad=useRef<AbortController|null>(null);
  const appointmentSnapshot=useRef<Appointment[]>([]);
  useEffect(()=>{appointmentSnapshot.current=appointments;},[appointments]);
  useEffect(() => {
    const cancel = () => { downloadRequest.current?.abort(); downloadRequest.current = null; };
    window.addEventListener("blur", cancel);
    return () => { cancel(); appointmentLoad.current?.abort(); window.removeEventListener("blur", cancel); };
  }, []);
  const selected = appointments.find(appointment => appointment.id === selectedId);
  const draft = selected ? drafts[selected.id] ?? initialDraft(selected) : emptyDraft;

  const load=useCallback(async () => {
    if(actionLock.current)return;
    const previousAppointments=new Map(appointmentSnapshot.current.map(appointment=>[appointment.id,appointment]));
    appointmentLoad.current?.abort();const controller=new AbortController();appointmentLoad.current=controller;
    setLoading(true); setError("");
    try {
      const rows = await apiFetch<Appointment[]>("/v1/doctor/appointments",{signal:controller.signal});
      if(controller.signal.aborted)return;
      setDrafts(current=>Object.fromEntries(rows.filter(row=>current[row.id]).map(row=>{const previous=previousAppointments.get(row.id);return [row.id,previous?rebaseDraft(initialDraft(previous),initialDraft(row),current[row.id]):initialDraft(row)];})));
      setAppointments(rows);
      const requestedId=new URLSearchParams(window.location.search).get("appointmentId");
      setSelectedId(current => rows.some(row => row.id === current) ? current : requestedId&&rows.some(row=>row.id===requestedId)?requestedId:rows[0]?.id??"");
    } catch (cause) { if(!controller.signal.aborted)setError(cause instanceof Error ? cause.message : "Unable to load appointments."); }
    finally { if(!controller.signal.aborted)setLoading(false);if(appointmentLoad.current===controller)appointmentLoad.current=null; }
  },[]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  function update(field: Exclude<keyof Draft, "items">, value: string) {
    if (selected) setDrafts(current => ({ ...current, [selected.id]: { ...draft, [field]: value } }));
  }
  function updateMedication(index: number, field: keyof Medication, value: string) {
    if (selected) setDrafts(current => ({ ...current, [selected.id]: { ...draft, items: draft.items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item) } }));
  }
  function setMedications(items: Medication[]) {
    if (selected) setDrafts(current => ({ ...current, [selected.id]: { ...draft, items } }));
  }
  async function perform(action: () => Promise<void>, success: string) {
    if (actionLock.current) return;
    actionLock.current=true;setBusy(true); setError(""); setMessage("");
    try { await action(); setMessage(success); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save. Please try again."); }
    finally { actionLock.current=false;setBusy(false); }
  }
  function changeConsultation(status: "IN_PROGRESS" | "COMPLETED") {
    if (!selected) return;
    if (status === "COMPLETED") {
      const saved = initialDraft(selected);
      const medicationValues = (items: Medication[]) => items.map(item => [item.medication, item.dose, item.frequency, item.duration, item.route, item.instructions].map(value => (value ?? "").trim()));
      const prescriptionChanged = JSON.stringify(medicationValues(draft.items)) !== JSON.stringify(medicationValues(saved.items)) || draft.prescriptionInstructions.trim() !== saved.prescriptionInstructions.trim();
      const noteChanged=(["assessment","findings","recommendations"] as const).some(field=>draft[field].trim()!==saved[field].trim());
      if (noteChanged || [draft.followDue,draft.followInstructions].some(value=>value.trim()) || prescriptionChanged) {
        setError("Save or clear your clinical note, prescription and follow-up edits before completing this consultation.");
        return;
      }
    }
    void perform(async () => {
      const consultation = await apiFetch<Consultation>(`/v1/doctor/appointments/${encodeURIComponent(selected.id)}/consultation`, jsonRequest("PUT", { status, summary: draft.summary || null }));
      setAppointments(current => current.map(appointment => appointment.id === selected.id ? { ...appointment, consultation: { ...appointment.consultation, ...consultation } } : appointment));
    }, status === "IN_PROGRESS" ? "Consultation started." : "Consultation completed.");
  }
  function saveNote() {
    if (!selected?.consultation) return;
    void perform(async () => {
      const note = await apiFetch<ClinicalNote>(`/v1/doctor/consultations/${encodeURIComponent(selected.consultation!.id)}/note`, jsonRequest("PUT", { assessment: draft.assessment, findings: draft.findings, recommendations: draft.recommendations }));
      setAppointments(current => current.map(appointment => appointment.id === selected.id && appointment.consultation ? { ...appointment, consultation: { ...appointment.consultation, notes: [note, ...(appointment.consultation.notes ?? []).filter(previous=>previous.id!==note.id)].slice(0, 10) } } : appointment));
      setDrafts(current => ({ ...current, [selected.id]: { ...draft, assessment: note.assessment??"", findings: note.findings??"", recommendations: note.recommendations??"" } }));
    }, "Clinical note saved to the record.");
  }
  function savePrescription() {
    if (!selected?.consultation || !draft.items.length || draft.items.some(item => !item.medication.trim())) return;
    void perform(async () => {
      const prescription = await apiFetch<Prescription>(`/v1/doctor/consultations/${encodeURIComponent(selected.consultation!.id)}/prescription`, jsonRequest("PUT", { instructions: draft.prescriptionInstructions || null, items: draft.items.map(item => ({ ...item, medication: item.medication.trim() })) }));
      setAppointments(current => current.map(appointment => appointment.id === selected.id && appointment.consultation ? { ...appointment, consultation: { ...appointment.consultation, prescription } } : appointment));
      setDrafts(current=>({...current,[selected.id]:{...draft,items:prescription.items.map(item=>({...item})),prescriptionInstructions:prescription.instructions??""}}));
    }, "Prescription saved to this consultation.");
  }
  function saveFollowUp() {
    if (!selected?.consultation || !draft.followDue) return;
    void perform(async () => {
      const dueAt = new Date(`${draft.followDue}T12:00:00`);
      if (!Number.isFinite(dueAt.getTime()) || dueAt.getTime() <= Date.now()) throw new Error("Choose a future follow-up date.");
      const followUp = await apiFetch<FollowUp>(`/v1/doctor/consultations/${encodeURIComponent(selected.consultation!.id)}/follow-up`, jsonRequest("POST", { dueAt: dueAt.toISOString(), instructions: draft.followInstructions || null, status: "RECOMMENDED" }));
      setAppointments(current => current.map(appointment => appointment.id === selected.id && appointment.consultation ? { ...appointment, consultation: { ...appointment.consultation, followUps: [followUp, ...(appointment.consultation.followUps ?? [])] } } : appointment));
      setDrafts(current => ({ ...current, [selected.id]: { ...draft, followDue: "", followInstructions: "" } }));
    }, "Follow-up added.");
  }
  function openDocument(id: string) {
    if (busy||actionLock.current) return;
    const controller = new AbortController(); downloadRequest.current = controller;
    void perform(async () => {
      const document = await apiFetch<{ contentBase64: string; contentType: string; originalFileName?: string }>(`/v1/doctor/documents/${encodeURIComponent(id)}/content`, { signal: controller.signal });
      if (controller.signal.aborted) throw new Error("The document download was cancelled. Please try again.");
      const prepared = prepareMedicalDownload(document);
      const url = URL.createObjectURL(prepared.blob);
      // Download rather than execute a patient-supplied document in the app's origin.
      const anchor = window.document.createElement("a");
      anchor.href = url; anchor.download = prepared.fileName;
      anchor.click(); downloadRequest.current = null; setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }, "Document downloaded.");
  }
  function refreshClinicalRecord(){
    if(!selected)return;
    void perform(async()=>{
      const record=await apiFetch<ClinicalRecord>(`/v1/doctor/appointments/${encodeURIComponent(selected.id)}/clinical-record`);
      const refreshed={...selected,consultation:record.consultation?{...record.consultation,notes:record.notes,prescription:record.prescription,followUps:record.followUps}:null};
      setDrafts(current=>current[selected.id]?{...current,[selected.id]:rebaseDraft(initialDraft(selected),initialDraft(refreshed),current[selected.id])}:current);
      setAppointments(current=>current.map(appointment=>appointment.id===selected.id?refreshed:appointment));
    },"Saved clinical record refreshed. Unsaved fields remain with this appointment.");
  }
  const canWrite=selected?.consultation?.status==="IN_PROGRESS";
  const canPrescribe=selected?.consultation&&["IN_PROGRESS","COMPLETED"].includes(selected.consultation.status);
  const completed=selected?.consultation?.status==="COMPLETED";
  return <div className="shell"><header className="topbar"><div><div className="brand">CareBridge</div><div className="role">Doctor Workspace</div></div><Link href="/dashboard" style={{ color: "inherit" }}>Dashboard</Link></header>
    <main className="content"><div className="eyebrow">Provider operations</div><h1>Today&apos;s care</h1><p className="subtitle">Review intake, run the consultation, and complete the clinical record. Save your entries before leaving this page.</p><button disabled={busy||loading} onClick={()=>void load()}>Refresh appointment queue</button>
      {error && <div role="alert" className="note">{error} <button disabled={busy} onClick={() => void load()}>Refresh appointments</button></div>}
      {message && <p role="status" className="note">{message}</p>}
      {loading ? <p role="status">Loading appointments…</p> : !appointments.length ? <section className="card"><h2>{error ? "Appointment data unavailable" : "No appointments yet"}</h2><p>{error ? "Refresh appointments to try again." : "Booked consultations will appear here."}</p><Link href="/operations">Manage availability</Link></section> : <div className="grid"><section className="card"><h2>Appointment queue</h2><div className="queue">{appointments.map(appointment => <button key={appointment.id} disabled={busy} aria-pressed={appointment.id === selectedId} className={`queueItem ${appointment.id === selectedId ? "active" : ""}`} onClick={() => { setSelectedId(appointment.id); setMessage(""); setError(""); }}><div className="row"><span className="patient">{patientName(appointment)}</span><span className="badge">{appointment.consultation?.status ?? appointment.status}</span></div><div className="meta">{new Date(appointment.scheduledAt).toLocaleString()} · {appointment.patient.country}</div></button>)}</div></section>
        {selected && <section className="card detail"><h2>{patientName(selected)}</h2><div className="meta">Appointment {selected.id}</div><button disabled={busy} onClick={refreshClinicalRecord}>Refresh saved record</button><div className="section"><h3>Medical intake</h3>{selected.medicalIntake ? <div className="note"><strong>{selected.medicalIntake.reasonForVisit || "Reason not provided"}</strong><br/>Symptoms: {selected.medicalIntake.symptoms || "Not provided"}<br/>Allergies: {selected.medicalIntake.allergies || "Not provided"}<br/>Medications: {selected.medicalIntake.medications || "Not provided"}</div> : <p>Medical intake has not been completed.</p>}</div>
          <div className="section"><h3>Medical documents</h3>{selected.documents.length ? selected.documents.map(document => <button key={document.id} disabled={busy} className="documentLink" onClick={() => openDocument(document.id)}>{document.originalFileName} · {Math.max(1, Math.round(document.sizeBytes / 1024))} KB</button>) : <p>No patient documents shared yet.</p>}</div>
          <fieldset disabled={busy || selected.consultation?.status === "CANCELLED" || selected.status === "CANCELLED"} className="clinical-fields"><legend>Consultation record</legend>
            <label className="label">Consultation summary<textarea disabled={completed} maxLength={10000} value={draft.summary} onChange={event => update("summary", event.target.value)}/></label>
            <div className="actions"><button className="button" disabled={completed||selected.consultation?.status === "IN_PROGRESS"} onClick={() => changeConsultation("IN_PROGRESS")}>Start consultation</button><button className="button secondary" disabled={!canWrite} onClick={() => changeConsultation("COMPLETED")}>Complete consultation</button></div>
            <fieldset disabled={!canWrite} className="clinical-fields"><legend>Clinical assessment</legend>{(["assessment", "findings", "recommendations"] as const).map(field => <label className="label" key={field}>{field[0].toUpperCase() + field.slice(1)}<textarea maxLength={10000} value={draft[field]} onChange={event => update(field, event.target.value)}/></label>)}<button className="button" disabled={![draft.assessment, draft.findings, draft.recommendations].some(value => value.trim())} onClick={saveNote}>Save clinical note</button></fieldset>
            <fieldset disabled={!canPrescribe} className="clinical-fields"><legend>Prescription</legend><p className="meta">Review all medications before saving. Saving updates the complete prescription for this consultation.</p>
              {draft.items.map((item, index) => <fieldset key={index} className="clinical-fields"><legend>Medication {index + 1}</legend>{(["medication", "dose", "frequency", "duration", "route", "instructions"] as const).map(field => <label key={field} className="label">{field[0].toUpperCase() + field.slice(1)} {index + 1}<input maxLength={field === "medication" ? 300 : field === "instructions" ? 1000 : field === "route" ? 100 : 200} value={item[field] ?? ""} onChange={event => updateMedication(index, field, event.target.value)}/></label>)}<button disabled={draft.items.length === 1} onClick={() => setMedications(draft.items.filter((_, itemIndex) => itemIndex !== index))}>Remove medication {index + 1}</button></fieldset>)}
              <div className="actions"><button disabled={draft.items.length >= 25} onClick={() => setMedications([...draft.items, { ...emptyMedication }])}>Add medication</button></div>
              <label className="label section">Prescription instructions<textarea maxLength={5000} value={draft.prescriptionInstructions} onChange={event => update("prescriptionInstructions", event.target.value)}/></label>
              <button className="button" disabled={!draft.items.length || draft.items.some(item => !item.medication.trim())} onClick={savePrescription}>Save prescription</button>
            </fieldset>
            <fieldset disabled={!canPrescribe} className="clinical-fields"><legend>Follow-up</legend><label className="label">Due date<input type="date" value={draft.followDue} onChange={event => update("followDue", event.target.value)}/></label><label className="label">Instructions<textarea maxLength={5000} value={draft.followInstructions} onChange={event => update("followInstructions", event.target.value)}/></label><button className="button secondary" disabled={!draft.followDue} onClick={saveFollowUp}>Add follow-up</button></fieldset>
          </fieldset>
          {!!selected.consultation?.notes?.length && <section className="section"><h3>Saved clinical notes</h3>{selected.consultation.notes.map(note => <article className="note" key={note.id}><p className="meta">{new Date(note.createdAt).toLocaleString()}</p>{note.assessment && <p><strong>Assessment:</strong> {note.assessment}</p>}{note.findings && <p><strong>Findings:</strong> {note.findings}</p>}{note.recommendations && <p><strong>Recommendations:</strong> {note.recommendations}</p>}</article>)}</section>}
          {!!selected.consultation?.followUps?.length && <section className="section"><h3>Recommended follow-ups</h3>{selected.consultation.followUps.map(followUp => <article className="note" key={followUp.id}><strong>{followUp.dueAt ? new Date(followUp.dueAt).toLocaleDateString() : "Date not specified"} · {followUp.status}</strong><p>{followUp.instructions || "No additional instructions."}</p></article>)}</section>}
          {busy && <p role="status">Saving…</p>}
        </section>}
      </div>}
    </main>
  </div>;
}
