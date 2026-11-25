"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError, API_URL, apiFetch } from "../../lib/api";
import styles from "./notifications.module.css";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  status: string;
  createdAt: string;
};

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [signInRequired, setSignInRequired] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const data = await apiFetch<{ notifications: Notification[]; unreadCount: number }>("/v1/notifications?limit=100", { signal });
      if (signal?.aborted) return false;
      setItems(data.notifications); setUnread(data.unreadCount); setError(""); setSignInRequired(false);
      return true;
    } catch (cause) {
      if (!signal?.aborted) { setError(cause instanceof Error ? cause.message : "Unable to load notifications."); setSignInRequired(cause instanceof ApiError && cause.status === 401); }
      return false;
    } finally { if (!signal?.aborted) setLoading(false); }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let stream: EventSource | null = null;
    // State updates in load occur after the network request settles.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(controller.signal).then((ok) => {
      if (!ok || controller.signal.aborted) return;
      stream = new EventSource(`${API_URL}/v1/notifications/stream`, { withCredentials: true });
      stream.addEventListener("notification", () => void load(controller.signal));
    });
    return () => { controller.abort(); stream?.close(); };
  }, [load]);

  async function mark(id: string) {
    setPending(id);
    try { await apiFetch(`/v1/notifications/${encodeURIComponent(id)}/read`, { method: "POST" }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to mark this notification as read."); }
    finally { setPending(null); }
  }

  async function markAll() {
    setPending("all");
    try { await apiFetch("/v1/notifications/read-all", { method: "POST" }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to mark notifications as read."); }
    finally { setPending(null); }
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
              Important updates about your care, documents, security and
              account.
            </p>
          </div>
          <div className={styles.actions}>
            <button
              className={styles.actionBtn}
              onClick={markAll}
              disabled={!unread || pending !== null || loading}
            >
              Mark all read
            </button>
            <a className={styles.actionLink} href="/dashboard">
              Dashboard
            </a>
          </div>
        </header>

        {error && <div className={styles.empty} role="alert">{error} {signInRequired ? <Link href="/login">Sign in</Link> : <button className={styles.actionBtn} onClick={() => void load()}>Try again</button>}</div>}
        {loading ? <p className={styles.empty} role="status">Loading notifications…</p> : (
          <section className={styles.list}>
            {items.length === 0 && !error ? (
              <div className={styles.empty}>You&apos;re all caught up.</div>
            ) : (
              items.map((item) => {
                const isUnread = item.status === "UNREAD";
                return (
                  <article
                    key={item.id}
                    className={`${styles.card} ${isUnread ? styles.unread : ""}`}
                  >
                    <div
                      className={`${styles.dot} ${isUnread ? styles.unreadDot : ""}`}
                    >
                      {isUnread ? "•" : "✓"}
                    </div>
                    <div className={styles.body}>
                      <div className={styles.meta}>
                        {item.type} ·{" "}
                        {new Date(item.createdAt).toLocaleString()}
                      </div>
                      <h2 className={styles.cardTitle}>{item.title}</h2>
                      <p className={styles.cardBody}>{item.body}</p>
                    </div>
                    {isUnread && (
                      <button
                        className={styles.read}
                        disabled={pending !== null}
                        onClick={() => mark(item.id)}
                      >
                        Read
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
