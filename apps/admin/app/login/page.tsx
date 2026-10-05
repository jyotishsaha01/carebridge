"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "../../lib/api";

export default function AdminLogin() {
  const router = useRouter();
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  async function submit(event:FormEvent){
    event.preventDefault(); setBusy(true); setError("");
    try { const result=await signIn(email,password); if(result.user.role!=="ADMIN") throw new Error("This workspace requires an admin account."); router.push("/dashboard"); }
    catch(e){setError(e instanceof Error?e.message:"Unable to sign in.");} finally{setBusy(false);}
  }
  return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",background:"#f7f9fc",padding:24,fontFamily:"Inter,system-ui,sans-serif"}}>
    <section style={{width:"100%",maxWidth:460,background:"white",border:"1px solid #e2e8f0",borderRadius:24,padding:32}}>
      <div style={{fontSize:12,fontWeight:800,letterSpacing:".12em",color:"#64748b"}}>CAREBRIDGE · ADMIN</div>
      <h1>Secure operations access</h1><p style={{color:"#64748b"}}>Administrator authentication is required before operational data is displayed.</p>
      <form onSubmit={submit} style={{display:"grid",gap:16,marginTop:24}}>
        <label>Email<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} style={{display:"block",width:"100%",marginTop:6,padding:12}} /></label>
        <label>Password<input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} style={{display:"block",width:"100%",marginTop:6,padding:12}} /></label>
        <button disabled={busy} type="submit" style={{padding:13,fontWeight:700}}>{busy?"Signing in…":"Sign in securely"}</button>
      </form>
      {error&&<p role="alert" style={{color:"#b42318",marginTop:16}}>{error}</p>}
      <p style={{fontSize:12,color:"#718096",marginTop:22}}>Development environment. Production MFA, identity controls and security review remain release gates.</p>
    </section>
  </main>;
}