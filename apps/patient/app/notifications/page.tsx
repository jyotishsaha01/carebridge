"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./notifications.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  status: string;
  createdAt: string;
};

type NotificationResponse = {
  notifications: Notification[];
  unreadCount: number;
};

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
        throw new Error(response.status === 401 || response.status === 403
          ? "Sign in to view your notifications."
          : "Notifications could not be loaded. Please try again.");
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
    stream.onerror = () => {
      // Keep persisted notifications visible; EventSource retries automatically.
    };
    return () => {
      active = false;
      stream.close();
    };
  }, []);

  async function mark(id: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/v1/notifications/${encodeURIComponent(id)}/read`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Unable to mark this notification as read.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update notification.");
    } finally {
      setBusy(false);
    }
  }

  async function markAll() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/v1/notifications/read-all`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Unable to mark all notifications as read.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update notifications.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.wrap}>
        <header className={styles.header}>
          <div>
            <span className={styles.brand}>CareBridge</span>
            <h1 className={styles.title}>
              Notifications <b className={styles.badge}>{unread}</b>
            </h1>
            <p className={styles.subtitle}>
              Important updates about your care, documents, security and account.
            </p>
          </div>
          <div className={styles.actions}>
            <button className={styles.actionBtn} onClick={() => void markAll()} disabled={!unread || busy}>
              {busy ? "Updating…" : "Mark all read"}
            </button>
            <button className={styles.actionBtn} onClick={() => void load()} disabled={loading || busy}>
              Refresh
            </button>
            <a className={styles.actionLink} href="/dashboard">Dashboard</a>
          </div>
        </header>

        {error && <div className={styles.empty} role="alert">{error}</div>}
        {loading ? (
          <div className={styles.empty} role="status">Loading notifications…</div>
        ) : (
          <section className={styles.list} aria-label="Your notifications">
            {items.length === 0 ? (
              <div className={styles.empty}>You&apos;re all caught up.</div>
            ) : (
              items.map((item) => {
                const isUnread = item.status === "UNREAD";
                return (
                  <article
                    key={item.id}
                    className={`${styles.card} ${isUnread ? styles.unread : ""}`}
                  >
                    <div className={`${styles.dot} ${isUnread ? styles.unreadDot : ""}`} aria-hidden="true">
                      {isUnread ? "•" : "✓"}
                    </div>
                    <div className={styles.body}>
                      <div className={styles.meta}>
                        {item.type} · {new Date(item.createdAt).toLocaleString()}
                      </div>
                      <h2 className={styles.cardTitle}>{item.title}</h2>
                      <p className={styles.cardBody}>{item.body}</p>
                    </div>
                    {isUnread && (
                      <button className={styles.read} onClick={() => void mark(item.id)} disabled={busy}>
                        Mark read
                      </button>
                    )}
                  </article>
                );
              })
            )}
          </section>
        )}
      </div>
    </main>
  );
}
