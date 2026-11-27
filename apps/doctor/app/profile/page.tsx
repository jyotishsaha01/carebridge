"use client";

import Link from "next/link";
import {useCallback,useEffect,useRef,useState} from "react";
import {apiFetch,jsonRequest} from "../../lib/request";

type Doctor={id:string;name:string;bio:string;location:string;experienceYears:number;consultationPriceUsd:number;expertise:unknown;status:string;isVerified:boolean;specialty?:{name:string}};
type Credential={id:string;type:string;licenseNumber:string;jurisdiction:string;documentName?:string;status:string;createdAt:string};
type Fields={bio:string;location:string;price:string;expertise:string};
const emptyFields:Fields={bio:"",location:"",price:"",expertise:""};
function profileFields(profile:Doctor):Fields{return {bio:profile.bio??"",location:profile.location??"",price:String(profile.consultationPriceUsd??""),expertise:Array.isArray(profile.expertise)?profile.expertise.join(", "):""};}

export default function DoctorProfile(){
 const[doctor,setDoctor]=useState<Doctor|null>(null);const[credentials,setCredentials]=useState<Credential[]>([]);
 const[fields,setFields]=useState<Fields>(emptyFields);const[message,setMessage]=useState("");const[loading,setLoading]=useState(true);const[busy,setBusy]=useState(false);const[error,setError]=useState("");
 const baseline=useRef<Fields|null>(null);const mutation=useRef(false);const lifetime=useRef<AbortController|null>(null);const activeLoad=useRef<AbortController|null>(null);
 const load=useCallback(async()=>{
  const view=lifetime.current;if(!view||view.signal.aborted||mutation.current)return;
  activeLoad.current?.abort();const controller=new AbortController();activeLoad.current=controller;const signal=AbortSignal.any([view.signal,controller.signal]);
  setLoading(true);setError("");
  try{
   const[profile,rows]=await Promise.all([apiFetch<Doctor>("/v1/doctor/me",{signal}),apiFetch<Credential[]>("/v1/doctor/credentials",{signal})]);
   if(signal.aborted)return;
   const fresh=profileFields(profile);const previous=baseline.current;
   setFields(current=>previous?Object.fromEntries(Object.entries(fresh).map(([key,value])=>[key,current[key as keyof Fields]===previous[key as keyof Fields]?value:current[key as keyof Fields]])) as Fields:fresh);
   baseline.current=fresh;setDoctor(profile);setCredentials(rows);
  }catch(cause){if(!signal.aborted)setError(cause instanceof Error?cause.message:"Unable to load your profile.");}
  finally{if(!signal.aborted)setLoading(false);if(activeLoad.current===controller)activeLoad.current=null;}
 },[]);
 useEffect(()=>{const view=new AbortController();lifetime.current=view;const timer=window.setTimeout(()=>void load(),0);return()=>{window.clearTimeout(timer);view.abort();activeLoad.current?.abort();lifetime.current=null;};},[load]);
 async function save(){
  if(mutation.current)return;const signal=lifetime.current?.signal;if(!signal||signal.aborted)return;
  mutation.current=true;activeLoad.current?.abort();setLoading(false);setBusy(true);setMessage("");setError("");
  try{
   const amount=Number(fields.price);
   if(!Number.isFinite(amount)||amount<=0||amount>5000)throw new Error("Enter a consultation price greater than $0 and no more than $5,000.");
   if(fields.bio.length>4000||fields.location.trim().length>160)throw new Error("Biography must be 4,000 characters or fewer and location 160 characters or fewer.");
   const entries=fields.expertise.split(",").map(value=>value.trim()).filter(Boolean);
   if(entries.length>30||entries.some(value=>value.length<2||value.length>120))throw new Error("Enter up to 30 expertise areas with 2–120 characters each.");
   const profile=await apiFetch<Doctor>("/v1/doctor/me/profile",{...jsonRequest("PATCH",{bio:fields.bio,location:fields.location,consultationPriceUsd:amount,expertise:entries}),signal});
   if(signal.aborted)return;
   const saved=profileFields(profile);baseline.current=saved;setDoctor(profile);setFields(saved);setMessage("Profile saved. These saved details are used on your provider profile.");
  }catch(cause){if(!signal.aborted)setError(cause instanceof Error?cause.message:"Unable to save your profile.");}
  finally{mutation.current=false;if(!signal.aborted)setBusy(false);}
 }
 const changed=doctor&&JSON.stringify(fields)!==JSON.stringify(profileFields(doctor));
 function change(field:keyof Fields,value:string){setFields(current=>({...current,[field]:value}));setMessage("");}
 if(!doctor)return <main className="session-state"><h1>{loading?"Doctor profile":"Profile unavailable"}</h1>{loading?<p role="status">Loading profile…</p>:<><p role="alert">{error}</p><button onClick={()=>void load()}>Try again</button></>}</main>;
 return <main className="doctor-page"><div className="doctor-container"><Link href="/dashboard">← Dashboard</Link><header className="doctor-header"><div><p className="eyebrow">CAREBRIDGE · PROVIDER PROFILE</p><h1>{doctor.name}</h1><p>{doctor.specialty?.name??"Specialist"} · {doctor.experienceYears??0} years experience</p></div><div className={doctor.isVerified?"status verified":"status pending"}>{doctor.isVerified?"VERIFIED":"PENDING VERIFICATION"}</div></header>
 <button disabled={busy||loading} onClick={()=>void load()}>{loading?"Refreshing…":"Refresh profile and credentials"}</button><p>Refresh keeps your unsaved profile edits and loads the latest verification status.</p>
 <form onSubmit={event=>{event.preventDefault();void save();}} className="doctor-card"><h2>Professional profile</h2><label htmlFor="doctor-bio">Biography</label><textarea id="doctor-bio" disabled={busy} maxLength={4000} value={fields.bio} onChange={event=>change("bio",event.target.value)} rows={6}/><label>Location<input disabled={busy} maxLength={160} value={fields.location} onChange={event=>change("location",event.target.value)}/></label><label htmlFor="doctor-expertise">Expertise (comma separated)</label><input id="doctor-expertise" disabled={busy} value={fields.expertise} onChange={event=>change("expertise",event.target.value)}/><label>Consultation price (USD)<input disabled={busy} required type="number" min="0.01" max="5000" step="0.01" value={fields.price} onChange={event=>change("price",event.target.value)}/></label>
 {changed&&<p>Unsaved profile changes</p>}<div style={{display:"flex",gap:12,flexWrap:"wrap"}}><button disabled={busy||loading||!changed} type="submit">{busy?"Saving…":"Save profile"}</button>{changed&&<button type="button" disabled={busy||loading} onClick={()=>{setFields(profileFields(doctor));setMessage("");setError("");}}>Reset changes</button>}</div>{message&&<p role="status" className="message">{message}</p>}{error&&<p role="alert">{error}</p>}</form>
 <section className="doctor-card"><h2>Verification credentials</h2><p>Credential status is controlled by CareBridge administration.</p><Link href="/onboarding">Submit or resubmit credentials →</Link>{credentials.length===0?<p>No credentials submitted.</p>:credentials.map(credential=><div className="credential" key={credential.id}><div><b>{credential.type}</b><span>{credential.licenseNumber} · {credential.jurisdiction}</span>{credential.documentName&&<span>{credential.documentName}</span>}</div><strong>{credential.status}</strong></div>)}</section></div>
<style>{`.doctor-page{min-height:100vh;background:#f6f9fc;color:#142235;padding:42px 24px;font-family:Inter,system-ui,sans-serif}.doctor-container{max-width:950px;margin:auto}.doctor-page a{color:#1672b8;text-decoration:none}.doctor-header{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin:24px 0}.eyebrow{font-size:12px;font-weight:800;letter-spacing:.12em;color:#64788d}.doctor-header h1{font-size:42px;margin:8px 0}.doctor-header p{color:#64788d}.status{padding:9px 13px;border-radius:999px;font-size:12px;font-weight:800}.status.verified{background:#e8f7ef;color:#17653f}.status.pending{background:#fff5e6;color:#9a5b11}.doctor-card{background:#fff;border:1px solid #dfe8f0;border-radius:24px;padding:26px;margin-top:20px;display:grid;gap:16px}.doctor-card label{display:grid;gap:7px;font-weight:700}.doctor-card label span{font-size:12px;font-weight:400;color:#718398}.doctor-card input,.doctor-card textarea{font:inherit;padding:12px;border:1px solid #cbd9e5;border-radius:12px}.doctor-card button{justify-self:start;padding:12px 18px;border:0;border-radius:12px;background:#1672b8;color:#fff;font-weight:800}.message{padding:12px;border-radius:12px;background:#edf7f3;color:#17653f}.credential{display:flex;justify-content:space-between;gap:20px;padding:15px 0;border-top:1px solid #eef2f7}.credential span{display:block;color:#718398;font-size:13px;margin-top:4px}`}</style>
</main>;
}
