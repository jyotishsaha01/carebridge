"use client";

import { useEffect, useState } from "react";
import styles from "./analytics.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
type Metrics = { patients:number; doctors:number; verifiedDoctors:number; appointments:number; consultations:number; completedConsultations:number; careRequests:number; unreadNotifications:number; recentAuditEvents:number; consultationCompletionRate:number };
type CareRequest = { id:string; type:string; title:string; status:string; country?:string|null; patient:{firstName?:string|null;lastName?:string|null;country:string} };

export default function AnalyticsPage(){
 const [metrics,setMetrics]=useState<Metrics|null>(null); const [requests,setRequests]=useState<CareRequest[]>([]); const [message,setMessage]=useState("");
 async function load(){const [a,b]=await Promise.all([fetch(`${API_URL}/v1/admin/analytics/overview`,{credentials:"include"}),fetch(`${API_URL}/v1/admin/care-requests?limit=20`,{credentials:"include`"})]); if(a.ok)setMetrics(await a.json()); if(b.ok)setRequests(await b.json()); else setMessage("Admin session required.");}
 useEffect(()=>{void load()},[]);
 async function update(id:string,status:string){const r=await fetch(`${API_URL}/v1/admin/care-requests/${id}`,{method:"PATCH",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify({status})}); if(r.ok) await load();}
 return <main className={styles.page}><div className={styles.wrap}><header><div><span>CareBridge Operations</span><h1>Command center</h1><p>Monitor care demand, completion and operational workload without exposing unnecessary clinical detail.</p></div><a href="/">← Admin</a></header>{message&&<div className={styles.notice}>{message}</div>}<section className={styles.metrics}>{metrics&&Object.entries({Patients:metrics.patients,Doctors:metrics.verifiedDoctors,Appointments:metrics.appointments,Consultations:metrics.consultations,"Completed":metrics.completedConsultations,"Open care requests":metrics.careRequests,"Unread alerts":metrics.unreadNotifications,"Audit events/24h":metrics.recentAuditEvents,"Completion rate":`${metrics.consultationCompletionRate}%`}).map(([label,value])=><div className={styles.metric} key={label}><span>{label}</span><strong>{value}</strong></div>)}</section><section className={styles.panel}><div className={styles.head}><div><span>CARE COORDINATION</span><h2>Incoming requests</h2></div><span>{requests.length}</span></div>{requests.length===0?<p className={styles.empty}>No active care requests.</p>:requests.map(r=><div className={styles.row} key={r.id}><div><strong>{r.title}</strong><p>{r.type.replaceAll("_"," ")} · {r.patient.firstName||"Patient"} · {r.patient.country}</p></div><select value={r.status} onChange={e=>update(r.id,e.target.value)}><option>REQUESTED</option><option>REVIEWING</option><option>APPROVED</option><option>SCHEDULED</option><option>COMPLETED</option><option>CANCELLED</option></select></div>)}</section></div></main>;
}
