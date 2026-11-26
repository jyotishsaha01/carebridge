"use client";

import Link from "next/link";
export default function WorkspaceError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <main className="session-state"><h1>Unable to open this workspace</h1><p role="alert">An unexpected problem occurred. Try again or return to your dashboard.</p><button onClick={retry}>Try again</button> <Link href="/dashboard">Dashboard</Link></main>;
}
