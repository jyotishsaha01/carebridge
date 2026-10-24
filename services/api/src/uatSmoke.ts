import assert from "node:assert/strict";
const API_URL = process.env.API_URL ?? "http://127.0.0.1:4000";
const DEMO_PASSWORD = process.env.CAREBRIDGE_UAT_PASSWORD;
if (!DEMO_PASSWORD) throw new Error("CAREBRIDGE_UAT_PASSWORD is required");
const accounts = {
  patient: "demo-patient@demo.carebridge.local",
  doctor: "dr-anil-sharma@demo.carebridge.local",
  admin: "demo-admin@demo.carebridge.local",
};
async function request(path: string, options: RequestInit = {}, cookie?: string) {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (cookie) headers.set("cookie", cookie);
  const response = await fetch(API_URL + path, { ...options, headers });
  const text = await response.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  return { response, body };
}
function cookieFrom(response: Response) {
  const value = response.headers.get("set-cookie");
  assert.ok(value, "Expected session cookie");
  return value.split(";")[0];
}
async function login(email: string) {
  const { response, body } = await request("/v1/auth/login", { method: "POST", body: JSON.stringify({ email, password: DEMO_PASSWORD }) });
  assert.equal(response.status, 200, `Login failed: ${email} ${JSON.stringify(body)}`);
  return cookieFrom(response);
}
type LiveNotificationStream = {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  decoder: TextDecoder;
  buffer: string;
};

async function openNotificationStream(cookie: string): Promise<LiveNotificationStream> {
  const response = await fetch(API_URL + "/v1/notifications/stream", {
    headers: { cookie, accept: "text/event-stream" },
  });
  assert.equal(response.status, 200, "Notification stream should authenticate successfully");
  assert.ok(response.body, "Notification stream should return a readable body");
  return { reader: response.body.getReader(), decoder: new TextDecoder(), buffer: "" };
}

async function waitForLiveNotification(stream: LiveNotificationStream, expectedTitle: string) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    let boundary = stream.buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const block = stream.buffer.slice(0, boundary);
      stream.buffer = stream.buffer.slice(boundary + 2);
      boundary = stream.buffer.indexOf("\n\n");
      const eventName = block.split("\n").find((line) => line.startsWith("event:"))?.slice(6).trim();
      const data = block.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
      if (eventName === "notification" && data) {
        const notification = JSON.parse(data) as { title?: string };
        if (notification.title === expectedTitle) return notification;
      }
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        stream.reader.read(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("Timed out waiting for live notification: " + expectedTitle)), remaining);
        }),
      ]);
      if (result.done) throw new Error("Notification stream closed unexpectedly");
      stream.buffer += stream.decoder.decode(result.value, { stream: true });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  throw new Error("Timed out waiting for live notification: " + expectedTitle);
}

async function main() {
  let r = await request("/health");
  assert.equal(r.response.status, 200);
  r = await request("/v1/doctors?limit=10");
  assert.equal(r.response.status, 200);
  assert.ok(r.body.some((d: any) => d.slug === "dr-anil-sharma"));
  const patientCookie = await login(accounts.patient);
  const doctorCookie = await login(accounts.doctor);
  const adminCookie = await login(accounts.admin);

  // Confirm each synthetic credential resolves to the expected server-side role.
  for (const [cookie, expectedRole] of [
    [patientCookie, "PATIENT"],
    [doctorCookie, "DOCTOR"],
    [adminCookie, "ADMIN"],
  ] as const) {
    const identity = await request("/v1/auth/me", {}, cookie);
    assert.equal(identity.response.status, 200, "Authenticated identity endpoint should succeed");
    assert.equal(identity.body.user.role, expectedRole, `Expected ${expectedRole} role`);
  }

  // Verify role boundaries in both directions before exercising workflows.
  for (const [cookie, path, expectedStatus, label] of [
    [patientCookie, "/v1/admin/overview", 403, "patient cannot access admin overview"],
    [patientCookie, "/v1/doctor/me", 403, "patient cannot access doctor workspace"],
    [doctorCookie, "/v1/admin/overview", 403, "doctor cannot access admin overview"],
    [doctorCookie, "/v1/patient/dashboard", 401, "doctor cannot access patient dashboard"],
    [adminCookie, "/v1/doctor/me", 403, "admin cannot access doctor workspace"],
    [adminCookie, "/v1/patient/dashboard", 401, "admin cannot access patient dashboard"],
  ] as const) {
    const denied = await request(path, {}, cookie);
    assert.equal(denied.response.status, expectedStatus, `RBAC check failed: ${label}`);
  }

  const invalidLogin = await request("/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "not-a-real-account@carebridge.test", password: DEMO_PASSWORD }),
  });
  assert.equal(invalidLogin.response.status, 401, "Unknown account must not authenticate");

  const livePatientStream = await openNotificationStream(patientCookie);
  const liveDoctorStream = await openNotificationStream(doctorCookie);
  const liveAdminStream = await openNotificationStream(adminCookie);
  r = await request("/v1/auth/me", {}, patientCookie);
  assert.equal(r.body.user.role, "PATIENT");
  r = await request("/v1/patient/profile", { method: "PATCH", body: JSON.stringify({ firstName: "UAT", lastName: "Patient", country: "IN", phone: "+91-555-0100", emergencyContactName: "UAT Contact", emergencyContactPhone: "+91-555-0101" }) }, patientCookie);
  assert.equal(r.response.status, 200);
  assert.equal(r.body.phone, "+91-555-0100");
  assert.equal(r.body.emergencyContactName, "UAT Contact");
  r = await request("/v1/patient/profile", {}, patientCookie);
  assert.equal(r.response.status, 200);
  assert.equal(r.body.emergencyContactPhone, "+91-555-0101");
  const from = new Date();
  const to = new Date(Date.now() + 30 * 86400000);
  r = await request(`/v1/doctors/dr-anil-sharma/availability?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`);
  assert.equal(r.response.status, 200);
  assert.ok(r.body.length > 0);
  r = await request("/v1/appointments", { method: "POST", body: JSON.stringify({ doctorSlug: "dr-anil-sharma", scheduledAt: r.body[0].startsAt, durationMin: 30 }) }, patientCookie);
  assert.equal(r.response.status, 201);
  const appointmentId = r.body.id;

  // Medical questionnaire: verify draft save, fresh-read persistence, validation, and role access.
  r = await request(`/v1/appointments/${appointmentId}/intake`, {}, patientCookie);
  assert.equal(r.response.status, 200, "Patient should load intake for their appointment");
  assert.equal(r.body.appointmentId, appointmentId);

  const intakeDraft = {
    reasonForVisit: "UAT questionnaire reason",
    symptoms: "UAT symptoms",
    allergies: "None",
    medications: "None",
    medicalHistory: "UAT medical history",
    surgeries: "None",
    familyHistory: "UAT family history",
    consentToConsult: false,
  };
  r = await request(`/v1/appointments/${appointmentId}/intake`, { method: "PUT", body: JSON.stringify(intakeDraft) }, patientCookie);
  assert.equal(r.response.status, 200, `Questionnaire draft should save: ${JSON.stringify(r.body)}`);
  assert.equal(r.body.status, "DRAFT");
  assert.equal(r.body.reasonForVisit, intakeDraft.reasonForVisit);

  // A separate GET confirms the answers came back from persistent storage.
  r = await request(`/v1/appointments/${appointmentId}/intake`, {}, patientCookie);
  assert.equal(r.response.status, 200);
  assert.equal(r.body.reasonForVisit, intakeDraft.reasonForVisit);
  assert.equal(r.body.symptoms, intakeDraft.symptoms);
  assert.equal(r.body.medicalHistory, intakeDraft.medicalHistory);
  assert.equal(r.body.familyHistory, intakeDraft.familyHistory);
  assert.equal(r.body.consentToConsult, false);

  r = await request(`/v1/appointments/${appointmentId}/intake`, { method: "PUT", body: JSON.stringify({ ...intakeDraft, reasonForVisit: "x".repeat(2001) }) }, patientCookie);
  assert.equal(r.response.status, 400, "Overlong questionnaire fields should return a validation error");
  assert.ok(r.body.issues?.some((issue: any) => issue.field === "reasonForVisit"));

  r = await request(`/v1/appointments/${appointmentId}/intake`, {}, doctorCookie);
  assert.equal(r.response.status, 403, "Doctor must not read patient intake through the patient-only endpoint");
  await waitForLiveNotification(livePatientStream, "Appointment confirmed");
  await waitForLiveNotification(liveDoctorStream, "New appointment booked");
  await waitForLiveNotification(liveAdminStream, "New appointment booked");
  await liveDoctorStream.reader.cancel();
  await liveAdminStream.reader.cancel();
  r = await request("/v1/notifications", {}, patientCookie);
  assert.ok(r.body.notifications?.some((n: any) => n.title === "Appointment confirmed"));
  r = await request("/v1/doctor/appointments", {}, doctorCookie);
  assert.ok(r.body.some((a: any) => a.id === appointmentId));
  r = await request(`/v1/doctor/appointments/${appointmentId}/consultation`, { method: "PUT", body: JSON.stringify({ status: "IN_PROGRESS", summary: "UAT started" }) }, doctorCookie);
  assert.equal(r.response.status, 200);
  const consultationId = r.body.id;
  r = await request(`/v1/doctor/appointments/${appointmentId}/consultation`, { method: "PUT", body: JSON.stringify({ status: "COMPLETED", summary: "UAT completed" }) }, doctorCookie);
  assert.equal(r.response.status, 200);
  await waitForLiveNotification(livePatientStream, "Consultation completed");
  r = await request(`/v1/doctor/consultations/${consultationId}/note`, { method: "PUT", body: JSON.stringify({ assessment: "UAT", findings: "UAT", recommendations: "UAT" }) }, doctorCookie);
  assert.equal(r.response.status, 200);
  r = await request(`/v1/doctor/consultations/${consultationId}/prescription`, { method: "PUT", body: JSON.stringify({ instructions: "UAT", items: [{ medication: "UAT medication", dose: "1 tablet", frequency: "Once daily", duration: "7 days" }] }) }, doctorCookie);
  assert.equal(r.response.status, 200);
  await waitForLiveNotification(livePatientStream, "Prescription available");
  await livePatientStream.reader.cancel();
  const liveDoctorDocumentStream = await openNotificationStream(doctorCookie);
  const documentContent = Buffer.from("%PDF-1.4\n% CareBridge UAT synthetic document\n%%EOF\n");
  r = await request("/v1/documents/upload-intent", { method: "POST", body: JSON.stringify({ fileName: "uat-note.pdf", contentType: "application/pdf", sizeBytes: documentContent.length, appointmentId }) }, patientCookie);
  assert.equal(r.response.status, 201, JSON.stringify(r.body));
  const documentId = r.body.document.id;
  r = await request("/v1/documents/" + documentId + "/content", { method: "PUT", body: JSON.stringify({ contentBase64: documentContent.toString("base64") }) }, patientCookie);
  assert.equal(r.response.status, 200);

  // Document ownership boundary: only the owning patient can retrieve document content.
  r = await request("/v1/documents/" + documentId + "/content", {}, doctorCookie);
  assert.equal(r.response.status, 403, "Doctor role must not use the patient document-content endpoint");
  r = await request("/v1/documents/not-a-real-document-id/content", {}, patientCookie);
  assert.equal(r.response.status, 404, "A patient must not retrieve content for an unknown document");
  await waitForLiveNotification(liveDoctorDocumentStream, "Patient document uploaded");
  await liveDoctorDocumentStream.reader.cancel();
  r = await request(`/v1/doctor/consultations/${consultationId}/follow-up`, { method: "POST", body: JSON.stringify({ instructions: "UAT follow-up", status: "RECOMMENDED" }) }, doctorCookie);
  assert.equal(r.response.status, 200);
  const liveAdminSupportStream = await openNotificationStream(adminCookie);
  const livePatientSupportStream = await openNotificationStream(patientCookie);
  r = await request("/v1/support/tickets", { method: "POST", body: JSON.stringify({ category: "UAT", message: "UAT support request for notification verification" }) }, patientCookie);
  assert.equal(r.response.status, 201);
  const supportTicketId = r.body.id;
  await waitForLiveNotification(liveAdminSupportStream, "New support request");
  r = await request("/v1/admin/support/tickets/" + supportTicketId, { method: "PATCH", body: JSON.stringify({ status: "IN_PROGRESS" }) }, adminCookie);
  assert.equal(r.response.status, 200);
  await waitForLiveNotification(livePatientSupportStream, "Support request updated");
  r = await request("/v1/support/tickets/" + supportTicketId + "/messages", {}, patientCookie);
  assert.equal(r.response.status, 200);
  assert.equal(r.body.length, 0);
  r = await request("/v1/support/tickets/" + supportTicketId + "/messages", {}, doctorCookie);
  assert.equal(r.response.status, 403);
  r = await request("/v1/support/tickets/" + supportTicketId + "/messages", { method: "POST", body: JSON.stringify({ message: "The support team is reviewing your request." }) }, adminCookie);
  assert.equal(r.response.status, 201);
  await waitForLiveNotification(livePatientSupportStream, "Support team replied");
  r = await request("/v1/support/tickets/" + supportTicketId + "/messages", {}, patientCookie);
  assert.equal(r.response.status, 200);
  assert.equal(r.body.length, 1);
  assert.equal(r.body[0].message, "The support team is reviewing your request.");
  await liveAdminSupportStream.reader.cancel();
  await livePatientSupportStream.reader.cancel();
  r = await request("/v1/notifications", {}, patientCookie);
  const titles = (r.body.notifications ?? []).map((n: any) => n.title);
  assert.ok(titles.includes("Consultation completed"));
  assert.ok(titles.includes("Prescription available"));
  assert.ok(titles.includes("Follow-up recommendation"));
  r = await request("/v1/admin/overview", {}, adminCookie);
  assert.equal(r.response.status, 200);
  r = await request("/v1/admin/appointments?limit=20", {}, adminCookie);
  assert.ok(r.body.some((a: any) => a.id === appointmentId));
  console.log("CAREBRIDGE UAT PASS");
}
main().catch((error) => { console.error("CAREBRIDGE UAT FAIL"); console.error(error); process.exit(1); });
