"use client";

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
type Notification = { id:string; type:string; title:string; body:string; status:string; createdAt:string };

export default function NotificationsPage() {
  const [items,setItems]=useState<Notification[]>([]);
  const [error,setError]=useState("");
  async function load(){const r=await fetch(API_URL+"/v1/notifications?limit=100",{credentials:"include"});if(!r.ok){setError("Sign in to view notifications.");return;}const d=await r.json();setItems(d.notifications);}
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{void load();const s=new EventSource(API_URL+"/v1/notifications/stream",{withCredentials:true});s.addEventListener("notification",()=>void load());return()=>s.close();},[]);
  async function mark(id:string){await fetch(API_URL+"/v1/notifications/"+id+"/read",{method:"POST",credentials:"include"});void load();}
  async function markAll(){await fetch(API_URL+"/v1/notifications/read-all",{method:"POST",credentials:"include"});void load();}
  return <main style={{minHeight:"100vh",background:"#f6f9fc",padding:40,fontFamily:"Inter,system-ui,sans-serif",color:"#142235"}}><div style={{maxWidth:900,margin:"auto"}}><a href="/dashboard" style={{color:"#1672b8"}}>← Dashboard</a><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:24}}><div><p style={{fontSize:12,fontWeight:800,letterSpacing:".12em",color:"#64748b"}}>CAREBRIDGE</p><h1>Notifications</h1><p style={{color:"#64748b"}}>Updates are delivered in real time.</p></div><button onClick={markAll} style={{padding:"10px 14px",borderRadius:10,border:"1px solid #dfe8f0",background:"white"}}>Mark all read</button></div>{error&&<p style={{color:"#b42318"}}>{error}</p>}<div style={{display:"grid",gap:12,marginTop:24}}>{items.map(n=><article key={n.id} style={{background:"white",border:"1px solid #e1e9f1",borderRadius:18,padding:18,display:"flex",justifyContent:"space-between",gap:20}}><div><small style={{color:"#718398"}}>{n.type} · {new Date(n.createdAt).toLocaleString()}</small><h3 style={{margin:"7px 0"}}>{n.title}</h3><p style={{color:"#64788d"}}>{n.body}</p></div>{n.status==="UNREAD"&&<button onClick={()=>void mark(n.id)} style={{height:38,padding:"0 12px"}}>Read</button>}</article>)}{!items.length&&!error&&<p style={{color:"#718398"}}>You&apos;re all caught up.</p>}</div></div></main>;
}
