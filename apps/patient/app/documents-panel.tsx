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
    if (!allowedTypes.includes(file.type)) {
      setMessage("For now, use PDF, JPG or PNG files.");
      return;
    }
    if (file.size > maxBytes) {
      setMessage("That file is larger than the 10 MB development limit.");
      return;
    }

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
      setDocuments((current) => [
        { id: intent.documentId ?? crypto.randomUUID(), fileName: file.name, mimeType: file.type, sizeBytes: file.size, status: intent.status ?? "PENDING_UPLOAD" },
        ...current,
      ]);
      setMessage("Upload slot created. The production object-storage transfer will be connected next.");
    } catch {
      setMessage("The CareBridge API is unavailable. Start the local API and try again.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <section id="documents" className="documents-section content-section">
      <div className="section-heading">
        <div>
          <div className="eyebrow">SECURE DOCUMENTS</div>
          <h2>Bring the right records to your consultation.</h2>
        </div>
        <p>Share relevant reports, scans and previous records without emailing sensitive files around.</p>
      </div>

      <div className="documents-card">
        <div className="upload-zone">
          <div className="upload-icon" aria-hidden="true">↑</div>
          <div>
            <strong>Drop a medical document here</strong>
            <p>PDF, JPG or PNG · up to 10 MB in development</p>
          </div>
          <button className="button dark" disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? "Preparing…" : "Choose file"}</button>
          <input ref={inputRef} hidden type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
        </div>

        <div className="document-trust">
          <span>🔒 Private by design</span>
          <span>✓ File type validated</span>
          <span>✓ No medical binaries in Git</span>
        </div>

        {documents.length > 0 && <div className="document-list">
          {documents.map((document) => <div className="document-item" key={document.id}>
            <div className="document-type">{document.mimeType === "application/pdf" ? "PDF" : "IMG"}</div>
            <div><strong>{document.fileName}</strong><span>{Math.max(1, Math.round(document.sizeBytes / 1024))} KB · {document.status}</span></div>
          </div>)}
        </div>}
        <p className="microcopy">{message} This development flow creates upload metadata only; production storage, encryption keys and access controls are intentionally not enabled yet.</p>
      </div>
    </section>
  );
}
