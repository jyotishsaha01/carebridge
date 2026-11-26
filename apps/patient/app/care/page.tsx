"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { API_URL, apiFetch } from "../../lib/api";
import { SessionChangedError } from "../../lib/session-binding";
import styles from "./care.module.css";

type Task = { id: string; title: string; description?: string | null; dueAt?: string | null; status: string };
type Plan = { id: string; title: string; description?: string | null; status: string; tasks: Task[] };
type Request = { id: string; type: string; title: string; description?: string | null; status: string; country?: string | null; targetDate?: string | null; createdAt: string; updatedAt?: string };

const requestStages: Record<string, { label: string; description: string }> = {
  REQUESTED: { label: "Requested", description: "Your request has been received and is waiting for the care team to review it." },
  REVIEWING: { label: "Under review", description: "The care team is reviewing your request and may contact you for more information." },
  APPROVED: { label: "Approved", description: "The care team has approved the coordination request. Contact the team to confirm the next steps." },
  SCHEDULED: { label: "Scheduled", description: "The care team has recorded a schedule for this request. Check Appointments for any confirmed consultation booking." },
  COMPLETED: { label: "Completed", description: "The care team has marked the coordination request as completed." },
  CANCELLED: { label: "Cancelled", description: "This coordination request has been cancelled. Contact the care team if you still need support." },
};

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function CarePage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [type, setType] = useState("COORDINATION");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [country, setCountry] = useState("US");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [updatingTask, setUpdatingTask] = useState<string | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  const activeLoad = useRef<AbortController | null>(null);
  const submitting = useRef(false);

  const load = useCallback(async () => {
    const view = lifetime.current;
    if (!view || view.signal.aborted) return false;
    activeLoad.current?.abort();
    const controller = new AbortController();
    activeLoad.current = controller;
    const signal = AbortSignal.any([view.signal, controller.signal]);
    setRefreshing(true);
    try {
      const [planData, requestData] = await Promise.all([
        apiFetch<Plan[]>("/v1/patient/care-plans", { signal }), apiFetch<Request[]>("/v1/patient/care-requests", { signal }),
      ]);
      if (signal.aborted) return false;
      setPlans(planData); setRequests(requestData); setLoadError("");
      return true;
    } catch (cause) {
      if (!signal.aborted && !(cause instanceof SessionChangedError)) setLoadError(cause instanceof Error ? cause.message : "Unable to load your care hub. Please try again.");
      return false;
    } finally {
      if (!signal.aborted) { setLoading(false); setRefreshing(false); }
      if (activeLoad.current === controller) activeLoad.current = null;
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    const refreshVisible = () => { if (document.visibilityState === "visible") void load(); };
    // A notification refreshes saved data without replacing the request form draft.
    // The private route has already verified the patient; a failed initial data
    // request must not stop a recovered notification connection from refreshing it.
    const stream = new EventSource(`${API_URL}/v1/notifications/stream`, { withCredentials: true });
    stream.addEventListener("notification", refreshVisible);
    stream.addEventListener("ready", refreshVisible);
    void load();
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    // Notifications may be disabled or temporarily unavailable; visible trackers still catch up.
    const timer = window.setInterval(() => { if (!activeLoad.current) refreshVisible(); }, 30_000);
    return () => {
      controller.abort(); activeLoad.current?.abort(); stream.close();
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
      if (lifetime.current === controller) lifetime.current = null;
    };
  }, [load]);

  async function createRequest(event: FormEvent) {
    event.preventDefault();
    if (title.trim().length < 3 || submitting.current) return;
    const signal = lifetime.current?.signal;
    if (!signal || signal.aborted) return;
    submitting.current = true;
    setBusy(true); setError(""); setMessage("");
    try {
      await apiFetch("/v1/patient/care-requests", { method: "POST", signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ type, title: title.trim(), description: description.trim() || undefined, country: country.trim() || undefined }) });
      if (signal.aborted) return;
      setTitle(""); setDescription(""); setMessage("Request submitted. Our care team can review it from here.");
      await load();
    } catch (cause) { if (!signal.aborted) setError(cause instanceof Error ? cause.message : "We could not submit the request. Please try again."); }
    finally { submitting.current = false; if (!signal.aborted) setBusy(false); }
  }

  async function updateTask(planId: string, task: Task) {
    const signal = lifetime.current?.signal;
    if (!signal || signal.aborted || updatingTask) return;
    const next = task.status === "DONE" ? "TODO" : "DONE";
    setUpdatingTask(task.id); setError("");
    try { await apiFetch(`/v1/patient/care-plans/${encodeURIComponent(planId)}/tasks/${encodeURIComponent(task.id)}`, { method: "PATCH", signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ status: next }) }); if (!signal.aborted) await load(); }
    catch (cause) { if (!signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to update this task. Please try again."); }
    finally { if (!signal.aborted) setUpdatingTask(null); }
  }

  return (
    <main className={styles.page}>
      <div className={styles.glow} />
      <header className={styles.header}>
        <div><span className={styles.eyebrow}>CareBridge Care Hub</span><h1>Your care, beyond the consultation.</h1><p>Keep treatment coordination, follow-ups, medications and procedure requests in one calm place.</p></div>
        <div className={styles.actions}><button type="button" onClick={() => void load()} className={styles.back} disabled={refreshing || busy || updatingTask !== null}>{refreshing ? "Refreshing…" : "Refresh care hub"}</button><a href="/dashboard" className={styles.back}>Dashboard</a></div>
      </header>
      {error && <div className={styles.message} role="alert">{error}</div>}
      {loadError && <div className={styles.message} role="alert">{loadError} <button className={styles.back} onClick={() => void load()} disabled={refreshing}>Try again</button></div>}
      {loading && <p role="status">Loading your care hub…</p>}

      <section className={styles.grid}>
        <article className={styles.heroCard}>
          <div className={styles.icon}>✦</div><div><span className={styles.kicker}>CARE COORDINATION</span><h2>Need more than a consultation?</h2><p>Tell CareBridge what you need next. A care coordinator can review diagnostic, medication, procedure, surgery or coordination requests.</p></div>
          <form onSubmit={createRequest} className={styles.form}>
            <label>What do you need?<select disabled={busy} value={type} onChange={(e) => setType(e.target.value)}><option value="COORDINATION">Care coordination</option><option value="DIAGNOSTIC">Diagnostic support</option><option value="MEDICATION">Medication support</option><option value="PROCEDURE">Procedure planning</option><option value="SURGERY">Surgery planning</option></select></label>
            <label>Request title<input disabled={busy} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Help me understand surgery options" minLength={3} maxLength={160} required /></label>
            <div className={styles.field}><label htmlFor="care-request-details">Details</label><textarea id="care-request-details" disabled={busy} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Share what you would like the care team to help with." maxLength={2000} /></div>
            <label>Preferred country<input disabled={busy} value={country} onChange={(e) => setCountry(e.target.value)} maxLength={80} /></label>
            <button type="submit" disabled={busy || loading || title.trim().length < 3}>{busy ? "Submitting request…" : "Start a care request"} <span>→</span></button>
            {message && <p className={styles.message} role="status">{message}</p>}
          </form>
        </article>

        <article className={styles.card}><div className={styles.cardHead}><div><span className={styles.kicker}>YOUR PLAN</span><h2>Care plans</h2></div><span className={styles.count}>{plans.length}</span></div>
          {plans.length === 0 ? !loading && !loadError && <div className={styles.empty}>Your care plan will appear here after your clinician or care team creates one.</div> : plans.map((plan) => <div className={styles.plan} key={plan.id}><div className={styles.planTitle}><strong>{plan.title}</strong><span>{plan.status}</span></div>{plan.description && <p>{plan.description}</p>}{plan.tasks.map((task) => <button className={`${styles.task} ${task.status === "DONE" ? styles.done : ""}`} key={task.id} disabled={updatingTask !== null} aria-pressed={task.status === "DONE"} onClick={() => updateTask(plan.id, task)}><span>{task.status === "DONE" ? "✓" : "○"}</span><span>{task.title}</span>{task.dueAt && <small>{new Date(task.dueAt).toLocaleDateString()}</small>}</button>)}</div>)}
        </article>
      </section>

      <section className={`${styles.card} ${styles.tracker}`} aria-label="Care request tracker"><div className={styles.cardHead}><div><span className={styles.kicker}>REQUEST TRACKER</span><h2>Care requests</h2></div><span className={styles.count}>{requests.length}</span></div>
        <p className={styles.guidance}>Stages track your care coordinator&apos;s progress. Appointment bookings and clinical care plans are managed separately. Saved updates appear here automatically while this page is open; you can also refresh at any time.</p>
        {requests.length === 0 ? !loading && !loadError && <div className={styles.empty}>No care requests yet.</div> : <div className={styles.requests}>{requests.map((item) => {
          const stage = requestStages[item.status];
          return <article className={styles.request} key={item.id} aria-label={`Care request: ${item.title}`}><div className={styles.requestBody}><strong>{item.title}</strong><p>{item.type.replaceAll("_", " ")} {item.country ? `· ${item.country}` : ""}</p>{item.description && <p className={styles.details}>{item.description}</p>}<p className={styles.stageDescription}>{stage?.description ?? "Contact the care team for details about this request."}</p><small className={styles.reference}>Reference: {item.id}</small><small className={styles.updated}>Updated <time dateTime={item.updatedAt ?? item.createdAt}>{formatDate(item.updatedAt ?? item.createdAt)}</time>{item.targetDate && <> · Target date: <time dateTime={item.targetDate}>{formatDate(item.targetDate)}</time></>}</small></div><span className={styles.status}>{stage?.label ?? item.status.replaceAll("_", " ")}</span></article>;
        })}</div>}
      </section>
    </main>
  );
}
