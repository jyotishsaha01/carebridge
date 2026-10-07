import Link from "next/link";
import DocumentsPanel from "../documents-panel";

export default function DocumentsPage() {
  return (
    <main className="site-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="CareBridge home"><span className="brand-mark">C</span><span>CareBridge</span></Link>
        <nav className="nav-links" aria-label="Document navigation"><Link href="/">Find Specialists</Link><a href="#documents">My Documents</a></nav>
      </header>
      <DocumentsPanel />
    </main>
  );
}
