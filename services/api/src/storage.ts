export type UploadIntent = {
  storageKey: string;
  contentType: string;
  maxBytes: number;
};

const allowedContentTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export function createUploadIntent(input: { patientId: string; fileName: string; contentType: string; sizeBytes: number }): UploadIntent {
  if (!allowedContentTypes.has(input.contentType)) {
    throw new Error("Unsupported document type");
  }
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > MAX_DOCUMENT_BYTES) {
    throw new Error("Document size is invalid");
  }

  const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "document";
  const unique = `${Date.now()}-${crypto.randomUUID()}`;
  return {
    storageKey: `patients/${input.patientId}/${unique}-${safeName}`,
    contentType: input.contentType,
    maxBytes: MAX_DOCUMENT_BYTES,
  };
}
