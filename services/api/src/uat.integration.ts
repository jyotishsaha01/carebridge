import assert from "node:assert/strict";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:4000";
const DEMO_PASSWORD = "CareBridge-UAT-2026!";
const patient = "demo-patient@demo.carebridge.local";
const doctor = "dr-anil-sharma@demo.carebridge.local";
const admin = "demo-admin@demo.carebridge.local";

type Json = Record<string, any>;

async function request(path: string, options: RequestInit = {}, cookie?: string) {
  const headers = new Headers(options.headers);
  headers.set("content-type", "application/json");
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
  const { response, body } = await request("/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password: DEMO_PASSWORD }),
  });
  assert.equal(response.status, 200, `Login failed for ${email}: ${JSON.stringify(body)}`);
  return cookieFrom(response);
}

async function main() {
  let r = await request("/health", { headers: { "content-type": "application/json" } });
  assert.equal(r.response.status, 200);
  assert.equal(r.body.status, "ok");

  r = await request("/v1/doctors?limit=10");
  assert.equal(r.response.status, 200);
  assert.ok(r.body.some((item: any) => item.slug === "dr-anil-sharma"));

  const patientCookie = await login(patient);
  const doctorCookie = await login(doctor);
  const adminCookie = await login(admin);

  r = await request("/v1/auth/me", {}, patientCookie);
  assert.equal(r.response.status, 200);
  assert.equal(r.body.user.role, "PATIENT");

  r = await request("/v1/doctors/dr-anil-sharma/availability?from=2026-10-06T00:00:00.000Z&to=2026-11-30T23:59:59.000Z");
  assert.equal(r.response.status, 200);
  assert.ok(r.body.length > 0, "Expected seeded doctor availability");
  const scheduledAt = r.body[0].startsAt;

  r = await request("/v1/appointments", {
    method: "POST",
    body: JSON.stringify({ doctorSlug: "dr-anil-sharma", scheduledAt, durationMin: 30 }),
  }, patientCookie);
  assert.equal(r.response.status, 201, `Booking failed: ${JSON.stringify(r.body)}`);
  const appointmentId = r.body.id;
  assert.ok(appointmentId);

  r = await request("/v1/notifications", {}, patientCookie);
  assert.equal(r.response.status, 200);
  assert.ok(r.body.notifications?.some((n: any) => n.title === "Appointment confirmed"));

  r = await request("/v1/doctor/appointments", {}, doctorCookie);
  assert.equal(r.response.status, 200);
  assert.ok(r.body.some((a: any) => a.id === appointmentId));

  r = await request(`/v1/doctor/appointments/${appointmentId}/consultation`, {
    method: "PUT",
    body: JSON.stringify({ status: "IN_PROGRESS", summary: "UAT consultation started." }),
  }, doctorCookie);
  assert.equal(r.response.status, 200);
  const consultationId = r.body.id;
  assert.ok(consultationId);

  r = await request(`/v1/doctor/appointments/${appointmentId}/consultation`, {
    method: "PUT",
    body: JSON.stringify({ status: "COMPLETED", summary: "UAT consultation completed." }),
  }, doctorCookie);
  assert.equal(r.response.status, 200);

  r = await request(`/v1/doctor/consultations/${consultationId}/note`, {
    method: "PUT",
    body: JSON.stringify({ assessment: "UAT assessment", findings: "UAT findings", recommendations: "UAT recommendations" }),
  }, doctorCookie);
  assert.equal(r.response.status, 200);

  r = await request(`/v1/doctor/consultations/${consultationId}/prescription`, {
    method: "PUT",
    body: JSON.stringify({ instructions: "UAT instructions", items: [{ medication: "UAT medication", dose: "1 tablet", frequency: "Once daily", duration: "7 days", route: "Oral", instructions: "After food" }] }),
  }, doctorCookie);
  assert.equal(r.response.status, 200);

  r = await request(`/v1/doctor/consultations/${consultationId}/follow-up`, {
    method: "POST",
    body: JSON.stringify({ instructions: "UAT follow-up recommendation", status: "RECOMMENDED" }),
  }, doctorCookie);
  assert.equal(r.response.status, 200);

  r = await request("/v1/notifications", {}, patientCookie);
  assert.equal(r.response.status, 200);
  const titles = (r.body.notifications ?? []).map((n: any) => n.title);
  assert.ok(titles.includes("Consultation completed"));
  assert.ok(titles.includes("Prescription available"));
  assert.ok(titles.includes("Follow-up recommendation"));

  r = await request("/v1/admin/overview", {}, adminCookie);
  assert.equal(r.response.status, 200);
  assert.ok(typeof r.body.patients === "number");
  assert.ok(typeof r.body.appointments === "number");

  r = await request("/v1/admin/appointments?limit=20", {}, adminCookie);
  assert.equal(r.response.status, 200);
  assert.ok(r.body.some((a: any) => a.id === appointmentId));

  console.log("CAREBRIDGE UAT PASS: patient → booking → doctor → consultation → prescription/follow-up → notifications → admin");
}

main().catch((error) => {
  console.error("CAREBRIDGE UAT FAIL");
  console.error(error);
  process.exit(1);
});
