"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getCurrentUser, signOut, type AuthUser } from "../../lib/api";
import styles from "./dashboard.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type DashboardData = { appointments: Array<{ id:string; scheduledAt:string; status:string; doctor:{name:string;specialty:string} }>; documents:Array<unknown>; consultations:Array<{id:string;status:string;summary:string|null}> };
type NotificationData = { unreadCount:number };

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    getCurrentUser().then(async (response) => {
      setUser(response.user);
      const [dashboard, notifications] = await Promise.all([
        fetch(`${API_URL}/v1/patient/dashboard`, { credentials: "include" }),
        fetch(`${API_URL}/v1/notifications?limit=1`, { credentials: "include" }),
      ]);
      if (dashboard.ok) setData(await dashboard.json());
      if (notifications.ok) { const notificationData: NotificationData = await notifications.json(); setUnread(notificationData.unreadCount); }
    }).catch((err) => setError(err instanceof Error ? err.message : "Please sign in to view your dashboard.")).finally(() => setLoading(false));
  }, []);

  async function logout() { setSigningOut(true); try { await signOut(); router.push("/"); } catch { setSigningOut(false); setError("We could not end the session. Please try again."); } }

  if (loading) return <main className={styles.shell}><div className={styles.loadingCard}><span className={styles.spinner} />Preparing your CareBridge dashboard…</div></main>;
  if (!user) return <main className={styles.shell}><section className={styles.emptyCard}><span className={styles.mark}>C</span><div className="eyebrow">PATIENT SPACE</div><h1>Your care, organized.</h1><p>Sign in to access your personalized CareBridge dashboard, consultations and medical records.</p>{error && <div className={styles.error} role="alert">{error}</div>}<Link className="button primary" href="/login">Sign in to CareBridge</Link><Link className={styles.backLink} href="/">← Back to specialists</Link></section></main>;

  const nextAppointment = data?.appointments.find((item) => new Date(item.scheduledAt) >= new Date());
  return <main className={styles.shell}><div className={styles.ambient} /><header className={styles.topbar}><Link className="brand" href="/"><span className="brand-mark">C</span><span>CareBridge</span></Link><nav aria-label="Patient navigation"><Link href="/">Find specialists</Link><Link href="/care">Care hub</Link><Link href="/documents">Documents</Link><Link href="/notifications">Notifications{unread > 0 ? ` (${unread})` : ""}</Link><button onClick={logout} disabled={signingOut}>{signingOut ? "Signing out…" : "Sign out"}</button></nav></header><section className={styles.hero}><div><div className="eyebrow">YOUR CAREBRIDGE SPACE</div><h1>Good to see you.</h1><p>Everything you need for your care journey, brought together in one secure place.</p></div><div className={styles.profileCard}><div className={styles.avatar}>{user.email.slice(0,1).toUpperCase()}</div><div><span>Signed in as</span><strong>{user.email}</strong><small>{user.role === "PATIENT" ? "Patient account" : `${user.role} account`}</small></div></div></section><section className={styles.grid} aria-label="Care overview"><article className={`${styles.overview} ${styles.primaryCard}`}><div className={styles.cardHeader}><div><span className={styles.cardEyebrow}>NEXT APPOINTMENT</span><h2>{nextAppointment ? nextAppointment.doctor.name : "Plan your consultation"}</h2></div><span className={styles.status}>{nextAppointment ? new Date(nextAppointment.scheduledAt).toLocaleDateString() : "Ready"}</span></div><p>{nextAppointment ? `${nextAppointment.doctor.specialty} · ${new Date(nextAppointment.scheduledAt).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}` : "Find a specialist, review transparent consultation pricing and choose a convenient time."}</p><Link className="button primary" href="/#specialists">{nextAppointment ? "View specialists →" : "Explore specialists →"}</Link></article><article className={styles.overview}><div className={styles.metricIcon}>◷</div><span className={styles.cardEyebrow}>APPOINTMENTS</span><h2>Upcoming</h2><strong className={styles.bigNumber}>{data?.appointments.length ?? 0}</strong><p>Your appointment schedule is synced with your CareBridge account.</p></article><article className={styles.overview}><div className={styles.metricIcon}>▣</div><span className={styles.cardEyebrow}>MEDICAL RECORDS</span><h2>Documents</h2><strong className={styles.bigNumber}>{data?.documents.length ?? 0}</strong><p>Reports and records available to your care team.</p><Link className={styles.textLink} href="/documents">Open documents →</Link></article></section><section className={styles.actionsSection}><div><div className="eyebrow">QUICK ACTIONS</div><h2>Keep moving forward.</h2></div><div className={styles.actionGrid}><Link href="/care" className={styles.action}><span className={styles.actionIcon}>✦</span><span><strong>Care hub</strong><small>Coordinate treatment beyond consultation</small></span><b>↗</b></Link><Link href="/notifications" className={styles.action}><span className={styles.actionIcon}>◌</span><span><strong>Notifications</strong><small>{unread ? `${unread} updates need your attention` : "You are all caught up"}</small></span><b>↗</b></Link><Link href="/documents" className={styles.action}><span className={styles.actionIcon}>▣</span><span><strong>Medical documents</strong><small>Keep reports ready for your care team</small></span><b>↗</b></Link></div></section><section className={styles.notice}><div className={styles.noticeIcon}>✓</div><div><strong>Built around informed care</strong><p>CareBridge shows consultation pricing and comparable estimates as decision-support information. It is not a substitute for emergency care or a guarantee of treatment cost.</p></div></section><footer className={styles.footer}><Link href="/">CareBridge</Link><span>Global Healthcare. Trusted Care. Smarter Costs.</span><small>Development environment · Synthetic data only</small></footer></main>;
}
