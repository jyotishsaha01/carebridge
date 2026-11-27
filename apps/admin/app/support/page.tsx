"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, jsonRequest } from "../../lib/request";

type Ticket = { id: string; userId: string; category: string; message: string; status: string; priority: string; slaDueAt: string | null; escalatedAt: string | null; createdAt: string; updatedAt: string; user: { id: string; email: string; role: string } };
type SupportMessage = { id: string; message: string; createdAt: string; author: { id: string; role: string } };
type Attachment = { id: string; fileName: string; contentType: string; sizeBytes: number; createdAt: string };
type Draft = { reply?: string; status?: string; priority?: string; escalated?: boolean };
const panel = { background: "white", border: "1px solid #e2e8f0", borderRadius: 22, padding: 22 } as const;
const field = { padding: 10, border: "1px solid #cbd5e1", borderRadius: 10 } as const;
const muted = { color: "#64748b" } as const;
const message = (cause: unknown, fallback: string) => cause instanceof Error ? cause.message : fallback;

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [queueFilter, setQueueFilter] = useState("ALL");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const queueVersion = useRef(0);
  const selectedId = useRef("");
  const initialLinkOpened = useRef(false);

  const loadQueue = useCallback(async (signal?: AbortSignal) => {
    const version = ++queueVersion.current;
    setLoading(true); setError("");
    try {
      const query = new URLSearchParams({ limit: "100" });
      if (queueFilter === "OVERDUE") query.set("overdue", "true");
      if (queueFilter === "ESCALATED") query.set("escalated", "true");
      const rows = await apiFetch<Ticket[]>(`/v1/admin/support/tickets?${query}`, { signal });
      if (signal?.aborted || version !== queueVersion.current) return false;
      setTickets(rows);
      if (!initialLinkOpened.current) {
        const id = new URLSearchParams(window.location.search).get("ticket");
        if (id) {
          const ticket = rows.find((row) => row.id === id) ?? await apiFetch<Ticket>(`/v1/admin/support/tickets/${encodeURIComponent(id)}`, { signal });
          if (signal?.aborted || version !== queueVersion.current) return false;
          selectedId.current = ticket.id; setSelected(ticket);
        }
        initialLinkOpened.current = true;
      }
      return true;
    } catch (cause) { if (!signal?.aborted && version === queueVersion.current) setError(message(cause, "Unable to load support requests.")); return false; }
    finally { if (!signal?.aborted && version === queueVersion.current) setLoading(false); }
  }, [queueFilter]);

  useEffect(() => { const controller = new AbortController(); const timer = window.setTimeout(() => void loadQueue(controller.signal), 0); return () => { window.clearTimeout(timer); controller.abort(); }; }, [loadQueue]);

  function saved(ticket: Ticket) {
    if (selectedId.current === ticket.id) setSelected(ticket);
    setTickets((current) => current.map((row) => row.id === ticket.id ? ticket : row));
  }

  return <main style={{ minHeight: "100vh", background: "#f7f9fc", padding: "40px 22px", color: "#172334", fontFamily: "Inter,system-ui,sans-serif" }}><div style={{ maxWidth: 1200, margin: "auto" }}>
    <Link href="/dashboard" style={{ color: "#1672b8" }}>← Operations center</Link><p style={{ ...muted, fontSize: 12, fontWeight: 800, letterSpacing: ".12em", marginTop: 26 }}>CAREBRIDGE · ADMIN SUPPORT</p><h1 style={{ fontSize: 40, margin: "8px 0" }}>Support conversations</h1><p style={muted}>Review incoming requests, reply securely and save support settings.</p>
    {error && <p role="alert">{error} Previously loaded queue records may be out of date.</p>}
    <div className="workspace-columns" style={{ marginTop: 24 }}>
      <section style={panel} aria-label="Support request queue"><div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}><h2>Request queue</h2><button disabled={busy || loading} onClick={() => void loadQueue()}>Refresh queue</button></div>
        <label style={{ display: "grid", gap: 6, marginBottom: 12, fontWeight: 700 }}>Filter queue<select disabled={busy || loading} value={queueFilter} onChange={(event) => setQueueFilter(event.target.value)} style={field}><option value="ALL">All requests</option><option value="OVERDUE">SLA overdue</option><option value="ESCALATED">Escalated</option></select></label>
        <p style={{ ...muted, fontSize: 12 }}>Up to 100 matching requests, ordered by escalation, SLA due date and recent activity.</p>
        {loading && <p role="status">Loading support requests…</p>}{!loading && !error && !tickets.length && <p>No support requests match this filter.</p>}
        {tickets.map((ticket) => <button key={ticket.id} disabled={busy || loading} aria-label={`Open support request ${ticket.id}`} onClick={() => { selectedId.current = ticket.id; setSelected(ticket); }} style={{ display: "block", width: "100%", textAlign: "left", padding: 14, border: 0, borderTop: "1px solid #eef2f7", background: selected?.id === ticket.id ? "#f0f7fc" : "white" }}><b>{ticket.category} · {ticket.status}</b><p style={{ margin: "8px 0", overflowWrap: "anywhere" }}>{ticket.message}</p><small>{ticket.user.email} · {ticket.user.role}</small><p style={{ ...muted, fontSize: 12 }}>ID: {ticket.id} · Priority: {ticket.priority} · SLA due: {ticket.slaDueAt ? new Date(ticket.slaDueAt).toLocaleString() : "Not set"}{ticket.escalatedAt ? " · ESCALATED" : ""}{Object.values(drafts[ticket.id] ?? {}).some((value) => value !== undefined && value !== "") ? " · Draft retained" : ""}</p></button>)}
      </section>
      {selected ? <Conversation key={selected.id} ticket={selected} draft={drafts[selected.id] ?? {}} onDraft={(draft) => setDrafts((current) => ({ ...current, [selected.id]: draft }))} onSaved={saved} refreshQueue={loadQueue} onBusy={setBusy} /> : <section style={panel}><h2>Select a request</h2><p style={muted}>Choose a request to review its thread and respond.</p></section>}
    </div>
  </div></main>;
}

function Conversation({ ticket, draft, onDraft, onSaved, refreshQueue, onBusy }: { ticket: Ticket; draft: Draft; onDraft: (draft: Draft) => void; onSaved: (ticket: Ticket) => void; refreshQueue: () => Promise<boolean>; onBusy: (busy: boolean) => void }) {
  const [thread, setThread] = useState<SupportMessage[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [threadError, setThreadError] = useState("");
  const [attachmentError, setAttachmentError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const mutating = useRef(false);
  const version = useRef(0);
  const status = draft.status ?? ticket.status;
  const priority = draft.priority ?? ticket.priority;
  const escalated = draft.escalated ?? Boolean(ticket.escalatedAt);
  const reply = draft.reply ?? "";
  const changed = status !== ticket.status || priority !== ticket.priority || escalated !== Boolean(ticket.escalatedAt);

  const loadThread = useCallback(async (signal?: AbortSignal) => {
    const current = ++version.current;
    setLoading(true);
    const [messages, files] = await Promise.allSettled([
      apiFetch<SupportMessage[]>(`/v1/support/tickets/${encodeURIComponent(ticket.id)}/messages`, { signal }),
      apiFetch<Attachment[]>(`/v1/support/tickets/${encodeURIComponent(ticket.id)}/attachments`, { signal }),
    ]);
    if (signal?.aborted || current !== version.current) return;
    if (messages.status === "fulfilled") { setThread(messages.value); setThreadError(""); } else setThreadError(message(messages.reason, "Unable to load this conversation."));
    if (files.status === "fulfilled") { setAttachments(files.value); setAttachmentError(""); } else setAttachmentError(message(files.reason, "Unable to load attachments."));
    setLoading(false);
  }, [ticket.id]);
  useEffect(() => { const controller = new AbortController(); const timer = window.setTimeout(() => void loadThread(controller.signal), 0); return () => { window.clearTimeout(timer); controller.abort(); }; }, [loadThread]);

  function start() { if (mutating.current) return false; mutating.current = true; setBusy(true); onBusy(true); setError(""); setNotice(""); return true; }
  function finish() { mutating.current = false; setBusy(false); onBusy(false); }

  async function saveSettings() {
    if (!changed || !start()) return;
    try {
      const patch = { expectedUpdatedAt: ticket.updatedAt, ...(status !== ticket.status ? { status } : {}), ...(priority !== ticket.priority ? { priority } : {}), ...(escalated !== Boolean(ticket.escalatedAt) ? { escalated } : {}) };
      const updated = await apiFetch<Ticket>(`/v1/admin/support/tickets/${encodeURIComponent(ticket.id)}`, jsonRequest("PATCH", patch));
      onSaved(updated); onDraft({ reply }); setNotice(`Settings saved for request ${ticket.id}: ${updated.status}, ${updated.priority}${updated.escalatedAt ? ", escalated" : ""}.`);
      if (!await refreshQueue()) setNotice(`Settings saved for request ${ticket.id}. The queue could not be refreshed.`);
    } catch (cause) { setError(message(cause, "Unable to save support settings. Your draft is retained.")); }
    finally { finish(); }
  }

  async function sendReply() {
    if (!reply.trim() || !start()) return;
    try {
      const saved = await apiFetch<SupportMessage>(`/v1/support/tickets/${encodeURIComponent(ticket.id)}/messages`, jsonRequest("POST", { message: reply.trim() }));
      version.current++;
      setThread((current) => [...current.filter((row) => row.id !== saved.id), saved].slice(-200)); onDraft({ ...draft, reply: "" });
      let outcome = `Reply sent for request ${ticket.id}.`;
      try { onSaved(await apiFetch<Ticket>(`/v1/admin/support/tickets/${encodeURIComponent(ticket.id)}`)); }
      catch { outcome += " Refresh latest request before saving settings to check its current version."; }
      if (!await refreshQueue()) outcome += " The queue could not be refreshed.";
      setNotice(outcome);
    } catch (cause) { setError(message(cause, "Unable to send reply. Your draft is retained.")); }
    finally { finish(); }
  }

  async function refreshLatest() {
    if (!start()) return;
    try { const updated = await apiFetch<Ticket>(`/v1/admin/support/tickets/${encodeURIComponent(ticket.id)}`); onSaved(updated); await loadThread(); setNotice("Latest saved settings loaded. Unsaved choices and reply drafts are retained."); }
    catch (cause) { setError(message(cause, "Unable to refresh this support request.")); }
    finally { finish(); }
  }

  async function download(file: Attachment) {
    if (!start()) return;
    try {
      const data = await apiFetch<{ attachment: Attachment; contentBase64: string }>(`/v1/support/tickets/${encodeURIComponent(ticket.id)}/attachments/${encodeURIComponent(file.id)}/content`);
      const bytes = Uint8Array.from(atob(data.contentBase64), (value) => value.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: data.attachment.contentType }));
      const link = document.createElement("a"); link.href = url; link.download = data.attachment.fileName; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setNotice(`Downloaded ${data.attachment.fileName}.`);
    } catch (cause) { setError(message(cause, "Unable to download this attachment.")); }
    finally { finish(); }
  }

  return <section style={{ ...panel, minHeight: 440 }} aria-label={`Support conversation ${ticket.id}`}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}><h2>{ticket.category} · Conversation</h2><button disabled={busy || loading} onClick={() => void refreshLatest()}>Refresh latest request</button></div>
    <p style={{ ...muted, overflowWrap: "anywhere" }}>Request ID: {ticket.id} · {ticket.user.email} · {ticket.user.role}</p><p>Saved settings: {ticket.status} · {ticket.priority} · {ticket.escalatedAt ? "Escalated" : "Not escalated"}</p>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10, marginBottom: 12 }}>
      <div><label htmlFor={`support-status-${ticket.id}`}>Status</label><select id={`support-status-${ticket.id}`} disabled={busy || loading} value={status} onChange={(event) => onDraft({ ...draft, status: event.target.value })} style={{ ...field, display: "block", width: "100%" }}><option>OPEN</option><option>IN_PROGRESS</option><option>RESOLVED</option><option>CLOSED</option></select></div>
      <div><label htmlFor={`support-priority-${ticket.id}`}>Priority</label><select id={`support-priority-${ticket.id}`} disabled={busy || loading} value={priority} onChange={(event) => onDraft({ ...draft, priority: event.target.value })} style={{ ...field, display: "block", width: "100%" }}><option>LOW</option><option>NORMAL</option><option>HIGH</option></select></div>
    </div><label><input disabled={busy || loading} type="checkbox" checked={escalated} onChange={(event) => onDraft({ ...draft, escalated: event.target.checked })} /> Escalate for additional review</label><div><button disabled={busy || loading || !changed} onClick={() => void saveSettings()} style={{ ...field, margin: "12px 0" }}>Save support settings</button></div>
    {changed && <p style={muted}>Unsaved settings. Saving a priority change sets a new SLA due date.</p>}
    <div style={{ padding: 14, borderRadius: 14, background: "#f1f5f9", overflowWrap: "anywhere" }}><b>{ticket.user.email} · Original request</b><p style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>{ticket.message}</p></div>
    <p style={{ ...muted, fontSize: 12 }}>Latest 200 conversation messages and up to 50 attachments are shown.</p>
    {loading && <p role="status">Loading conversation…</p>}{threadError && <p role="alert">{threadError}</p>}
    {thread.map((row) => <article key={row.id} style={{ padding: 14, borderRadius: 14, background: row.author.role === "ADMIN" ? "#eaf5ff" : "#f8fafc", margin: "10px 0", overflowWrap: "anywhere" }}><b>{row.author.role === "ADMIN" ? "CareBridge Support" : ticket.user.email}</b><p style={{ whiteSpace: "pre-wrap" }}>{row.message}</p><small>{new Date(row.createdAt).toLocaleString()}</small></article>)}
    <section aria-label="Support attachments"><h3>Attachments</h3>{attachmentError && <p role="alert">{attachmentError}</p>}{attachments.map((file) => <div key={file.id} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}><span style={{ overflowWrap: "anywhere" }}>{file.fileName} · {Math.ceil(file.sizeBytes / 1024)} KB</span><button disabled={busy || loading} onClick={() => void download(file)} aria-label={`Download ${file.fileName}`}>Download</button></div>)}{!loading && !attachmentError && !attachments.length && <p>No attachments.</p>}</section>
    <div style={{ display: "grid", gap: 7, fontWeight: 700 }}><label htmlFor={`support-reply-${ticket.id}`}>Reply</label><textarea id={`support-reply-${ticket.id}`} disabled={busy || loading} value={reply} onChange={(event) => onDraft({ ...draft, reply: event.target.value })} rows={3} maxLength={5000} placeholder="Write a response…" style={{ ...field, width: "100%" }} /></div><button disabled={busy || loading || !reply.trim()} onClick={() => void sendReply()} style={{ ...field, marginTop: 12, background: "#1672b8", color: "white", fontWeight: 800 }}>Send reply</button>
  </section>;
}
