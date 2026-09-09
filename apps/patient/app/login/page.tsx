"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./login.module.css";
import { signIn, signUp } from "../../lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = mode === "login" ? await signIn(email, password) : await signUp(email, password);
      setMessage(`Welcome to CareBridge. Signed in as ${result.user.email}.`);
      window.setTimeout(() => router.push("/dashboard"), 500);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to continue. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.shell}>
      <div className={`${styles.orbit} ${styles.orbitOne}`} />
      <div className={`${styles.orbit} ${styles.orbitTwo}`} />
      <section className={styles.card}>
        <Link className="brand" href="/" aria-label="CareBridge home"><span className="brand-mark">C</span><span>CareBridge</span></Link>
        <div className={styles.copy}>
          <div className="eyebrow">YOUR CARE, ONE PLACE</div>
          <h1>{mode === "login" ? "Welcome back." : "Start your care journey."}</h1>
          <p>{mode === "login" ? "Sign in to manage consultations, medical records and follow-ups." : "Create a secure patient account to book consultations and keep your care organized."}</p>
        </div>
        <div className={styles.tabs} role="tablist" aria-label="Account access">
          <button className={mode === "login" ? styles.active : ""} onClick={() => setMode("login")} type="button">Sign in</button>
          <button className={mode === "signup" ? styles.active : ""} onClick={() => setMode("signup")} type="button">Create account</button>
        </div>
        <form className={styles.form} onSubmit={submit}>
          <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required /></label>
          <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 12 characters" minLength={12} maxLength={128} autoComplete={mode === "login" ? "current-password" : "new-password"} required /></label>
          <button className="button primary full" disabled={busy} type="submit">{busy ? "Securing your session…" : mode === "login" ? "Sign in securely" : "Create secure account"}</button>
        </form>
        {message && <div className={styles.message} role="status">{message}</div>}
        <div className={styles.trust}><span>🔒 Encrypted session</span><span>✓ Patient account</span><span>✓ No plain-text password storage</span></div>
        <p className="microcopy">Development environment: authentication is connected to the local CareBridge API. Production identity verification, recovery and regulatory controls will be added before launch.</p>
      </section>
    </main>
  );
}
