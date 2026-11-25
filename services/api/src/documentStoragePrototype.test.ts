import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let sandbox: string;
let root: string;
let storage: typeof import("./documentStoragePrototype.js");
const pdf = Buffer.from("%PDF-1.4\nsynthetic document");

beforeEach(async () => {
  sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "carebridge-storage-security-"));
  root = path.join(sandbox, "documents");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("CAREBRIDGE_DOCUMENT_STORAGE_DIR", root);
  vi.resetModules();
  storage = await import("./documentStoragePrototype.js");
  await storage.initializeDocumentStorage();
});
afterEach(async () => { vi.unstubAllEnvs(); await fs.rm(sandbox, { recursive: true, force: true }); });

describe("local document storage isolation", () => {
  it("round-trips owned files without allowing replacement", async () => {
    const storageKey = storage.createStorageKey("patient-a", "report.pdf");
    await storage.saveDocument({ storageKey, content: pdf, contentType: "application/pdf" });
    expect(await storage.readDocument(storageKey)).toEqual(pdf);
    await expect(storage.saveDocument({ storageKey, content: pdf, contentType: "application/pdf" })).rejects.toMatchObject({ code: "EEXIST" });
    await storage.deleteDocument(storageKey);
    await expect(storage.readDocument(storageKey)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each(["../secret", "/secret", "patients/../secret", "patients//secret", "patients\\secret", "./secret", "patients/secret\0"])("rejects unsafe key %j instead of silently remapping it", async (storageKey) => {
    await expect(storage.readDocument(storageKey)).rejects.toThrow("Invalid document storage key");
    await expect(storage.saveDocument({ storageKey, content: pdf, contentType: "application/pdf" })).rejects.toThrow("Invalid document storage key");
    await expect(storage.deleteDocument(storageKey)).rejects.toThrow("Invalid document storage key");
  });

  it("cannot read an external file through a symbolic-link leaf", async () => {
    const external = path.join(sandbox, "private-secret");
    await fs.writeFile(external, "confidential unrelated file");
    await fs.symlink(external, path.join(root, "document.pdf"));
    await expect(storage.readDocument("document.pdf")).rejects.toBeDefined();
    await expect(storage.deleteDocument("document.pdf")).rejects.toThrow("Invalid stored document");
    expect(await fs.readFile(external, "utf8")).toBe("confidential unrelated file");
  });

  it("cannot read, write, or remove files through a symbolic-link directory", async () => {
    const external = path.join(sandbox, "external");
    await fs.mkdir(external);
    await fs.writeFile(path.join(external, "secret.pdf"), pdf);
    await fs.symlink(external, path.join(root, "patients"));
    await expect(storage.readDocument("patients/secret.pdf")).rejects.toThrow("symbolic links");
    await expect(storage.saveDocument({ storageKey: "patients/new.pdf", content: pdf, contentType: "application/pdf" })).rejects.toThrow("symbolic links");
    await expect(storage.deleteDocument("patients/secret.pdf")).rejects.toThrow("symbolic links");
    expect(await fs.readdir(external)).toEqual(["secret.pdf"]);
  });

  it("rejects a configured storage root that is itself a symbolic link", async () => {
    await fs.rmdir(root);
    await fs.symlink(sandbox, root);
    await expect(storage.initializeDocumentStorage()).rejects.toThrow("symbolic link");
    await expect(storage.readDocument("private-secret")).rejects.toThrow("symbolic link");
  });

  it("rejects invalid patient identifiers before generating paths", () => {
    expect(() => storage.createStorageKey("../other-patient", "report.pdf")).toThrow("Invalid patient storage identifier");
  });
});
