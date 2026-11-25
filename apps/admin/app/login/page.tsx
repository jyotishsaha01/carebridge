"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, signOut } from "../../lib/api";

export default function AdminLogin() {
  const router = useRouter();
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const loginRequest=useRef<AbortController|null>(null);
  useEffect(()=>()=>loginRequest.current?.abort(),[]);
  async function submit(event:FormEvent){
    event.preventDefault(); if (busy || loginRequest.current) return; const controller=new AbortController();loginRequest.current=controller;setBusy(true); setError("");
    try { const result=await signIn(email,password,controller.signal); if(controller.signal.aborted)return; if(result.user.role!=="ADMIN") { await signOut(); throw new Error("This workspace requires an admin account."); } router.replace("/dashboard"); }
    catch(e){if(controller.signal.aborted)return;setError(e instanceof Error?e.message:"Unable to sign in.");} finally{if(loginRequest.current===controller)loginRequest.current=null;if(!controller.signal.aborted)setBusy(false);}
  }
  return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",background:"#f7f9fc",color:"#172334",padding:24,fontFamily:"Inter,system-ui,sans-serif"}}>
    <section style={{width:"100%",maxWidth:460,background:"white",border:"1px solid #e2e8f0",borderRadius:24,padding:32}}>
      <div style={{fontSize:12,fontWeight:800,letterSpacing:".12em",color:"#64748b"}}>CAREBRIDGE · ADMIN</div>
      <h1>Secure operations access</h1><p style={{color:"#64748b"}}>Administrator authentication is required before operational data is displayed.</p>
      <form onSubmit={submit} style={{display:"grid",gap:16,marginTop:24}}>
        <label>Email<input disabled={busy} type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} style={{display:"block",width:"100%",marginTop:6,padding:12}} /></label>
        <label>Password<input disabled={busy} type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} style={{display:"block",width:"100%",marginTop:6,padding:12}} /></label>
        <button disabled={busy} type="submit" style={{padding:13,fontWeight:700}}>{busy?"Signing in…":"Sign in securely"}</button>
      </form>
      {error&&<p role="alert" style={{color:"#b42318",marginTop:16}}>{error}</p>}
      <p style={{fontSize:12,color:"#718096",marginTop:22}}>For authorized CareBridge administrators.</p>
    </section>
  </main>;
}