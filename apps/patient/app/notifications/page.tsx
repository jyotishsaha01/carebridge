"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, API_URL, apiFetch } from "../../lib/api";
import styles from "./notifications.module.css";
import { captureSessionScope } from "../../lib/session-binding";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  status: string;
  createdAt: string;
};

function formatNotificationDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}
function formatNotificationBody(value: string): string {
  return value.replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\b/g, (timestamp) => formatNotificationDate(timestamp));
}

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [signInRequired, setSignInRequired] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState("");
  const lifetime = useRef<AbortController | null>(null);
  const activeLoad = useRef<AbortController | null>(null);
  const mutation = useRef<string | null>(null);

  const load = useCallback(async (requestSignal?: AbortSignal, afterMutation = false) => {
    if ((mutation.current !== null && !afterMutation) || !lifetime.current || lifetime.current.signal.aborted) return false;
    activeLoad.current?.abort();
    const controller = new AbortController(); activeLoad.current = controller;
    const signal = AbortSignal.any([controller.signal, lifetime.current.signal, ...(requestSignal ? [requestSignal] : [])]);
    setRefreshing(true);
    try {
      const data = await apiFetch<{ notifications: Notification[]; unreadCount: number }>("/v1/notifications?limit=100", { signal });
      if (signal?.aborted) return false;
      setItems(Array.isArray(data.notifications) ? data.notifications : []); setUnread(Number.isFinite(data.unreadCount) ? data.unreadCount : 0); setError(""); setSignInRequired(false);
      return true;
    } catch (cause) {
      if (!signal?.aborted) { setError(cause instanceof Error ? cause.message : "Unable to load notifications."); setSignInRequired(cause instanceof ApiError && cause.status === 401 && !captureSessionScope().userId); }
      return false;
    } finally { if (!signal.aborted) { setLoading(false); setRefreshing(false); } }
  }, []);

  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    const refresh = () => { if (document.visibilityState === "visible") void load(controller.signal); };
    const stream = new EventSource(`${API_URL}/v1/notifications/stream`, { withCredentials: true });
    stream.addEventListener("notification", refresh); stream.addEventListener("ready", refresh);
    const timer = window.setTimeout(refresh, 0);
    window.addEventListener("focus", refresh);
    return () => { window.clearTimeout(timer); controller.abort(); activeLoad.current?.abort(); stream.close(); window.removeEventListener("focus", refresh); };
  }, [load]);

  async function mark(id: string) {
    if (mutation.current !== null) return;
    mutation.current = id; setPending(id); setNotice(""); activeLoad.current?.abort();
    try {
      await apiFetch(`/v1/notifications/${encodeURIComponent(id)}/read`, { method: "POST" });
      if (items.some(item => item.id === id && item.status === "UNREAD")) setUnread(current => Math.max(0, current - 1));
      setItems(current => current.map(item => item.id === id ? { ...item, status: "READ" } : item));
      setNotice("Notification marked as read.");
      await load(undefined, true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to mark this notification as read."); }
    finally { mutation.current = null; setPending(null); setRefreshing(false); }
  }

  async function markAll() {
    if (mutation.current !== null) return;
    mutation.current = "all"; setPending("all"); setNotice(""); activeLoad.current?.abort();
    try {
      await apiFetch("/v1/notifications/read-all", { method: "POST" });
      setItems(current => current.map(item => ({ ...item, status: "READ" }))); setUnread(0);
      setNotice("All notifications marked as read."); await load(undefined, true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to mark notifications as read."); }
    finally { mutation.current = null; setPending(null); setRefreshing(false); }
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
              disabled={!unread || pending !== null || loading || refreshing}
            >
              Mark all read
            </button>
            <button className={styles.actionBtn} onClick={() => void load()} disabled={refreshing || pending !== null}>{refreshing ? "Refreshing…" : "Refresh"}</button>
            <a className={styles.actionLink} href="/dashboard">
              Dashboard
            </a>
          </div>
        </header>

        {notice && <p role="status" className={styles.empty}>{notice}</p>}
        {error && <div className={styles.empty} role="alert">{error} {signInRequired ? <Link href="/login">Sign in</Link> : <button className={styles.actionBtn} onClick={() => void load()} disabled={refreshing || pending !== null}>Try again</button>}</div>}
        {loading ? <p className={styles.empty} role="status">Loading notifications…</p> : (
          <section className={styles.list} aria-label="Your notifications">
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
                        {formatNotificationDate(item.createdAt)}
                      </div>
                      <h2 className={styles.cardTitle}>{item.title}</h2>
                      <p className={styles.cardBody}>{formatNotificationBody(item.body)}</p>
                    </div>
                    {isUnread && (
                      <button
                        className={styles.read}
                        disabled={pending !== null || refreshing}
                        onClick={() => mark(item.id)}
                      >
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
