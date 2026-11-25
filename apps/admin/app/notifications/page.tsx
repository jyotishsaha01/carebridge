"use client";

import Link from "next/link";
import {useCallback,useEffect,useState} from "react";
import {API_URL,apiFetch} from "../../lib/request";
type Notification={id:string;type:string;title:string;body:string;status:string;createdAt:string};
type NotificationResponse={notifications:Notification[];unreadCount:number};
export default function NotificationsPage(){
 const[items,setItems]=useState<Notification[]>([]);const[unread,setUnread]=useState(0);const[error,setError]=useState("");const[loading,setLoading]=useState(true);const[busy,setBusy]=useState(false);
 const load=useCallback(async(signal?:AbortSignal)=>{
  try{const data=await apiFetch<NotificationResponse>("/v1/notifications?limit=100",{signal});if(signal?.aborted)return false;setItems(Array.isArray(data.notifications)?data.notifications:[]);setUnread(Number.isFinite(data.unreadCount)?data.unreadCount:0);setError("");return true;}
  catch(cause){if(!signal?.aborted)setError(cause instanceof Error?cause.message:"Unable to load notifications.");return false;}
  finally{if(!signal?.aborted)setLoading(false);}
 },[]);
 useEffect(()=>{const controller=new AbortController();let stream:EventSource|undefined;const timer=window.setTimeout(()=>{void load(controller.signal).then(ok=>{if(!ok||controller.signal.aborted)return;stream=new EventSource(`${API_URL}/v1/notifications/stream`,{withCredentials:true});stream.addEventListener("notification",()=>void load(controller.signal));});},0);return()=>{window.clearTimeout(timer);controller.abort();stream?.close();};},[load]);
 async function update(path:string,method="POST"){
  if(busy)return;setBusy(true);setError("");
  try{await apiFetch(path,{method});await load();}catch(cause){setError(cause instanceof Error?cause.message:"Unable to update notifications.");}finally{setBusy(false);}
 }
 return <main style={{minHeight:"100vh",background:"#f6f9fc",padding:"clamp(20px,5vw,40px)",color:"#142235"}}><div style={{maxWidth:900,margin:"auto"}}><Link href="/dashboard">← Dashboard</Link><header style={{display:"flex",flexWrap:"wrap",justifyContent:"space-between",alignItems:"center",gap:16,marginTop:24}}><div><p>CAREBRIDGE · ADMIN</p><h1>Notifications <span aria-label={`${unread} unread notifications`}>{unread}</span></h1><p>Updates are refreshed automatically when new events arrive.</p></div><div style={{display:"flex",flexWrap:"wrap",gap:8}}><button disabled={busy||!unread} onClick={()=>void update("/v1/notifications/read-all")}>Mark all read</button><button disabled={busy||loading} onClick={()=>void load()}>Refresh</button><button disabled={busy||!items.some(item=>item.status==="READ")} onClick={()=>void update("/v1/notifications/read","DELETE")}>Delete read notifications</button></div></header>{error&&<p role="alert">{error}</p>}{loading?<p role="status">Loading notifications…</p>:<section aria-label="Your notifications" style={{display:"grid",gap:12,marginTop:24}}>{items.map(item=><article key={item.id} style={{background:"white",border:`1px solid ${item.status==="UNREAD"?"#b8d7f5":"#e1e9f1"}`,borderRadius:18,padding:18,display:"flex",flexWrap:"wrap",justifyContent:"space-between",gap:20}}><div><small>{item.type} · {new Date(item.createdAt).toLocaleString()}</small><h2 style={{fontSize:18}}>{item.title}</h2><p style={{overflowWrap:"anywhere"}}>{item.body}</p><small>{item.status}</small></div><div>{item.status==="UNREAD"&&<button disabled={busy} onClick={()=>void update(`/v1/notifications/${encodeURIComponent(item.id)}/read`)}>Mark read</button>}<button disabled={busy} aria-label={`Delete notification: ${item.title}`} onClick={()=>void update(`/v1/notifications/${encodeURIComponent(item.id)}`,"DELETE")}>Delete</button></div></article>)}{!items.length&&!error&&<p>You’re all caught up. New notifications will appear here.</p>}</section>}</div></main>;
}
