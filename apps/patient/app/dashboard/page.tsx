"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getCurrentUser, signOut, type AuthUser } from "../../lib/api";
import styles from "./dashboard.module.css";

const quickActions = [
  { href: "/#specialists", label: "Find a specialist", detail: "Compare expertise and consultation costs", icon: "⌕" },
  { href: "/documents", label: "Medical documents", detail: "Keep reports ready for your care team", icon: "▣" },
  { href: "/#how-it-works", label: "How CareBridge works", detail: "Understand your consultation journey", icon: "→" },
];

export default function DashboardPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    getCurrentUser()
      .then((response) => setUser(response.user))
      .catch((err) => setError(err instanceof Error ? err.message : "Please sign in to view your dashboard."))
      .finally(() => setLoading(false));
  }, []);

  async function logout() {
    setSigningOut(true);
    try {
      await signOut();
      window.location.href = "/";
    } catch {
      setSigningOut(false);
      setError("We could not end the session. Please try again.");
    }
  }

  if (loading) {
    return <main className={styles.shell}><div className={styles.loadingCard}><span className={styles.spinner} />Preparing your CareBridge dashboard…</div></main>;
  }

  if (!user) {
    return (
      <main className={styles.shell}>
        <section className={styles.emptyCard}>
          <span className={styles.mark}>C</span>
          <div className="eyebrow">PATIENT SPACE</div>
          <h1>Your care, organized.</h1>
          <p>Sign in to access your personalized CareBridge dashboard, consultations and medical records.</p>
          {error && <div className={styles.error} role="alert">{error}</div>}
          <Link className="button primary" href="/login">Sign in to CareBridge</Link>
          <Link className={styles.backLink} href="/">← Back to specialists</Link>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      <div className={styles.ambient} />
      <header className={styles.topbar}>
        <Link className="brand" href="/"><span className="brand-mark">C</span><span>CareBridge</span></Link>
        <nav aria-label="Patient navigation">
          <Link href="/">Find specialists</Link>
          <Link href="/documents">Documents</Link>
          <button onClick={logout} disabled={signingOut}>{signingOut ? "Signing out…" : "Sign out"}</button>
        </nav>
      </header>

      <section className={styles.hero}>
        <div>
          <div className="eyebrow">YOUR CAREBRIDGE SPACE</div>
          <h1>Good to see you.</h1>
          <p>Everything you need for your care journey, brought together in one secure place.</p>
        </div>
        <div className={styles.profileCard}>
          <div className={styles.avatar}>{user.email.slice(0, 1).toUpperCase()}</div>
          <div><span>Signed in as</span><strong>{user.email}</strong><small>{user.role === "PATIENT" ? "Patient account" : `${user.role} account`}</small></div>
        </div>
      </section>

      <section className={styles.grid} aria-label="Care overview">
        <article className={`${styles.overview} ${styles.primaryCard}`}>
          <div className={styles.cardHeader}><div><span className={styles.cardEyebrow}>NEXT STEP</span><h2>Plan your consultation</h2></div><span className={styles.status}>Ready</span></div>
          <p>Find a specialist, review transparent consultation pricing and choose a convenient time.</p>
          <Link className="button primary" href="/#specialists">Explore specialists →</Link>
        </article>
        <article className={styles.overview}>
          <div className={styles.metricIcon}>◷</div><span className={styles.cardEyebrow}>APPOINTMENTS</span><h2>Upcoming</h2><strong className={styles.bigNumber}>0</strong><p>Your confirmed consultations will appear here.</p>
        </article>
        <article className={styles.overview}>
          <div className={styles.metricIcon}>▣</div><span className={styles.cardEyebrow}>MEDICAL RECORDS</span><h2>Documents</h2><strong className={styles.bigNumber}>0</strong><p>Upload reports and records when your care team needs them.</p><Link className={styles.textLink} href="/documents">Open documents →</Link>
        </article>
      </section>

      <section className={styles.actionsSection}>
        <div><div className="eyebrow">QUICK ACTIONS</div><h2>Keep moving forward.</h2></div>
        <div className={styles.actionGrid}>{quickActions.map((action) => <Link href={action.href} className={styles.action} key={action.label}><span className={styles.actionIcon}>{action.icon}</span><span><strong>{action.label}</strong><small>{action.detail}</small></span><b>↗</b></Link>)}</div>
      </section>

      <section className={styles.notice}><div className={styles.noticeIcon}>✓</div><div><strong>Built around informed care</strong><p>CareBridge shows consultation pricing and comparable estimates as decision-support information. It is not a substitute for emergency care or a guarantee of treatment cost.</p></div></section>

      <footer className={styles.footer}><Link href="/">CareBridge</Link><span>Global Healthcare. Trusted Care. Smarter Costs.</span><small>Development environment · Synthetic data only</small></footer>
    </main>
  );
}
