"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function DoctorLogin() {
  const router = useRouter();
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch(API + "/v1/auth/login", { method:"POST", credentials:"include", headers:{"content-type":"application/json"}, body:JSON.stringify({email,password}) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to sign in.");
      if (body.user?.role !== "DOCTOR") throw new Error("This workspace requires a doctor account.");
      router.push("/dashboard");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to sign in."); }
    finally { setBusy(false); }
  }

  return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",background:"#f6f9fc",padding:24,fontFamily:"Inter,system-ui,sans-serif"}}><section style={{width:"100%",maxWidth:460,background:"white",border:"1px solid #dfe8f0",borderRadius:24,padding:32}}><div style={{fontSize:12,fontWeight:800,letterSpacing:".12em",color:"#5f7891"}}>CAREBRIDGE · DOCTOR</div><h1>Clinical workspace access</h1><p style={{color:"#64788d"}}>Sign in to review appointments and complete clinical records.</p><form onSubmit={submit} style={{display:"grid",gap:16,marginTop:24}}><label>Email<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} style={{display:"block",width:"100%",marginTop:6,padding:12}}/></label><label>Password<input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} style={{display:"block",width:"100%",marginTop:6,padding:12}}/></label><button disabled={busy} type="submit" style={{padding:13,fontWeight:700}}>{busy?"Signing in…":"Sign in securely"}</button></form>{error&&<p role="alert" style={{color:"#b42318",marginTop:16}}>{error}</p>}<p style={{fontSize:12,color:"#718096",marginTop:22}}>Development environment · Synthetic data only.</p></section></main>;
}
