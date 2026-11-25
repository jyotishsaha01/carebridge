import Link from "next/link";
export default function NotFound() {
  return <main className="session-state"><h1>Page not found</h1><p>This page may have moved or is no longer available.</p><Link href="/dashboard">Return to dashboard</Link></main>;
}
