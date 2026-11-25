export type UploadIntent = {
  storageKey: string;
  contentType: string;
  maxBytes: number;
  uploadUrl?: string;
  expiresAt?: string;
};

export type DownloadAccess = {
  mode: "provider-adapter-pending" | "signed-url";
  url?: string;
  expiresAt?: string;
};

const allowedContentTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export interface DocumentStorageProvider {
  createUploadIntent(input: { storageKey: string; contentType: string; sizeBytes: number }): Promise<UploadIntent>;
  createDownloadAccess(input: { storageKey: string }): Promise<DownloadAccess>;
}

class LocalStorageProvider implements DocumentStorageProvider {
  async createUploadIntent(input: { storageKey: string; contentType: string; sizeBytes: number }): Promise<UploadIntent> {
    assertLocalStorageAllowed();
    return { storageKey: input.storageKey, contentType: input.contentType, maxBytes: MAX_DOCUMENT_BYTES };
  }
  async createDownloadAccess(): Promise<DownloadAccess> {
    assertLocalStorageAllowed();
    return { mode: "provider-adapter-pending" };
  }
}

export const documentStorage: DocumentStorageProvider = new LocalStorageProvider();

export function createUploadIntent(input: { patientId: string; fileName: string; contentType: string; sizeBytes: number }): UploadIntent {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(input.patientId)) throw new Error("Invalid patient storage identifier");
  if (!allowedContentTypes.has(input.contentType)) throw new Error("Unsupported document type");
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > MAX_DOCUMENT_BYTES) throw new Error("Document size is invalid");
  const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "document";
  const unique = `${Date.now()}-${crypto.randomUUID()}`;
  return { storageKey: `patients/${input.patientId}/${unique}-${safeName}`, contentType: input.contentType, maxBytes: MAX_DOCUMENT_BYTES };
}

export function assertLocalStorageAllowed() {
  if (process.env.NODE_ENV === "production") throw Object.assign(new Error("Encrypted production document storage is not configured"), { statusCode: 503 });
}

export function documentMatchesContentType(content: Buffer, contentType: string) {
  if (contentType === "application/pdf") return content.subarray(0, 5).toString("ascii") === "%PDF-";
  if (contentType === "image/png") return content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (contentType === "image/jpeg") return content.length >= 3 && content[0] === 255 && content[1] === 216 && content[2] === 255;
  return false;
}
