"use client";
import { useState } from "react";
import { apiFetch, jsonRequest } from "../../lib/request";
const steps=["Professional profile","Credentials","Review & submit"];
export default function DoctorOnboarding(){
 const[step,setStep]=useState(0);
 const[license,setLicense]=useState("");
 const[jurisdiction,setJurisdiction]=useState("");
 const[doc,setDoc]=useState("");
 const[submitted,setSubmitted]=useState(false);
 const[error,setError]=useState("");
 const[busy,setBusy]=useState(false);
 async function submit(){
  if(busy)return;setError("");setBusy(true);
  try{
   await apiFetch("/v1/doctor/credentials",jsonRequest("POST",{type:"Medical license",licenseNumber:license.trim(),jurisdiction:jurisdiction.trim(),documentName:doc.trim()||undefined}));
   setSubmitted(true);
  }catch(e){setError(e instanceof Error?e.message:"Submission failed");}finally{setBusy(false);}
 }
 return <main style={{minHeight:"100vh",background:"#f6f9fc",padding:"48px 24px",fontFamily:"Inter,system-ui,sans-serif",color:"#142235"}}>
  <div style={{maxWidth:820,margin:"auto"}}>
   <p style={{color:"#5f7891",fontWeight:800,letterSpacing:".12em",fontSize:12,textTransform:"uppercase"}}>CareBridge · Doctor verification</p>
   <h1 style={{fontSize:40,margin:"8px 0"}}>Join the CareBridge clinical network</h1>
   <p style={{color:"#64788d",fontSize:17}}>Submit your professional credential for admin review before providing care.</p>
   <div style={{display:"flex",flexWrap:"wrap",gap:8,margin:"28px 0"}}>{steps.map((x,i)=><div key={x} style={{flex:1,padding:13,borderRadius:12,background:i<=step?"#e7f4fb":"#edf2f7",fontWeight:700,color:i<=step?"#1672b8":"#718398"}}>{i+1}. {x}</div>)}</div>
   {submitted?<section style={{background:"white",border:"1px solid #dfe8f0",borderRadius:24,padding:30}}><h2>Application submitted</h2><p style={{color:"#64788d"}}>Your credential is stored for admin review.</p><b style={{display:"inline-block",padding:"8px 12px",borderRadius:999,background:"#fff7ed",color:"#9a5b11"}}>PENDING REVIEW</b></section>:
   <section style={{background:"white",border:"1px solid #dfe8f0",borderRadius:24,padding:30}}>
    {step===0&&<div style={{padding:18,borderRadius:16,background:"#f8fafc"}}><h3>Professional profile</h3><p style={{color:"#64788d"}}>Your existing CareBridge doctor profile will be used during verification.</p></div>}
    {step===1&&<div style={{display:"grid",gap:16}}>
      <label style={{display:"grid",gap:7,fontWeight:700}}>Medical license number<input maxLength={120} value={license} onChange={e=>setLicense(e.target.value)} placeholder="License / registration number" style={{padding:13,border:"1px solid #cbd9e5",borderRadius:12}}/></label>
      <label style={{display:"grid",gap:7,fontWeight:700}}>License jurisdiction<input maxLength={120} value={jurisdiction} onChange={e=>setJurisdiction(e.target.value)} placeholder="Country / state / jurisdiction" style={{padding:13,border:"1px solid #cbd9e5",borderRadius:12}}/></label>
      <label style={{display:"grid",gap:7,fontWeight:700}}>Credential document name<input maxLength={200} value={doc} onChange={e=>setDoc(e.target.value)} placeholder="e.g. medical-license.pdf" style={{padding:13,border:"1px solid #cbd9e5",borderRadius:12}}/></label>
    </div>}
    {step===2&&<div style={{padding:18,borderRadius:16,background:"#f8fafc"}}><h3>Ready for review</h3><p style={{color:"#64788d"}}>The credential will enter the admin verification queue.</p></div>}
    {error&&<p role="alert" style={{color:"#b42318"}}>{error}</p>}
    <div style={{display:"flex",justifyContent:"space-between",marginTop:28}}>
      <button disabled={busy || step===0} onClick={()=>setStep(step-1)} style={{padding:"11px 16px",borderRadius:12,border:"1px solid #cbd9e5",background:"white"}}>Back</button>
      {step<2?<button disabled={step===1 && (license.trim().length<2 || jurisdiction.trim().length<2)} onClick={()=>setStep(step+1)} style={{padding:"11px 16px",borderRadius:12,border:0,background:"#1672b8",color:"white",fontWeight:800}}>Continue</button>:<button disabled={busy || license.trim().length<2 || jurisdiction.trim().length<2} onClick={submit} style={{padding:"11px 16px",borderRadius:12,border:0,background:"#1672b8",color:"white",fontWeight:800}}>{busy?"Submitting…":"Submit for verification"}</button>}
    </div>
   </section>}
  </div>
 </main>;
}