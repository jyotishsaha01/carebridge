"use client";

import { useRef, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];
const maxBytes = 10 * 1024 * 1024;
type DocumentItem = { id: string; fileName: string; mimeType: string; sizeBytes: number; status: string };

export default function DocumentsPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Upload a PDF or image to share securely with your care team.");

  async function upload(file: File) {
    if (!allowedTypes.includes(file.type)) return setMessage("For now, use PDF, JPG or PNG files.");
    if (file.size > maxBytes) return setMessage("That file is larger than the 10 MB development limit.");
    setBusy(true);
    setMessage("Preparing a secure upload…");
    try {
      const response = await fetch(`${API_URL}/v1/documents/upload-intent`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileName: file.name, mimeType: file.type, sizeBytes: file.size }),
      });
      if (!response.ok) throw new Error("Upload intent failed");
      const intent = await response.json() as { documentId?: string; status?: string };
      setDocuments((current) => [{ id: intent.documentId ?? crypto.randomUUID(), fileName: file.name, mimeType: file.type, sizeBytes: file.size, status: intent.status ?? "PENDING_UPLOAD" }, ...current]);
      setMessage("Upload slot created. Production object-storage transfer will be connected next.");
    } catch {
      setMessage("The CareBridge API is unavailable. Start the local API and try again.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <section id="documents" className="documents-section content-section">
      <style>{`#documents.documents-section{padding-top:18px}.documents-card{border:1px solid rgba(148,163,184,.28);border-radius:28px;padding:22px;background:linear-gradient(145deg,rgba(255,255,255,.96),rgba(241,248,245,.88));box-shadow:0 24px 70px rgba(15,48,40,.09)}.upload-zone{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:18px;padding:24px;border:1.5px dashed #9ab8ae;border-radius:22px;background:rgba(255,255,255,.72);transition:transform .25s ease,box-shadow .25s ease}.upload-zone:hover{transform:translateY(-2px);box-shadow:0 14px 35px rgba(15,48,40,.08)}.upload-icon{width:52px;height:52px;display:grid;place-items:center;border-radius:16px;background:#e4f2ed;color:#17604e;font-size:27px;font-weight:800}.upload-zone strong{font-size:16px}.upload-zone p{margin:5px 0 0;color:#66756f;font-size:13px}.document-trust{display:flex;flex-wrap:wrap;gap:10px;margin:16px 2px;color:#49625a;font-size:12px}.document-trust span{padding:8px 10px;border-radius:999px;background:#edf5f2}.document-list{display:grid;gap:9px;margin-top:14px}.document-item{display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid #dce8e3;border-radius:15px;background:#fff}.document-type{width:42px;height:42px;display:grid;place-items:center;border-radius:12px;background:#eef5f2;color:#225d4f;font-size:11px;font-weight:800}.document-item strong,.document-item span{display:block}.document-item span{margin-top:3px;color:#71817b;font-size:12px}.documents-card .microcopy{margin:16px 2px 2px}@media(max-width:700px){.upload-zone{grid-template-columns:auto 1fr}.upload-zone .button{grid-column:1/-1;width:100%}}@media(prefers-reduced-motion:reduce){.upload-zone{transition:none}}`}</style>
      <div className="section-heading"><div><div className="eyebrow">SECURE DOCUMENTS</div><h2>Bring the right records to your consultation.</h2></div><p>Share relevant reports, scans and previous records without emailing sensitive files around.</p></div>
      <div className="documents-card">
        <div className="upload-zone">
          <div className="upload-icon" aria-hidden="true">↑</div>
          <div><strong>Drop a medical document here</strong><p>PDF, JPG or PNG · up to 10 MB in development</p></div>
          <button className="button dark" disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? "Preparing…" : "Choose file"}</button>
          <input ref={inputRef} hidden type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
        </div>
        <div className="document-trust"><span>🔒 Private by design</span><span>✓ File type validated</span><span>✓ No medical binaries in Git</span></div>
        {documents.length > 0 && <div className="document-list">{documents.map((document) => <div className="document-item" key={document.id}><div className="document-type">{document.mimeType === "application/pdf" ? "PDF" : "IMG"}</div><div><strong>{document.fileName}</strong><span>{Math.max(1, Math.round(document.sizeBytes / 1024))} KB · {document.status}</span></div></div>)}</div>}
        <p className="microcopy">{message} This development flow creates upload metadata only; production storage, encryption keys and access controls are intentionally not enabled yet.</p>
      </div>
    </section>
  );
}
