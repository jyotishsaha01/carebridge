import { constants, promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { MAX_DOCUMENT_BYTES, assertLocalStorageAllowed, documentMatchesContentType } from "./storage";

const root = path.resolve(process.env.CAREBRIDGE_DOCUMENT_STORAGE_DIR ?? ".carebridge-storage");

function keyParts(key: string) {
  const parts = key.split("/");
  if (!parts.length || parts.some((part) => !/^[A-Za-z0-9._-]+$/.test(part) || part === "." || part === "..")) {
    throw Object.assign(new Error("Invalid document storage key"), { statusCode: 400 });
  }
  return parts;
}

async function storageRoot(create = false) {
  assertLocalStorageAllowed();
  if (create) await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const info = await fs.lstat(root);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Document storage directory must not be a symbolic link");
  // Resolve trusted configured ancestors (for example macOS /tmp -> /private/tmp)
  // once, then reject links in every untrusted path component below this root.
  return fs.realpath(root);
}

async function documentPath(key: string, create = false) {
  const parts = keyParts(key);
  let directory = await storageRoot(create);
  for (const part of parts.slice(0, -1)) {
    directory = path.join(directory, part);
    if (create) {
      try { await fs.mkdir(directory, { mode: 0o700 }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    }
    const info = await fs.lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Document storage path must not contain symbolic links");
  }
  return path.join(directory, parts[parts.length - 1]);
}

export async function initializeDocumentStorage() {
  await storageRoot(true);
}

export async function saveDocument(input: { storageKey: string; content: Buffer; contentType: string }) {
  assertLocalStorageAllowed();
  if (!documentMatchesContentType(input.content, input.contentType)) throw Object.assign(new Error("Document content does not match its declared type"), { statusCode: 400 });
  if (!input.content.length || input.content.length > MAX_DOCUMENT_BYTES) throw new Error("Document size is invalid");
  const file = await documentPath(input.storageKey, true);
  // Exclusive creation also prevents replacing an existing file or following a leaf symlink.
  await fs.writeFile(file, input.content, { flag: "wx", mode: 0o600 });
  return { storageKey: input.storageKey, provider: "local-prototype", bytes: input.content.length };
}

export async function readDocument(storageKey: string) {
  assertLocalStorageAllowed();
  const file = await documentPath(storageKey);
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > MAX_DOCUMENT_BYTES) throw new Error("Invalid stored document");
    return await handle.readFile();
  } finally { await handle.close(); }
}

export async function deleteDocument(storageKey: string) {
  assertLocalStorageAllowed();
  try {
    const file = await documentPath(storageKey);
    const info = await fs.lstat(file);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error("Invalid stored document");
    await fs.unlink(file);
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
}

export function createStorageKey(patientId: string, fileName: string) {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(patientId)) throw new Error("Invalid patient storage identifier");
  const clean = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "document";
  return `patients/${patientId}/${Date.now()}-${randomUUID()}-${clean}`;
}
