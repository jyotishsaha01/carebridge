"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import styles from "../login/login.module.css";
import { resetPassword } from "../../lib/api";

export default function ResetPasswordPage() {
  const params = useSearchParams();
  const [token, setToken] = useState(() => params.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const mismatch = useMemo(() => Boolean(confirm) && password !== confirm, [password, confirm]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirm) { setMessage("Passwords do not match."); return; }
    setBusy(true); setMessage("");
    try { await resetPassword(token.trim(), password); setMessage("Password updated. All previous sessions have been signed out."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Unable to reset password."); }
    finally { setBusy(false); }
  }

  return <main className={styles.shell}><section className={styles.card}>
    <Link className="brand" href="/"><span className="brand-mark">C</span><span>CareBridge</span></Link>
    <div className={styles.copy}><div className="eyebrow">ACCOUNT RECOVERY</div><h1>Create a new password.</h1><p>Use your one-time recovery token. Passwords must contain at least 12 characters.</p></div>
    <form className={styles.form} onSubmit={submit}>
      <label>Reset token<input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste reset token" required /></label>
      <label>New password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 12 characters" minLength={12} maxLength={128} autoComplete="new-password" required /></label>
      <label>Confirm password<input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat new password" minLength={12} maxLength={128} autoComplete="new-password" required /></label>
      {mismatch && <div className={styles.message}>Passwords do not match yet.</div>}
      <button className="button primary full" disabled={busy || mismatch} type="submit">{busy ? "Updating password…" : "Update password"}</button>
    </form>
    {message && <div className={styles.message} role="status">{message}</div>}
    <p className="microcopy"><Link href="/login">Back to sign in</Link></p>
  </section></main>;
}
