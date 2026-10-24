"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getCurrentUser } from "../../lib/api";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
type Ticket = { id: string; userId: string; category: string; message: string; status: string; priority: string; slaDueAt: string | null; escalatedAt: string | null; isOverdue?: boolean; createdAt: string; user: { id: string; email: string; role: string } };
type SupportMessage = { id: string; message: string; createdAt: string; author: { id: string; role: string } };

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [thread, setThread] = useState<SupportMessage[]>([]);
  const [reply, setReply] = useState("");
  const [status, setStatus] = useState("OPEN");
  const [priority, setPriority] = useState("NORMAL");
  const [escalated, setEscalated] = useState(false);
  const [queueFilter, setQueueFilter] = useState("ALL");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const session = await getCurrentUser();
    if (session.user.role !== "ADMIN") throw new Error("Administrator access required.");
    const query = new URLSearchParams({ limit: "100" });
    if (queueFilter === "OVERDUE") query.set("overdue", "true");
    if (queueFilter === "ESCALATED") query.set("escalated", "true");
    const r = await fetch(API + "/v1/admin/support/tickets?" + query.toString(), { credentials: "include", cache: "no-store" });
    if (!r.ok) throw new Error("Unable to load support queue.");
    const rows: Ticket[] = await r.json();
    const now = Date.now();
    setTickets(rows.map(t => ({ ...t, isOverdue: Boolean(t.slaDueAt && new Date(t.slaDueAt).getTime() < now && !["RESOLVED", "CLOSED"].includes(t.status)) })));
    setSelected((current) => current ? (rows.find((ticket) => ticket.id === current.id) ?? null) : null);
  }, [queueFilter]);
  async function openTicket(ticket: Ticket) {
    setSelected(ticket); setStatus(ticket.status); setPriority(ticket.priority ?? "NORMAL"); setEscalated(Boolean(ticket.escalatedAt)); setError("");
    const r = await fetch(API + "/v1/support/tickets/" + ticket.id + "/messages", { credentials: "include" });
    if (!r.ok) { setError("Unable to load this conversation."); return; }
    setThread(await r.json());
  }
  useEffect(() => { const timer = window.setTimeout(() => { void load().catch(e => setError(e instanceof Error ? e.message : "Unable to load support queue.")); }, 0); return () => window.clearTimeout(timer); }, [load]);
  async function sendReply() {
    if (!selected || !reply.trim()) return;
    setBusy(true); setError("");
    try {
      const r = await fetch(API + "/v1/support/tickets/" + selected.id + "/messages", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: reply }) });
      if (!r.ok) throw new Error("Unable to send support reply.");
      setReply("");
      await openTicket(selected);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to send support reply."); }
    finally { setBusy(false); }
  }
  async function updateStatus() {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      const r = await fetch(API + "/v1/admin/support/tickets/" + selected.id, { method: "PATCH", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ status, priority, escalated }) });
      if (!r.ok) throw new Error("Unable to update request status.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to update request."); }
    finally { setBusy(false); }
  }
  const panel = { background: "white", border: "1px solid #e2e8f0", borderRadius: 22, padding: 22 } as const;
  return <main style={{ minHeight: "100vh", background: "#f7f9fc", padding: "40px 22px", color: "#172334", fontFamily: "Inter,system-ui,sans-serif" }}>
    <div style={{ maxWidth: 1200, margin: "auto" }}><Link href="/dashboard" style={{ color: "#1672b8" }}>← Operations center</Link>
      <p style={{ color: "#64748b", fontSize: 12, fontWeight: 800, letterSpacing: ".12em", marginTop: 26 }}>CAREBRIDGE · ADMIN SUPPORT</p>
      <h1 style={{ fontSize: 40, margin: "8px 0" }}>Support conversations</h1><p style={{ color: "#64748b" }}>Review incoming requests, reply securely and update the request status.</p>
      {error && <div role="alert" style={{ padding: 14, background: "#fff7ed", borderRadius: 12, marginTop: 14 }}>{error}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 20, marginTop: 24 }}>
        <section style={panel}><h2>Request queue</h2><label style={{ display: "grid", gap: 6, marginBottom: 12, fontWeight: 700 }}>Filter queue<select value={queueFilter} onChange={e => setQueueFilter(e.target.value)} style={{ padding: 10, border: "1px solid #cbd5e1", borderRadius: 10 }}><option value="ALL">All requests</option><option value="OVERDUE">SLA overdue</option><option value="ESCALATED">Escalated</option></select></label>{!tickets.length ? <p>No support requests match this filter.</p> : tickets.map(t => <button key={t.id} onClick={() => void openTicket(t)} style={{ display: "block", width: "100%", textAlign: "left", padding: 14, border: 0, borderTop: "1px solid #eef2f7", background: selected?.id === t.id ? "#f0f7fc" : "white", cursor: "pointer" }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><b>{t.category}</b><span>{t.status}</span></div><p style={{ margin: "8px 0" }}>{t.message}</p><small style={{ display: "block", color: t.isOverdue ? "#b91c1c" : "#64748b" }}>Priority: {t.priority ?? "NORMAL"} · SLA due: {t.slaDueAt ? new Date(t.slaDueAt).toLocaleString() : "Not set"}{t.escalatedAt ? " · ESCALATED" : ""}</small><small style={{ color: "#64748b" }}>{t.user.email} · {t.user.role}</small></button>)}</section>
        <section style={{ ...panel, minHeight: 440, display: "flex", flexDirection: "column" }}><h2>{selected ? selected.category + " · Conversation" : "Select a request"}</h2>
          {!selected ? <p style={{ color: "#64748b" }}>Choose a request to review its thread and respond.</p> : <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10, marginBottom: 12 }}><label style={{ display: "grid", gap: 5, fontWeight: 700 }}>Status<select value={status} onChange={e => setStatus(e.target.value)} style={{ padding: 10, borderRadius: 10, border: "1px solid #cbd5e1" }}><option>OPEN</option><option>IN_PROGRESS</option><option>RESOLVED</option><option>CLOSED</option></select></label><label style={{ display: "grid", gap: 5, fontWeight: 700 }}>Priority<select value={priority} onChange={e => setPriority(e.target.value)} style={{ padding: 10, borderRadius: 10, border: "1px solid #cbd5e1" }}><option>LOW</option><option>NORMAL</option><option>HIGH</option></select></label></div><label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}><input type="checkbox" checked={escalated} onChange={e => setEscalated(e.target.checked)} /> Escalate for additional review</label><button disabled={busy || (status === selected.status && priority === (selected.priority ?? "NORMAL") && escalated === Boolean(selected.escalatedAt))} onClick={() => void updateStatus()} style={{ padding: "10px 13px", borderRadius: 10, border: "1px solid #cbd5e1", background: "white" }}>Save support settings</button>
            <div aria-live="polite" style={{ display: "grid", gap: 12, alignContent: "start", flex: 1, margin: "8px 0 18px" }}><div style={{ padding: 14, borderRadius: 14, background: "#f1f5f9" }}><b>{selected.user.email} · Original request</b><p style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>{selected.message}</p></div>{thread.map(m => <div key={m.id} style={{ padding: 14, borderRadius: 14, background: m.author.role === "ADMIN" ? "#eaf5ff" : "#f8fafc" }}><b>{m.author.role === "ADMIN" ? "CareBridge Support" : selected.user.email}</b><p style={{ whiteSpace: "pre-wrap", margin: "8px 0" }}>{m.message}</p><small style={{ color: "#64748b" }}>{new Date(m.createdAt).toLocaleString()}</small></div>)}</div>
            <label style={{ display: "grid", gap: 7, fontWeight: 700 }}>Reply<textarea value={reply} onChange={e => setReply(e.target.value)} rows={3} maxLength={5000} placeholder="Write a response..." style={{ padding: 12, border: "1px solid #cbd5e1", borderRadius: 12 }} /></label><button disabled={busy || !reply.trim()} onClick={() => void sendReply()} style={{ alignSelf: "start", marginTop: 12, padding: "12px 16px", border: 0, borderRadius: 12, background: "#1672b8", color: "white", fontWeight: 800 }}>Send reply</button>
          </>}
        </section>
      </div>
    </div>
  </main>;
}
