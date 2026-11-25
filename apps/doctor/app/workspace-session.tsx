"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "../lib/request";
import { usePrivateSession } from "../lib/use-private-session";

export default function WorkspaceSession({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return pathname === "/login" ? children : <Session key={pathname}>{children}</Session>;
}

function Session({ children }: { children: React.ReactNode }) {
  const session = usePrivateSession("DOCTOR");
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  async function signOut() {
    setSigningOut(true); setError("");
    try { await apiFetch("/v1/auth/logout", { method: "POST" }); session.clearSession(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to sign out. Try again."); }
    finally { setSigningOut(false); }
  }
  const status = <main className="session-state"><h1>CareBridge Doctor</h1>{session.error ? <><p role="alert">{session.error}</p><button onClick={() => void session.verify()}>Try again</button> <Link href="/login">Sign in</Link></> : <p role="status">Verifying secure access…</p>}</main>;
  if (!session.authorized) return status;
  return <><div className="workspace-session-bar"><Link href="/dashboard">CareBridge · Doctor workspace</Link><button disabled={signingOut} onClick={() => void signOut()}>{signingOut ? "Signing out…" : "Sign out"}</button></div>{error && <p role="alert" className="session-message">{error}</p>}{session.checking && status}<div key={session.userId} hidden={session.checking} inert={session.checking}>{children}</div></>;
}
