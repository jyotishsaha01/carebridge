"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getCareRequests, getCurrentUser, getDoctors, getOverview, getSupportTickets, type AdminCareRequest, type AdminDoctor, type AdminSupportTicket, type Overview } from "../../lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
function Bell() { return <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>; }
const panel = { background: "white", border: "1px solid #e2e8f0", borderRadius: 20, padding: 22 } as const;
const muted = { color: "#718096" } as const;

export default function AdminDashboard() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [doctors, setDoctors] = useState<AdminDoctor[]>([]);
  const [careRequests, setCareRequests] = useState<AdminCareRequest[]>([]);
  const [tickets, setTickets] = useState<AdminSupportTicket[]>([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let stream: EventSource | null = null;
    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError("");
        try {
          const session = await getCurrentUser();
          if (session.user.role !== "ADMIN") throw new Error("Sign in with an admin account to view operations.");
          const [counts, doctorRows, requestRows, ticketRows, notificationResponse] = await Promise.all([
            getOverview(), getDoctors(), getCareRequests(), getSupportTickets(20),
            fetch(API_URL + "/v1/notifications?limit=1", { credentials: "include", cache: "no-store" }),
          ]);
          if (cancelled) return;
          setOverview(counts);
          setDoctors(doctorRows.filter((doctor) => !doctor.isVerified || !doctor.isActive));
          setCareRequests(requestRows.filter((item) => item.status === "REQUESTED" || item.status === "REVIEWING").slice(0, 6));
          setTickets(ticketRows.filter((ticket) => ticket.status === "OPEN" || ticket.status === "IN_PROGRESS").slice(0, 6));
          if (notificationResponse.ok) {
            const notifications = await notificationResponse.json();
            if (!cancelled) setUnread(Number(notifications.unreadCount) || 0);
          }
          if (!cancelled) {
            stream = new EventSource(API_URL + "/v1/notifications/stream", { withCredentials: true });
            stream.addEventListener("notification", () => setUnread((count) => count + 1));
          }
        } catch (cause) {
          if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load admin operations.");
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); stream?.close(); };
  }, [refreshKey]);

  const metrics = overview ? [
    { label: "Patients", value: overview.patients, href: "/operations#patients", hint: "View patient accounts" },
    { label: "Doctors", value: overview.doctors, href: "/operations#doctors", hint: "Review provider profiles" },
    { label: "Verified doctors", value: overview.verifiedDoctors, href: "/operations#verified-doctors", hint: "View approved providers" },
    { label: "Appointments", value: overview.appointments, href: "/operations#appointments", hint: "Monitor bookings" },
    { label: "Active sessions", value: overview.openSessions, href: "/operations#sessions", hint: "Inspect signed-in accounts" },
    { label: "Patient requests", value: overview.pendingCareRequests, href: "/operations#patient-requests", hint: "Review care requests" },
  ] : [];

  return <main style={{ minHeight: "100vh", background: "#f7f9fc", padding: "clamp(18px,4vw,44px) 22px", fontFamily: "Inter,system-ui,sans-serif", color: "#172334" }}>
    <div style={{ maxWidth: 1220, margin: "auto", display: "grid", gap: 22 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div><p style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".12em", color: "#64748b", margin: "0 0 8px" }}>CAREBRIDGE · ADMIN OPERATIONS</p><h1 style={{ fontSize: "clamp(32px,5vw,44px)", margin: 0, letterSpacing: "-.04em" }}>Operations center</h1><p style={{ ...muted, fontSize: 16, marginBottom: 0 }}>Review provider licenses, patient care requests, appointments and support activity.</p></div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}><button onClick={() => setRefreshKey((value) => value + 1)} disabled={loading} style={{ border: "1px solid #dfe8f0", background: "white", color: "#1672b8", borderRadius: 12, padding: "11px 14px", fontWeight: 700 }}>{loading ? "Refreshing…" : "Refresh"}</button><Link href="/notifications" aria-label="Notifications" title="Notifications" style={{ position: "relative", display: "grid", placeItems: "center", width: 44, height: 44, borderRadius: "50%", background: "white", border: "1px solid #dfe8f0", color: "#1672b8" }}><Bell />{unread > 0 && <span style={{ position: "absolute", right: -3, top: -3, minWidth: 18, height: 18, borderRadius: 99, background: "#d84d45", color: "white", fontSize: 9, fontWeight: 800, display: "grid", placeItems: "center" }}>{unread > 99 ? "99+" : unread}</span>}</Link></div>
      </header>
      <nav aria-label="Admin work areas" style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
        {[[ "/operations#doctors", "Doctor approvals" ], [ "/operations#patient-requests", "Patient requests" ], [ "/operations#patients", "Patient accounts" ], [ "/operations#appointments", "Appointments" ], [ "/support", "Support inbox" ]].map(([href,label]) => <Link key={href} href={href} style={{ color: "#1672b8", background: "white", border: "1px solid #dfe8f0", borderRadius: 11, padding: "10px 13px", textDecoration: "none", fontWeight: 700 }}>{label}</Link>)}
      </nav>
      {error && <div role="alert" style={{ padding: 15, background: "#fff7ed", color: "#9a3412", borderRadius: 14, border: "1px solid #fed7aa" }}>{error} <button onClick={() => setRefreshKey((value) => value + 1)} style={{ marginLeft: 10, background: "transparent", border: 0, textDecoration: "underline", fontWeight: 700, color: "inherit" }}>Retry</button></div>}
      {loading && <p role="status" style={muted}>Loading live operations…</p>}
      <section aria-label="Operational metrics" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(165px,1fr))", gap: 14 }}>
        {metrics.map((metric) => <Link key={metric.label} href={metric.href} style={{ ...panel, display: "block", color: "inherit", textDecoration: "none" }}><strong style={{ fontSize: 30, letterSpacing: "-.04em" }}>{metric.value}</strong><div style={{ marginTop: 5, fontWeight: 700 }}>{metric.label}</div><div style={{ marginTop: 12, fontSize: 12, color: "#1672b8", fontWeight: 700 }}>{metric.hint} →</div></Link>)}
        {!overview && !loading && !error && <p style={muted}>Metrics are not available yet.</p>}
      </section>
      <section style={panel}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}><h2 style={{ margin: 0 }}>Doctor license review</h2><Link href="/operations#doctors" style={{ color: "#1672b8", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>Open full review queue →</Link></div>
        {doctors.length === 0 ? <p style={muted}>No provider profiles need attention.</p> : doctors.map((doctor) => <div key={doctor.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "15px 0", borderTop: "1px solid #edf2f7" }}><div><b>{doctor.name}</b><div style={{ ...muted, marginTop: 4 }}>{doctor.specialty.name} · {doctor.location} · {doctor.status}</div></div><Link href={"/operations?doctor=" + encodeURIComponent(doctor.id) + "#doctors"} style={{ background: "#1672b8", color: "white", padding: "9px 12px", borderRadius: 10, textDecoration: "none", fontWeight: 700 }}>Review credentials</Link></div>)}
      </section>
      <section style={panel}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}><h2 style={{ margin: 0 }}>Patient care requests</h2><Link href="/operations#patient-requests" style={{ color: "#1672b8", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>Review all requests →</Link></div>
        {careRequests.length === 0 ? <p style={muted}>No new patient care requests.</p> : careRequests.map((request) => <div key={request.id} style={{ padding: "14px 0", borderTop: "1px solid #edf2f7" }}><div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><b>{request.title}</b><span style={{ color: "#1672b8", fontSize: 12, fontWeight: 800 }}>{request.status}</span></div><p style={{ ...muted, margin: "6px 0" }}>{request.type} · {[request.patient.firstName, request.patient.lastName].filter(Boolean).join(" ") || "Patient"} · {request.patient.country}</p><Link href="/operations#patient-requests" style={{ color: "#1672b8", fontWeight: 700, fontSize: 13, textDecoration: "none" }}>Open request queue →</Link></div>)}
      </section>
      <section style={panel}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}><h2 style={{ margin: 0 }}>Support queue</h2><Link href="/support" style={{ color: "#1672b8", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>Open support inbox →</Link></div>
        {tickets.length === 0 ? <p style={muted}>No open support requests.</p> : tickets.map((ticket) => <div key={ticket.id} style={{ padding: "14px 0", borderTop: "1px solid #edf2f7" }}><div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><b>{ticket.category}</b><span style={{ color: "#1672b8", fontSize: 12, fontWeight: 800 }}>{ticket.status}</span></div><p style={{ margin: "6px 0" }}>{ticket.message}</p><small style={muted}>{ticket.user.email}</small><div style={{ marginTop: 8 }}><Link href={"/support?ticket=" + encodeURIComponent(ticket.id)} style={{ color: "#1672b8", fontWeight: 700, fontSize: 13, textDecoration: "none" }}>Open conversation →</Link></div></div>)}
      </section>
    </div>
  </main>;
}
