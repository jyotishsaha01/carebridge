"use client";

import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
type Ticket = { id: string; category: string; message: string; status: string; createdAt: string; updatedAt?: string };
type SupportMessage = { id: string; ticketId: string; userId: string; message: string; createdAt: string; author: { id: string; role: string } };

export default function SupportPage() {
  const cats = ["Care request", "Medical document", "Account & privacy", "Technical issue", "Other"];
  const [category, setCategory] = useState(cats[0]);
  const [message, setMessage] = useState("");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [thread, setThread] = useState<SupportMessage[]>([]);
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await fetch(API + "/v1/support/tickets", { credentials: "include" });
    if (!r.ok) { setError("Sign in to manage support requests."); return; }
    setTickets(await r.json());
  }
  async function openTicket(ticket: Ticket) {
    setSelected(ticket); setError("");
    const r = await fetch(API + "/v1/support/tickets/" + ticket.id + "/messages", { credentials: "include" });
    if (!r.ok) { setError("Unable to load this conversation."); return; }
    setThread(await r.json());
  }
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, []);
  async function submit() {
    setError(""); setBusy(true);
    try {
      const r = await fetch(API + "/v1/support/tickets", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ category, message }) });
      if (!r.ok) { setError("Unable to send your request."); return; }
      setMessage(""); setSent(true); await load();
    } finally { setBusy(false); }
  }
  async function sendReply() {
    if (!selected || !reply.trim()) return;
    setBusy(true); setError("");
    try {
      const r = await fetch(API + "/v1/support/tickets/" + selected.id + "/messages", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: reply }) });
      if (!r.ok) { setError("Unable to send your reply."); return; }
      setReply(""); await openTicket(selected); await load();
    } finally { setBusy(false); }
  }
  const panel = { background: "white", border: "1px solid #e2e8f0", borderRadius: 24, padding: 24 } as const;
  return <main style={{ maxWidth: 1100, margin: "auto", padding: "42px 22px", fontFamily: "Inter,system-ui,sans-serif", color: "#172334" }}>
    <p style={{ color: "#64748b", fontWeight: 800, letterSpacing: ".12em", fontSize: 12 }}>CAREBRIDGE · SUPPORT</p>
    <h1 style={{ fontSize: 40, margin: "8px 0" }}>How can we help?</h1>
    <p style={{ color: "#64748b" }}>Create a request and continue the conversation securely from your account.</p>
    {error && <div role="alert" style={{ marginTop: 18, padding: 14, borderRadius: 14, background: "#fff7ed" }}>{error}</div>}
    {sent && <div style={{ marginTop: 18, padding: 14, borderRadius: 14, background: "#ecfdf5", color: "#166534" }}>Request received. Track its status below.</div>}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 20, marginTop: 24 }}>
      <div style={{ display: "grid", gap: 20, alignContent: "start" }}>
        <section style={panel}><h2>New request</h2>
          <label style={{ display: "grid", gap: 7, fontWeight: 700 }}>Topic<select value={category} onChange={e => setCategory(e.target.value)} style={{ padding: 12, border: "1px solid #cbd5e1", borderRadius: 12 }}>{cats.map(x => <option key={x}>{x}</option>)}</select></label>
          <label style={{ display: "grid", gap: 7, fontWeight: 700, marginTop: 14 }}>Message<textarea value={message} onChange={e => setMessage(e.target.value)} rows={5} maxLength={5000} placeholder="Tell us what you need help with..." style={{ padding: 12, border: "1px solid #cbd5e1", borderRadius: 12 }} /></label>
          <button disabled={busy || message.trim().length < 5} onClick={() => void submit()} style={{ marginTop: 14, padding: "12px 16px", border: 0, borderRadius: 12, background: "#1672b8", color: "white", fontWeight: 800 }}>Send request</button>
        </section>
        <section style={panel}><h2>Your requests</h2>
          {!tickets.length ? <p style={{ color: "#64748b" }}>No support requests yet.</p> : tickets.map(t => <button key={t.id} onClick={() => void openTicket(t)} style={{ display: "block", width: "100%", textAlign: "left", padding: "14px 0", border: 0, borderTop: "1px solid #eef2f7", background: selected?.id === t.id ? "#f0f7fc" : "white", color: "#172334", cursor: "pointer" }}><div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><b>{t.category}</b><span style={{ fontSize: 12, fontWeight: 800 }}>{t.status}</span></div><p style={{ margin: "7px 0", color: "#64748b" }}>{t.message}</p><small style={{ color: "#94a3b8" }}>{new Date(t.createdAt).toLocaleString()}</small></button>)}
        </section>
      </div>
      <section style={{ ...panel, minHeight: 440, display: "flex", flexDirection: "column" }}>
        <h2>{selected ? "Conversation · " + selected.category : "Support conversation"}</h2>
        {!selected ? <p style={{ color: "#64748b" }}>Select a request to read replies and send a message to the support team.</p> : <>
          <p style={{ color: "#64748b", fontSize: 13 }}>Status: <b>{selected.status}</b></p>
          <div aria-live="polite" style={{ display: "grid", gap: 12, alignContent: "start", flex: 1, margin: "12px 0 20px" }}>
            <div style={{ padding: 14, borderRadius: 14, background: "#f1f5f9" }}><b>You · original request</b><p style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>{selected.message}</p></div>
            {thread.map(m => <div key={m.id} style={{ padding: 14, borderRadius: 14, background: m.author.role === "ADMIN" ? "#eaf5ff" : "#f8fafc" }}><b>{m.author.role === "ADMIN" ? "CareBridge Support" : "You"}</b><p style={{ whiteSpace: "pre-wrap", margin: "8px 0" }}>{m.message}</p><small style={{ color: "#64748b" }}>{new Date(m.createdAt).toLocaleString()}</small></div>)}
            {!thread.length && <p style={{ color: "#64748b" }}>No replies yet. You can send a follow-up below.</p>}
          </div>
          <label style={{ display: "grid", gap: 7, fontWeight: 700 }}>Reply<textarea value={reply} onChange={e => setReply(e.target.value)} rows={3} maxLength={5000} placeholder="Write a reply..." style={{ padding: 12, border: "1px solid #cbd5e1", borderRadius: 12 }} /></label>
          <button disabled={busy || !reply.trim()} onClick={() => void sendReply()} style={{ alignSelf: "start", marginTop: 12, padding: "12px 16px", border: 0, borderRadius: 12, background: "#1672b8", color: "white", fontWeight: 800 }}>Send reply</button>
        </>}
      </section>
    </div>
  </main>;
}
