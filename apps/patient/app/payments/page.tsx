"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getPayments, type PaymentSummary } from "../../lib/api";
import styles from "./payments.module.css";

function money(amountMinor: number, currency: string) { return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amountMinor / 100); }
function date(value?: string) { return value ? new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—"; }

export default function PaymentsPage() {
  const [payments, setPayments] = useState<PaymentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { getPayments().then(setPayments).catch((e) => setError(e instanceof Error ? e.message : "Unable to load payment history.")).finally(() => setLoading(false)); }, []);
  return <main className={styles.shell}><header className={styles.header}><Link className="brand" href="/"><span className="brand-mark">C</span><span>CareBridge</span></Link><Link href="/dashboard" className={styles.back}>← Dashboard</Link></header><section className={styles.hero}><div className="eyebrow">PAYMENTS</div><h1>Your payment history.</h1><p>Secure, server-confirmed records of your CareBridge consultation payments.</p></section>{loading ? <div className={styles.empty}>Loading your payments…</div> : error ? <div className={styles.error}>{error}</div> : payments.length === 0 ? <div className={styles.empty}>No payments yet. When you book a consultation, your payment record will appear here.</div> : <section className={styles.list}>{payments.map((payment) => <article className={styles.row} key={payment.id}><div><strong>{payment.doctorName ?? "CareBridge consultation"}</strong><span>{date(payment.scheduledAt)}</span><small>{payment.provider} · {payment.id}</small></div><div className={styles.amount}><strong>{money(payment.amountMinor, payment.currency)}</strong><span className={payment.status}>{payment.status.replaceAll("_", " ")}</span></div>{payment.status === "REQUIRES_ACTION" && <Link className="button primary" href={`/checkout/${encodeURIComponent(payment.appointmentId)}`}>Continue payment →</Link>}</article>)}</section>}</main>;
}
