const formats: Record<string, { extension: string; signature: number[] }> = {
  "application/pdf": { extension: "pdf", signature: [37, 80, 68, 70, 45] },
  "image/png": { extension: "png", signature: [137, 80, 78, 71, 13, 10, 26, 10] },
  "image/jpeg": { extension: "jpg", signature: [255, 216, 255] },
};
const maxBytes = 10 * 1024 * 1024;

/** Patient-provided names must never choose an executable file extension. */
export function prepareMedicalDownload(content: { contentBase64: string; contentType: string; originalFileName?: string }) {
  const format = Object.hasOwn(formats, content.contentType) ? formats[content.contentType] : undefined;
  if (!format || typeof content.contentBase64 !== "string" || content.contentBase64.length > Math.ceil(maxBytes / 3) * 4) throw new Error("This document cannot be safely downloaded.");
  let bytes: Uint8Array<ArrayBuffer>;
  try { bytes = Uint8Array.from(atob(content.contentBase64), character => character.charCodeAt(0)); }
  catch { throw new Error("This document cannot be safely downloaded."); }
  if (!bytes.length || bytes.length > maxBytes || !format.signature.every((value, index) => bytes[index] === value)) throw new Error("The document content does not match its file type.");
  let stem = (typeof content.originalFileName === "string" ? content.originalFileName : "patient-document").replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069<>:"/\\|?*]/g, "_").replace(/^\.+/, "").replace(/[. ]+$/, "");
  const dot = stem.lastIndexOf(".");
  if (dot > 0) stem = stem.slice(0, dot);
  stem = stem.slice(0, 100).replace(/[. ]+$/, "") || "patient-document";
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem)) stem = `document-${stem}`;
  return { blob: new Blob([bytes], { type: content.contentType }), fileName: `${stem}.${format.extension}` };
}
