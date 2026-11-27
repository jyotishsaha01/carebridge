"use client";

import Link from "next/link";
import {useCallback,useEffect,useRef,useState} from "react";
import {API_URL,apiFetch,jsonRequest} from "../../lib/request";

type Notification={id:string;type:string;title:string;body:string;status:string;createdAt:string};
type NotificationResponse={notifications:Notification[];unreadCount:number};
const preferenceTypes=["CONSULTATION","PRESCRIPTION","FOLLOW_UP","CARE_PLAN","DOCUMENT","SUPPORT","SYSTEM"] as const;
type PreferenceType=typeof preferenceTypes[number];
type Preferences=Record<PreferenceType,boolean>;
const preferenceLabel=(type:PreferenceType)=>type.charAt(0)+type.slice(1).toLowerCase().replaceAll("_"," ");

export default function NotificationsPage(){
 const[items,setItems]=useState<Notification[]>([]);const[unread,setUnread]=useState(0);const[error,setError]=useState("");const[message,setMessage]=useState("");const[loading,setLoading]=useState(true);const[busy,setBusy]=useState(false);
 const[preferences,setPreferences]=useState<Preferences|null>(null);const[drafts,setDrafts]=useState<Partial<Preferences>>({});const[preferenceError,setPreferenceError]=useState("");const[preferenceMessage,setPreferenceMessage]=useState("");const[preferencesLoading,setPreferencesLoading]=useState(true);const[savingPreference,setSavingPreference]=useState<PreferenceType|null>(null);
 const lifetime=useRef<AbortController|null>(null);const inboxLoad=useRef<AbortController|null>(null);const preferenceLoad=useRef<AbortController|null>(null);const mutation=useRef(false);const preferenceMutation=useRef(false);
 const load=useCallback(async(saved=false)=>{
  const view=lifetime.current;if(!view||view.signal.aborted||mutation.current)return false;
  inboxLoad.current?.abort();const controller=new AbortController();inboxLoad.current=controller;const signal=AbortSignal.any([view.signal,controller.signal]);
  setLoading(true);
  try{const data=await apiFetch<NotificationResponse>("/v1/notifications?limit=100",{signal});if(signal.aborted)return false;setItems(Array.isArray(data.notifications)?data.notifications:[]);setUnread(Number.isFinite(data.unreadCount)?data.unreadCount:0);setError("");return true;}
  catch(cause){if(!signal.aborted)setError((saved?"Changes saved. Inbox refresh failed: ":"")+(cause instanceof Error?cause.message:"Unable to load notifications."));return false;}
  finally{if(!signal.aborted)setLoading(false);if(inboxLoad.current===controller)inboxLoad.current=null;}
 },[]);
 const loadPreferences=useCallback(async()=>{
  const view=lifetime.current;if(!view||view.signal.aborted||preferenceMutation.current)return;
  preferenceLoad.current?.abort();const controller=new AbortController();preferenceLoad.current=controller;const signal=AbortSignal.any([view.signal,controller.signal]);
  setPreferencesLoading(true);setPreferenceError("");
  try{const data=await apiFetch<Preferences>("/v1/notification-preferences",{signal});if(signal.aborted)return;if(!preferenceTypes.every(type=>typeof data[type]==="boolean"))throw new Error("Notification preferences are temporarily unavailable.");setPreferences(data);}
  catch(cause){if(!signal.aborted)setPreferenceError(cause instanceof Error?cause.message:"Unable to load notification preferences.");}
  finally{if(!signal.aborted)setPreferencesLoading(false);if(preferenceLoad.current===controller)preferenceLoad.current=null;}
 },[]);
 useEffect(()=>{
  const view=new AbortController();lifetime.current=view;
  const refresh=()=>{if(document.visibilityState==="visible")void load();};
  const stream=new EventSource(`${API_URL}/v1/notifications/stream`,{withCredentials:true});
  stream.addEventListener("notification",refresh);stream.addEventListener("ready",refresh);
  const start=window.setTimeout(()=>{void load();void loadPreferences();},0);
  const interval=window.setInterval(()=>{if(!inboxLoad.current)refresh();},30_000);
  window.addEventListener("focus",refresh);document.addEventListener("visibilitychange",refresh);
  return()=>{view.abort();inboxLoad.current?.abort();preferenceLoad.current?.abort();stream.close();window.clearTimeout(start);window.clearInterval(interval);window.removeEventListener("focus",refresh);document.removeEventListener("visibilitychange",refresh);lifetime.current=null;};
 },[load,loadPreferences]);
 async function update(path:string,method="POST",success="Notification updated."){
  if(mutation.current)return;const signal=lifetime.current?.signal;if(!signal||signal.aborted)return;
  mutation.current=true;inboxLoad.current?.abort();setLoading(false);setBusy(true);setError("");setMessage("");
  try{
   const saved=await apiFetch<Notification|undefined>(path,{method,signal});if(signal.aborted)return;
   if(path.endsWith("/read-all")){setItems(current=>current.map(item=>({...item,status:"READ"})));setUnread(0);}
   else if(method==="DELETE"&&path.endsWith("/read")){setItems(current=>current.filter(item=>item.status!=="READ"));}
   else{
    const id=method==="DELETE"?decodeURIComponent(path.split("/").at(-1)!):saved?.id;
    if(id){
     const wasUnread=items.some(item=>item.id===id&&item.status==="UNREAD");
     setItems(current=>method==="DELETE"?current.filter(item=>item.id!==id):current.map(item=>item.id===id?saved??{...item,status:"READ"}:item));
     if(wasUnread)setUnread(current=>Math.max(0,current-1));
    }
   }
   setMessage(success);mutation.current=false;await load(true);
  }
  catch(cause){if(!signal.aborted)setError(cause instanceof Error?cause.message:"Unable to update notifications.");}
  finally{mutation.current=false;if(!signal.aborted)setBusy(false);}
 }
 async function savePreference(type:PreferenceType){
  if(preferenceMutation.current||!preferences)return;const signal=lifetime.current?.signal;if(!signal||signal.aborted)return;
  const enabled=drafts[type]??preferences[type];if(enabled===preferences[type])return;
  preferenceMutation.current=true;preferenceLoad.current?.abort();setPreferencesLoading(false);setSavingPreference(type);setPreferenceError("");setPreferenceMessage("");
  try{const saved=await apiFetch<Preferences>(`/v1/notification-preferences/${type}`,{...jsonRequest("PATCH",{enabled}),signal});if(signal.aborted)return;setPreferences(saved);setDrafts(current=>{const next={...current};delete next[type];return next;});setPreferenceMessage(`${preferenceLabel(type)} preference saved: ${saved[type]?"enabled":"disabled"}.`);}
  catch(cause){if(!signal.aborted)setPreferenceError(cause instanceof Error?cause.message:"Unable to save notification preference.");}
  finally{preferenceMutation.current=false;if(!signal.aborted)setSavingPreference(null);}
 }
 return <main style={{minHeight:"100vh",background:"#f6f9fc",padding:"clamp(20px,5vw,40px)",color:"#142235"}}><div style={{maxWidth:900,margin:"auto"}}><Link href="/dashboard">← Dashboard</Link><header style={{display:"flex",flexWrap:"wrap",justifyContent:"space-between",alignItems:"center",gap:16,marginTop:24}}><div><p>CAREBRIDGE · DOCTOR</p><h1>Notifications <span aria-label={`${unread} unread notifications`}>{unread}</span></h1><p>Updates refresh when events arrive, when you return, or when you select Refresh.</p></div><div style={{display:"flex",flexWrap:"wrap",gap:8}}><button disabled={busy||loading||!unread} onClick={()=>void update("/v1/notifications/read-all","POST","All notifications marked read.")}>Mark all read</button><button disabled={busy||loading} onClick={()=>void load()}>{loading?"Refreshing…":"Refresh notifications"}</button><button disabled={busy||loading||!items.some(item=>item.status==="READ")} onClick={()=>void update("/v1/notifications/read","DELETE","Read notifications deleted.")}>Delete read notifications</button></div></header>
 {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}{loading&&<p role="status">Loading notifications…</p>}
 <section aria-label="Your notifications" style={{display:"grid",gap:12,marginTop:24}}>{items.map(item=><article key={item.id} style={{background:"white",border:`1px solid ${item.status==="UNREAD"?"#b8d7f5":"#e1e9f1"}`,borderRadius:18,padding:18,display:"flex",flexWrap:"wrap",justifyContent:"space-between",gap:20}}><div><small>{item.type} · {new Date(item.createdAt).toLocaleString()}</small><h2 style={{fontSize:18}}>{item.title}</h2><p style={{overflowWrap:"anywhere"}}>{item.body}</p><small>{item.status}</small></div><div>{item.status==="UNREAD"&&<button disabled={busy||loading} onClick={()=>void update(`/v1/notifications/${encodeURIComponent(item.id)}/read`,"POST","Notification marked read.")}>Mark read</button>}<button disabled={busy||loading} aria-label={`Delete notification: ${item.title}`} onClick={()=>void update(`/v1/notifications/${encodeURIComponent(item.id)}`,"DELETE","Notification deleted.")}>Delete</button></div></article>)}{!loading&&!items.length&&!error&&<p>You’re all caught up. New notifications will appear here.</p>}</section>
 <section aria-label="Notification preferences" className="card" style={{marginTop:28}}><div className="row" style={{flexWrap:"wrap"}}><h2>Notification preferences</h2><button disabled={preferencesLoading||savingPreference!==null} onClick={()=>void loadPreferences()}>{preferencesLoading?"Refreshing preferences…":"Refresh preferences"}</button></div><p>Choose the updates you receive, then save each changed preference. Refresh preserves your unsaved choices.</p>{preferenceError&&<p role="alert">{preferenceError}</p>}{preferenceMessage&&<p role="status">{preferenceMessage}</p>}{preferencesLoading&&<p role="status">Loading preferences…</p>}{preferences&&preferenceTypes.map(type=>{const value=drafts[type]??preferences[type];const changed=value!==preferences[type];return <div key={type} className="row" style={{flexWrap:"wrap",padding:"12px 0",borderTop:"1px solid #e1e9f1"}}><label style={{display:"flex",gap:10,alignItems:"center"}}><input type="checkbox" style={{width:"auto"}} disabled={savingPreference!==null||preferencesLoading} checked={value} onChange={event=>{setDrafts(current=>({...current,[type]:event.target.checked}));setPreferenceMessage("");}}/>{preferenceLabel(type)} updates</label><span>Saved: {preferences[type]?"Enabled":"Disabled"}{changed?" · Unsaved change":""}</span><button disabled={!changed||savingPreference!==null||preferencesLoading} onClick={()=>void savePreference(type)} aria-label={`Save ${preferenceLabel(type).toLowerCase()} preference`}>{savingPreference===type?"Saving…":"Save preference"}</button></div>;})}</section>
 </div></main>;
}
