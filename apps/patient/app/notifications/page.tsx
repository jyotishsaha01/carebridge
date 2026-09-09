"use client";

import { useEffect, useState } from "react";
import styles from "./notifications.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type Notification = { id: string; type: string; title: string; body: string; status: string; createdAt: string };

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState("");

  async function load() {
    const response = await fetch(`${API_URL}/v1/notifications?limit=100`, { credentials: "include" });
    if (!response.ok) { setError("Sign in to view your notifications."); return; }
    const data = await response.json(); setItems(data.notifications); setUnread(data.unreadCount);
  }
  useEffect(() => { void load(); }, []);

  async function mark(id: string) { await fetch(`${API_URL}/v1/notifications/${id}/read`, { method: "POST", credentials: "include" }); await load(); }
  async function markAll() { await fetch(`${API_URL}/v1/notifications/read-all`, { method: "POST", credentials: "include" }); await load(); }

  return <main className={styles.page}><div className={styles.wrap}><header><div><span>CareBridge</span><h1>Notifications <b>{unread}</b></h1><p>Important updates about your care, documents, security and account.</p></div><div className={styles.actions}><button onClick={markAll} disabled={!unread}>Mark all read</button><a href="/dashboard">Dashboard</a></div></header>{error ? <div className={styles.empty}>{error}</div> : <section>{items.length === 0 ? <div className={styles.empty}>You&apos;re all caught up.</div> : items.map((item) => <article key={item.id} className={item.status === "UNREAD" ? styles.unread : ""}><div className={styles.dot}>{item.status === "UNREAD" ? "•" : "✓"}</div><div className={styles.body}><div className={styles.meta}>{item.type} · {new Date(item.createdAt).toLocaleString()}</div><h2>{item.title}</h2><p>{item.body}</p></div>{item.status === "UNREAD" && <button className={styles.read} onClick={() => mark(item.id)}>Read</button>}</article>)}</section>}</div></main>;
}
