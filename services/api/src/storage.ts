import { createHash, createHmac, randomUUID } from "node:crypto";
import { readDocument as readLocalDocument, saveDocument as saveLocalDocument } from "./documentStoragePrototype";

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
}

function sha256(value: string | Buffer) { return createHash("sha256").update(value).digest("hex"); }
function hmac(key: Buffer | string, value: string) { return createHmac("sha256", key).update(value).digest(); }
function encodePath(value: string) { return value.split("/").map(segment => encodeURIComponent(segment).replace(/[!'()*]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase())).join("/"); }
function amzDate(date: Date) { return date.toISOString().replace(/[:-]|\.\d{3}/g, ""); }

class LocalStorageProvider implements DocumentStorageProvider {
  async createUploadIntent(input: { storageKey: string; contentType: string; sizeBytes: number }): Promise<UploadIntent> {
    return { storageKey: input.storageKey, contentType: input.contentType, maxBytes: MAX_DOCUMENT_BYTES };
  }
  async createDownloadAccess(): Promise<DownloadAccess> { return { mode: "provider-adapter-pending" }; }
  async writeDocument(input: { storageKey: string; content: Buffer; contentType: string }) {
    await saveLocalDocument(input);
  }
  async readDocument(storageKey: string) { return readLocalDocument(storageKey); }
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
  private async signedRequest(method: "PUT" | "GET", key: string, body?: Buffer, contentType?: string) {
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
    if (method === "PUT") headers["x-amz-server-side-encryption"] = "AES256";
    if (contentType) headers["content-type"] = contentType;
    const signedHeaders = Object.keys(headers).sort().join(";");
    const canonicalHeaders = Object.keys(headers).sort().map(k => `${k}:${headers[k].trim()}\n`).join("");
    const canonicalRequest = [method, url.pathname, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
    const scope = `${dateStamp}/${this.config.region}/s3/aws4_request`;
    const stringToSign = ["AWS4-HMAC-SHA256", date, scope, sha256(canonicalRequest)].join("\n");
    const signature = createHmac("sha256", this.signingKey(dateStamp)).update(stringToSign).digest("hex");
    const authorization = `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    const response = await fetch(url, { method, headers: { ...headers, authorization }, body: body as BodyInit | undefined, redirect: "error" });
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
    return Buffer.from(await response.arrayBuffer());
  }
}

const production = process.env.NODE_ENV === "production";
const providerName = process.env.STORAGE_PROVIDER ?? (production ? "s3" : "local");
if (production && providerName !== "s3") throw new Error("Production requires STORAGE_PROVIDER=s3; local document storage is not production-safe");
if (providerName !== "s3" && providerName !== "local") throw new Error("STORAGE_PROVIDER must be either s3 or local");
export const documentStorage: DocumentStorageProvider = providerName === "s3" ? new S3CompatibleStorageProvider() : new LocalStorageProvider();

export function createUploadIntent(input: { patientId: string; fileName: string; contentType: string; sizeBytes: number }): UploadIntent {
  if (!allowedContentTypes.has(input.contentType)) throw new Error("Unsupported document type");
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > MAX_DOCUMENT_BYTES) throw new Error("Document size is invalid");
  const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "document";
  const unique = `${Date.now()}-${randomUUID()}`;
  return { storageKey: `patients/${input.patientId}/${unique}-${safeName}`, contentType: input.contentType, maxBytes: MAX_DOCUMENT_BYTES };
}
