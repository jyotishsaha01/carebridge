"use client";

import Link from "next/link";
import { FormEvent, Suspense, useState } from "react";
import { useOneTimeToken } from "../../lib/use-one-time-token";
import styles from "../login/login.module.css";
import { resendVerification, verifyEmail } from "../../lib/api";

function VerifyEmailForm() {
  const [token, setToken] = useOneTimeToken();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setMessage("");
    try { await verifyEmail(token.trim()); setToken(""); setMessage("Email verified. You can now sign in to CareBridge."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Unable to verify email."); }
    finally { setBusy(false); }
  }

  async function resend() {
    setBusy(true); setMessage("");
    try {
      const result = await resendVerification(email);
      setMessage(result.devVerificationToken ? `Verification requested. Development token: ${result.devVerificationToken}` : result.message);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to resend verification."); }
    finally { setBusy(false); }
  }

  return <main className={styles.shell}><section className={styles.card}>
    <Link className="brand" href="/"><span className="brand-mark">C</span><span>CareBridge</span></Link>
    <div className={styles.copy}><div className="eyebrow">ACCOUNT SECURITY</div><h1>Verify your email.</h1><p>Use the verification link or token from your email to activate your account.</p></div>
    <form className={styles.form} onSubmit={submit}><label>Verification token<input type="password" autoComplete="off" spellCheck={false} maxLength={200} value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste your token" required /></label><button className="button primary full" disabled={busy} type="submit">{busy ? "Verifying…" : "Verify email"}</button></form>
    <div style={{ marginTop: 20 }}><label className="microcopy" htmlFor="resend-email">Need a new verification email?</label><input id="resend-email" style={{ width: "100%", minHeight: 48, padding: "0 15px", borderRadius: 14, border: "1px solid rgba(16,34,31,.11)", marginTop: 7 }} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" /><button className="button secondary full" style={{ marginTop: 10 }} disabled={busy || !email} onClick={resend} type="button">Resend verification</button></div>
    {message && <div className={styles.message} role="status">{message}</div>}
    <p className="microcopy"><Link href="/login">Back to sign in</Link></p>
  </section></main>;
}

export default function VerifyEmailPage() {
  return <Suspense fallback={<main className={styles.shell}><section className={styles.card}><p role="status">Preparing email verification…</p></section></main>}><VerifyEmailForm /></Suspense>;
}
