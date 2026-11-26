"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePrivateSession } from "../lib/use-private-session";

export default function PrivateSession({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const protectedPage = /^\/(dashboard|appointments|profile|records|care-plan|care|notifications|payments|support)(\/|$)/.test(pathname) || /^\/checkout\/.+/.test(pathname);
  return protectedPage ? <Session key={pathname}>{children}</Session> : children;
}
function Session({ children }: { children: React.ReactNode }) {
  const session = usePrivateSession("PATIENT");
  const status = <main className="system-state"><h1>Your private CareBridge workspace</h1>{session.error ? <><p role="alert">{session.error}</p><button className="button primary" onClick={() => void session.verify()}>Try again</button><Link className="button ghost" href="/login">Sign in</Link></> : <p role="status">Verifying secure access…</p>}</main>;
  if (!session.authorized) return status;
  return <>{session.checking && status}<div key={session.userId} hidden={session.checking} inert={session.checking}>{children}</div></>;
}
