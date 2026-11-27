"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import CareRequestEditor, { careRequestStatusLabel } from "../../components/care-request-editor";
import { getAnalyticsOverview, getCareRequests, type AdminCareRequest, type AnalyticsOverview } from "../../lib/api";
import styles from "./analytics.module.css";

const openStatuses = ["REQUESTED", "REVIEWING", "APPROVED", "SCHEDULED"] as const;
const isOpen = (request: AdminCareRequest) => openStatuses.some((status) => status === request.status);

export default function AnalyticsPage() {
  return <Suspense fallback={<main className={styles.page}><p role="status">Loading command center…</p></main>}><CommandCenter /></Suspense>;
}

function CommandCenter() {
  const searchParams = useSearchParams();
  const openOnly = searchParams.get("requestStatus") === "OPEN";
  const [metrics, setMetrics] = useState<AnalyticsOverview | null>(null);
  const [requests, setRequests] = useState<AdminCareRequest[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingIds, setSavingIds] = useState<string[]>([]);
  const [deferredRefresh, setDeferredRefresh] = useState(0);
  const savingIdsRef = useRef(new Set<string>());
  const refreshAfterSave = useRef(false);
  const loadVersion = useRef(0);
  const metricVersion = useRef(0);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (savingIdsRef.current.size > 0) { refreshAfterSave.current = true; return; }
    const version = ++loadVersion.current;
    const overviewVersion = ++metricVersion.current;
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const [overview, groups] = await Promise.all([
        getAnalyticsOverview(),
        openOnly ? Promise.all(openStatuses.map((status) => getCareRequests(status))) : Promise.all([getCareRequests()]),
      ]);
      if (signal?.aborted || version !== loadVersion.current) return;
      if (overviewVersion === metricVersion.current) setMetrics(overview);
      const byId = new Map<string, AdminCareRequest>();
      for (const row of groups.flat()) {
        const previous = byId.get(row.id);
        if (!previous || Date.parse(row.updatedAt) >= Date.parse(previous.updatedAt)) byId.set(row.id, row);
      }
      setRequests([...byId.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)));
    } catch (cause) {
      if (!signal?.aborted && version === loadVersion.current) setError(cause instanceof Error ? cause.message : "Unable to load analytics.");
    } finally {
      if (!signal?.aborted && version === loadVersion.current) setLoading(false);
    }
  }, [openOnly]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [load, deferredRefresh]);

  function saved(updated: AdminCareRequest) {
    setRequests((current) => current.map((request) => request.id === updated.id ? updated : request));
    setNotice(`Request ${updated.id} saved as ${careRequestStatusLabel(updated.status)}. The patient can see this status in their care requests.`);
    const overviewVersion = ++metricVersion.current;
    void getAnalyticsOverview().then((overview) => { if (overviewVersion === metricVersion.current) setMetrics(overview); }).catch((cause) => {
      if (overviewVersion === metricVersion.current) setError(`Status saved. Metrics could not be refreshed: ${cause instanceof Error ? cause.message : "Try Refresh latest."}`);
    });
  }

  const cards = metrics ? [
    { label: "Patients", value: metrics.patients, href: "/operations#patients", hint: "Patient accounts" },
    { label: "Doctors", value: metrics.doctors, href: "/operations#doctors", hint: "All provider profiles" },
    { label: "Verified doctors", value: metrics.verifiedDoctors, href: "/operations#verified-doctors", hint: "Active verified profiles" },
    { label: "Appointments", value: metrics.appointments, href: "/operations#appointments", hint: "Booking activity" },
    { label: "Consultations", value: metrics.consultations, href: "/analytics/details?view=consultations", hint: "Inspect consultation activity" },
    { label: "Completed", value: metrics.completedConsultations, href: "/analytics/details?view=completed", hint: "Inspect completed consultations" },
    { label: "Open care requests", value: metrics.careRequests, href: "/analytics?requestStatus=OPEN#incoming-requests", hint: "All requests still in progress" },
    { label: "Your unread alerts", value: metrics.unreadNotifications, href: "/notifications", hint: "Open your notification inbox" },
    { label: "Audit events/24h", value: metrics.recentAuditEvents, href: "/analytics/details?view=audits", hint: "Recent security events" },
    { label: "Completion rate", value: `${metrics.consultationCompletionRate}%`, href: "/analytics/details?view=completion-rate", hint: "View calculation and activity" },
  ] : [];
  const visibleRequests = openOnly ? requests.filter(isOpen) : requests;

  return <main className={styles.page}><div className={styles.wrap}>
    <header><div><span>CareBridge Operations</span><h1>Command center</h1><p>Monitor care demand, completion and operational workload without exposing unnecessary clinical detail.</p></div><Link href="/">← Admin</Link></header>
    {error && <div role="alert" className={styles.notice}>{error}</div>}
    {notice && <div role="status" className={styles.notice}>{notice}</div>}
    <section className={styles.metrics} aria-label="Command center metrics">
      {cards.map((card) => <Link href={card.href} className={styles.metric} key={card.label} onNavigate={(event) => { if (card.href.startsWith("/analytics?") && savingIdsRef.current.size > 0) event.preventDefault(); }}><span>{card.label}</span><strong>{card.value}</strong><small>{card.hint} →</small></Link>)}
    </section>
    <section className={styles.panel} id="incoming-requests" aria-labelledby="requests-heading">
      <div className={styles.head}><div><span>CARE COORDINATION</span><h2 id="requests-heading">Incoming requests</h2></div><button type="button" className={styles.button} disabled={loading || savingIds.length > 0} onClick={() => void load()}>{loading ? "Refreshing…" : "Refresh latest"}</button></div>
      <nav className={styles.filters} aria-label="Care request filters"><Link href="/analytics#incoming-requests" aria-current={!openOnly ? "page" : undefined} onNavigate={(event) => { if (savingIdsRef.current.size > 0) event.preventDefault(); }}>All requests</Link><Link href="/analytics?requestStatus=OPEN#incoming-requests" aria-current={openOnly ? "page" : undefined} onNavigate={(event) => { if (savingIdsRef.current.size > 0) event.preventDefault(); }}>Open requests</Link></nav>
      <p className={styles.helper}>{openOnly ? "Open means Requested, Reviewing, Approved or Scheduled. Showing up to 100 latest requests per open status." : "Showing the latest 100 care requests across all statuses."} {metrics && `${visibleRequests.length} shown.`}</p>
      <p className={styles.helper}>Choose a status, then Save status. These updates coordinate care; they do not create appointments, prescriptions or clinical approvals. Refresh latest reloads saved data and discards drafts for changed requests.</p>
      {loading && <p role="status">Loading requests…</p>}
      {!loading && !error && visibleRequests.length === 0 && <p className={styles.empty}>{openOnly ? "No open care requests." : "No care requests."}</p>}
      {visibleRequests.map((request) => <CareRequestEditor key={request.id} request={request} disabled={loading} onSaved={saved} onSavingChange={(id, saving) => {
        if (saving) savingIdsRef.current.add(id); else savingIdsRef.current.delete(id);
        setSavingIds([...savingIdsRef.current]);
        if (!saving && savingIdsRef.current.size === 0 && refreshAfterSave.current) {
          refreshAfterSave.current = false;
          setDeferredRefresh((current) => current + 1);
        }
      }} />)}
    </section>
  </div></main>;
}
