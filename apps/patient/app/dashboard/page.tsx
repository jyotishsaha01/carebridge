"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL, apiFetch, signOut, type AuthUser } from "../../lib/api";
import styles from "./dashboard.module.css";

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </svg>
  );
}

type DashboardData = { appointmentCount?:number; documentCount?:number; consultationCount?:number; appointments: Array<{ id:string; scheduledAt:string; status:string; doctor:{name:string;specialty:string} }>; documents:Array<unknown>; consultations:Array<{id:string;status:string;summary:string|null}> };
type NotificationData = { unreadCount:number };

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [unread, setUnread] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const lifetime = useRef<AbortController | null>(null);
  const activeLoad = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!lifetime.current || lifetime.current.signal.aborted) return;
    activeLoad.current?.abort(); const controller = new AbortController(); activeLoad.current = controller;
    const signal = AbortSignal.any([controller.signal, lifetime.current.signal]); setRefreshing(true);
    try {
      const response = await apiFetch<{ user: AuthUser }>("/v1/auth/me", { signal });
      if (signal.aborted) return;
      if (response.user.role !== "PATIENT") throw new Error("Please use your patient account to access this workspace.");
      setUser(response.user);
      const [dashboard, notifications] = await Promise.allSettled([apiFetch<DashboardData>("/v1/patient/dashboard", { signal }), apiFetch<NotificationData>("/v1/notifications?limit=1", { signal })]);
      if (signal.aborted) return;
      if (dashboard.status === "rejected") throw dashboard.reason;
      setData(dashboard.value);
      if (notifications.status === "fulfilled") { setUnread(notifications.value.unreadCount); setError(""); }
      else setError("Your dashboard is up to date, but notification counts could not be refreshed.");
    } catch (cause) { if (!signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load your dashboard."); }
    finally { if (!signal.aborted) { setLoading(false); setRefreshing(false); } }
  }, []);
  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    const stream = new EventSource(`${API_URL}/v1/notifications/stream`, { withCredentials: true });
    stream.addEventListener("notification", refresh); stream.addEventListener("ready", refresh);
    const timer = window.setTimeout(refresh, 0); window.addEventListener("focus", refresh);
    return () => { window.clearTimeout(timer); controller.abort(); activeLoad.current?.abort(); stream.close(); window.removeEventListener("focus", refresh); };
  }, [load]);

  async function logout() { setSigningOut(true); try { await signOut(); router.push("/"); } catch { setSigningOut(false); setError("We could not end the session. Please try again."); } }

  if (loading) return <main className={styles.shell}><div className={styles.loadingCard}><span className={styles.spinner} />Preparing your CareBridge dashboard…</div></main>;
  if (!user) return <main className={styles.shell}><section className={styles.emptyCard}><span className={styles.mark}>C</span><div className="eyebrow">PATIENT SPACE</div><h1>Your care, organized.</h1><p>Sign in to access your personalized CareBridge dashboard, consultations and medical records.</p>{error && <div className={styles.error} role="alert">{error}</div>}<Link className="button primary" href="/login">Sign in to CareBridge</Link><Link className={styles.backLink} href="/">← Back to specialists</Link></section></main>;

  if (!data) return <main className="system-state"><h1>Your dashboard couldn’t be loaded.</h1><p role="alert">{error}</p><button className="button primary" onClick={() => void load()} disabled={refreshing}>Try again</button><Link className="button ghost" href="/">Find a specialist</Link></main>;
  const upcomingAppointments = data.appointments.filter((item) => item.status === "BOOKED" && new Date(item.scheduledAt) >= new Date()).sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
  const nextAppointment = upcomingAppointments[0];
  return <main className={styles.shell}><div className={styles.ambient} /><header className={styles.topbar}><Link className="brand" href="/dashboard" aria-label="CareBridge patient dashboard"><span className="brand-mark">C</span><span>CareBridge</span></Link><nav aria-label="Patient navigation"><Link href="/">Find specialists</Link><Link href="/appointments?view=all">Appointments</Link><Link href="/care">Care hub</Link><Link href="/documents">Documents</Link><Link href="/records">Records</Link><Link href="/profile">Profile</Link><Link href="/notifications" className={styles.notificationBell} aria-label={unread !== null && unread > 0 ? `Notifications, ${unread} unread` : "Notifications"} title="Notifications"><BellIcon />{unread !== null && unread > 0 && <span className={styles.notificationBadge}>{unread > 99 ? "99+" : unread}</span>}</Link><button onClick={logout} disabled={signingOut}>{signingOut ? "Signing out…" : "Sign out"}</button></nav></header><section className={styles.hero}><div><div className="eyebrow">YOUR CAREBRIDGE SPACE</div><h1>Good to see you.</h1><p>Everything you need for your care journey, brought together in one secure place.</p></div><div className={styles.profileCard}><div className={styles.avatar}>{user.email.slice(0,1).toUpperCase()}</div><div><span>Signed in as</span><strong>{user.email}</strong><small>{user.role === "PATIENT" ? "Patient account" : `${user.role} account`}</small></div></div></section>{error && <div className={styles.error} role="alert">{error}</div>}<button className="button ghost" style={{marginBottom:16}} disabled={refreshing} onClick={() => void load()}>{refreshing ? "Refreshing…" : "Refresh dashboard"}</button><section className={styles.grid} aria-label="Care overview"><article className={`${styles.overview} ${styles.primaryCard}`}><div className={styles.cardHeader}><div><span className={styles.cardEyebrow}>NEXT APPOINTMENT</span><h2>{nextAppointment ? nextAppointment.doctor.name : "Plan your consultation"}</h2></div><span className={styles.status}>{nextAppointment ? new Date(nextAppointment.scheduledAt).toLocaleDateString() : "Ready"}</span></div><p>{nextAppointment ? `${nextAppointment.doctor.specialty} · ${new Date(nextAppointment.scheduledAt).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}` : "Find a specialist, review transparent consultation pricing and choose a convenient time."}</p><Link className="button primary" href={nextAppointment ? `/appointments/${encodeURIComponent(nextAppointment.id)}` : "/#specialists"}>{nextAppointment ? "Open appointment →" : "Explore specialists →"}</Link></article><Link className={styles.overview} href="/appointments?view=upcoming" aria-label="Upcoming appointments"><div className={styles.metricIcon}>◷</div><span className={styles.cardEyebrow}>APPOINTMENTS</span><h2>Upcoming</h2><strong className={styles.bigNumber}>{data.appointmentCount ?? upcomingAppointments.length}</strong><p>Open your upcoming appointment schedule and booking details.</p><span className={styles.textLink}>View upcoming appointments →</span></Link><Link className={styles.overview} href="/documents" aria-label="Medical documents"><div className={styles.metricIcon}>▣</div><span className={styles.cardEyebrow}>MEDICAL RECORDS</span><h2>Documents</h2><strong className={styles.bigNumber}>{data.documentCount ?? data.documents.length}</strong><p>Manage reports and records shared through your account.</p><span className={styles.textLink}>Open documents →</span></Link></section><section className={styles.actionsSection}><div><div className="eyebrow">QUICK ACTIONS</div><h2>Keep moving forward.</h2></div><div className={styles.actionGrid}><Link href="/records" className={styles.action}><span className={styles.actionIcon}>▤</span><span><strong>Medical records</strong><small>Review consultations, prescriptions and follow-ups</small></span><b>↗</b></Link><Link href="/care" className={styles.action}><span className={styles.actionIcon}>✦</span><span><strong>Care hub</strong><small>Coordinate treatment beyond consultation</small></span><b>↗</b></Link><Link href="/notifications" className={styles.action}><span className={styles.actionIcon}>◌</span><span><strong>Notifications</strong><small>{unread === null ? "Open your care updates" : unread ? `${unread} updates need your attention` : "You are all caught up"}</small></span><b>↗</b></Link><Link href="/documents" className={styles.action}><span className={styles.actionIcon}>▣</span><span><strong>Medical documents</strong><small>Keep reports ready for your care team</small></span><b>↗</b></Link><Link href="/appointments?view=all" className={styles.action}><span className={styles.actionIcon}>◷</span><span><strong>All appointments</strong><small>Review upcoming and previous bookings</small></span><b>↗</b></Link><Link href="/care-plan" className={styles.action}><span className={styles.actionIcon}>✓</span><span><strong>Care plan progress</strong><small>Track and save recommended tasks</small></span><b>↗</b></Link><Link href="/payments" className={styles.action}><span className={styles.actionIcon}>$</span><span><strong>Payment history</strong><small>Review server-confirmed payment records</small></span><b>↗</b></Link><Link href="/support" className={styles.action}><span className={styles.actionIcon}>?</span><span><strong>Support requests</strong><small>Read replies and track saved request stages</small></span><b>↗</b></Link></div></section><section className={styles.notice}><div className={styles.noticeIcon}>✓</div><div><strong>Built around informed care</strong><p>CareBridge shows consultation pricing and comparable estimates as decision-support information. It is not a substitute for emergency care or a guarantee of treatment cost.</p></div></section><footer className={styles.footer}><Link href="/">CareBridge</Link><span>Global Healthcare. Trusted Care. Smarter Costs.</span><small>Your personal care workspace</small></footer></main>;
}
