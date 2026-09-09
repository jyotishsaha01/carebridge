"use client";

import { useEffect, useState } from "react";
import { getAuditLogs, getDoctors, getOverview, verifyDoctor, type AdminDoctor, type AuditLog, type Overview } from "../lib/api";

export default function AdminHome() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [doctors, setDoctors] = useState<AdminDoctor[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setError("");
    try {
      const [nextOverview, nextDoctors, nextLogs] = await Promise.all([getOverview(), getDoctors(), getAuditLogs()]);
      setOverview(nextOverview);
      setDoctors(nextDoctors);
      setLogs(nextLogs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load admin data. Sign in with an admin account.");
    }
  }

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, []);

  async function toggleVerification(doctor: AdminDoctor) {
    setBusy(doctor.id);
    try {
      await verifyDoctor(doctor.id, !doctor.isVerified);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification update failed.");
    } finally {
      setBusy(null);
    }
  }

  const metrics = [
    ["Patients", overview?.patients ?? "—"],
    ["Doctors", overview?.doctors ?? "—"],
    ["Verified", overview?.verifiedDoctors ?? "—"],
    ["Appointments", overview?.appointments ?? "—"],
    ["Active sessions", overview?.openSessions ?? "—"],
  ];

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand"><span className="mark">C</span><span>CareBridge Operations</span></div>
        <span className="badge">Admin-only workspace</span>
      </header>

      <div className="content">
        <section className="hero">
          <div><div className="eyebrow">OPERATIONS CONTROL CENTER</div><h1>Run care with confidence.</h1></div>
          <p>Monitor the network, review provider verification and inspect security events from one focused operations surface.</p>
        </section>

        {error && <div className="card message">{error}</div>}

        <section className="grid" aria-label="Operational metrics">
          {metrics.map(([label, value]) => <article className="card metric" key={label as string}><span>{label}</span><strong>{value}</strong></article>)}
        </section>

        <section className="card panel">
          <div className="panel-head"><div><h2>Doctor verification</h2><div className="panel-sub">Provider activation stays explicit and auditable.</div></div><button className="action secondary" onClick={() => void load()}>Refresh</button></div>
          <div className="rows">
            {doctors.map((doctor) => <div className="row" key={doctor.id}>
              <div><strong>{doctor.name}</strong><br /><span>{doctor.specialty.name} · {doctor.location}</span></div>
              <span>{doctor.status}</span>
              <span>{doctor.isActive ? "Active" : "Inactive"}</span>
              <button className="action" disabled={busy === doctor.id} onClick={() => void toggleVerification(doctor)}>{busy === doctor.id ? "Saving…" : doctor.isVerified ? "Suspend verification" : "Verify doctor"}</button>
            </div>)}
            {!doctors.length && !error && <div className="empty">No provider records are available.</div>}
          </div>
        </section>

        <section className="card panel">
          <div className="panel-head"><div><h2>Security audit trail</h2><div className="panel-sub">Recent authentication and administrative events.</div></div></div>
          <div className="rows">
            {logs.map((log) => <div className="row" key={log.id}><div><strong>{log.action}</strong><br /><span>{log.resourceType}{log.resourceId ? ` · ${log.resourceId}` : ""}</span></div><span>{log.outcome}</span><span>{new Date(log.createdAt).toLocaleString()}</span><span>{log.actorUserId ? "Authenticated" : "System"}</span></div>)}
            {!logs.length && !error && <div className="empty">No recent audit events.</div>}
          </div>
        </section>
      </div>
    </main>
  );
}
