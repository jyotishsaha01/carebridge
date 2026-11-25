import Link from "next/link";

export default function CheckoutPage() {
  return <main className="system-state"><div className="eyebrow">CAREBRIDGE · CHECKOUT</div><h1>Choose an appointment to continue.</h1><p>Open an appointment from your dashboard to review its fee and payment status.</p><Link className="button primary" href="/dashboard">View my appointments</Link><Link className="button ghost" href="/payments">Payment history</Link></main>;
}
