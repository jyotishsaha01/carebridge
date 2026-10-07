"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPaymentIntent, getPayment, type PaymentSummary } from "../../lib/api";
import styles from "./checkout.module.css";

function money(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amountMinor / 100);
}

export default function CheckoutPage() {
  const params = useParams<{ appointmentId: string }>();
  const router = useRouter();
  const appointmentId = params.appointmentId;
  const [payment, setPayment] = useState<PaymentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!appointmentId) return;
    getPayment(appointmentId)
      .then(setPayment)
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load payment status."))
      .finally(() => setLoading(false));
  }, [appointmentId]);

  async function startPayment() {
    setPaying(true);
    setError("");
    try {
      const intent = await createPaymentIntent(appointmentId);
      setPayment(intent);
      if (intent.checkoutUrl) window.location.assign(intent.checkoutUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We could not start checkout. Please try again.");
      setPaying(false);
    }
  }

  if (loading) return <main className={styles.shell}><div className={styles.loading}>Preparing your secure checkout…</div></main>;

  return (
    <main className={styles.shell}>
      <div className={styles.ambient} />
      <header className={styles.header}>
        <Link className="brand" href="/"><span className="brand-mark">C</span><span>CareBridge</span></Link>
        <span className={styles.secure}>⌁ Secure checkout</span>
      </header>
      <section className={styles.layout}>
        <div>
          <div className="eyebrow">CONSULTATION PAYMENT</div>
          <h1>Confirm your consultation.</h1>
          <p className={styles.lead}>Your consultation fee is shown clearly before you continue. Card details are handled by the payment provider, not stored by CareBridge.</p>
          {error && <div className={styles.error} role="alert">{error}</div>}
          <div className={styles.card}>
            <div className={styles.cardTop}><span>Appointment</span><span className={styles.status}>{payment?.status ?? "Ready"}</span></div>
            <div className={styles.price}>{payment ? money(payment.amountMinor, payment.currency) : "Consultation fee"}</div>
            <p>30-minute specialist consultation · USD</p>
            {payment?.status === "SUCCEEDED" ? (
              <button className="button primary" onClick={() => router.push("/dashboard")}>Payment complete →</button>
            ) : (
              <button className="button primary" onClick={startPayment} disabled={paying}>{paying ? "Opening secure checkout…" : payment ? "Continue to secure payment →" : "Continue to payment →"}</button>
            )}
          </div>
        </div>
        <aside className={styles.trustCard}>
          <div className={styles.icon}>✓</div>
          <h2>Designed for peace of mind</h2>
          <ul><li>Server-confirmed payment status</li><li>No card numbers stored by CareBridge</li><li>Duplicate payment protection</li><li>Clear cancellation and refund states</li></ul>
          <Link href="/" className={styles.back}>← Back to specialists</Link>
        </aside>
      </section>
    </main>
  );
}
