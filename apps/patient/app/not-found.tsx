import Link from "next/link";

export default function NotFound() {
  return <main className="system-state"><div className="eyebrow">CAREBRIDGE · 404</div><h1>We couldn’t find that page.</h1><p>The link may have changed. Return to your dashboard or explore our specialist network.</p><Link className="button primary" href="/dashboard">Go to dashboard</Link><Link className="button ghost" href="/">Find a specialist</Link></main>;
}
