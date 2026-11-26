"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPaymentIntent, getPayment, type PaymentSummary } from "../../lib/api";
import styles from "./checkout.module.css";
import { trustedCheckoutUrl } from "../../lib/checkout-url";

function money(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amountMinor / 100);
}

export default function CheckoutForm({ appointmentId }: { appointmentId: string }) {
  const router = useRouter();
  const [payment, setPayment] = useState<PaymentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getPayment(appointmentId)
      .then((result) => { if (active) setPayment(result); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Unable to load payment status."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [appointmentId]);

  async function startPayment() {
    if (paying) return;
    setPaying(true);
    setError("");
    try {
      const intent = payment?.checkoutUrl && ["PENDING", "REQUIRES_ACTION"].includes(payment.status) ? payment : await createPaymentIntent(appointmentId);
      setPayment(intent);
      if (intent.checkoutUrl) {
        window.location.assign(trustedCheckoutUrl(intent.checkoutUrl));
      } else if (intent.status !== "SUCCEEDED") {
        setError("Secure payment is currently unavailable. Please try again later or contact support. No payment has been taken.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "We could not start checkout. Please try again.");
    } finally { setPaying(false); }
  }

  if (loading) return <main className={styles.shell}><div className={styles.loading} role="status">Preparing your secure checkout…</div></main>;

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
            <p>Specialist consultation{payment?.scheduledAt ? ` · ${new Date(payment.scheduledAt).toLocaleString()}` : ""}</p>
            {payment?.status === "SUCCEEDED" ? (
              <button className="button primary" onClick={() => router.push("/dashboard")}>Payment complete →</button>
            ) : payment && ["CANCELLED", "REFUNDED"].includes(payment.status) ? <p>This payment is {payment.status.toLowerCase()}. <Link href="/support">Contact support</Link> if you need help.</p> : (
              <button className="button primary" onClick={startPayment} disabled={paying}>{paying ? "Opening secure checkout…" : payment ? "Continue to secure payment →" : "Continue to payment →"}</button>
            )}
            <p><Link href={`/appointments/${encodeURIComponent(appointmentId)}`}>View appointment →</Link></p>
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
