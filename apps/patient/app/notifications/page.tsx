"use client";

import { useEffect, useState } from "react";
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

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState("");

  async function load() {
    const response = await fetch(`${API_URL}/v1/notifications?limit=100`, {
      credentials: "include",
    });
    if (!response.ok) {
      setError("Sign in to view your notifications.");
      return;
    }
    const data = await response.json();
    setItems(data.notifications);
    setUnread(data.unreadCount);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    void load();
  }, []);

  async function mark(id: string) {
    await fetch(`${API_URL}/v1/notifications/${id}/read`, {
      method: "POST",
      credentials: "include",
    });
    await load();
  }

  async function markAll() {
    await fetch(`${API_URL}/v1/notifications/read-all`, {
      method: "POST",
      credentials: "include",
    });
    await load();
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
              disabled={!unread}
            >
              Mark all read
            </button>
            <a className={styles.actionLink} href="/dashboard">
              Dashboard
            </a>
          </div>
        </header>

        {error ? (
          <div className={styles.empty}>{error}</div>
        ) : (
          <section className={styles.list}>
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
