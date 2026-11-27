"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL, apiFetch } from "../../lib/api";
type Ticket = { id: string; category: string; message: string; status: string; createdAt: string; updatedAt?: string };
type SupportMessage = { id: string; ticketId: string; userId: string; message: string; createdAt: string; author: { id: string; role: string } };

export default function SupportPage() {
  const cats = ["Care request", "Medical document", "Account & privacy", "Technical issue", "Other"];
  const [category, setCategory] = useState(cats[0]);
  const [message, setMessage] = useState("");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [thread, setThread] = useState<SupportMessage[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const reply = selected ? drafts[selected.id] ?? "" : "";
  const setReply = (value: string) => { if (selected) setDrafts(current => ({ ...current, [selected.id]: value })); };
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const threadRequest = useRef(0);
  const [loadError, setLoadError] = useState("");
  const [threadError, setThreadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const lifetime = useRef<AbortController | null>(null);
  const activeLoad = useRef<AbortController | null>(null);
  const selectedId = useRef("");
  const mutation = useRef(false);

  const load = useCallback(async () => {
    if (!lifetime.current || lifetime.current.signal.aborted) return;
    activeLoad.current?.abort(); const controller = new AbortController(); activeLoad.current = controller;
    const signal = AbortSignal.any([controller.signal, lifetime.current.signal]); setRefreshing(true);
    try {
      const rows = await apiFetch<Ticket[]>("/v1/support/tickets", { signal });
      if (signal.aborted) return;
      setTickets(rows); setLoadError("");
      setSelected(current => current ? rows.find(item => item.id === current.id) ?? current : null);
    } catch (cause) { if (!signal.aborted) setLoadError(cause instanceof Error ? cause.message : "Unable to load support requests."); }
    finally { if (!signal.aborted) { setLoading(false); setRefreshing(false); } }
  }, []);
  const loadThread = useCallback(async (ticketId: string) => {
    const request = ++threadRequest.current; const signal = lifetime.current?.signal; setLoadingThread(true); setThreadError("");
    try {
      const messages = await apiFetch<SupportMessage[]>(`/v1/support/tickets/${encodeURIComponent(ticketId)}/messages`, { signal });
      if (!signal?.aborted && request === threadRequest.current && selectedId.current === ticketId) setThread(messages);
    } catch (cause) { if (!signal?.aborted && request === threadRequest.current && selectedId.current === ticketId) setThreadError(cause instanceof Error ? cause.message : "Unable to load this conversation."); }
    finally { if (!signal?.aborted && request === threadRequest.current && selectedId.current === ticketId) setLoadingThread(false); }
  }, []);
  function openTicket(ticket: Ticket) {
    if (mutation.current) return;
    if (selectedId.current !== ticket.id) setThread([]);
    selectedId.current = ticket.id; setSelected(ticket); setError(""); void loadThread(ticket.id);
  }
  const refresh = useCallback(async () => {
    if (mutation.current) return;
    await Promise.all([load(), ...(selectedId.current ? [loadThread(selectedId.current)] : [])]);
  }, [load, loadThread]);
  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    const refreshVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    const stream = new EventSource(`${API_URL}/v1/notifications/stream`, { withCredentials: true });
    stream.addEventListener("notification", refreshVisible);
    const timer = window.setTimeout(refreshVisible, 0);
    window.addEventListener("focus", refreshVisible);
    return () => { window.clearTimeout(timer); controller.abort(); activeLoad.current?.abort(); stream.close(); window.removeEventListener("focus", refreshVisible); };
  }, [refresh]);
  async function submit() {
    if (mutation.current || message.trim().length < 5) return;
    mutation.current = true; setError(""); setNotice(""); setBusy(true);
    try {
      const saved = await apiFetch<Ticket>("/v1/support/tickets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ category, message: message.trim() }) });
      setTickets(current => [saved, ...current.filter(item => item.id !== saved.id)]);
      setMessage(""); setNotice("Request received. Track its saved status below."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to send your request. Your draft remains here."); }
    finally { mutation.current = false; setBusy(false); }
  }
  async function sendReply() {
    if (!selected || !reply.trim() || mutation.current || loadingThread || threadError) return;
    const ticketId = selected.id; const text = reply.trim();
    mutation.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const saved = await apiFetch<SupportMessage>(`/v1/support/tickets/${encodeURIComponent(ticketId)}/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: text }) });
      setThread(current => [...current.filter(item => item.id !== saved.id), saved]);
      setDrafts(current => ({ ...current, [ticketId]: "" })); setNotice("Reply sent.");
      await Promise.all([loadThread(ticketId), load()]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to send your reply. Your draft remains here."); }
    finally { mutation.current = false; setBusy(false); }
  }

  const panel = { background: "white", border: "1px solid #e2e8f0", borderRadius: 24, padding: 24 } as const;
  return <main style={{ maxWidth: 1100, margin: "auto", padding: "42px 22px", fontFamily: "Inter,system-ui,sans-serif", color: "#172334" }}>
    <p style={{ color: "#64748b", fontWeight: 800, letterSpacing: ".12em", fontSize: 12 }}>CAREBRIDGE · SUPPORT</p>
    <h1 style={{ fontSize: 40, margin: "8px 0" }}>How can we help?</h1>
    <p style={{ color: "#64748b" }}>Create a request and continue the conversation securely from your account.</p>
    <Link className="text-link" href="/dashboard">← Back to dashboard</Link>
    {error && <div role="alert" style={{ marginTop: 18, padding: 14, borderRadius: 14, background: "#fff7ed" }}>{error}</div>}
    {notice && <div role="status" style={{ marginTop: 18, padding: 14, borderRadius: 14, background: "#ecfdf5", color: "#166534" }}>{notice}</div>}
    <button disabled={busy || refreshing || loadingThread} onClick={() => void refresh()} style={{ marginTop: 16 }}>{refreshing ? "Refreshing…" : "Refresh support requests"}</button>
    {loadError && <p role="alert" style={{ color: "#9a3412" }}>{loadError}</p>}
    <div className="responsive-two-column" style={{ display: "grid", gap: 20, marginTop: 24 }}>
      <div style={{ display: "grid", gap: 20, alignContent: "start" }}>
        <section style={panel}><h2>New request</h2>
          <label style={{ display: "grid", gap: 7, fontWeight: 700 }}>Topic<select disabled={busy} value={category} onChange={e => setCategory(e.target.value)} style={{ padding: 12, border: "1px solid #cbd5e1", borderRadius: 12 }}>{cats.map(x => <option key={x}>{x}</option>)}</select></label>
          <div style={{ display: "grid", gap: 7, fontWeight: 700, marginTop: 14 }}><label htmlFor="support-message">Message</label><textarea id="support-message" disabled={busy} value={message} onChange={e => setMessage(e.target.value)} rows={5} maxLength={5000} placeholder="Tell us what you need help with..." style={{ padding: 12, border: "1px solid #cbd5e1", borderRadius: 12 }} /></div>
          <button disabled={busy || message.trim().length < 5} onClick={() => void submit()} style={{ marginTop: 14, padding: "12px 16px", border: 0, borderRadius: 12, background: "#1672b8", color: "white", fontWeight: 800 }}>Send request</button>
        </section>
        <section style={panel}><h2>Your requests</h2>
          {loading ? <p role="status">Loading support requests…</p> : !tickets.length ? !loadError && <p style={{ color: "#64748b" }}>No support requests yet.</p> : tickets.map(t => <button key={t.id} disabled={busy} onClick={() => void openTicket(t)} style={{ display: "block", width: "100%", textAlign: "left", padding: "14px 0", border: 0, borderTop: "1px solid #eef2f7", background: selected?.id === t.id ? "#f0f7fc" : "white", color: "#172334", cursor: "pointer" }}><div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><b>{t.category}</b><span style={{ fontSize: 12, fontWeight: 800 }}>{t.status}</span></div><p style={{ margin: "7px 0", color: "#64748b" }}>{t.message}</p><small style={{ color: "#94a3b8" }}>{new Date(t.createdAt).toLocaleString()}</small></button>)}
        </section>
      </div>
      <section style={{ ...panel, minHeight: 440, display: "flex", flexDirection: "column" }}>
        {threadError && <p role="alert" style={{ color: "#9a3412" }}>{threadError} <button disabled={busy || loadingThread} onClick={() => selected && void loadThread(selected.id)}>Retry conversation</button></p>}
        <h2>{selected ? "Conversation · " + selected.category : "Support conversation"}</h2>
        {!selected ? <p style={{ color: "#64748b" }}>Select a request to read replies and send a message to the support team.</p> : <>
          <p style={{ color: "#64748b", fontSize: 13 }}>Status: <b>{selected.status}</b></p>
          <div aria-live="polite" style={{ display: "grid", gap: 12, alignContent: "start", flex: 1, margin: "12px 0 20px" }}>
            <div style={{ padding: 14, borderRadius: 14, background: "#f1f5f9" }}><b>You · original request</b><p style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>{selected.message}</p></div>
            {thread.map(m => <div key={m.id} style={{ padding: 14, borderRadius: 14, background: m.author.role === "ADMIN" ? "#eaf5ff" : "#f8fafc" }}><b>{m.author.role === "ADMIN" ? "CareBridge Support" : "You"}</b><p style={{ whiteSpace: "pre-wrap", margin: "8px 0" }}>{m.message}</p><small style={{ color: "#64748b" }}>{new Date(m.createdAt).toLocaleString()}</small></div>)}
            {loadingThread ? <p role="status">Loading conversation…</p> : !thread.length && !threadError && <p style={{ color: "#64748b" }}>No replies yet. You can send a follow-up below.</p>}
          </div>
          <div style={{ display: "grid", gap: 7, fontWeight: 700 }}><label htmlFor="support-reply">Reply</label><textarea id="support-reply" disabled={busy || loadingThread || Boolean(threadError)} value={reply} onChange={e => setReply(e.target.value)} rows={3} maxLength={5000} placeholder="Write a reply..." style={{ padding: 12, border: "1px solid #cbd5e1", borderRadius: 12 }} /></div>
          <button disabled={busy || loadingThread || Boolean(threadError) || !reply.trim()} onClick={() => void sendReply()} style={{ alignSelf: "start", marginTop: 12, padding: "12px 16px", border: 0, borderRadius: 12, background: "#1672b8", color: "white", fontWeight: 800 }}>Send reply</button>
        </>}
      </section>
    </div>
  </main>;
}
