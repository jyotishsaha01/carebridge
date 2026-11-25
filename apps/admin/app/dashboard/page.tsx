"use client";
import Link from "next/link";
import { API_URL, apiFetch, jsonRequest } from "../../lib/request";
import {useEffect,useState} from "react";

function Bell(){return <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>}
type Overview = { patients: number; doctors: number; verifiedDoctors: number; appointments: number; openSessions: number };
type PendingDoctor = { id: string; name: string; location: string; specialty: { name: string } };
type Ticket = { id: string; category: string; message: string; status: string; user: { email: string } };
export default function AdminDashboard() {
 const [data,setData]=useState<Overview|null>(null);
 const [unread,setUnread]=useState(0);
 const [doctors,setDoctors]=useState<PendingDoctor[]>([]);
 const [tickets,setTickets]=useState<Ticket[]>([]);
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 async function load() {
  setError("");
  try {
   const [overview, providers, queue] = await Promise.all([
    apiFetch<Overview>("/v1/admin/overview"),
    apiFetch<PendingDoctor[]>("/v1/admin/doctors?verified=false"),
    apiFetch<Ticket[]>("/v1/admin/support/tickets?limit=20"),
   ]);
   setData(overview); setDoctors(providers); setTickets(queue); return true;
  } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load operations."); return false; }
  finally { setLoading(false); }
 }
 useEffect(() => {
  let active=true; let stream: EventSource | undefined;
  const timer=window.setTimeout(() => { void load().then(async loaded => {
   if (!loaded || !active) return;
   try {
    const notifications=await apiFetch<{unreadCount:number}>("/v1/notifications?limit=1");
    if (!active) return;
    setUnread(notifications.unreadCount);
    stream=new EventSource(`${API_URL}/v1/notifications/stream`,{withCredentials:true});
    stream.addEventListener("notification",()=>setUnread(current=>current+1));
   } catch { /* The dashboard remains usable if notification delivery is unavailable. */ }
  }); }, 0);
  return () => { active=false; window.clearTimeout(timer); stream?.close(); };
 }, []);
 async function updateTicket(id:string,status:string) {
  if (busy) return; setBusy(true); setError("");
  try { await apiFetch(`/v1/admin/support/tickets/${encodeURIComponent(id)}`, jsonRequest("PATCH",{status})); await load(); }
  catch(cause) { setError(cause instanceof Error?cause.message:"Unable to update request."); }
  finally { setBusy(false); }
 }
 async function verify(id:string) {
  if (busy) return; setBusy(true); setError("");
  try { await apiFetch(`/v1/admin/doctors/${encodeURIComponent(id)}/verification`,jsonRequest("POST",{verified:true})); await load(); }
  catch(cause) { setError(cause instanceof Error?cause.message:"Unable to verify provider."); }
  finally { setBusy(false); }
 }
 return <main style={{minHeight:"100vh",background:"#f7f9fc",padding:"44px 24px",fontFamily:"Inter,system-ui,sans-serif",color:"#172334"}}><div style={{maxWidth:1180,margin:"auto"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><p style={{fontSize:12,fontWeight:800,letterSpacing:".12em",color:"#64748b"}}>CAREBRIDGE · ADMIN OPERATIONS</p><Link href="/notifications" aria-label="Notifications" title="Notifications" style={{position:"relative",display:"grid",placeItems:"center",width:42,height:42,borderRadius:"50%",background:"white",border:"1px solid #dfe8f0",color:"#1672b8"}}><Bell/>{unread>0&&<span style={{position:"absolute",right:-3,top:-3,minWidth:18,height:18,borderRadius:99,background:"#d84d45",color:"white",fontSize:9,fontWeight:800,display:"grid",placeItems:"center"}}>{unread>99?"99+":unread}</span>}</Link></div><nav style={{display:"flex",gap:10,margin:"14px 0 20px"}}><Link href="/operations" style={{padding:"9px 13px",borderRadius:10,background:"white",border:"1px solid #dfe8f0",color:"#1672b8",textDecoration:"none"}}>Operational management</Link><Link href="/support" style={{padding:"9px 13px",borderRadius:10,background:"white",border:"1px solid #dfe8f0",color:"#1672b8",textDecoration:"none"}}>Support inbox</Link></nav><h1 style={{fontSize:42,margin:"8px 0"}}>Operations center</h1><p style={{color:"#64748b",fontSize:17}}>Review current provider, appointment and support activity.</p>{error&&<div role="alert" style={{marginTop:18,padding:14,background:"#fff7ed",borderRadius:14}}>{error}</div>}<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:14,margin:"30px 0"}}>{[[data?.patients??"—","Patients"],[data?.doctors??"—","Doctors"],[data?.verifiedDoctors??"—","Verified doctors"],[data?.appointments??"—","Appointments"],[data?.openSessions??"—","Active sessions"]].map(([v,l])=><div key={l} style={{background:"white",border:"1px solid #e2e8f0",borderRadius:20,padding:20}}><strong style={{fontSize:30}}>{v}</strong><div style={{color:"#718096",marginTop:5}}>{l}</div></div>)}</div><section style={{background:"white",border:"1px solid #e2e8f0",borderRadius:24,padding:24}}><h2>Pending doctor verification</h2>{loading?<p role="status">Loading provider queue…</p>:doctors.length===0?<p style={{color:"#718096"}}>{error?"Provider queue unavailable.":"No pending doctors."}</p>:doctors.map(d=><div key={d.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 0",borderTop:"1px solid #edf2f7"}}><div><b>{d.name}</b><div style={{color:"#718096"}}>{d.specialty?.name} · {d.location}</div></div><button disabled={busy} onClick={()=>void verify(d.id)} style={{padding:"9px 13px",borderRadius:11,border:"1px solid #cbd5e1",background:"white",fontWeight:700}}>Verify</button></div>)}</section><section style={{marginTop:24,background:"white",border:"1px solid #e2e8f0",borderRadius:24,padding:24}}><div style={{display:"flex",justifyContent:"space-between"}}><h2>Support queue</h2><span>{tickets.filter(t=>t.status==="OPEN"||t.status==="IN_PROGRESS").length} active</span></div>{loading?<p role="status">Loading support queue…</p>:tickets.length===0?<p style={{color:"#718096"}}>{error?"Support queue unavailable.":"No support requests."}</p>:tickets.map(t=><div key={t.id} style={{padding:"16px 0",borderTop:"1px solid #edf2f7"}}><div style={{display:"flex",justifyContent:"space-between",gap:20}}><div><b>{t.category}</b><p>{t.message}</p><small>{t.user.email}</small></div><select aria-label={`Status for ${t.category} request`} disabled={busy} value={t.status} onChange={e=>void updateTicket(t.id,e.target.value)}><option>OPEN</option><option>IN_PROGRESS</option><option>RESOLVED</option><option>CLOSED</option></select></div></div>)}</section></div></main>}
