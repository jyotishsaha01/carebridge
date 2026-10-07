import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { MAX_DOCUMENT_BYTES } from "./storage";

const root=path.resolve(process.env.CAREBRIDGE_DOCUMENT_STORAGE_DIR??".carebridge-storage");
const safe=(key:string)=>key.replace(/^[/\\]+/g,"").replace(/\.\./g,"_");
export async function initializeDocumentStorage(){await fs.mkdir(root,{recursive:true});}
export async function saveDocument(input:{storageKey:string;content:Buffer;contentType:string}){if(!input.content.length||input.content.length>MAX_DOCUMENT_BYTES)throw new Error("Document size is invalid");const key=safe(input.storageKey);const file=path.join(root,key);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,input.content,{flag:"wx"});return{storageKey:key,provider:"local-prototype",bytes:input.content.length};}
export async function readDocument(storageKey:string){return fs.readFile(path.join(root,safe(storageKey)));}
export async function deleteDocument(storageKey:string){await fs.rm(path.join(root,safe(storageKey)),{force:true});}
export function createStorageKey(patientId:string,fileName:string){const clean=fileName.replace(/[^a-zA-Z0-9._-]/g,"_").slice(0,120)||"document";return `patients/${patientId}/${Date.now()}-${randomUUID()}-${clean}`;}
