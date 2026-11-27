"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, type PaymentSummary } from "../../lib/api";
import styles from "./payments.module.css";

function money(amountMinor: number, currency: string) { return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amountMinor / 100); }
function date(value?: string) { return value ? new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—"; }

export default function PaymentsPage() {
  const [payments, setPayments] = useState<PaymentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const lifetime = useRef<AbortController | null>(null);
  const activeLoad = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    if (!lifetime.current || lifetime.current.signal.aborted) return;
    activeLoad.current?.abort(); const controller = new AbortController(); activeLoad.current = controller;
    const signal = AbortSignal.any([controller.signal, lifetime.current.signal]); setRefreshing(true);
    try { const rows = await apiFetch<PaymentSummary[]>("/v1/payments", { signal }); if (!signal.aborted) { setPayments(rows); setError(""); } }
    catch (cause) { if (!signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load payment history."); }
    finally { if (!signal.aborted) { setLoading(false); setRefreshing(false); } }
  }, []);
  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    const timer = window.setTimeout(refresh, 0); window.addEventListener("focus", refresh);
    return () => { window.clearTimeout(timer); controller.abort(); activeLoad.current?.abort(); window.removeEventListener("focus", refresh); };
  }, [load]);
  return <main className={styles.shell}><header className={styles.header}><Link className="brand" href="/"><span className="brand-mark">C</span><span>CareBridge</span></Link><Link href="/dashboard" className={styles.back}>← Dashboard</Link></header><section className={styles.hero}><div className="eyebrow">PAYMENTS</div><h1>Your payment history.</h1><p>Secure, server-confirmed records of your CareBridge consultation payments.</p><button className="button ghost" disabled={refreshing} onClick={() => void load()}>{refreshing ? "Refreshing…" : "Refresh payments"}</button></section>{error && <div className={styles.error} role="alert">{error} Displayed records may be out of date. <button disabled={refreshing} onClick={() => void load()}>Try again</button></div>}{loading ? <div className={styles.empty} role="status">Loading your payments…</div> : payments.length === 0 && !error ? <div className={styles.empty}>No payments yet. When you book a consultation, your payment record will appear here.</div> : <section className={styles.list}>{payments.map((payment) => <article className={styles.row} key={payment.id}><div><strong>{payment.doctorName ?? "CareBridge consultation"}</strong><span>{date(payment.scheduledAt)}</span><small>{payment.provider} · {payment.id}</small></div><div className={styles.amount}><strong>{money(payment.amountMinor, payment.currency)}</strong><span className={`${styles.status} ${styles[payment.status] ?? ""}`}>{payment.status.replaceAll("_", " ")}</span></div><div className={styles.actions}>{payment.status === "REQUIRES_ACTION" && <Link className="button primary" href={`/checkout/${encodeURIComponent(payment.appointmentId)}`}>Continue payment →</Link>}<Link className="button ghost" href={`/appointments/${encodeURIComponent(payment.appointmentId)}`}>View appointment →</Link></div></article>)}</section>}</main>;
}
