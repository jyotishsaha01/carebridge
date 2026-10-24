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
      if (mode === "signup") {
        const result = await signUp(email, password);
        if (result.emailVerificationRequired) {
          setMessage("Account created. Check your email for the verification link.");
          return;
        }
        setMessage(`Welcome to CareBridge. Signed in as ${result.user.email}.`);
      } else {
        const result = await signIn(email, password);
        setMessage(`Welcome to CareBridge. Signed in as ${result.user.email}.`);
      }
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
        <div aria-label="Choose your CareBridge portal" style={{ marginTop: 22, marginBottom: 22 }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: "#526579", marginBottom: 10 }}>SIGN IN AS</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
            <div aria-current="page" style={{ border: "2px solid #1672b8", borderRadius: 14, padding: "13px 10px", background: "#eff7ff", color: "#145b91", textAlign: "center" }}>
              <div style={{ fontSize: 20, marginBottom: 5 }}>👤</div>
              <div style={{ fontSize: 14, fontWeight: 800 }}>Patient</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>Current portal</div>
            </div>
            <a href={process.env.NEXT_PUBLIC_DOCTOR_PORTAL_URL ?? "http://localhost:3001/login"} style={{ display: "block", textDecoration: "none", border: "1px solid #cbd5e1", borderRadius: 14, padding: "13px 10px", color: "#172334", textAlign: "center", background: "#fff" }}>
              <div style={{ fontSize: 20, marginBottom: 5 }}>🩺</div>
              <div style={{ fontSize: 14, fontWeight: 800 }}>Doctor</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>Doctor sign in →</div>
            </a>
            <a href={process.env.NEXT_PUBLIC_ADMIN_PORTAL_URL ?? "http://localhost:3002/login"} style={{ display: "block", textDecoration: "none", border: "1px solid #cbd5e1", borderRadius: 14, padding: "13px 10px", color: "#172334", textAlign: "center", background: "#fff" }}>
              <div style={{ fontSize: 20, marginBottom: 5 }}>🛡️</div>
              <div style={{ fontSize: 14, fontWeight: 800 }}>Admin</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>Admin sign in →</div>
            </a>
          </div>
          <p style={{ fontSize: 12, color: "#64748b", marginTop: 9 }}>Choose Patient to use this form, or select Doctor/Admin to open that portal's sign-in page.</p>
        </div>
        <div className={styles.tabs} role="tablist" aria-label="Patient account access">
          <button className={mode === "login" ? styles.active : ""} onClick={() => setMode("login")} type="button">Sign in</button>
          <button className={mode === "signup" ? styles.active : ""} onClick={() => setMode("signup")} type="button">Create account</button>
        </div>
        <form className={styles.form} onSubmit={submit}>
          <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required /></label>
          <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 12 characters" minLength={12} maxLength={128} autoComplete={mode === "login" ? "current-password" : "new-password"} required /></label>
          <button className="button primary full" disabled={busy} type="submit">{busy ? "Securing your session…" : mode === "login" ? "Sign in securely" : "Create secure account"}</button>
        </form>
        {mode === "login" && <div style={{ marginTop: 12, display: "flex", gap: 14, flexWrap: "wrap" }}><Link className="microcopy" href="/forgot-password">Forgot password?</Link><Link className="microcopy" href="/verify-email">Verify email</Link></div>}
        {message && <div className={styles.message} role="status">{message}</div>}
        <div className={styles.trust}><span>🔒 Encrypted session</span><span>✓ Patient account</span><span>✓ Security events audited</span></div>
        <p className="microcopy">Development environment: authentication is connected to the local CareBridge API. Production identity verification, recovery, abuse protection and regulatory controls remain release gates.</p>
      </section>
    </main>
  );
}
