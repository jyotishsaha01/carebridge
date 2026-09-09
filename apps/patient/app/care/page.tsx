"use client";

import { FormEvent, useEffect, useState } from "react";
import styles from "./care.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type Task = { id: string; title: string; description?: string | null; dueAt?: string | null; status: string };
type Plan = { id: string; title: string; description?: string | null; status: string; tasks: Task[] };
type Request = { id: string; type: string; title: string; description?: string | null; status: string; country?: string | null; targetDate?: string | null; createdAt: string };

export default function CarePage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [type, setType] = useState("COORDINATION");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [country, setCountry] = useState("US");
  const [message, setMessage] = useState("");

  async function load() {
    const [plansResponse, requestsResponse] = await Promise.all([
      fetch(`${API_URL}/v1/patient/care-plans`, { credentials: "include" }),
      fetch(`${API_URL}/v1/patient/care-requests`, { credentials: "include" }),
    ]);
    if (plansResponse.ok) setPlans(await plansResponse.json());
    if (requestsResponse.ok) setRequests(await requestsResponse.json());
  }

  useEffect(() => { void load(); }, []);

  async function createRequest(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    const response = await fetch(`${API_URL}/v1/patient/care-requests`, {
      method: "POST", credentials: "include", headers: { "content-type": "application/json" },
      body: JSON.stringify({ type, title, description: description || undefined, country: country || undefined }),
    });
    if (!response.ok) { setMessage("We could not submit the request. Please try again."); return; }
    setTitle(""); setDescription(""); setMessage("Request submitted. Our care team can review it from here.");
    await load();
  }

  async function updateTask(planId: string, task: Task) {
    const next = task.status === "DONE" ? "TODO" : "DONE";
    const response = await fetch(`${API_URL}/v1/patient/care-plans/${planId}/tasks/${task.id}`, {
      method: "PATCH", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: next }),
    });
    if (response.ok) await load();
  }

  return (
    <main className={styles.page}>
      <div className={styles.glow} />
      <header className={styles.header}>
        <div><span className={styles.eyebrow}>CareBridge Care Hub</span><h1>Your care, beyond the consultation.</h1><p>Keep treatment coordination, follow-ups, medications and procedure requests in one calm place.</p></div>
        <a href="/dashboard" className={styles.back}>Dashboard</a>
      </header>

      <section className={styles.grid}>
        <article className={styles.heroCard}>
          <div className={styles.icon}>✦</div><div><span className={styles.kicker}>CARE COORDINATION</span><h2>Need more than a consultation?</h2><p>Tell CareBridge what you need next. A care coordinator can review diagnostic, medication, procedure, surgery or coordination requests.</p></div>
          <form onSubmit={createRequest} className={styles.form}>
            <label>What do you need?<select value={type} onChange={(e) => setType(e.target.value)}><option value="COORDINATION">Care coordination</option><option value="DIAGNOSTIC">Diagnostic support</option><option value="MEDICATION">Medication support</option><option value="PROCEDURE">Procedure planning</option><option value="SURGERY">Surgery planning</option></select></label>
            <label>Request title<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Help me understand surgery options" maxLength={160} /></label>
            <label>Details<textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Share what you would like the care team to help with." maxLength={2000} /></label>
            <label>Preferred country<input value={country} onChange={(e) => setCountry(e.target.value)} maxLength={80} /></label>
            <button type="submit">Start a care request <span>→</span></button>
            {message && <p className={styles.message}>{message}</p>}
          </form>
        </article>

        <article className={styles.card}><div className={styles.cardHead}><div><span className={styles.kicker}>YOUR PLAN</span><h2>Care plans</h2></div><span className={styles.count}>{plans.length}</span></div>
          {plans.length === 0 ? <div className={styles.empty}>Your care plan will appear here after your clinician or care team creates one.</div> : plans.map((plan) => <div className={styles.plan} key={plan.id}><div className={styles.planTitle}><strong>{plan.title}</strong><span>{plan.status}</span></div>{plan.description && <p>{plan.description}</p>}{plan.tasks.map((task) => <button className={`${styles.task} ${task.status === "DONE" ? styles.done : ""}`} key={task.id} onClick={() => updateTask(plan.id, task)}><span>{task.status === "DONE" ? "✓" : "○"}</span><span>{task.title}</span>{task.dueAt && <small>{new Date(task.dueAt).toLocaleDateString()}</small>}</button>)}</div>)}
        </article>
      </section>

      <section className={styles.card}><div className={styles.cardHead}><div><span className={styles.kicker}>REQUEST TRACKER</span><h2>Care requests</h2></div><span className={styles.count}>{requests.length}</span></div>
        {requests.length === 0 ? <div className={styles.empty}>No care requests yet.</div> : <div className={styles.requests}>{requests.map((item) => <div className={styles.request} key={item.id}><div><strong>{item.title}</strong><p>{item.type.replaceAll("_", " ")} {item.country ? `· ${item.country}` : ""}</p></div><span className={styles.status}>{item.status.replaceAll("_", " ")}</span></div>)}</div>}
      </section>
    </main>
  );
}
