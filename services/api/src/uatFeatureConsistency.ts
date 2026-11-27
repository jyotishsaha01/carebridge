import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:4000";
async function call(path: string, cookie: string, method = "GET", payload?: unknown) {
  const response = await fetch(API_URL + path, { method, headers: { cookie, ...(payload === undefined ? {} : { "content-type": "application/json" }) }, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) });
  return { status: response.status, body: await response.json() as any };
}

/** Real cross-role regression, called only by the synthetic integration journey. */
export async function exerciseFeatureConsistency(cookies: { patient: string; secondPatient: string; doctor: string; admin: string }) {
  const input = { category: `Feature-${randomUUID()}`, message: "Synthetic portal consistency request" };
  const submissions = await Promise.all([call("/v1/support/tickets", cookies.patient, "POST", input), call("/v1/support/tickets", cookies.patient, "POST", input)]);
  assert.deepEqual(submissions.map(item => item.status).sort(), [200, 201]);
  assert.equal(submissions[0].body.id, submissions[1].body.id);
  const path = `/v1/admin/support/tickets/${submissions[0].body.id}`;
  let result = await call(path, cookies.admin);
  assert.equal(result.status, 200);
  let ticket = result.body;
  assert.ok(ticket.user.email && !ticket.user.passwordHash);
  const due = ticket.slaDueAt;
  result = await call(path, cookies.admin, "PATCH", { status: "IN_PROGRESS", priority: "NORMAL", expectedUpdatedAt: ticket.updatedAt });
  assert.equal(result.status, 200); assert.equal(result.body.slaDueAt, due, "A status-only edit must preserve the original SLA");
  const stale = ticket; ticket = result.body;
  result = await call(path, cookies.admin, "PATCH", { priority: "HIGH", expectedUpdatedAt: stale.updatedAt });
  assert.equal(result.status, 409);
  result = await call(path, cookies.admin, "PATCH", { status: "IN_PROGRESS", priority: "NORMAL", expectedUpdatedAt: ticket.updatedAt });
  assert.equal(result.status, 200); assert.equal(result.body.updatedAt, ticket.updatedAt, "No-op must retain its version");
  result = await call(path, cookies.admin, "PATCH", { priority: "HIGH", expectedUpdatedAt: ticket.updatedAt });
  assert.equal(result.status, 200); ticket = result.body;
  assert.equal(Date.parse(ticket.slaDueAt) - Date.parse(ticket.updatedAt), 4 * 3_600_000);
  const threadPath = `/v1/support/tickets/${ticket.id}/messages`;
  const replies = await Promise.all([call(threadPath, cookies.patient, "POST", { message: "Synthetic duplicate reply" }), call(threadPath, cookies.patient, "POST", { message: "Synthetic duplicate reply" })]);
  assert.deepEqual(replies.map(item => item.status).sort(), [200, 201]); assert.equal(replies[0].body.id, replies[1].body.id);
  assert.equal((await call(path, cookies.admin, "PATCH", { status: "RESOLVED", expectedUpdatedAt: ticket.updatedAt })).status, 409, "Conversation activity must invalidate a previously loaded ticket");
  assert.equal((await call(threadPath, cookies.doctor)).status, 403);
  assert.equal((await call(path, cookies.patient)).status, 403);
  assert.equal((await call(threadPath, cookies.admin, "POST", { message: "Synthetic admin acknowledgement" })).status, 201);
  result = await call(threadPath, cookies.patient);
  assert.equal(result.status, 200); assert.equal(result.body.length, 2); assert.equal(result.body[1].message, "Synthetic admin acknowledgement");

  result = await call("/v1/admin/care-plans", cookies.admin, "POST", { patientId: (await call("/v1/patient/profile", cookies.patient)).body.id, title: `Synthetic feature care plan ${randomUUID()}`, tasks: [{ title: "Confirm follow-up arrangements" }] });
  assert.equal(result.status, 201);
  const plan = result.body; const task = plan.tasks[0]; const taskPath = `/v1/patient/care-plans/${plan.id}/tasks/${task.id}`;
  result = await call(taskPath, cookies.patient, "PATCH", { status: "DONE", expectedStatus: task.status, expectedUpdatedAt: task.updatedAt });
  assert.equal(result.status, 200); assert.equal(result.body.status, "DONE");
  assert.equal((await call(taskPath, cookies.patient, "PATCH", { status: "IN_PROGRESS", expectedStatus: task.status, expectedUpdatedAt: task.updatedAt })).status, 409);
  assert.equal((await call(taskPath, cookies.secondPatient, "PATCH", { status: "DONE" })).status, 404);
  assert.equal((await call(taskPath, cookies.doctor, "PATCH", { status: "DONE" })).status, 403);
  result = await call("/v1/patient/care-plans", cookies.patient);
  assert.equal(result.body.find((row: any) => row.id === plan.id).tasks[0].status, "DONE");

  result = await call("/v1/doctor/me/profile", cookies.doctor, "PATCH", { bio: "  Synthetic feature verification  " });
  assert.equal(result.status, 200); assert.equal(result.body.bio, "Synthetic feature verification");
  const start = new Date(Date.now() + 60 * 86400_000); const end = new Date(start.getTime() + 30 * 60_000);
  result = await call("/v1/doctor/availability", cookies.doctor, "POST", { startsAt: start.toISOString(), endsAt: end.toISOString() });
  assert.equal(result.status, 201); const slotId = result.body.id;
  assert.equal((await call(`/v1/doctor/availability/${slotId}`, cookies.doctor, "DELETE")).status, 200);
  result = await call(`/v1/doctor/availability?from=${encodeURIComponent(start.toISOString())}&to=${encodeURIComponent(end.toISOString())}`, cookies.doctor);
  assert.equal(result.status, 200); assert.ok(!result.body.some((row: any) => row.id === slotId));

  const dashboard = await call("/v1/patient/dashboard", cookies.patient);
  const upcoming = await call("/v1/patient/appointments?view=upcoming&limit=1", cookies.patient);
  assert.equal(dashboard.status, 200); assert.equal(upcoming.status, 200); assert.equal(dashboard.body.appointmentCount, upcoming.body.total);
  result = await call("/v1/patient/appointments?view=all&limit=1", cookies.patient);
  assert.equal(result.status, 200); assert.ok(result.body.total >= 1); assert.ok(result.body.appointments.length <= 1);
  assert.equal((await call("/v1/patient/appointments", cookies.doctor)).status, 401);
  assert.equal((await call("/v1/patient/appointments?limit=1000", cookies.patient)).status, 400);
}
