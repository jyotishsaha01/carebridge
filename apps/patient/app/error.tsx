"use client";

import Link from "next/link";

export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <main className="system-state"><div className="eyebrow">CAREBRIDGE</div><h1>We couldn’t load this page.</h1><p>Please try again. If the problem continues, return to your dashboard or contact support.</p><button className="button primary" onClick={retry}>Try again</button><Link className="button ghost" href="/dashboard">Go to dashboard</Link><Link className="button ghost" href="/support">Contact support</Link></main>;
}
