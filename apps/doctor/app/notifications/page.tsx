"use client";

import { useCallback, useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
type Notification = { id: string; type: string; title: string; body: string; status: string; createdAt: string };
type NotificationResponse = { notifications: Notification[]; unreadCount: number };

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/v1/notifications?limit=100`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error("Your session is not authorized. Sign in again to view notifications.");
        }
        throw new Error("Notifications could not be loaded. Please try again.");
      }
      const data = (await response.json()) as NotificationResponse;
      setItems(Array.isArray(data.notifications) ? data.notifications : []);
      setUnread(Number.isFinite(data.unreadCount) ? data.unreadCount : 0);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Notifications could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void fetch(`${API_URL}/v1/notifications?limit=100`, {
        credentials: "include",
        cache: "no-store",
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("Unable to refresh notifications.");
          return (await response.json()) as NotificationResponse;
        })
        .then((data) => {
          if (!active) return;
          setItems(Array.isArray(data.notifications) ? data.notifications : []);
          setUnread(Number.isFinite(data.unreadCount) ? data.unreadCount : 0);
          setError("");
          setLoading(false);
        })
        .catch(() => {
          if (active) {
            setError("Notifications could not be refreshed. Check your connection and retry.");
            setLoading(false);
          }
        });
    };

    refresh();
    const stream = new EventSource(`${API_URL}/v1/notifications/stream`, { withCredentials: true });
    stream.addEventListener("notification", refresh);
    return () => {
      active = false;
      stream.close();
    };
  }, []);

  async function updateNotifications(path: string, id?: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}${path}`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(id ? "Unable to mark this notification as read." : "Unable to mark notifications as read.");
      }
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update notifications.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f7f9fc", padding: "clamp(20px, 5vw, 40px)", fontFamily: "Inter, system-ui, sans-serif", color: "#172334" }}>
      <div style={{ maxWidth: 900, margin: "auto" }}>
        <a href="/dashboard" style={{ color: "#1672b8" }}>← Dashboard</a>
        <header style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 16, marginTop: 24 }}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".12em", color: "#64748b" }}>CAREBRIDGE · DOCTOR</p>
            <h1 style={{ marginBottom: 6 }}>Notifications <span aria-label={`${unread} unread notifications`} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 28, height: 28, padding: "0 8px", borderRadius: 99, background: unread ? "#dbeafe" : "#e8edf3", color: "#174a7e", fontSize: 14 }}>{unread}</span></h1>
            <p style={{ color: "#64748b", marginTop: 0 }}>Updates are refreshed automatically when new events arrive.</p>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button type="button" onClick={() => void updateNotifications("/v1/notifications/read-all")} disabled={busy || unread === 0} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #dfe8f0", background: "white", cursor: busy || unread === 0 ? "not-allowed" : "pointer" }}>{busy ? "Updating…" : "Mark all read"}</button>
            <button type="button" onClick={() => void load()} disabled={loading || busy} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #dfe8f0", background: "white" }}>Refresh</button>
          </div>
        </header>
        {error && <div role="alert" style={{ marginTop: 18, padding: 14, borderRadius: 12, border: "1px solid #f3c6c6", background: "#fff5f5", color: "#a52222" }}>{error}</div>}
        {loading ? (
          <p role="status" style={{ marginTop: 24, color: "#64748b" }}>Loading notifications…</p>
        ) : (
          <section aria-label="Your notifications" style={{ display: "grid", gap: 12, marginTop: 24 }}>
            {items.length === 0 ? (
              <p style={{ padding: 22, background: "white", border: "1px solid #e1e9f1", borderRadius: 16, color: "#64748b" }}>You’re all caught up. New notifications will appear here.</p>
            ) : items.map((item) => {
              const isUnread = item.status === "UNREAD";
              const date = new Date(item.createdAt);
              return (
                <article key={item.id} style={{ background: "white", border: `1px solid ${isUnread ? "#b8d7f5" : "#e1e9f1"}`, borderRadius: 16, padding: 18, display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                  <div style={{ minWidth: 0, flex: "1 1 300px" }}>
                    <small style={{ color: "#718398" }}>{item.type} · {Number.isNaN(date.getTime()) ? item.createdAt : date.toLocaleString()}</small>
                    <h2 style={{ fontSize: 17, margin: "8px 0" }}>{item.title}</h2>
                    <p style={{ color: "#64788d", margin: 0, overflowWrap: "anywhere" }}>{item.body}</p>
                    <p style={{ fontSize: 12, fontWeight: 700, color: isUnread ? "#175a91" : "#718398", marginBottom: 0 }}>{isUnread ? "UNREAD" : "READ"}</p>
                  </div>
                  {isUnread && <button type="button" onClick={() => void updateNotifications(`/v1/notifications/${encodeURIComponent(item.id)}/read`, item.id)} disabled={busy} style={{ padding: "9px 12px", borderRadius: 9, border: "1px solid #dfe8f0", background: "white" }}>Mark read</button>}
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}
