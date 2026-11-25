"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { bindSession } from "../../lib/session-binding";
import { apiFetch, jsonRequest } from "../../lib/request";

export default function DoctorLogin() {
  const router = useRouter();
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const loginRequest=useRef<AbortController|null>(null);
  useEffect(()=>()=>loginRequest.current?.abort(),[]);

  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy || loginRequest.current) return; const controller=new AbortController();loginRequest.current=controller; setBusy(true); setError("");
    try {
      const body = await apiFetch<{ user: { id:string; role: string } }>("/v1/auth/login", {...jsonRequest("POST", { email: email.trim(), password }), signal:controller.signal});
      if(controller.signal.aborted)return;
      bindSession(body.user.id,body.user.role);
      if (body.user.role !== "DOCTOR") {
        await apiFetch("/v1/auth/logout", { method: "POST" });
        throw new Error("This workspace requires a doctor account.");
      }
      router.replace("/dashboard");
    } catch (e) { if(controller.signal.aborted)return;setError(e instanceof Error ? e.message : "Unable to sign in."); }
    finally { if(loginRequest.current===controller)loginRequest.current=null;if(!controller.signal.aborted)setBusy(false); }
  }

  return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",background:"#f6f9fc",padding:24,fontFamily:"Inter,system-ui,sans-serif"}}><section style={{width:"100%",maxWidth:460,background:"white",border:"1px solid #dfe8f0",borderRadius:24,padding:32}}><div style={{fontSize:12,fontWeight:800,letterSpacing:".12em",color:"#5f7891"}}>CAREBRIDGE · DOCTOR</div><h1>Clinical workspace access</h1><p style={{color:"#64788d"}}>Sign in to review appointments and complete clinical records.</p><form onSubmit={submit} style={{display:"grid",gap:16,marginTop:24}}><label>Email<input disabled={busy} type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} style={{display:"block",width:"100%",marginTop:6,padding:12}}/></label><label>Password<input disabled={busy} type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} style={{display:"block",width:"100%",marginTop:6,padding:12}}/></label><button disabled={busy} type="submit" style={{padding:13,fontWeight:700}}>{busy?"Signing in…":"Sign in securely"}</button></form>{error&&<p role="alert" style={{color:"#b42318",marginTop:16}}>{error}</p>}<p style={{fontSize:12,color:"#718096",marginTop:22}}>For authorized healthcare professionals.</p></section></main>;
}
