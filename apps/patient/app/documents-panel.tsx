"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ApiError, apiFetch } from "../lib/api";
import { usePrivateSession } from "../lib/use-private-session";
import { assertSessionScope, captureSessionScope } from "../lib/session-binding";

const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];
const maxBytes = 10 * 1024 * 1024;
type DocumentItem = { id: string; originalFileName: string; contentType: string; sizeBytes: number; createdAt: string };
type DocumentContent = { contentBase64: string; contentType: string; originalFileName: string };

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Unable to read this file. Please choose it again."));
    reader.readAsDataURL(file);
  });
}

export default function DocumentsPanel() {
  const session = usePrivateSession("PATIENT", null);
  if (!session.authorized) return <section id="documents" className="documents-section content-section"><div className="section-heading"><div><div className="eyebrow">SECURE DOCUMENTS</div><h2>Bring the right records to your consultation.</h2></div><p>Share relevant reports, scans and previous records with your care team.</p></div><div className="documents-card"><button className="button dark" disabled>Choose file</button>{session.error ? <p role="alert">Please sign in to access your medical documents. <Link href="/login">Sign in</Link></p> : <p role="status">Verifying secure access…</p>}</div></section>;
  return <>{session.checking && <p role="status">Verifying secure document access…</p>}<div key={session.userId} hidden={session.checking} inert={session.checking}><DocumentsPanelContent /></div></>;
}

function DocumentsPanelContent() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [signInRequired, setSignInRequired] = useState(false);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  async function load(signal?: AbortSignal) {
    try {
      const result = await apiFetch<DocumentItem[]>("/v1/documents", { signal });
      if (!signal?.aborted) { setDocuments(result); setError(""); setSignInRequired(false); }
    } catch (cause) {
      if (!signal?.aborted) {
        setError(cause instanceof Error ? cause.message : "Unable to load your documents. Please try again.");
        setSignInRequired(cause instanceof ApiError && cause.status === 401);
      }
    } finally { if (!signal?.aborted) setLoading(false); }
  }

  useEffect(() => {
    const controller = new AbortController();
    // State updates in load occur after the network request settles.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(controller.signal);
    return () => controller.abort();
  }, []);

  async function upload(file: File) {
    if (!allowedTypes.includes(file.type) || file.size === 0 || file.size > maxBytes) {
      setMessage("Choose a non-empty PDF, JPG, or PNG file up to 10 MB.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    const scope = captureSessionScope();
    setBusy(true); setMessage("Uploading your document…");
    try {
      const contentBase64 = await fileToBase64(file);
      assertSessionScope(scope);
      const intent = await apiFetch<{ document: { id: string } }>("/v1/documents/upload-intent", { method: "POST", headers: { "content-type": "application/json" }, sessionScope: scope, body: JSON.stringify({ fileName: file.name, contentType: file.type, sizeBytes: file.size }) });
      await apiFetch(`/v1/documents/${encodeURIComponent(intent.document.id)}/content`, { method: "PUT", headers: { "content-type": "application/json" }, sessionScope: scope, body: JSON.stringify({ contentBase64 }) });
      setMessage("Document uploaded successfully.");
      await load();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "The document could not be uploaded. Please try again.");
    } finally { setBusy(false); if (inputRef.current) inputRef.current.value = ""; }
  }

  async function openDocument(id: string) {
    const scope = captureSessionScope();
    setOpening(id); setMessage(""); setPreview(null);
    try {
      const details = await apiFetch<{ document: { contentType: string } }>(`/v1/documents/${encodeURIComponent(id)}`, { sessionScope: scope });
      const content = await apiFetch<DocumentContent>(`/v1/documents/${encodeURIComponent(id)}/content`, { sessionScope: scope });
      if (!allowedTypes.includes(content.contentType)) throw new Error("This document type cannot be previewed.");
      if (content.contentType !== details.document.contentType) throw new Error("The document metadata does not match its stored content. Please contact support.");
      const bytes = Uint8Array.from(atob(content.contentBase64), (char) => char.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: content.contentType }));
      setPreview({ url, name: content.originalFileName });
      setMessage("Your document is ready to open.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to open this document. Please try again.");
    } finally { setOpening(null); }
  }

  return <section id="documents" className="documents-section content-section">
    <div className="section-heading"><div><div className="eyebrow">SECURE DOCUMENTS</div><h2>Bring the right records to your consultation.</h2></div><p>Share relevant reports, scans and previous records with your care team.</p></div>
    <div className="documents-card">
      <div className="upload-zone"><div className="upload-icon" aria-hidden="true">↑</div><div><strong>Upload a medical document</strong><p>PDF, JPG or PNG · up to 10 MB</p></div><button className="button dark" disabled={busy || loading || signInRequired} onClick={() => inputRef.current?.click()}>{busy ? "Uploading…" : "Choose file"}</button><input ref={inputRef} hidden type="file" accept="application/pdf,image/jpeg,image/png" aria-label="Select a medical document" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} /></div>
      <div className="document-trust"><span>Access restricted to your account and authorized care team</span></div>
      {error && <div className="empty-state" role="alert">{error} {signInRequired ? <Link href="/login" className="button ghost">Sign in</Link> : <button className="button ghost" onClick={() => { setLoading(true); void load(); }}>Try again</button>}</div>}
      <div className="document-list" aria-busy={loading}>{loading ? <p className="microcopy" role="status">Loading your documents…</p> : !error && (documents.length === 0 ? <p className="microcopy">No medical documents uploaded yet.</p> : documents.map((document) => <button className="document-item" key={document.id} aria-label={`Open ${document.originalFileName}`} disabled={opening !== null} onClick={() => void openDocument(document.id)}><div className="document-type">{document.contentType === "application/pdf" ? "PDF" : "IMG"}</div><div><strong>{document.originalFileName}</strong><span>{opening === document.id ? "Preparing document…" : `${Math.max(1, Math.round(document.sizeBytes / 1024))} KB · ${new Date(document.createdAt).toLocaleDateString()}`}</span></div></button>))}</div>
      {message && <p className="microcopy" role="status">{message}</p>}
      {preview && <a className="button primary" style={{ display: "inline-block" }} href={preview.url} target="_blank" rel="noopener noreferrer">Open {preview.name} in a new tab</a>}
    </div>
    <style>{`#documents.documents-section{padding-top:18px}.documents-card{border:1px solid rgba(148,163,184,.28);border-radius:28px;padding:22px;background:linear-gradient(145deg,rgba(255,255,255,.96),rgba(241,248,245,.88));box-shadow:0 24px 70px rgba(15,48,40,.09)}.upload-zone{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:18px;padding:24px;border:1.5px dashed #9ab8ae;border-radius:22px;background:rgba(255,255,255,.72)}.upload-icon{width:52px;height:52px;display:grid;place-items:center;border-radius:16px;background:#e4f2ed;color:#17604e;font-size:27px;font-weight:800}.upload-zone p{margin:5px 0 0;color:#66756f;font-size:13px}.document-trust{display:flex;flex-wrap:wrap;gap:10px;margin:16px 2px;color:#49625a;font-size:12px}.document-trust span{padding:8px 10px;border-radius:999px;background:#edf5f2}.document-list{display:grid;gap:9px;margin-top:14px}.document-item{display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid #dce8e3;border-radius:15px;background:#fff;text-align:left;width:100%;cursor:pointer}.document-type{width:42px;height:42px;display:grid;place-items:center;border-radius:12px;background:#eef5f2;color:#225d4f;font-size:11px;font-weight:800}.document-item strong,.document-item span{display:block}.document-item span{margin-top:3px;color:#71817b;font-size:12px}@media(max-width:700px){.upload-zone{grid-template-columns:auto 1fr}.upload-zone .button{grid-column:1/-1;width:100%}}`}</style>
  </section>;
}
