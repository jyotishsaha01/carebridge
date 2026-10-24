import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("document storage provider", () => {
  it("rejects unsupported types and oversized uploads before storage", async () => {
    const storage = await import("./storage.js");
    expect(() => storage.createUploadIntent({ patientId: "patient_1", fileName: "scan.exe", contentType: "application/octet-stream", sizeBytes: 100 })).toThrow("Unsupported document type");
    expect(() => storage.createUploadIntent({ patientId: "patient_1", fileName: "scan.pdf", contentType: "application/pdf", sizeBytes: storage.MAX_DOCUMENT_BYTES + 1 })).toThrow("Document size is invalid");
  });

  it("requires configured encrypted S3 storage when production is selected", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STORAGE_PROVIDER", "s3");
    vi.stubEnv("STORAGE_BUCKET", "");
    vi.stubEnv("STORAGE_REGION", "");
    vi.stubEnv("STORAGE_ACCESS_KEY_ID", "");
    vi.stubEnv("STORAGE_SECRET_ACCESS_KEY", "");
    vi.stubEnv("STORAGE_ENCRYPTION", "true");
    await expect(import("./storage.js")).rejects.toThrow("S3 storage requires");
  });

  it("writes to S3-compatible storage with signed requests and returns a short-lived download URL", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("STORAGE_PROVIDER", "s3");
    vi.stubEnv("STORAGE_BUCKET", "carebridge-private");
    vi.stubEnv("STORAGE_REGION", "ap-south-1");
    vi.stubEnv("STORAGE_ACCESS_KEY_ID", "test-access-key");
    vi.stubEnv("STORAGE_SECRET_ACCESS_KEY", "test-secret-key");
    vi.stubEnv("STORAGE_ENCRYPTION", "true");
    vi.stubEnv("STORAGE_ENDPOINT", "https://storage.example.test");
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const storage = await import("./storage.js");
    const body = Buffer.from("%PDF-1.7 test");
    await storage.documentStorage.writeDocument({ storageKey: "patients/p1/scan.pdf", content: body, contentType: "application/pdf" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toContain("/carebridge-private/patients/p1/scan.pdf");
    expect(options.method).toBe("PUT");
    expect(new Headers(options.headers).get("authorization")).toContain("AWS4-HMAC-SHA256");
    expect(new Headers(options.headers).get("x-amz-server-side-encryption")).toBe("AES256");

    const access = await storage.documentStorage.createDownloadAccess({ storageKey: "patients/p1/scan.pdf" });
    expect(access.mode).toBe("signed-url");
    expect(access.url).toContain("X-Amz-Signature=");
    expect(access.url).toContain("X-Amz-Expires=300");
    expect(access.expiresAt).toBeTruthy();
  });

  it("does not allow local storage as a production provider", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STORAGE_PROVIDER", "local");
    await expect(import("./storage.js")).rejects.toThrow("Production requires STORAGE_PROVIDER=s3");
  });
});
