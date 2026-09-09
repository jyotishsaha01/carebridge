import DocumentsPanel from "../documents-panel";

export default function DocumentsPage() {
  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="CareBridge home"><span className="brand-mark">C</span><span>CareBridge</span></a>
        <nav className="nav-links" aria-label="Document navigation"><a href="/">Find Specialists</a><a href="#documents">My Documents</a></nav>
      </header>
      <DocumentsPanel />
    </main>
  );
}
