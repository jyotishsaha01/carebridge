"use client";
import Link from "next/link";
import { API_URL, apiFetch } from "../../lib/request";
import {useEffect,useMemo,useState} from "react";
type Patient={id:string;name:string;reason:string;status:string;time:string};

function Bell(){return <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>}
type Doctor = { name:string; specialty?:{name:string} };
type Availability = { id:string; status:string; startsAt:string };
export default function DoctorDashboard() {
 const[doctor,setDoctor]=useState<Doctor|null>(null);
 const[items,setItems]=useState<Patient[]>([]);
 const[unread,setUnread]=useState(0);
 const[filter,setFilter]=useState("ALL");
 const[error,setError]=useState("");
 const[loading,setLoading]=useState(true);
 useEffect(() => {
  let active=true; let stream: EventSource | undefined;
  void Promise.all([apiFetch<Doctor>("/v1/doctor/me"),apiFetch<Availability[]>("/v1/doctor/availability")]).then(async ([profile,slots])=>{
   if (!active) return;
   setDoctor(profile);
   setItems(slots.map(slot=>({id:slot.id,name:"Consultation slot",reason:"Availability",status:slot.status,time:new Date(slot.startsAt).toLocaleString([], {month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})})));
   setLoading(false);
   try {
    const notifications=await apiFetch<{unreadCount:number}>("/v1/notifications?limit=1");
    if (!active) return;
    setUnread(notifications.unreadCount);
    stream=new EventSource(`${API_URL}/v1/notifications/stream`,{withCredentials:true});
    stream.addEventListener("notification",()=>setUnread(current=>current+1));
   } catch { /* Availability remains usable when notification delivery is unavailable. */ }
  }).catch(cause=>{if(active){setError(cause instanceof Error?cause.message:"Unable to load workspace.");setLoading(false);}});
  return()=>{active=false;stream?.close();};
 },[]);
 const visible=useMemo(()=>filter==="ALL"?items:items.filter(slot=>slot.status===filter),[filter,items]);
 return <main style={{minHeight:"100vh",background:"#f6f9fc",color:"#142235",padding:"42px 24px",fontFamily:"Inter,system-ui,sans-serif"}}><div style={{maxWidth:1150,margin:"auto"}}><header style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",flexWrap:"wrap",gap:24,marginBottom:30}}><div><p style={{color:"#5f7891",fontWeight:800,letterSpacing:".12em",fontSize:12,textTransform:"uppercase"}}>CareBridge · Doctor Workspace</p><h1 style={{fontSize:42,margin:"8px 0"}}>{doctor?doctor.name:"Doctor workspace"}</h1><p style={{color:"#64788d",fontSize:17}}>{doctor?.specialty?.name??"Live clinical workspace"}</p></div><div style={{display:"flex",alignItems:"center",gap:14}}><Link href="/notifications" aria-label="Notifications" title="Notifications" style={{position:"relative",display:"grid",placeItems:"center",width:42,height:42,borderRadius:"50%",background:"white",border:"1px solid #dfe8f0",color:"#1672b8"}}><Bell/>{unread>0&&<span style={{position:"absolute",right:-3,top:-3,minWidth:18,height:18,borderRadius:99,background:"#d84d45",color:"white",fontSize:9,fontWeight:800,display:"grid",placeItems:"center"}}>{unread>99?"99+":unread}</span>}</Link><div style={{padding:"14px 18px",background:"white",border:"1px solid #dfe8f0",borderRadius:16}}><b>{items.filter(item=>item.status==="AVAILABLE").length}</b><div style={{color:"#64788d",marginTop:4}}>Available slots</div></div></div></header><nav style={{display:"flex",flexWrap:"wrap",gap:10,marginBottom:20}}><Link href="/" style={{padding:"10px 14px",borderRadius:10,background:"white",border:"1px solid #dfe8f0",color:"#1672b8",textDecoration:"none"}}>Clinical workspace</Link><Link href="/operations" style={{padding:"10px 14px",borderRadius:10,background:"white",border:"1px solid #dfe8f0",color:"#1672b8",textDecoration:"none"}}>Availability</Link><Link href="/profile" style={{padding:"10px 14px",borderRadius:10,background:"white",border:"1px solid #dfe8f0",color:"#1672b8",textDecoration:"none"}}>Profile</Link></nav>{error&&<div role="alert" style={{padding:14,background:"#fff7ed",borderRadius:14,marginBottom:18}}>{error}</div>}<section style={{background:"white",border:"1px solid #e1e9f1",borderRadius:24,padding:24}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:20,marginBottom:18}}><div><h2 style={{margin:0}}>Availability</h2><p style={{color:"#718398",margin:"6px 0 0"}}>Your consultation schedule and available capacity.</p></div><select aria-label="Filter availability by status" value={filter} onChange={e=>setFilter(e.target.value)} style={{padding:10,borderRadius:12,border:"1px solid #cfdbe6"}}><option>ALL</option><option>AVAILABLE</option><option>BOOKED</option><option>BLOCKED</option></select></div><div style={{display:"grid",gap:10}}>{loading?<p role="status">Loading availability…</p>:!visible.length?<p>{error?"Availability data unavailable.":"No slots match this filter."} <Link href="/operations">Manage availability</Link></p>:visible.map(p=><div key={p.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:20,padding:17,border:"1px solid #e4ebf2",borderRadius:16}}><div><b>{p.name}</b><div style={{color:"#718398",marginTop:4}}>{p.reason} · {p.time}</div></div><span style={{fontSize:12,fontWeight:800,color:"#58718b"}}>{p.status}</span></div>)}</div></section></div></main>}
