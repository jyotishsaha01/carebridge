"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL, apiFetch } from "../../lib/request";
import NotificationPreferences from "./preferences";

type Notification = { id: string; type: string; title: string; body: string; status: string; createdAt: string };
type NotificationResponse = { notifications: Notification[]; unreadCount: number };

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const mutating = useRef(false);
  const version = useRef(0);

  const load = useCallback(async (signal?: AbortSignal, foreground = false) => {
    if (mutating.current) return false;
    const current = ++version.current;
    if (foreground) setLoading(true);
    try {
      const data = await apiFetch<NotificationResponse>("/v1/notifications?limit=100", { signal });
      if (signal?.aborted || current !== version.current) return false;
      setItems(data.notifications); setUnread(data.unreadCount); setError(""); return true;
    } catch (cause) {
      if (!signal?.aborted && current === version.current) setError(cause instanceof Error ? cause.message : "Unable to load notifications.");
      return false;
    } finally { if (!signal?.aborted && current === version.current) setLoading(false); }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const stream = new EventSource(`${API_URL}/v1/notifications/stream`, { withCredentials: true });
    stream.addEventListener("notification", () => void load(controller.signal));
    const timer = window.setTimeout(() => void load(controller.signal), 0);
    return () => { window.clearTimeout(timer); controller.abort(); stream.close(); };
  }, [load]);

  async function update(action: "read" | "read-all" | "delete" | "delete-read", item?: Notification) {
    if (mutating.current || loading) return;
    mutating.current = true; version.current++; setBusy(true); setError(""); setNotice("");
    let confirmed = false;
    try {
      if (action === "read" && item) {
        const updated = await apiFetch<Notification>(`/v1/notifications/${encodeURIComponent(item.id)}/read`, { method: "POST" });
        setItems((current) => current.map((row) => row.id === item.id ? updated : row));
        if (item.status === "UNREAD") setUnread((current) => current === null ? null : Math.max(0, current - 1));
        setNotice("Notification marked read.");
      } else if (action === "read-all") {
        await apiFetch("/v1/notifications/read-all", { method: "POST" });
        setItems((current) => current.map((row) => ({ ...row, status: "READ" }))); setUnread(0); setNotice("All notifications marked read.");
      } else if (action === "delete" && item) {
        await apiFetch(`/v1/notifications/${encodeURIComponent(item.id)}`, { method: "DELETE" });
        setItems((current) => current.filter((row) => row.id !== item.id));
        if (item.status === "UNREAD") setUnread((current) => current === null ? null : Math.max(0, current - 1));
        setNotice("Notification deleted.");
      } else if (action === "delete-read") {
        await apiFetch("/v1/notifications/read", { method: "DELETE" });
        setItems((current) => current.filter((row) => row.status !== "READ")); setNotice("Read notifications deleted.");
      }
      confirmed = true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update notifications."); }
    finally { mutating.current = false; }
    if (confirmed && !await load()) setNotice("Your notification change was saved. Refresh to check for newer updates.");
    setBusy(false);
  }

  return <main style={{ minHeight: "100vh", background: "#f6f9fc", padding: "clamp(20px,5vw,40px)", color: "#142235" }}><div style={{ maxWidth: 900, margin: "auto" }}>
    <Link href="/dashboard">← Dashboard</Link>
    <header style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 16, marginTop: 24 }}>
      <div><p>CAREBRIDGE · ADMIN</p><h1>Notifications <span aria-label={unread === null ? "Unread notifications unavailable" : `${unread} unread notifications`}>{unread ?? "—"}</span></h1><p>Your latest 100 notifications. New events refresh this inbox automatically.</p></div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}><button disabled={busy || loading || !unread} onClick={() => void update("read-all")}>Mark all read</button><button disabled={busy || loading} onClick={() => void load(undefined, true)}>{loading ? "Refreshing…" : "Refresh"}</button><button disabled={busy || loading || !items.some((item) => item.status === "READ")} onClick={() => void update("delete-read")}>Delete read notifications</button></div>
    </header>
    {error && <p role="alert">{error} Existing records may be out of date.</p>}{notice && <p role="status">{notice}</p>}{loading && <p role="status">Loading notifications…</p>}
    <section aria-label="Your notifications" style={{ display: "grid", gap: 12, marginTop: 24 }}>
      {items.map((item) => <article key={item.id} aria-label={`Notification ${item.id}`} style={{ background: "white", border: `1px solid ${item.status === "UNREAD" ? "#b8d7f5" : "#e1e9f1"}`, borderRadius: 18, padding: 18, display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 20 }}>
        <div><small>{item.type} · {new Date(item.createdAt).toLocaleString()}</small><h2 style={{ fontSize: 18 }}>{item.title}</h2><p style={{ overflowWrap: "anywhere" }}>{item.body}</p><small>{item.status}</small></div>
        <div>{item.status === "UNREAD" && <button disabled={busy || loading} onClick={() => void update("read", item)}>Mark read</button>}<button disabled={busy || loading} aria-label={`Delete notification: ${item.title} (${item.id})`} onClick={() => void update("delete", item)}>Delete</button></div>
      </article>)}
      {!loading && !items.length && !error && <p>You’re all caught up. New notifications will appear here.</p>}
    </section>
    <NotificationPreferences />
  </div></main>;
}
