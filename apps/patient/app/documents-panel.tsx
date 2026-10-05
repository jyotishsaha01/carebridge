"use client";
import { useEffect, useRef, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];
const maxBytes = 10 * 1024 * 1024;
type DocumentItem = { id: string; originalFileName: string; contentType: string; sizeBytes: number; createdAt: string };

function fileToBase64(file: File) {
  return new Promise<string>((resolve,reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });
}

export default function DocumentsPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [documents,setDocuments] = useState<DocumentItem[]>([]);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("Upload a PDF or image to share securely with your care team.");
  async function load() {
    const response = await fetch(`${API_URL}/v1/documents`,{credentials:"include"});
    if(response.ok) setDocuments(await response.json());
  }
  useEffect(()=>{void load();},[]);
  async function upload(file:File){
    if(!allowedTypes.includes(file.type))return setMessage("For now, use PDF, JPG or PNG files.");
    if(file.size>maxBytes)return setMessage("That file is larger than the 10 MB development limit.");
    setBusy(true);setMessage("Preparing a secure upload…");
    try{
      const intentResponse=await fetch(`${API_URL}/v1/documents/upload-intent`,{method:"POST",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify({fileName:file.name,contentType:file.type,sizeBytes:file.size})});
      if(!intentResponse.ok)throw new Error("Upload intent failed");
      const intent=await intentResponse.json() as {document:{id:string}};
      const contentBase64=await fileToBase64(file);
      const uploadResponse=await fetch(`${API_URL}/v1/documents/${intent.document.id}/content`,{method:"PUT",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify({contentBase64})});
      if(!uploadResponse.ok)throw new Error("Document upload failed");
      setMessage("Document uploaded successfully.");
      await load();
    }catch{setMessage("The document could not be uploaded. Start the local API and try again.");}
    finally{setBusy(false);if(inputRef.current)inputRef.current.value="";}
  }
  async function openDocument(id:string){
    const response=await fetch(`${API_URL}/v1/documents/${id}`,{credentials:"include"});
    if(!response.ok){setMessage("Unable to open this document.");return;}
    const data=await response.json();
    setMessage(data.access?.mode==="provider-adapter-pending"?"Document is stored locally for development; cloud signed access is a production release gate.":"Document access ready.");
  }
  return <section id="documents" className="documents-section content-section">
    <div className="section-heading"><div><div className="eyebrow">SECURE DOCUMENTS</div><h2>Bring the right records to your consultation.</h2></div><p>Share relevant reports, scans and previous records without emailing sensitive files around.</p></div>
    <div className="documents-card">
      <div className="upload-zone"><div className="upload-icon" aria-hidden="true">↑</div><div><strong>Upload a medical document</strong><p>PDF, JPG or PNG · up to 10 MB in development</p></div><button className="button dark" disabled={busy} onClick={()=>inputRef.current?.click()}>{busy?"Uploading…":"Choose file"}</button><input ref={inputRef} hidden type="file" accept="application/pdf,image/jpeg,image/png" onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file);}}/></div>
      <div className="document-trust"><span>🔒 Patient-scoped access</span><span>✓ File type validated</span><span>✓ Local encrypted-storage adapter pending</span></div>
      <div className="document-list">{documents.length===0?<p className="microcopy">No medical documents uploaded yet.</p>:documents.map(d=><button className="document-item" key={d.id} onClick={()=>void openDocument(d.id)}><div className="document-type">{d.contentType==="application/pdf"?"PDF":"IMG"}</div><div><strong>{d.originalFileName}</strong><span>{Math.max(1,Math.round(d.sizeBytes/1024))} KB · {new Date(d.createdAt).toLocaleDateString()}</span></div></button>)}</div>
      <p className="microcopy">{message} Production cloud object storage, encryption-key management and signed URLs remain release gates.</p>
    </div>
    <style>{`#documents.documents-section{padding-top:18px}.documents-card{border:1px solid rgba(148,163,184,.28);border-radius:28px;padding:22px;background:linear-gradient(145deg,rgba(255,255,255,.96),rgba(241,248,245,.88));box-shadow:0 24px 70px rgba(15,48,40,.09)}.upload-zone{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:18px;padding:24px;border:1.5px dashed #9ab8ae;border-radius:22px;background:rgba(255,255,255,.72)}.upload-icon{width:52px;height:52px;display:grid;place-items:center;border-radius:16px;background:#e4f2ed;color:#17604e;font-size:27px;font-weight:800}.upload-zone p{margin:5px 0 0;color:#66756f;font-size:13px}.document-trust{display:flex;flex-wrap:wrap;gap:10px;margin:16px 2px;color:#49625a;font-size:12px}.document-trust span{padding:8px 10px;border-radius:999px;background:#edf5f2}.document-list{display:grid;gap:9px;margin-top:14px}.document-item{display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid #dce8e3;border-radius:15px;background:#fff;text-align:left;width:100%;cursor:pointer}.document-type{width:42px;height:42px;display:grid;place-items:center;border-radius:12px;background:#eef5f2;color:#225d4f;font-size:11px;font-weight:800}.document-item strong,.document-item span{display:block}.document-item span{margin-top:3px;color:#71817b;font-size:12px}@media(max-width:700px){.upload-zone{grid-template-columns:auto 1fr}.upload-zone .button{grid-column:1/-1;width:100%}}`}</style>
  </section>;
}