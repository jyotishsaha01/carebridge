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
    return { storageKey: input.storageKey, contentType: input.contentType, maxBytes: MAX_DOCUMENT_BYTES };
  }
  async createDownloadAccess(): Promise<DownloadAccess> {
    return { mode: "provider-adapter-pending" };
  }
}

export const documentStorage: DocumentStorageProvider = new LocalStorageProvider();

export function createUploadIntent(input: { patientId: string; fileName: string; contentType: string; sizeBytes: number }): UploadIntent {
  if (!allowedContentTypes.has(input.contentType)) throw new Error("Unsupported document type");
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > MAX_DOCUMENT_BYTES) throw new Error("Document size is invalid");
  const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "document";
  const unique = `${Date.now()}-${crypto.randomUUID()}`;
  return { storageKey: `patients/${input.patientId}/${unique}-${safeName}`, contentType: input.contentType, maxBytes: MAX_DOCUMENT_BYTES };
}
