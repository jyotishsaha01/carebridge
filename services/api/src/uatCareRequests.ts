import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:4000";
type Cookies = { patient: string; secondPatient: string; doctor: string; admin: string };
async function request(path: string, cookie?: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("content-type", "application/json");
  if (cookie) headers.set("cookie", cookie);
  const response = await fetch(API_URL + path, { ...options, headers });
  return { status: response.status, response, body: await response.json() as any };
}

async function notificationStream(cookie: string) {
  const response = await fetch(API_URL + "/v1/notifications/stream", { headers: { cookie, accept: "text/event-stream" } });
  assert.equal(response.status, 200);
  assert.ok(response.body);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  return {
    close: () => reader.cancel(),
    async expectTitle(title: string) {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        let boundary = buffer.indexOf("\n\n");
        while (boundary >= 0) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          boundary = buffer.indexOf("\n\n");
          if (!block.startsWith("event: notification\n")) continue;
          const data = block.split("\n").find((line) => line.startsWith("data:"))?.slice(5).trim();
          if (data && JSON.parse(data).title === title) return;
        }
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const result = await Promise.race([
            reader.read(),
            new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`Missing live care notification: ${title}`)), Math.max(1, deadline - Date.now())); }),
          ]);
          assert.equal(result.done, false, "Care notification stream closed unexpectedly");
          buffer += decoder.decode(result.value, { stream: true });
        } finally { if (timer) clearTimeout(timer); }
      }
      throw new Error(`Missing live care notification: ${title}`);
    },
  };
}

/** Shared with the full integration journey; run only against synthetic test fixtures. */
export async function exerciseCareRequests(cookies: Cookies) {
  const preference = await request("/v1/notification-preferences", cookies.patient);
  assert.equal(preference.status, 200);
  assert.equal(preference.body.SYSTEM, true, "Synthetic UAT fixture must enable SYSTEM notifications");
  const beforeDoctorAppointments = await request("/v1/doctor/appointments", cookies.doctor);
  const beforePayments = await request("/v1/payments", cookies.patient);
  const beforeDoctorNotifications = await request("/v1/notifications", cookies.doctor);
  for (const result of [beforeDoctorAppointments, beforePayments, beforeDoctorNotifications]) assert.equal(result.status, 200);
  const stream = await notificationStream(cookies.patient);
  try {
    const input = { type: "COORDINATION", title: `Synthetic UAT care request ${randomUUID()}`, description: "Synthetic care coordination only" };
    const submit = () => request("/v1/patient/care-requests", cookies.patient, { method: "POST", body: JSON.stringify(input) });
    const duplicates = await Promise.all([submit(), submit()]);
    assert.deepEqual(duplicates.map((result) => result.status).sort(), [200, 201], "Concurrent retry should reuse one committed request");
    assert.equal(duplicates[0].body.id, duplicates[1].body.id);
    let record = duplicates[0].body;
    const requestId = record.id as string;
    await stream.expectTitle("Care request received");
    const patch = (payload: Record<string, unknown>, cookie = cookies.admin, id = requestId) => request(`/v1/admin/care-requests/${id}`, cookie, { method: "PATCH", body: JSON.stringify(payload) });
    const save = async (status: string, extra: Record<string, unknown> = {}) => {
      const result = await patch({ status, expectedStatus: record.status, expectedUpdatedAt: record.updatedAt, ...extra });
      assert.equal(result.status, 200, `Care stage save failed: ${JSON.stringify(result.body)}`);
      assert.equal(result.body.status, status);
      assert.ok(result.body.patient?.id, "Saved projection must preserve the patient display fields");
      assert.equal(result.body.patient.userId, undefined);
      record = result.body;
      await stream.expectTitle("Care request updated");
    };

    await save("REVIEWING");
    const beforeNoop = await request("/v1/notifications", cookies.patient);
    const noop = await patch({ status: record.status, expectedStatus: record.status, expectedUpdatedAt: record.updatedAt });
    assert.equal(noop.status, 200);
    assert.equal(noop.body.updatedAt, record.updatedAt, "No-op must retain its version");
    const afterNoop = await request("/v1/notifications", cookies.patient);
    assert.deepEqual(afterNoop.body.notifications.map((item: any) => item.id), beforeNoop.body.notifications.map((item: any) => item.id), "No-op must not create a duplicate notification");

    const stale = { ...record };
    await save("REVIEWING", { targetDate: new Date(Date.now() + 7 * 86400_000).toISOString() });
    assert.notEqual(record.updatedAt, stale.updatedAt, "Every actual edit must advance the version");
    let result = await patch({ status: "APPROVED", expectedStatus: stale.status, expectedUpdatedAt: stale.updatedAt });
    assert.equal(result.status, 409, "A same-stage date edit must invalidate an old editor");
    result = await patch({ status: "APPROVED", expectedStatus: "REQUESTED" });
    assert.equal(result.status, 409, "An old stage must not overwrite a newer save");
    for (const status of ["APPROVED", "SCHEDULED", "COMPLETED", "REQUESTED", "CANCELLED"]) await save(status);

    const patientList = await request("/v1/patient/care-requests", cookies.patient);
    assert.equal(patientList.status, 200);
    assert.equal(patientList.body.find((item: any) => item.id === requestId)?.status, "CANCELLED", "Patient refresh must read the committed stage");
    assert.equal(patientList.body.filter((item: any) => item.title === input.title).length, 1);
    const otherPatientList = await request("/v1/patient/care-requests", cookies.secondPatient);
    assert.equal(otherPatientList.status, 200);
    assert.ok(!otherPatientList.body.some((item: any) => item.id === requestId), "Another patient must not see this request");
    const adminList = await request("/v1/admin/care-requests?status=CANCELLED&limit=100", cookies.admin);
    assert.equal(adminList.status, 200);
    assert.equal(adminList.body.find((item: any) => item.id === requestId)?.status, "CANCELLED");

    for (const cookie of [cookies.patient, cookies.doctor]) {
      assert.equal((await request("/v1/admin/care-requests", cookie)).status, 403);
      assert.equal((await patch({ status: "APPROVED" }, cookie)).status, 403);
    }
    assert.equal((await request("/v1/patient/care-requests", cookies.doctor)).status, 403);
    assert.equal((await patch({ status: "APPROVED" }, cookies.admin, `missing_${randomUUID()}`)).status, 404);
    assert.equal((await patch({ status: "PAID" })).status, 400);

    const audits = await request("/v1/admin/audit-logs?action=CARE_REQUEST_UPDATED&limit=100", cookies.admin);
    const ownAudits = audits.body.filter((item: any) => item.resourceId === requestId);
    assert.equal(ownAudits.length, 7, "Each actual edit, excluding rejected and no-op attempts, must be audited");
    assert.ok(ownAudits.every((item: any) => item.outcome === "SUCCESS" && item.metadata.previousStatus && item.metadata.status));
    const creationAudits = await request("/v1/admin/audit-logs?action=CARE_REQUEST_CREATED&limit=100", cookies.admin);
    assert.equal(creationAudits.body.filter((item: any) => item.resourceId === requestId).length, 1, "Deduplication must not duplicate the creation audit");
    const afterDoctorAppointments = await request("/v1/doctor/appointments", cookies.doctor);
    const afterPayments = await request("/v1/payments", cookies.patient);
    const afterDoctorNotifications = await request("/v1/notifications", cookies.doctor);
    assert.deepEqual(afterDoctorAppointments.body, beforeDoctorAppointments.body, "Coordination stages must not create or alter clinical appointments");
    assert.deepEqual(afterPayments.body, beforePayments.body, "Coordination stages must not create charges");
    assert.deepEqual(afterDoctorNotifications.body.notifications, beforeDoctorNotifications.body.notifications, "Unassigned care requests must not broadcast patient data to doctors");
  } finally { await stream.close(); }
}

async function main() {
  if (process.env.NODE_ENV !== "test") throw new Error("Care request UAT requires NODE_ENV=test and an isolated synthetic test API");
  const password = process.env.CAREBRIDGE_UAT_PASSWORD;
  if (!password) throw new Error("CAREBRIDGE_UAT_PASSWORD is required");
  const login = async (email: string) => {
    const result = await request("/v1/auth/login", undefined, { method: "POST", body: JSON.stringify({ email, password }) });
    assert.equal(result.status, 200, `Synthetic account login failed: ${email}`);
    const cookie = result.response.headers.get("set-cookie");
    assert.ok(cookie);
    return cookie.split(";")[0];
  };
  const [patient, secondPatient, doctor, admin] = await Promise.all([
    login("demo-patient@demo.carebridge.local"), login("demo-patient-two@demo.carebridge.local"),
    login("dr-anil-sharma@demo.carebridge.local"), login("demo-admin@demo.carebridge.local"),
  ]);
  await exerciseCareRequests({ patient, secondPatient, doctor, admin });
  console.log("CAREBRIDGE CARE REQUEST UAT PASS: persistence, deduplication, stale edits, patient visibility, live notifications and doctor isolation");
}
if (require.main === module) main().catch((error) => { console.error("CAREBRIDGE CARE REQUEST UAT FAIL"); console.error(error); process.exit(1); });
