"use client";

import { useRef, useState } from "react";
import { updateCareRequestStatus, type AdminCareRequest, type AdminCareRequestStatus } from "../lib/api";
import styles from "./care-request-editor.module.css";

export const careRequestStatuses: AdminCareRequestStatus[] = ["REQUESTED", "REVIEWING", "APPROVED", "SCHEDULED", "COMPLETED", "CANCELLED"];
export function careRequestStatusLabel(status: AdminCareRequestStatus) {
  return status === "CANCELLED" ? "Cancelled / declined" : status.charAt(0) + status.slice(1).toLowerCase();
}

export default function CareRequestEditor({ request, onSaved, disabled = false, onSavingChange }: {
  request: AdminCareRequest;
  onSaved: (updated: AdminCareRequest) => void;
  disabled?: boolean;
  onSavingChange?: (requestId: string, saving: boolean) => void;
}) {
  const [draft, setDraft] = useState<{ value: AdminCareRequestStatus; version: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const saveInProgress = useRef(false);
  const version = `${request.updatedAt}:${request.status}`;
  const status = draft?.version === version ? draft.value : request.status;
  const changed = status !== request.status;
  const label = `${request.title} (${request.id})`;
  const patientName = [request.patient.firstName, request.patient.lastName].filter(Boolean).join(" ") || "Patient";

  async function save() {
    if (saveInProgress.current || disabled || !changed) return;
    saveInProgress.current = true;
    setSaving(true);
    onSavingChange?.(request.id, true);
    setError("");
    setNotice("");
    try {
      const updated = await updateCareRequestStatus(request.id, status, { expectedStatus: request.status, expectedUpdatedAt: request.updatedAt });
      onSaved(updated);
      setDraft(null);
      setNotice(`Saved: ${careRequestStatusLabel(updated.status)}. The patient can see this status in their care requests.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save this care request. Try again.");
    } finally {
      saveInProgress.current = false;
      setSaving(false);
      onSavingChange?.(request.id, false);
    }
  }

  return <article id={`care-request-${request.id}`} className={styles.request} aria-label={`Care request ${request.id}`}>
    <div className={styles.details}>
      <h3>{request.title}</h3>
      <p>{request.type.replaceAll("_", " ")} · {patientName} · {request.patient.country}</p>
      <p className={styles.identifier}>Request ID: {request.id} · Patient ID: {request.patient.id}</p>
      {request.description && <p className={styles.description}>{request.description}</p>}
      {request.country && <p>Requested care country: {request.country}</p>}
      {request.targetDate && <p>Target date: {new Date(request.targetDate).toLocaleDateString()}</p>}
      <p>Submitted: {new Date(request.createdAt).toLocaleString()} · Updated: {new Date(request.updatedAt).toLocaleString()}</p>
      <p>Saved status: <strong>{careRequestStatusLabel(request.status)}</strong></p>
    </div>
    <div className={styles.editor}>
      <label htmlFor={`care-request-status-${request.id}`}>Request status</label>
      <select id={`care-request-status-${request.id}`} aria-label={`Status for ${label}`} value={status} disabled={saving || disabled} onChange={(event) => {
        setDraft({ value: event.target.value as AdminCareRequestStatus, version });
        setNotice("");
        setError("");
      }}>
        {careRequestStatuses.map((value) => <option key={value} value={value}>{careRequestStatusLabel(value)}</option>)}
      </select>
      {changed && <span className={styles.unsaved}>Unsaved change</span>}
      <div className={styles.actions}>
        <button type="button" disabled={!changed || saving || disabled} aria-label={`Save status for ${label}`} onClick={() => void save()}>{saving ? "Saving…" : "Save status"}</button>
        {changed && <button type="button" className={styles.reset} disabled={saving || disabled} onClick={() => { setDraft(null); setError(""); setNotice(""); }}>Reset</button>}
      </div>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {notice && <p role="status" className={styles.success}>{notice}</p>}
    </div>
  </article>;
}
