"use client";
import Link from "next/link";
import {useParams} from "next/navigation";
import {useEffect,useState} from "react";
import { apiFetch } from "../../../../lib/api";
type Intake = Record<string, string | boolean | null>;
const fields=[["reasonForVisit","Reason for visit","Briefly describe why you are seeking this consultation."],["symptoms","Current symptoms","Describe your symptoms, timing and anything that makes them better or worse."],["allergies","Allergies","List medication, food or other allergies, or write none."],["medications","Current medications","Include prescription medicines, OTC medicines and supplements."],["medicalHistory","Relevant medical history","Conditions, diagnoses or important previous medical history."],["surgeries","Previous surgeries","List relevant surgeries and approximate dates, or write none."],["familyHistory","Family history","Relevant family medical history." ]];
export default function IntakePage(){
 const{id}=useParams<{id:string}>();const[data,setData]=useState<Intake>({});const[consent,setConsent]=useState(false);const[loading,setLoading]=useState(true);const[saving,setSaving]=useState(false);const[message,setMessage]=useState("");const[error,setError]=useState("");const[loaded,setLoaded]=useState(false);
 useEffect(()=>{
   const controller = new AbortController();
   apiFetch<Intake>(`/v1/appointments/${encodeURIComponent(id)}/intake`,{signal:controller.signal})
     .then(x=>{if(!controller.signal.aborted){setData(x);setConsent(Boolean(x.consentToConsult));setLoaded(true);}})
     .catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"Unable to load your questionnaire.");})
     .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
   return ()=>controller.abort();
 },[id]);
 async function save(){
   if(saving || !loaded)return;
   setSaving(true);setMessage("");setError("");
   try {
     const result=await apiFetch<Intake>(`/v1/appointments/${encodeURIComponent(id)}/intake`,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({...data,consentToConsult:consent})});
     setData(result);setMessage(consent?"Questionnaire submitted successfully.":"Draft saved.");
   } catch(cause){setError(cause instanceof Error?cause.message:"Unable to save your questionnaire. Your changes are still here; please try again.");}
   finally{setSaving(false);}
 }

 if(loading)return <main style={{padding:48,fontFamily:"system-ui"}}><p role="status">Loading questionnaire…</p></main>;
 if(!loaded)return <main className="system-state"><h1>Your questionnaire couldn’t be loaded.</h1><p role="alert">{error}</p><Link className="button primary" href="/login">Sign in</Link><Link className="button ghost" href={`/appointments/${encodeURIComponent(id)}`}>Back to appointment</Link></main>;
 return <main style={{maxWidth:900,margin:"auto",padding:"48px 24px",fontFamily:"Inter,system-ui,sans-serif",color:"#172334"}}><Link href={`/appointments/${encodeURIComponent(id)}`} style={{color:"#1672b8"}}>← Appointment</Link><p style={{marginTop:28,fontSize:12,fontWeight:800,letterSpacing:".12em",color:"#64748b"}}>CAREBRIDGE · MEDICAL INTAKE</p><h1>Prepare for your consultation.</h1><p style={{color:"#64748b",fontSize:17}}>Share relevant information so the specialist can review it before your consultation. Only provide information you are comfortable sharing for this care purpose.</p>{error&&<div role="alert" className="empty-state">{error}</div>}{message&&<div role="status" style={{margin:"18px 0",padding:14,borderRadius:14,background:"#ecfdf5"}}>{message}</div>}<section style={{marginTop:24,padding:26,border:"1px solid #e2e8f0",borderRadius:24}}>{fields.map(([key,label,help])=><label key={key} style={{display:"grid",gap:7,fontWeight:700,marginBottom:18}}>{label}<span style={{fontSize:13,fontWeight:400,color:"#64748b"}}>{help}</span><textarea rows={key==="reasonForVisit"?3:4} maxLength={key==="reasonForVisit"?2000:["symptoms","medicalHistory"].includes(key)?5000:3000} value={String(data[key]??"")} onChange={e=>setData((x)=>({...x,[key]:e.target.value}))} style={{padding:13,border:"1px solid #cbd5e1",borderRadius:12,resize:"vertical"}}/></label>)}<label style={{display:"flex",gap:10,alignItems:"flex-start",padding:16,borderRadius:14,background:"#f8fafc"}}><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} /><span><b>I consent to this consultation</b><small style={{display:"block",color:"#64748b",marginTop:4}}>I confirm that the information provided is intended to help the CareBridge specialist prepare for my consultation.</small></span></label><div style={{display:"flex",gap:10,marginTop:20}}><button onClick={save} disabled={saving} style={{padding:"12px 17px",border:0,borderRadius:12,background:"#1672b8",color:"white",fontWeight:800}}>{saving?"Saving…":consent?"Submit questionnaire":"Save draft"}</button><Link href="/documents" style={{padding:"12px 17px",border:"1px solid #cbd5e1",borderRadius:12}}>Upload records</Link></div></section></main>;
}
