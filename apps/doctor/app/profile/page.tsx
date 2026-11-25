"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import { apiFetch, jsonRequest } from "../../lib/request";

type Doctor={id:string;name:string;bio:string;location:string;experienceYears:number;consultationPriceUsd:number;expertise:unknown;status:string;isVerified:boolean;specialty?:{name:string}};
type Credential={id:string;type:string;licenseNumber:string;jurisdiction:string;documentName?:string;status:string;createdAt:string};
export default function DoctorProfile(){
 const[doctor,setDoctor]=useState<Doctor|null>(null);const[credentials,setCredentials]=useState<Credential[]>([]);const[bio,setBio]=useState("");const[location,setLocation]=useState("");const[price,setPrice]=useState("");const[expertise,setExpertise]=useState("");const[message,setMessage]=useState("");const[loading,setLoading]=useState(true);const[busy,setBusy]=useState(false);const[error,setError]=useState("");
 async function load() {
  setError("");
  try {
   const[profile,rows]=await Promise.all([apiFetch<Doctor>("/v1/doctor/me"),apiFetch<Credential[]>("/v1/doctor/credentials")]);
   setDoctor(profile);setBio(profile.bio??"");setLocation(profile.location??"");setPrice(String(profile.consultationPriceUsd??""));setExpertise(Array.isArray(profile.expertise)?profile.expertise.join(", "):"");setCredentials(rows);
  } catch(cause) { setError(cause instanceof Error?cause.message:"Unable to load your profile."); }
  finally { setLoading(false); }
 }
 useEffect(()=>{const timer=window.setTimeout(()=>void load(),0);return()=>window.clearTimeout(timer)},[]);
 async function save() {
  if(busy)return;setBusy(true);setMessage("");setError("");
  try {
   const amount=Number(price);
   if(!Number.isFinite(amount)||amount<=0||amount>5000)throw new Error("Enter a consultation price greater than $0 and no more than $5,000.");
   if(bio.length>4000||location.trim().length>160)throw new Error("Biography must be 4,000 characters or fewer and location 160 characters or fewer.");
   const entries=expertise.split(",").map(value=>value.trim()).filter(Boolean);
   if(entries.length>30||entries.some(value=>value.length<2||value.length>120))throw new Error("Enter up to 30 expertise areas with 2–120 characters each.");
   const profile=await apiFetch<Doctor>("/v1/doctor/me/profile",jsonRequest("PATCH",{bio,location,consultationPriceUsd:Number(price),expertise:entries}));
   setDoctor(profile);setMessage("Profile saved.");
  } catch(cause) { setError(cause instanceof Error?cause.message:"Unable to save your profile."); }
  finally { setBusy(false); }
 }
if(loading)return <main className="session-state"><p role="status">Loading profile…</p></main>;
if(!doctor)return <main className="session-state"><h1>Profile unavailable</h1><p role="alert">{error}</p><button onClick={()=>void load()}>Try again</button></main>;
return <main className="doctor-page"><div className="doctor-container"><Link href="/dashboard">← Dashboard</Link><header className="doctor-header"><div><p className="eyebrow">CAREBRIDGE · PROVIDER PROFILE</p><h1>{doctor?.name??"Doctor profile"}</h1><p>{doctor?.specialty?.name??"Specialist"} · {doctor?.experienceYears??0} years experience</p></div><div className={doctor?.isVerified?"status verified":"status pending"}>{doctor?.isVerified?"VERIFIED":"PENDING VERIFICATION"}</div></header><form onSubmit={event=>{event.preventDefault();void save();}} className="doctor-card"><h2>Professional profile</h2><label>Biography<textarea disabled={busy} maxLength={4000} value={bio} onChange={e=>setBio(e.target.value)} rows={6}/></label><label>Location<input disabled={busy} maxLength={160} value={location} onChange={e=>setLocation(e.target.value)}/></label><label>Expertise <span>comma separated</span><input disabled={busy} value={expertise} onChange={e=>setExpertise(e.target.value)}/></label><label>Consultation price (USD)<input disabled={busy} required type="number" min="0.01" max="5000" step="0.01" value={price} onChange={e=>setPrice(e.target.value)}/></label><button disabled={busy} type="submit">{busy?"Saving…":"Save profile"}</button>{message&&<p role="status" className="message">{message}</p>}{error&&<p role="alert">{error}</p>}</form><section className="doctor-card"><h2>Verification credentials</h2><p>Credential status is controlled by CareBridge administration.</p>{credentials.length===0?<p>No credentials submitted.</p>:credentials.map(c=><div className="credential" key={c.id}><div><b>{c.type}</b><span>{c.licenseNumber} · {c.jurisdiction}</span>{c.documentName&&<span>{c.documentName}</span>}</div><strong>{c.status}</strong></div>)}</section></div><style>{`.doctor-page{min-height:100vh;background:#f6f9fc;color:#142235;padding:42px 24px;font-family:Inter,system-ui,sans-serif}.doctor-container{max-width:950px;margin:auto}.doctor-page a{color:#1672b8;text-decoration:none}.doctor-header{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin:24px 0}.eyebrow{font-size:12px;font-weight:800;letter-spacing:.12em;color:#64788d}.doctor-header h1{font-size:42px;margin:8px 0}.doctor-header p{color:#64788d}.status{padding:9px 13px;border-radius:999px;font-size:12px;font-weight:800}.status.verified{background:#e8f7ef;color:#17653f}.status.pending{background:#fff5e6;color:#9a5b11}.doctor-card{background:#fff;border:1px solid #dfe8f0;border-radius:24px;padding:26px;margin-top:20px;display:grid;gap:16px}.doctor-card label{display:grid;gap:7px;font-weight:700}.doctor-card label span{font-size:12px;font-weight:400;color:#718398}.doctor-card input,.doctor-card textarea{font:inherit;padding:12px;border:1px solid #cbd9e5;border-radius:12px}.doctor-card button{justify-self:start;padding:12px 18px;border:0;border-radius:12px;background:#1672b8;color:#fff;font-weight:800}.message{padding:12px;border-radius:12px;background:#edf7f3;color:#17653f}.credential{display:flex;justify-content:space-between;gap:20px;padding:15px 0;border-top:1px solid #eef2f7}.credential span{display:block;color:#718398;font-size:13px;margin-top:4px}`}</style></main>;
}