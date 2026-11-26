"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getAuditLogs, getDoctors, getOverview, verifyDoctor, type AdminDoctor, type AuditLog, type Overview } from "../lib/api";

export default function AdminHome() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [doctors, setDoctors] = useState<AdminDoctor[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  async function load() { setLoading(true); setError(""); try { const [nextOverview, nextDoctors, nextLogs] = await Promise.all([getOverview(), getDoctors(), getAuditLogs()]); setOverview(nextOverview); setDoctors(nextDoctors); setLogs(nextLogs); } catch (e) { setError(e instanceof Error ? e.message : "Unable to load admin data. Sign in with an admin account."); } finally { setLoading(false); } }
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, []);
  async function toggleVerification(doctor: AdminDoctor) {
    if (busy) return;
    setBusy(doctor.id); setError(""); setNotice("");
    try {
      await verifyDoctor(doctor.id, !doctor.isVerified);
      setNotice(doctor.isVerified ? `${doctor.name} is no longer active or verified in patient search.` : `${doctor.name} is now active and verified in patient search.`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Verification update failed."); }
    finally { setBusy(null); }
  }
  const metrics = [
    { label: "Patients", value: overview?.patients ?? "—", href: "/operations#patients", hint: "View patient accounts" },
    { label: "Doctors", value: overview?.doctors ?? "—", href: "/operations#doctors", hint: "Review provider profiles" },
    { label: "Verified", value: overview?.verifiedDoctors ?? "—", href: "/operations#verified-doctors", hint: "View active verified doctors" },
    { label: "Appointments", value: overview?.appointments ?? "—", href: "/operations#appointments", hint: "Inspect appointments" },
    { label: "Active sessions", value: overview?.openSessions ?? "—", href: "/operations#sessions", hint: "Inspect account sign-ins" },
  ];
  return <main className="shell"><header className="topbar"><div className="brand"><span className="mark">C</span><span>CareBridge Operations</span></div><div className="nav"><Link href="/analytics">Command center</Link><span className="badge">Admin-only workspace</span></div></header><div className="content"><section className="hero"><div><div className="eyebrow">OPERATIONS CONTROL CENTER</div><h1>Run care with confidence.</h1></div><p>Monitor the network, review provider verification and inspect security events from one focused operations surface.</p></section>{error && <div role="alert" className="card message">{error}</div>}{notice && <div role="status" className="card message">{notice}</div>}<section className="grid" aria-label="Operational metrics">{metrics.map((metric)=><Link className="card metric" key={metric.label} href={metric.href} style={{color:"inherit",textDecoration:"none"}}><span>{metric.label}</span><strong>{metric.value}</strong><span>{metric.hint} →</span></Link>)}</section><section className="card panel"><div className="panel-head"><div><h2>Doctor verification</h2><div className="panel-sub">Provider activation stays explicit and auditable.</div></div><button className="action secondary" disabled={loading || Boolean(busy)} onClick={() => void load()}>{loading ? "Refreshing…" : "Refresh"}</button></div><div className="rows">{doctors.map((doctor)=><div className="row" key={doctor.id}><div><strong>{doctor.name}</strong><br/><span>{doctor.specialty.name} · {doctor.location}</span></div><span>{doctor.status}</span><span>{doctor.isActive ? "Active" : "Inactive"}</span><div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}><Link className="action secondary" style={{textDecoration:"none"}} href={`/operations?doctor=${encodeURIComponent(doctor.id)}#doctors`}>Review credentials</Link><button className="action" disabled={Boolean(busy) || loading} onClick={()=>void toggleVerification(doctor)}>{busy===doctor.id?"Saving…":doctor.isVerified?"Suspend verification":"Verify doctor"}</button></div></div>)}{loading&&<p role="status">Loading providers…</p>}{!loading&&!doctors.length&&!error&&<div className="empty">No provider records are available.</div>}</div></section><section className="card panel"><div className="panel-head"><div><h2>Security audit trail</h2><div className="panel-sub">Latest 40 authentication and administrative events.</div></div><Link href="/analytics/details?view=audits" className="action secondary" style={{textDecoration:"none"}}>Inspect events →</Link></div><div className="rows">{logs.map(log=><div className="row" key={log.id}><div><strong>{log.action}</strong><br/><span>{log.resourceType}{log.resourceId?` · ${log.resourceId}`:""}</span></div><span>{log.outcome}</span><span>{new Date(log.createdAt).toLocaleString()}</span><span>{log.actorUserId?"Authenticated":"System"}</span></div>)}{loading&&<p role="status">Loading audit events…</p>}{!loading&&!logs.length&&!error&&<div className="empty">No recent audit events.</div>}</div></section></div></main>;
}
