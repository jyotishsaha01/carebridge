"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { getAnalyticsOverview, getAppointments, getAuditLogs, type AdminAppointment, type AnalyticsOverview, type AuditLog } from "../../../lib/api";
import styles from "../analytics.module.css";

export default function AnalyticsDetailsPage() {
  return <Suspense fallback={<main className={styles.page}><p role="status">Loading metric details…</p></main>}><MetricDetails /></Suspense>;
}

function MetricDetails() {
  const searchParams = useSearchParams();
  const requestedView = searchParams.get("view");
  const view = requestedView === "audits" || requestedView === "completed" || requestedView === "completion-rate" ? requestedView : "consultations";
  const [metrics, setMetrics] = useState<AnalyticsOverview | null>(null);
  const [appointments, setAppointments] = useState<AdminAppointment[]>([]);
  const [audits, setAudits] = useState<AuditLog[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [cutoff, setCutoff] = useState(0);
  const loadVersion = useRef(0);

  const load = useCallback(async (signal?: AbortSignal) => {
    const version = ++loadVersion.current;
    setLoading(true);
    setError("");
    try {
      const [overview, rows] = await Promise.all([getAnalyticsOverview(), view === "audits" ? getAuditLogs(100) : getAppointments()]);
      if (signal?.aborted || version !== loadVersion.current) return;
      setMetrics(overview);
      setCutoff(Date.now() - 24 * 60 * 60 * 1000);
      if (view === "audits") setAudits(rows as AuditLog[]);
      else setAppointments(rows as AdminAppointment[]);
    } catch (cause) {
      if (!signal?.aborted && version === loadVersion.current) setError(cause instanceof Error ? cause.message : "Unable to load metric details.");
    } finally {
      if (!signal?.aborted && version === loadVersion.current) setLoading(false);
    }
  }, [view]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 0);
    return () => { window.clearTimeout(timer); controller.abort(); loadVersion.current++; };
  }, [load]);

  const completedOnly = view === "completed" || view === "completion-rate";
  const consultations = appointments.filter((appointment) => appointment.consultation && (!completedOnly || appointment.consultation.status === "COMPLETED"));
  const recentAudits = audits.filter((event) => Date.parse(event.createdAt) >= cutoff);
  const title = view === "audits" ? "Audit events in the last 24 hours" : view === "completion-rate" ? "Consultation completion rate" : completedOnly ? "Completed consultations" : "Consultation activity";

  return <main className={styles.page}><div className={styles.wrap}>
    <header><div><span>CareBridge Operations · Metric details</span><h1>{title}</h1><p>Inspect operational records and the scope of the reported totals.</p></div><Link href="/analytics">← Command center</Link></header>
    <nav className={styles.filters} aria-label="Analytics detail views">
      {[["consultations", "Consultations"], ["completed", "Completed"], ["completion-rate", "Completion rate"], ["audits", "Audit events/24h"]].map(([key, label]) => <Link key={key} href={`/analytics/details?view=${key}`} aria-current={view === key ? "page" : undefined}>{label}</Link>)}
    </nav>
    {error && <div role="alert" className={styles.notice}>{error} Displayed data may be out of date.</div>}
    <section className={styles.panel} style={{ marginTop: 20 }} aria-label={title}>
      <div className={styles.head}><div><span>SERVER TOTALS</span><h2>{view === "audits" ? `${metrics?.recentAuditEvents ?? "—"} audit events / 24h` : view === "completion-rate" ? `${metrics?.consultationCompletionRate ?? "—"}% completed` : `${completedOnly ? metrics?.completedConsultations ?? "—" : metrics?.consultations ?? "—"} ${completedOnly ? "completed consultations" : "consultations"}`}</h2></div><button className={styles.button} disabled={loading} onClick={() => void load()}>{loading ? "Refreshing…" : "Refresh latest"}</button></div>
      {view === "audits" ? <p className={styles.helper}>The total counts every audit event recorded during the last 24 hours. Below are matching events from the latest 100 audit records; the list can omit older records when activity exceeds that limit.</p> : <>
        <div className={styles.breakdown}><div>All consultations<strong>{metrics?.consultations ?? "—"}</strong></div><div>Completed<strong>{metrics?.completedConsultations ?? "—"}</strong></div><div>Completion rate<strong>{metrics?.consultationCompletionRate ?? "—"}%</strong></div></div>
        <p className={styles.helper}>Completion rate = completed consultations ÷ all consultations × 100, rounded to a whole percent. With no consultations, the rate is 0%.</p>
        <p className={styles.helper}>The totals cover all consultations. Below are {completedOnly ? "completed consultations" : "consultations"} linked to the latest 100 appointments, ordered by scheduled time. This sample can omit older consultations.</p>
      </>}
      {loading ? <p role="status">Loading records…</p> : !metrics ? null : view === "audits" ? <>
        <p className={styles.helper}>{recentAudits.length} matching audit events shown.</p>
        {recentAudits.map((event) => <article className={styles.detailRow} key={event.id}><strong>{event.action} · {event.outcome}</strong><p>{event.resourceType}{event.resourceId ? ` · ${event.resourceId}` : ""}</p><p>{new Date(event.createdAt).toLocaleString()} · {event.actorUserId ? `Actor: ${event.actorUserId}` : "System event"}</p><p>Event ID: {event.id}</p></article>)}
        {!error && !recentAudits.length && <p className={styles.empty}>No matching audit events in this sample.</p>}
      </> : <>
        <p className={styles.helper}>{consultations.length} {completedOnly ? "completed consultations" : "consultations"} shown.</p>
        {consultations.map((appointment) => <article className={styles.detailRow} key={appointment.id}>
          <strong>{[appointment.patient.firstName, appointment.patient.lastName].filter(Boolean).join(" ") || "Patient"} · {appointment.doctor.name}</strong>
          <p>{appointment.patient.country} · {appointment.doctor.specialty.name}</p>
          <p>Consultation: {appointment.consultation!.status} · Appointment: {appointment.status}</p>
          <p>Scheduled: {new Date(appointment.scheduledAt).toLocaleString()}{appointment.consultation!.startedAt ? ` · Started: ${new Date(appointment.consultation!.startedAt).toLocaleString()}` : ""}{appointment.consultation!.endedAt ? ` · Ended: ${new Date(appointment.consultation!.endedAt).toLocaleString()}` : ""}</p>
          <p>Consultation ID: {appointment.consultation!.id} · Appointment ID: {appointment.id}</p>
          <Link href="/operations#appointments">Open appointment operations →</Link>
        </article>)}
        {!error && !consultations.length && <p className={styles.empty}>No {completedOnly ? "completed consultations" : "consultations"} in this appointment sample.</p>}
      </>}
    </section>
  </div></main>;
}
