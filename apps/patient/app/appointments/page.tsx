"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "../../lib/api";

type Appointment = { id: string; scheduledAt: string; durationMin: number; status: string; doctor: { id: string; name: string; slug: string; specialty: { name: string } }; consultation: { id: string; status: string } | null };
type PageData = { appointments: Appointment[]; total: number; limit: number; offset: number };
const limit = 20;
const button = { padding: "10px 14px", border: "1px solid #cbd5e1", borderRadius: 10, background: "white", color: "#1672b8", textDecoration: "none", display: "inline-block" } as const;
export default function AppointmentsPage() { return <Suspense fallback={<main className="system-state"><p role="status">Loading appointments…</p></main>}><Appointments /></Suspense>; }

function Appointments() {
  const params = useSearchParams();
  const view = params.get("view") === "upcoming" ? "upcoming" : "all";
  const requestedPage = Number(params.get("page") ?? 0);
  const page = Number.isSafeInteger(requestedPage) && requestedPage >= 0 && requestedPage <= 50_000 ? requestedPage : 0;
  const key = `${view}:${page}`;
  const [result, setResult] = useState<{ key: string; data: PageData } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const activeLoad = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    if (!mounted.current) return;
    activeLoad.current?.abort(); const controller = new AbortController(); activeLoad.current = controller;
    const version = ++generation.current; setRefreshing(true);
    try {
      const data = await apiFetch<PageData>(`/v1/patient/appointments?view=${view}&limit=${limit}&offset=${page * limit}`, { signal: controller.signal });
      if (!controller.signal.aborted && version === generation.current) { setResult({ key, data }); setError(null); }
    } catch (cause) { if (!controller.signal.aborted && version === generation.current) setError({ key, message: cause instanceof Error ? cause.message : "Unable to load appointments." }); }
    finally { if (!controller.signal.aborted && version === generation.current) setRefreshing(false); }
  }, [key, page, view]);
  useEffect(() => {
    mounted.current = true; const timer = window.setTimeout(() => void load(), 0);
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("focus", refresh);
    return () => { mounted.current = false; window.clearTimeout(timer); activeLoad.current?.abort(); window.removeEventListener("focus", refresh); };
  }, [load]);
  const data = result?.key === key ? result.data : null;
  const message = error?.key === key ? error.message : "";
  const loading = refreshing || (!data && !message);
  const pageLink = (nextPage: number) => `/appointments?view=${view}&page=${nextPage}`;
  return <main style={{ maxWidth: 1100, margin: "auto", padding: "44px 24px", color: "#172334", fontFamily: "Inter,system-ui,sans-serif" }}>
    <p style={{ color: "#64748b", fontSize: 12, fontWeight: 800 }}>CAREBRIDGE · APPOINTMENTS</p><h1>Your appointments</h1>
    <p style={{ color: "#64748b" }}>Open a booking to review its questionnaire, payment and available appointment actions.</p>
    <nav aria-label="Appointment views" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <Link style={{ ...button, ...(view === "upcoming" ? { background: "#eaf5ff", fontWeight: 800 } : {}) }} href="/appointments?view=upcoming" aria-current={view === "upcoming" ? "page" : undefined}>Upcoming appointments</Link>
      <Link style={{ ...button, ...(view === "all" ? { background: "#eaf5ff", fontWeight: 800 } : {}) }} href="/appointments?view=all" aria-current={view === "all" ? "page" : undefined}>All appointments</Link>
      <button style={button} disabled={loading} onClick={() => void load()}>{loading ? "Refreshing…" : "Refresh appointments"}</button>
      <Link style={button} href="/dashboard">Dashboard</Link>
    </nav>
    {message && <p role="alert" style={{ padding: 16, borderRadius: 12, background: "#fff7ed", color: "#9a3412" }}>{message} <button disabled={loading} onClick={() => void load()}>Try again</button></p>}
    {loading && <p role="status">Loading appointments…</p>}
    {data && <>
      <p>{data.appointments.length} shown of {data.total} {view === "upcoming" ? "upcoming appointments" : "appointments"}.</p>
      <section aria-label="Appointment records" style={{ display: "grid", gap: 12, margin: "20px 0" }}>{data.appointments.map(appointment => <article key={appointment.id} style={{ padding: 20, border: "1px solid #e2e8f0", borderRadius: 18, overflowWrap: "anywhere" }}>
        <h2 style={{ fontSize: 20, marginTop: 0 }}>{appointment.doctor.name}</h2><p>{appointment.doctor.specialty.name} · {new Date(appointment.scheduledAt).toLocaleString()} · {appointment.durationMin} minutes</p>
        <p>Appointment: <b>{appointment.status.replaceAll("_", " ")}</b>{appointment.consultation && <> · Consultation: <b>{appointment.consultation.status.replaceAll("_", " ")}</b></>}</p>
        <Link href={`/appointments/${encodeURIComponent(appointment.id)}`} style={button}>Open appointment →</Link>
      </article>)}</section>
      {!loading && !message && data.appointments.length === 0 && <p>{view === "upcoming" ? "No upcoming appointments." : "No appointments on this page."} <Link href="/#specialists">Find a specialist</Link></p>}
      <nav aria-label="Appointment pages" style={{ display: "flex", gap: 16, alignItems: "center" }}>
        {page > 0 ? <Link style={button} href={pageLink(page - 1)}>Previous page</Link> : <button style={button} disabled>Previous page</button>}
        <span>Page {page + 1}</span>
        {(page + 1) * limit < data.total ? <Link style={button} href={pageLink(page + 1)}>Next page</Link> : <button style={button} disabled>Next page</button>}
      </nav>
    </>}
  </main>;
}
