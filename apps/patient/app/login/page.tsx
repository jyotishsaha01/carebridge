"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./login.module.css";
import { getSpecialties, signIn, signUp } from "../../lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [role, setRole] = useState<"PATIENT" | "DOCTOR" | "ADMIN">("PATIENT");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [specialtyId, setSpecialtyId] = useState("");
  const [location, setLocation] = useState("");
  const [experienceYears, setExperienceYears] = useState("");
  const [specialties, setSpecialties] = useState<Array<{ id: string; name: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const loginRequest = useRef<AbortController | null>(null);
  useEffect(() => () => loginRequest.current?.abort(), []);

  useEffect(() => {
    if (mode !== "signup" || role !== "DOCTOR") return;
    let active = true;
    void getSpecialties().then((items) => {
      if (!active) return;
      setSpecialties(items);
      setSpecialtyId((current) => current || items[0]?.id || "");
    }).catch(() => { if (active) setMessage("Specialties could not be loaded. Please try again shortly."); });
    return () => { active = false; };
  }, [mode, role]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || loginRequest.current) return;
    const controller = new AbortController(); loginRequest.current = controller;
    setBusy(true);
    setMessage("");
    try {
      if (mode === "signup") {
        const result = await signUp(email.trim(), password, role === "DOCTOR" ? {
          role,
          doctorProfile: { name: doctorName, specialtyId, location, experienceYears: Number(experienceYears) },
        } : { role: "PATIENT" }, controller.signal);
        if (controller.signal.aborted) return;
        if (role === "DOCTOR") {
          setMessage("Doctor account created. Submit your credentials for verification to complete your application.");
          const workspaceUrl = process.env.NEXT_PUBLIC_DOCTOR_APP_URL ?? "http://localhost:3001";
          window.location.assign(new URL("/onboarding", workspaceUrl).toString());
          return;
        }
        if (result.emailVerificationRequired) {
          setMessage("Account created. Check your email for the verification link.");
          return;
        }
        setMessage(`Welcome to CareBridge. Signed in as ${result.user.email}.`);
      } else {
        const result = await signIn(email.trim(), password, role, controller.signal);
        if (controller.signal.aborted) return;
        setMessage(`Welcome to CareBridge. Signed in as ${result.user.email}.`);
        if (role !== "PATIENT") {
          const workspaceUrl = role === "DOCTOR"
            ? process.env.NEXT_PUBLIC_DOCTOR_APP_URL ?? "http://localhost:3001"
            : process.env.NEXT_PUBLIC_ADMIN_APP_URL ?? "http://localhost:3002";
          window.location.assign(new URL("/dashboard", workspaceUrl).toString());
          return;
        }
      }
      router.push("/dashboard");
    } catch (error) {
      if (controller.signal.aborted) return;
      setMessage(error instanceof Error ? error.message : "Unable to continue. Please try again.");
    } finally {
      if (loginRequest.current === controller) loginRequest.current = null;
      if (!controller.signal.aborted) setBusy(false);
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
          <p>{mode === "login" ? "Sign in to manage consultations, medical records and follow-ups." : role === "DOCTOR" ? "Create your clinician profile and submit credentials for verification." : role === "ADMIN" ? "Administrator accounts are available by invitation only." : "Create a secure patient account to book consultations and keep your care organized."}</p>
        </div>
        <div className={styles.tabs} role="group" aria-label="Account access">
          <button className={mode === "login" ? styles.active : ""} aria-pressed={mode === "login"} disabled={busy} onClick={() => { setMode("login"); setMessage(""); }} type="button">Sign in</button>
          <button className={mode === "signup" ? styles.active : ""} aria-pressed={mode === "signup"} disabled={busy} onClick={() => { setMode("signup"); setRole("PATIENT"); setMessage(""); }} type="button">Create account</button>
        </div>
        <fieldset className={styles.rolePicker}>
          <legend>{mode === "login" ? "Sign in as" : "Create account as"}</legend>
          {([ ["PATIENT", "Patient"], ["DOCTOR", "Doctor"], ["ADMIN", "Admin"] ] as const).map(([value, label]) => (
            <button key={value} disabled={busy} className={`${styles.roleButton} ${role === value ? styles.roleActive : ""} ${mode === "signup" && value === "ADMIN" ? styles.roleUnavailable : ""}`} onClick={() => { setRole(value); setMessage(""); }} type="button" aria-pressed={role === value}>{label}{mode === "signup" && value === "ADMIN" && <small>Invite only</small>}</button>
          ))}
        </fieldset>
        {mode === "signup" && role === "ADMIN" ? <div className={styles.message} role="note">Admin accounts are created by an existing administrator. Contact your organization for an invitation.</div> : <form className={styles.form} onSubmit={submit}>
          {mode === "signup" && role === "DOCTOR" && <>
            <label>Full professional name<input disabled={busy} value={doctorName} onChange={(event) => setDoctorName(event.target.value)} placeholder="Name as shown on your license" minLength={2} maxLength={100} required /></label>
            <label>Specialty<select disabled={busy} value={specialtyId} onChange={(event) => setSpecialtyId(event.target.value)} required><option value="" disabled>Select a specialty</option>{specialties.map((specialty) => <option key={specialty.id} value={specialty.id}>{specialty.name}</option>)}</select></label>
            <label>Practice location<input disabled={busy} value={location} onChange={(event) => setLocation(event.target.value)} placeholder="City, country" minLength={2} maxLength={120} required /></label>
            <label>Years of experience<input disabled={busy} type="number" value={experienceYears} onChange={(event) => setExperienceYears(event.target.value)} min={0} max={70} step={1} required /></label>
          </>}
          <label>Email address<input disabled={busy} type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" required /></label>
          <label>Password<input disabled={busy} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === "login" ? "Your password" : "At least 12 characters"} minLength={mode === "signup" ? 12 : 1} maxLength={128} autoComplete={mode === "login" ? "current-password" : "new-password"} required /></label>
          <button className="button primary full" disabled={busy} type="submit">{busy ? "Securing your session…" : mode === "login" ? "Sign in securely" : "Create secure account"}</button>
        </form>}
        {mode === "login" && <div style={{ marginTop: 12, display: "flex", gap: 14, flexWrap: "wrap" }}><Link className="microcopy" href="/forgot-password">Forgot password?</Link><Link className="microcopy" href="/verify-email">Verify email</Link></div>}
        {message && <div className={styles.message} role="status">{message}</div>}
        <div className={styles.trust}><span>🔒 Encrypted session</span><span>✓ {mode === "signup" ? `${role === "DOCTOR" ? "Doctor application" : "Patient account"}` : `${role[0]}${role.slice(1).toLowerCase()} workspace`}</span><span>✓ Security events audited</span></div>
        <p className="microcopy">Use your personal account to access care records. Keep your password private and sign out on shared devices.</p>
      </section>
    </main>
  );
}
