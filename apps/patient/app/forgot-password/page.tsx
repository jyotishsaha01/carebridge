"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import styles from "../login/login.module.css";
import { requestPasswordReset } from "../../lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const result = await requestPasswordReset(email);
      setMessage(result.devResetToken ? `Reset requested. Development token: ${result.devResetToken}` : result.message);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to request password reset."); }
    finally { setBusy(false); }
  }

  return <main className={styles.shell}><section className={styles.card}>
    <Link className="brand" href="/"><span className="brand-mark">C</span><span>CareBridge</span></Link>
    <div className={styles.copy}><div className="eyebrow">ACCOUNT RECOVERY</div><h1>Reset your password.</h1><p>Enter your account email. We’ll send recovery instructions when a matching account exists.</p></div>
    <form className={styles.form} onSubmit={submit}><label>Email address<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required /></label><button className="button primary full" disabled={busy} type="submit">{busy ? "Requesting reset…" : "Send reset instructions"}</button></form>
    {message && <div className={styles.message} role="status">{message}</div>}
    <p className="microcopy"><Link href="/login">Back to sign in</Link></p>
  </section></main>;
}
