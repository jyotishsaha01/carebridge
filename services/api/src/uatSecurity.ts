import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

if (process.env.NODE_ENV !== "test") throw new Error("Security UAT requires NODE_ENV=test and synthetic fixtures");
const password = process.env.CAREBRIDGE_UAT_PASSWORD;
if (!password) throw new Error("CAREBRIDGE_UAT_PASSWORD is required");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must identify the isolated test API database");
const api = new URL(process.env.API_URL ?? "http://127.0.0.1:4000");
if (!["http:", "https:"].includes(api.protocol) || !["127.0.0.1", "localhost", "[::1]"].includes(api.hostname) || api.username || api.password || api.pathname !== "/" || api.search || api.hash) {
  throw new Error("Security UAT API_URL must be a loopback HTTP(S) origin without credentials or a path");
}
const runId = randomUUID();
let phase = "startup";

type Account = { cookie: string; patientId: string };
type DocumentFixture = { id: string; content: Buffer };
type Json = Record<string, any>;

async function request(route: string, options: RequestInit = {}, cookie?: string) {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("content-type", "application/json");
  if (cookie) headers.set("cookie", cookie);
  const response = await fetch(api.origin + route, { ...options, headers, redirect: "error", signal: AbortSignal.timeout(10_000) });
  const text = await response.text();
  let body: any;
  try { body = text ? JSON.parse(text) : null; }
  catch { throw new Error("Security UAT expected a JSON API response"); }
  return { response, body };
}
function sessionCookie(response: Response) {
  const cookie = response.headers.get("set-cookie");
  assert.ok(cookie, "Authentication must issue a session cookie");
  return cookie.split(";")[0];
}
function status(actual: number, expected: number, operation: string) {
  assert.equal(actual, expected, `${operation}: expected HTTP ${expected}, received ${actual}`);
}
async function login(email: string, role: "PATIENT" | "DOCTOR") {
  const result = await request("/v1/auth/login", { method: "POST", body: JSON.stringify({ email, password, role }) });
  status(result.response.status, 200, "Synthetic fixture login");
  assert.equal(result.body.user.role, role, "Fixture must authenticate with its intended role");
  return sessionCookie(result.response);
}
async function createPatient(label: string): Promise<Account> {
  const email = `security-${label}-${runId}@demo.carebridge.local`;
  const result = await request("/v1/auth/signup", { method: "POST", body: JSON.stringify({ email, password, role: "PATIENT" }) });
  status(result.response.status, 201, "Unique synthetic patient creation");
  assert.equal(typeof result.body.user?.patientId, "string", "Signup must return its new patient identifier");
  let cookie: string;
  if (result.response.headers.has("set-cookie")) cookie = sessionCookie(result.response);
  else {
    assert.equal(typeof result.body.devVerificationToken, "string", "Verification-enabled test servers require ALLOW_DEMO_AUTH=true to expose the synthetic verification token");
    const verification = await request("/v1/auth/verify-email", { method: "POST", body: JSON.stringify({ token: result.body.devVerificationToken }) });
    status(verification.response.status, 200, "Synthetic email verification");
    cookie = await login(email, "PATIENT");
  }
  return { cookie, patientId: result.body.user.patientId };
}
async function book(slug: string, cookie: string): Promise<string> {
  const range = new URLSearchParams({ from: new Date().toISOString(), to: new Date(Date.now() + 30 * 86400_000).toISOString() });
  const availability = await request(`/v1/doctors/${slug}/availability?${range}`);
  status(availability.response.status, 200, "Seeded specialist availability");
  assert.ok(Array.isArray(availability.body) && availability.body.length, "Seeded doctor must have a future available slot");
  for (const slot of availability.body.slice(0, 8) as Array<{ startsAt: string }>) {
    const result = await request("/v1/appointments", { method: "POST", body: JSON.stringify({ doctorSlug: slug, scheduledAt: slot.startsAt }) }, cookie);
    if (result.response.status === 409) continue;
    status(result.response.status, 201, "Synthetic appointment reservation");
    assert.equal(typeof result.body.id, "string", "Reservation must return its new appointment identifier");
    return result.body.id;
  }
  throw new Error("Synthetic appointment slots were claimed concurrently; retry on an isolated test server");
}
async function upload(appointmentId: string, label: string, cookie: string): Promise<DocumentFixture> {
  const content = Buffer.from(`%PDF-1.4\nCareBridge synthetic security fixture ${label} ${runId}\n%%EOF\n`);
  const intent = await request("/v1/documents/upload-intent", { method: "POST", body: JSON.stringify({ appointmentId, fileName: `synthetic-${label}-${runId}.pdf`, contentType: "application/pdf", sizeBytes: content.length }) }, cookie);
  status(intent.response.status, 201, "Appointment-attached synthetic document intent");
  assert.equal(intent.body.document.storageKey, undefined, "Patient metadata must not expose internal object-storage keys");
  assert.equal(intent.body.upload.storageKey, undefined, "Upload instructions must not expose internal object-storage keys");
  assert.equal(typeof intent.body.document?.id, "string", "Upload intent must return a document identifier");
  const id = intent.body.document.id as string;
  const result = await request(`/v1/documents/${encodeURIComponent(id)}/content`, { method: "PUT", body: JSON.stringify({ contentBase64: content.toString("base64") }) }, cookie);
  status(result.response.status, 200, "Synthetic document upload");
  return { id, content };
}
async function clinicalConsent(appointmentId: string, patientCookie: string, doctorCookie: string, otherDoctorCookie: string) {
  const draftMarker = `synthetic-private-draft-${runId}`;
  const privateNote = `synthetic-private-clinical-note-${runId}`;
  let result = await request(`/v1/appointments/${appointmentId}/intake`, { method: "PUT", body: JSON.stringify({ symptoms: draftMarker, consentToConsult: false }) }, patientCookie);
  status(result.response.status, 200, "Synthetic intake draft save");
  result = await request("/v1/doctor/appointments", {}, doctorCookie);
  status(result.response.status, 200, "Clinician schedule with unsubmitted intake");
  assert.equal(result.body.find((appointment: Json) => appointment.id === appointmentId)?.medicalIntake, null, "Unsubmitted intake details must remain private");
  assert.ok(!JSON.stringify(result.body).includes(draftMarker), "Clinician schedule must not contain draft health details");
  const consultationRoute = `/v1/doctor/appointments/${appointmentId}/consultation`;
  result = await request(consultationRoute, { method: "PUT", body: JSON.stringify({ status: "IN_PROGRESS" }) }, doctorCookie);
  status(result.response.status, 409, "Clinical care requires accepted patient consent");
  result = await request(`/v1/appointments/${appointmentId}/intake`, { method: "PUT", body: JSON.stringify({ symptoms: "Synthetic submitted symptom", consentToConsult: true }) }, patientCookie);
  status(result.response.status, 200, "Explicit synthetic consultation consent");
  result = await request(consultationRoute, { method: "PUT", body: JSON.stringify({ status: "IN_PROGRESS" }) }, doctorCookie);
  status(result.response.status, 200, "Consented consultation start");
  const consultationId = result.body.id as string;
  assert.equal(typeof consultationId, "string");
  result = await request(`/v1/appointments/${appointmentId}/intake`, { method: "PUT", body: JSON.stringify({ symptoms: "overwrite historical intake", consentToConsult: false }) }, patientCookie);
  status(result.response.status, 409, "Established intake facts require the care-team correction workflow");
  result = await request(`/v1/doctor/consultations/${consultationId}/note`, { method: "PUT", body: JSON.stringify({ assessment: "Synthetic assessment", privateNotes: privateNote }) }, otherDoctorCookie);
  status(result.response.status, 404, "Patient-wide relationship must not authorize writes to another clinician's encounter");
  result = await request(`/v1/doctor/consultations/${consultationId}/note`, { method: "PUT", body: JSON.stringify({ assessment: "Synthetic assessment", privateNotes: privateNote }) }, doctorCookie);
  status(result.response.status, 200, "Authorized private clinical note");
  for (const route of [`/v1/patient/records/${consultationId}`, "/v1/patient/records", `/v1/patient/appointments/${appointmentId}`, "/v1/patient/dashboard"]) {
    result = await request(route, {}, patientCookie);
    status(result.response.status, 200, "Patient clinical-record projection");
    const serialized = JSON.stringify(result.body);
    assert.ok(!serialized.includes(privateNote) && !serialized.includes('"privateNotes"'), "Private clinical notes must not enter patient projections");
    assert.ok(!serialized.includes('"passwordHash"') && !serialized.includes('"tokenHash"'), "Authentication secrets must not enter clinical projections");
  }
}
async function doctorIsolation(cookie: string, patientId: string, own: DocumentFixture, other: DocumentFixture) {
  const listing = await request(`/v1/doctor/patients/${encodeURIComponent(patientId)}/documents`, {}, cookie);
  status(listing.response.status, 200, "Treating doctor's document list");
  assert.ok(Array.isArray(listing.body), "Document list must be an array");
  assert.ok(listing.body.some((document: Json) => document.id === own.id), "Clinician must see their own appointment attachment");
  assert.ok(!listing.body.some((document: Json) => document.id === other.id), "A patient-wide care relationship must not expose another clinician's attachment");
  for (const suffix of ["", "/content"]) {
    const allowed = await request(`/v1/doctor/documents/${encodeURIComponent(own.id)}${suffix}`, {}, cookie);
    status(allowed.response.status, 200, "Own-appointment document positive control");
    if (suffix) assert.deepEqual(Buffer.from(allowed.body.contentBase64, "base64"), own.content, "Authorized content must match the synthetic upload");
    else assert.equal(allowed.body.document.id, own.id);
    const denied = await request(`/v1/doctor/documents/${encodeURIComponent(other.id)}${suffix}`, {}, cookie);
    status(denied.response.status, 404, "Cross-clinician appointment attachment denial");
    assert.equal(denied.body.document, undefined, "Denied metadata must contain no document");
    assert.equal(denied.body.contentBase64, undefined, "Denied content must contain no bytes");
  }
}
async function cancelOwnFixture(appointmentId: string, patientId: string) {
  // This is the only direct database operation: cancel exactly the appointment
  // returned by this run's booking call, additionally scoped to its new patient.
  const database = new PrismaClient();
  try {
    const result = await database.appointment.updateMany({ where: { id: appointmentId, patientId, status: "BOOKED" }, data: { status: "CANCELLED" } });
    assert.equal(result.count, 1, "Exactly this run's synthetic appointment must be cancelled");
  } catch (error) {
    if (error instanceof assert.AssertionError) throw error;
    // Prisma errors may include connection information; never print them here.
    throw new Error("Could not cancel the synthetic fixture in the isolated API database");
  } finally { await database.$disconnect().catch(() => {}); }
}
async function exhaustAuthenticationQuota() {
  const payload = JSON.stringify({ email: `security-missing-${runId}@demo.carebridge.local`, password: "Incorrect-synthetic-security-password!" });
  let limited = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    const result = await request("/v1/auth/login", { method: "POST", body: payload });
    if (result.response.status === 429) {
      assert.ok(Number(result.response.headers.get("retry-after")) > 0, "Auth limit must include a positive retry interval");
      limited = true;
      break;
    }
    status(result.response.status, 401, "Failed-login quota consumption");
  }
  assert.ok(limited, "Failed login requests must reach an authentication rate limit");
  for (const spelling of ["/v1/auth/%6cogin", "/v1/%61uth/login", "/%761/auth/login", "/v1/auth/lo%67in"]) {
    const result = await request(spelling, { method: "POST", body: payload });
    status(result.response.status, 429, "Percent-encoded login must share the exhausted auth quota");
    assert.ok(Number(result.response.headers.get("retry-after")) > 0);
  }
}
async function accountBinding(ownerCookie: string, otherCookie: string) {
  const owner = await request("/v1/auth/me", {}, ownerCookie);
  const other = await request("/v1/auth/me", {}, otherCookie);
  status(owner.response.status, 200, "Owner account positive control");
  status(other.response.status, 200, "Other account positive control");
  const ownerId = owner.body.user.id as string;
  const otherId = other.body.user.id as string;
  const correct = { "X-CareBridge-Expected-User": ownerId };
  const wrong = { "X-CareBridge-Expected-User": otherId };
  let result = await request("/v1/documents", { headers: correct }, ownerCookie);
  status(result.response.status, 200, "Matching expected account must retain normal access");
  result = await request("/v1/documents", { headers: wrong }, ownerCookie);
  status(result.response.status, 409, "Stale expected account must not read the current account's private data");
  assert.equal(result.body.code, "ACCOUNT_CHANGED");
  const before = await request("/v1/patient/profile", { headers: correct }, ownerCookie);
  result = await request("/v1/patient/profile", { method: "PATCH", headers: wrong, body: JSON.stringify({ phone: "synthetic-not-applied" }) }, ownerCookie);
  status(result.response.status, 409, "Stale profile write must not mutate the current account");
  const after = await request("/v1/patient/profile", { headers: correct }, ownerCookie);
  status(after.response.status, 200, "Expected account remains usable after rejecting the stale write");
  assert.equal(after.body.phone, before.body.phone);
  result = await request("/v1/documents", { headers: correct });
  status(result.response.status, 401, "An expected-user header must not authenticate a caller");
  result = await request("/v1/documents", {}, `${ownerCookie}; ${otherCookie}`);
  status(result.response.status, 401, "Duplicate session cookies must not select an account");
  const [name, token] = ownerCookie.split("=");
  const alias = `${name}=%${token.charCodeAt(0).toString(16)}${token.slice(1)}`;
  result = await request("/v1/documents", {}, alias);
  status(result.response.status, 401, "Noncanonical cookie aliases must not be accepted");
}
async function concurrentClinicalStart(patientCookie: string, doctorCookie: string) {
  const appointmentId = await book("dr-anil-sharma", patientCookie);
  const intakeRoute = `/v1/appointments/${appointmentId}/intake`;
  const consultationRoute = `/v1/doctor/appointments/${appointmentId}/consultation`;
  let result = await request(intakeRoute, { method: "PUT", body: JSON.stringify({ symptoms: "Synthetic submitted intake", consentToConsult: true }) }, patientCookie);
  status(result.response.status, 200, "Race fixture submitted intake");
  const draft = `synthetic-unsubmitted-race-${runId}`;
  const [started, edited] = await Promise.all([
    request(consultationRoute, { method: "PUT", body: JSON.stringify({ status: "IN_PROGRESS" }) }, doctorCookie),
    request(intakeRoute, { method: "PUT", body: JSON.stringify({ symptoms: draft, consentToConsult: false }) }, patientCookie),
  ]);
  assert.deepEqual([started.response.status, edited.response.status].sort(), [200, 409], "Exactly one conflicting clinical-start/intake-edit request must commit");
  const intake = await request(intakeRoute, {}, patientCookie);
  status(intake.response.status, 200, "Race fixture resulting intake");
  const list = await request("/v1/doctor/appointments", {}, doctorCookie);
  status(list.response.status, 200, "Race fixture clinician projection");
  const appointment = list.body.find((row: Json) => row.id === appointmentId);
  assert.ok(appointment, "Race fixture appointment must remain visible for scheduling");
  if (started.response.status === 200) {
    assert.equal(appointment.consultation?.status, "IN_PROGRESS");
    assert.equal(intake.body.consentToConsult, true);
    assert.equal(intake.body.status, "COMPLETED");
    assert.notEqual(intake.body.symptoms, draft, "Queued draft must not overwrite established intake");
  } else {
    assert.equal(intake.body.consentToConsult, false);
    assert.equal(intake.body.status, "DRAFT");
    assert.equal(appointment.consultation, null);
    assert.equal(appointment.medicalIntake, null);
    assert.ok(!JSON.stringify(appointment).includes(draft), "Unsubmitted race draft must remain private");
  }
}
async function main() {
  phase = "synthetic account creation and seeded doctor authentication";
  const patient = await createPatient("owner");
  const secondPatient = await createPatient("other");
  const doctorA = await login("dr-anil-sharma@demo.carebridge.local", "DOCTOR");
  const doctorB = await login("dr-meera-patel@demo.carebridge.local", "DOCTOR");

  phase = "expected-account write protection and ambiguous cookie rejection";
  await accountBinding(patient.cookie, secondPatient.cookie);

  phase = "two care relationships and appointment-scoped document uploads";
  const appointmentA = await book("dr-anil-sharma", patient.cookie);
  const appointmentB = await book("dr-meera-patel", patient.cookie);
  const documentA = await upload(appointmentA, "appointment-a", patient.cookie);
  const documentB = await upload(appointmentB, "appointment-b", patient.cookie);

  phase = "symmetric cross-clinician document isolation";
  await doctorIsolation(doctorA, patient.patientId, documentA, documentB);
  await doctorIsolation(doctorB, patient.patientId, documentB, documentA);

  phase = "draft privacy, accepted consultation consent, and private clinical-note isolation";
  await clinicalConsent(appointmentA, patient.cookie, doctorA, doctorB);

  phase = "cross-patient document isolation";
  const otherListing = await request("/v1/documents", {}, secondPatient.cookie);
  status(otherListing.response.status, 200, "Other patient's private document list");
  assert.ok(!otherListing.body.some((document: Json) => [documentA.id, documentB.id].includes(document.id)), "A patient must not list another patient's documents");
  for (const document of [documentA, documentB]) for (const suffix of ["", "/content"]) {
    const result = await request(`/v1/documents/${encodeURIComponent(document.id)}${suffix}`, {}, secondPatient.cookie);
    status(result.response.status, 404, "Cross-patient document denial");
    assert.equal(result.body.contentBase64, undefined);
    assert.equal(result.body.document, undefined);
  }

  phase = "cancellation revokes doctor access to nested records and attachments";
  await cancelOwnFixture(appointmentA, patient.patientId);
  const appointments = await request("/v1/doctor/appointments", {}, doctorA);
  status(appointments.response.status, 200, "Doctor appointment list after cancellation");
  assert.ok(!appointments.body.some((appointment: Json) => appointment.id === appointmentA), "Cancelled appointments must not expose nested intake and clinical data");
  const unaffected = await request("/v1/doctor/appointments", {}, doctorB);
  status(unaffected.response.status, 200, "Uncancelled appointment positive control");
  assert.ok(unaffected.body.some((appointment: Json) => appointment.id === appointmentB));
  for (const suffix of ["", "/content"]) {
    const result = await request(`/v1/doctor/documents/${encodeURIComponent(documentA.id)}${suffix}`, {}, doctorA);
    status(result.response.status, 404, "Cancelled appointment document denial");
  }

  phase = "concurrent intake-save and clinical-start serialization";
  await concurrentClinicalStart(patient.cookie, doctorA);

  // Keep this last: the quota intentionally blocks further authentication from
  // this loopback client until the isolated API is restarted or its window ends.
  phase = "failed-login quota and percent-encoded route bypass regression";
  await exhaustAuthenticationQuota();
  console.log("CAREBRIDGE SECURITY UAT PASS: account binding, cookie rejection, document/private-note isolation, consent integrity, cancellation revocation and encoded-route auth limiting");
}
main().catch((error: unknown) => {
  console.error(`CAREBRIDGE SECURITY UAT FAIL during ${phase}`);
  if (error instanceof assert.AssertionError) console.error(error.message);
  else console.error("Request or isolated database operation failed; no credentials or server response bodies were logged.");
  process.exitCode = 1;
});
