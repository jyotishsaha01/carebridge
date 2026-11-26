"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./analytics.module.css";

import { apiFetch, jsonRequest } from "../../lib/request";
type Metrics = { patients:number; doctors:number; verifiedDoctors:number; appointments:number; consultations:number; completedConsultations:number; careRequests:number; unreadNotifications:number; recentAuditEvents:number; consultationCompletionRate:number };
type CareRequest = { id:string; type:string; title:string; status:string; country?:string|null; patient:{firstName?:string|null;lastName?:string|null;country:string} };

export default function AnalyticsPage(){
 const [metrics,setMetrics]=useState<Metrics|null>(null); const [requests,setRequests]=useState<CareRequest[]>([]); const [message,setMessage]=useState(""); const [loading,setLoading]=useState(true); const [busy,setBusy]=useState(false);
 async function load() {
  setMessage("");
  try { const [overview,rows]=await Promise.all([apiFetch<Metrics>("/v1/admin/analytics/overview"),apiFetch<CareRequest[]>("/v1/admin/care-requests?limit=20")]);setMetrics(overview);setRequests(rows); }
  catch(cause) { setMessage(cause instanceof Error?cause.message:"Unable to load analytics."); }
  finally { setLoading(false); }
 }
 useEffect(()=>{const timer=window.setTimeout(()=>void load(),0);return()=>window.clearTimeout(timer)},[]);
 async function update(id:string,status:string) {
  if(busy)return;setBusy(true);setMessage("");
  try { await apiFetch(`/v1/admin/care-requests/${encodeURIComponent(id)}`,jsonRequest("PATCH",{status}));await load(); }
  catch(cause) { setMessage(cause instanceof Error?cause.message:"Unable to update care request."); }
  finally { setBusy(false); }
 }
 return <main className={styles.page}><div className={styles.wrap}><header><div><span>CareBridge Operations</span><h1>Command center</h1><p>Monitor care demand, completion and operational workload without exposing unnecessary clinical detail.</p></div><Link href="/">← Admin</Link></header>{message&&<div role="alert" className={styles.notice}>{message}</div>}<section className={styles.metrics}>{metrics&&Object.entries({Patients:metrics.patients,Doctors:metrics.verifiedDoctors,Appointments:metrics.appointments,Consultations:metrics.consultations,"Completed":metrics.completedConsultations,"Open care requests":metrics.careRequests,"Unread alerts":metrics.unreadNotifications,"Audit events/24h":metrics.recentAuditEvents,"Completion rate":`${metrics.consultationCompletionRate}%`}).map(([label,value])=><div className={styles.metric} key={label}><span>{label}</span><strong>{value}</strong></div>)}</section><section className={styles.panel}><div className={styles.head}><div><span>CARE COORDINATION</span><h2>Incoming requests</h2></div><span>{requests.length}</span></div>{loading?<p role="status">Loading requests…</p>:requests.length===0?<p className={styles.empty}>No active care requests.</p>:requests.map(r=><div className={styles.row} key={r.id}><div><strong>{r.title}</strong><p>{r.type.replaceAll("_"," ")} · {r.patient.firstName||"Patient"} · {r.patient.country}</p></div><select aria-label={`Status for ${r.title}`} disabled={busy} value={r.status} onChange={e=>update(r.id,e.target.value)}><option>REQUESTED</option><option>REVIEWING</option><option>APPROVED</option><option>SCHEDULED</option><option>COMPLETED</option><option>CANCELLED</option></select></div>)}</section></div></main>;
}
