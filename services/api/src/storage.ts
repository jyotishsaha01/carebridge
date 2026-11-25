import { createHash, createHmac, randomUUID } from "node:crypto";
import { readDocument as readLocalDocument, saveDocument as saveLocalDocument, deleteDocument as deleteLocalDocument } from "./documentStoragePrototype";

export type UploadIntent = {
  storageKey: string;
  contentType: string;
  maxBytes: number;
  uploadUrl?: string;
  expiresAt?: string;
};
export type DownloadAccess = { mode: "provider-adapter-pending" | "signed-url"; url?: string; expiresAt?: string };
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const allowedContentTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);

export interface DocumentStorageProvider {
  createUploadIntent(input: { storageKey: string; contentType: string; sizeBytes: number }): Promise<UploadIntent>;
  createDownloadAccess(input: { storageKey: string }): Promise<DownloadAccess>;
  writeDocument(input: { storageKey: string; content: Buffer; contentType: string }): Promise<void>;
  readDocument(storageKey: string): Promise<Buffer>;
  deleteDocument(storageKey: string): Promise<void>;
}

function sha256(value: string | Buffer) { return createHash("sha256").update(value).digest("hex"); }
function hmac(key: Buffer | string, value: string) { return createHmac("sha256", key).update(value).digest(); }
function encodePath(value: string) { return value.split("/").map(segment => encodeURIComponent(segment).replace(/[!'()*]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase())).join("/"); }
function amzDate(date: Date) { return date.toISOString().replace(/[:-]|\.\d{3}/g, ""); }

class LocalStorageProvider implements DocumentStorageProvider {
  async createUploadIntent(input: { storageKey: string; contentType: string; sizeBytes: number }): Promise<UploadIntent> {
    assertLocalStorageAllowed();
    return { storageKey: input.storageKey, contentType: input.contentType, maxBytes: MAX_DOCUMENT_BYTES };
  }
  async createDownloadAccess(): Promise<DownloadAccess> { assertLocalStorageAllowed(); return { mode: "provider-adapter-pending" }; }
  async writeDocument(input: { storageKey: string; content: Buffer; contentType: string }) {
    await saveLocalDocument(input);
  }
  async readDocument(storageKey: string) { return readLocalDocument(storageKey); }
  async deleteDocument(storageKey: string) { return deleteLocalDocument(storageKey); }
}

type S3Config = { bucket: string; region: string; accessKeyId: string; secretAccessKey: string; endpoint: string };
function getS3Config(): S3Config {
  const { STORAGE_BUCKET, STORAGE_REGION, STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY } = process.env;
  if (!STORAGE_BUCKET || !STORAGE_REGION || !STORAGE_ACCESS_KEY_ID || !STORAGE_SECRET_ACCESS_KEY) {
    throw new Error("S3 storage requires STORAGE_BUCKET, STORAGE_REGION, STORAGE_ACCESS_KEY_ID and STORAGE_SECRET_ACCESS_KEY");
  }
  if (process.env.STORAGE_ENCRYPTION !== "true") throw new Error("S3 storage requires STORAGE_ENCRYPTION=true");
  const endpoint = process.env.STORAGE_ENDPOINT || `https://s3.${STORAGE_REGION}.amazonaws.com`;
  const parsed = new URL(endpoint);
  if (parsed.protocol !== "https:" && process.env.NODE_ENV === "production") throw new Error("Production object storage endpoint must use HTTPS");
  if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error("Storage endpoint must not include credentials, query parameters or fragments");
  return { bucket: STORAGE_BUCKET, region: STORAGE_REGION, accessKeyId: STORAGE_ACCESS_KEY_ID, secretAccessKey: STORAGE_SECRET_ACCESS_KEY, endpoint: endpoint.replace(/\/$/, "") };
}

class S3CompatibleStorageProvider implements DocumentStorageProvider {
  private readonly config = getS3Config();
  private objectUrl(key: string) {
    if (!key.split("/").every((part) => /^[A-Za-z0-9._-]+$/.test(part) && part !== "." && part !== "..")) throw new Error("Invalid document storage key");
    const url = new URL(this.config.endpoint);
    url.pathname = `${url.pathname.replace(/\/$/, "")}/${encodePath(this.config.bucket)}/${encodePath(key)}`;
    return url;
  }
  private signingKey(date: string) {
    const dateKey = hmac("AWS4" + this.config.secretAccessKey, date);
    const regionKey = hmac(dateKey, this.config.region);
    const serviceKey = hmac(regionKey, "s3");
    return hmac(serviceKey, "aws4_request");
  }
  private async signedRequest(method: "PUT" | "GET" | "DELETE", key: string, body?: Buffer, contentType?: string) {
    const url = this.objectUrl(key);
    const now = new Date();
    const date = amzDate(now);
    const dateStamp = date.slice(0, 8);
    const payloadHash = sha256(body ?? "");
    const headers: Record<string, string> = {
      host: url.host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": date,
    };
    if (method === "PUT") {
      headers["x-amz-server-side-encryption"] = "AES256";
      headers["if-none-match"] = "*";
    }
    if (contentType) headers["content-type"] = contentType;
    const signedHeaders = Object.keys(headers).sort().join(";");
    const canonicalHeaders = Object.keys(headers).sort().map(k => `${k}:${headers[k].trim()}\n`).join("");
    const canonicalRequest = [method, url.pathname, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
    const scope = `${dateStamp}/${this.config.region}/s3/aws4_request`;
    const stringToSign = ["AWS4-HMAC-SHA256", date, scope, sha256(canonicalRequest)].join("\n");
    const signature = createHmac("sha256", this.signingKey(dateStamp)).update(stringToSign).digest("hex");
    const authorization = `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    const response = await fetch(url, { method, headers: { ...headers, authorization }, body: body as BodyInit | undefined, redirect: "error", signal: AbortSignal.timeout(15_000) });
    if (method === "PUT" && response.status === 412) throw Object.assign(new Error("Document content has already been uploaded"), { code: "EEXIST" });
    if (!response.ok) throw new Error(`Object storage ${method} failed with status ${response.status}`);
    return response;
  }
  async createUploadIntent(input: { storageKey: string; contentType: string; sizeBytes: number }): Promise<UploadIntent> {
    if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > MAX_DOCUMENT_BYTES) throw new Error("Document size is invalid");
    return { storageKey: input.storageKey, contentType: input.contentType, maxBytes: MAX_DOCUMENT_BYTES };
  }
  async createDownloadAccess(input: { storageKey: string }): Promise<DownloadAccess> {
    const url = this.objectUrl(input.storageKey);
    const now = new Date();
    const date = amzDate(now);
    const dateStamp = date.slice(0, 8);
    const scope = `${dateStamp}/${this.config.region}/s3/aws4_request`;
    const query: Record<string, string> = {
      "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
      "X-Amz-Credential": `${this.config.accessKeyId}/${scope}`,
      "X-Amz-Date": date,
      "X-Amz-Expires": "300",
      "X-Amz-SignedHeaders": "host",
    };
    const canonicalQuery = Object.entries(query).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
    const canonicalRequest = ["GET", url.pathname, canonicalQuery, `host:${url.host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
    const stringToSign = ["AWS4-HMAC-SHA256", date, scope, sha256(canonicalRequest)].join("\n");
    query["X-Amz-Signature"] = createHmac("sha256", this.signingKey(dateStamp)).update(stringToSign).digest("hex");
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    return { mode: "signed-url", url: url.toString(), expiresAt: new Date(now.getTime() + 300_000).toISOString() };
  }
  async writeDocument(input: { storageKey: string; content: Buffer; contentType: string }) {
    if (!input.content.length || input.content.length > MAX_DOCUMENT_BYTES) throw new Error("Document size is invalid");
    await this.signedRequest("PUT", input.storageKey, input.content, input.contentType);
  }
  async readDocument(storageKey: string) {
    const response = await this.signedRequest("GET", storageKey);
    if (Number(response.headers.get("content-length")) > MAX_DOCUMENT_BYTES) throw new Error("Invalid stored document");
    if (!response.body) return Buffer.alloc(0);
    const chunks: Buffer[] = [];
    let length = 0;
    const reader = response.body.getReader();
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        length += part.value.length;
        if (length > MAX_DOCUMENT_BYTES) { await reader.cancel(); throw new Error("Invalid stored document"); }
        chunks.push(Buffer.from(part.value));
      }
      return Buffer.concat(chunks, length);
    } finally { reader.releaseLock(); }
  }
  async deleteDocument(storageKey: string) { await this.signedRequest("DELETE", storageKey); }
}

class UnconfiguredStorageProvider implements DocumentStorageProvider {
  private unavailable(): never { throw Object.assign(new Error("Encrypted production document storage is not configured"), { statusCode: 503 }); }
  async createUploadIntent(): Promise<UploadIntent> { return this.unavailable(); }
  async createDownloadAccess(): Promise<DownloadAccess> { return this.unavailable(); }
  async writeDocument(): Promise<void> { return this.unavailable(); }
  async readDocument(): Promise<Buffer> { return this.unavailable(); }
  async deleteDocument(): Promise<void> { return this.unavailable(); }
}

const production = process.env.NODE_ENV === "production";
const providerName = process.env.STORAGE_PROVIDER ?? (production ? "unconfigured" : "local");
if (production && providerName === "local") throw new Error("Production requires STORAGE_PROVIDER=s3; local document storage is not production-safe");
if (providerName !== "s3" && providerName !== "local" && providerName !== "unconfigured") throw new Error("STORAGE_PROVIDER must be either s3 or local");
export const documentStorage: DocumentStorageProvider = providerName === "s3" ? new S3CompatibleStorageProvider() : providerName === "local" ? new LocalStorageProvider() : new UnconfiguredStorageProvider();

export function createUploadIntent(input: { patientId: string; fileName: string; contentType: string; sizeBytes: number }): UploadIntent {
  if (!allowedContentTypes.has(input.contentType)) throw new Error("Unsupported document type");
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > MAX_DOCUMENT_BYTES) throw new Error("Document size is invalid");
  const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "document";
  const unique = `${Date.now()}-${randomUUID()}`;
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
