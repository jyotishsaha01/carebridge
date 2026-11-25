"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { API_URL, apiFetch } from "../../lib/request";

type Notification = { id: string; type: string; title: string; body: string; status: string; createdAt: string };
export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    let stream: EventSource | undefined;
    async function load() {
      try {
        const result = await apiFetch<{ notifications: Notification[] }>("/v1/notifications?limit=100");
        if (active) { setItems(result.notifications); setError(""); }
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "Unable to load notifications."); }
      finally { if (active) setLoading(false); }
    }
    void load().then(() => {
      if (!active) return;
      stream = new EventSource(`${API_URL}/v1/notifications/stream`, { withCredentials: true });
      stream.addEventListener("notification", () => void load());
    });
    return () => { active = false; stream?.close(); };
  }, []);
  async function mark(id?: string) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await apiFetch(id ? `/v1/notifications/${encodeURIComponent(id)}/read` : "/v1/notifications/read-all", { method: "POST" });
      setItems(current => current.map(item => !id || item.id === id ? { ...item, status: "READ" } : item));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update notifications."); }
    finally { setBusy(false); }
  }
  return <main style={{ minHeight: "100vh", background: "#f6f9fc", padding: "36px 24px", color: "#142235" }}><div style={{ maxWidth: 900, margin: "auto" }}><Link href="/dashboard">← Dashboard</Link><header style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 16, marginTop: 24 }}><div><p>CAREBRIDGE</p><h1>Notifications</h1><p>Updates from your CareBridge workspace.</p></div><button disabled={busy || !items.some(item => item.status === "UNREAD")} onClick={() => void mark()}>Mark all read</button></header>
    {error && <p role="alert">{error}</p>}{loading ? <p role="status">Loading notifications…</p> : <div aria-live="polite" style={{ display: "grid", gap: 12, marginTop: 24 }}>{items.map(item => <article key={item.id} style={{ background: "white", border: "1px solid #dfe8f0", borderRadius: 18, padding: 18, display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 20 }}><div><small>{item.type} · {new Date(item.createdAt).toLocaleString()}</small><h2 style={{ fontSize: 18 }}>{item.title}</h2><p>{item.body}</p></div>{item.status === "UNREAD" && <button disabled={busy} onClick={() => void mark(item.id)}>Mark read</button>}</article>)}{!items.length && !error && <p>You&apos;re all caught up.</p>}</div>}
  </div></main>;
}
