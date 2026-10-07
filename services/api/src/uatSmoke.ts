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
async function main() {
  let r = await request("/health");
  assert.equal(r.response.status, 200);
  r = await request("/v1/doctors?limit=10");
  assert.equal(r.response.status, 200);
  assert.ok(r.body.some((d: any) => d.slug === "dr-anil-sharma"));
  const patientCookie = await login(accounts.patient);
  const doctorCookie = await login(accounts.doctor);
  const adminCookie = await login(accounts.admin);
  r = await request("/v1/auth/me", {}, patientCookie);
  assert.equal(r.body.user.role, "PATIENT");
  const from = new Date();
  const to = new Date(Date.now() + 30 * 86400000);
  r = await request(`/v1/doctors/dr-anil-sharma/availability?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`);
  assert.equal(r.response.status, 200);
  assert.ok(r.body.length > 0);
  r = await request("/v1/appointments", { method: "POST", body: JSON.stringify({ doctorSlug: "dr-anil-sharma", scheduledAt: r.body[0].startsAt, durationMin: 30 }) }, patientCookie);
  assert.equal(r.response.status, 201);
  const appointmentId = r.body.id;
  r = await request("/v1/notifications", {}, patientCookie);
  assert.ok(r.body.notifications?.some((n: any) => n.title === "Appointment confirmed"));
  r = await request("/v1/doctor/appointments", {}, doctorCookie);
  assert.ok(r.body.some((a: any) => a.id === appointmentId));
  r = await request(`/v1/doctor/appointments/${appointmentId}/consultation`, { method: "PUT", body: JSON.stringify({ status: "IN_PROGRESS", summary: "UAT started" }) }, doctorCookie);
  assert.equal(r.response.status, 200);
  const consultationId = r.body.id;
  r = await request(`/v1/doctor/appointments/${appointmentId}/consultation`, { method: "PUT", body: JSON.stringify({ status: "COMPLETED", summary: "UAT completed" }) }, doctorCookie);
  assert.equal(r.response.status, 200);
  r = await request(`/v1/doctor/consultations/${consultationId}/note`, { method: "PUT", body: JSON.stringify({ assessment: "UAT", findings: "UAT", recommendations: "UAT" }) }, doctorCookie);
  assert.equal(r.response.status, 200);
  r = await request(`/v1/doctor/consultations/${consultationId}/prescription`, { method: "PUT", body: JSON.stringify({ instructions: "UAT", items: [{ medication: "UAT medication", dose: "1 tablet", frequency: "Once daily", duration: "7 days" }] }) }, doctorCookie);
  assert.equal(r.response.status, 200);
  r = await request(`/v1/doctor/consultations/${consultationId}/follow-up`, { method: "POST", body: JSON.stringify({ instructions: "UAT follow-up", status: "RECOMMENDED" }) }, doctorCookie);
  assert.equal(r.response.status, 200);
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
