import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

const mocks = vi.hoisted(() => ({
  actor: { id: "admin-user", role: "ADMIN", patient: { id: "patient" } },
  records: [] as any[],
  audits: [] as any[],
  notification: vi.fn(),
  notifyRole: vi.fn(),
  db: {
    patient: { updateMany: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
    careRequest: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    doctor: { count: vi.fn() }, appointment: { count: vi.fn() }, consultation: { count: vi.fn() }, notification: { count: vi.fn() },
    auditLog: { create: vi.fn(), count: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("./server", () => ({ prisma: mocks.db }));
vi.mock("./auth", () => ({
  requireRole: vi.fn(async (_request, reply, roles) => {
    if (roles.includes(mocks.actor.role)) return mocks.actor;
    reply.code(403).send({ error: "Forbidden" });
    return null;
  }),
  requireVerifiedDoctor: vi.fn(),
}));
vi.mock("./notificationsPrototype", () => ({ createNotification: mocks.notification, notifyUsersByRole: mocks.notifyRole }));
import { registerCarePlatformRoutes } from "./carePlatform";

const apps: ReturnType<typeof Fastify>[] = [];
async function app() {
  const instance = Fastify();
  apps.push(instance);
  instance.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) return reply.code(400).send({ error: "Invalid request" });
    return reply.code(500).send({ error: "Unexpected error" });
  });
  await registerCarePlatformRoutes(instance);
  return instance;
}
const patient = { id: "patient", firstName: "Synthetic", lastName: "Patient", country: "US" };
const initial = () => ({ id: "request", patientId: "patient", type: "COORDINATION", status: "REQUESTED", title: "Synthetic request", description: null, country: null, targetDate: null, createdAt: new Date(), updatedAt: new Date("2026-01-01T00:00:00Z") });
const projection = (record: any, include?: unknown) => record ? { ...record, ...(include ? { patient } : {}) } : null;
function matches(record: any, where: any) {
  return Object.entries(where).every(([key, expected]) => {
    if (key === "createdAt") return record.createdAt >= (expected as { gte: Date }).gte;
    if (expected instanceof Date) return record[key]?.getTime() === expected.getTime();
    return record[key] === expected;
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  Object.assign(mocks.actor, { id: "admin-user", role: "ADMIN", patient: { id: "patient" } });
  mocks.records = [initial()];
  mocks.audits = [];
  mocks.db.patient.updateMany.mockResolvedValue({ count: 1 });
  mocks.db.patient.findUnique.mockResolvedValue({ userId: "patient-user" });
  mocks.db.careRequest.findFirst.mockImplementation(async ({ where, include }) => projection(mocks.records.find((record) => matches(record, where)), include));
  mocks.db.careRequest.findUnique.mockImplementation(async ({ where, include }) => projection(mocks.records.find((record) => record.id === where.id), include));
  mocks.db.careRequest.findMany.mockImplementation(async ({ where, include }) => mocks.records.filter((record) => !where || matches(record, where)).map((record) => projection(record, include)));
  mocks.db.careRequest.create.mockImplementation(async ({ data }) => {
    const record = { ...initial(), id: "created-request", ...data };
    mocks.records.push(record);
    return { ...record };
  });
  mocks.db.careRequest.updateMany.mockImplementation(async ({ where, data }) => {
    const record = mocks.records.find((record) => matches(record, where));
    if (!record) return { count: 0 };
    Object.assign(record, data);
    return { count: 1 };
  });
  mocks.db.auditLog.create.mockImplementation(async ({ data }) => { mocks.audits.push(data); return { id: "audit", ...data }; });
  // Serialize transaction execution and model rollback. Auditing after commit
  // would leave the saved record changed and fail the atomicity assertions.
  let tail = Promise.resolve();
  mocks.db.$transaction.mockImplementation(async (operation) => {
    const preceding = tail;
    let release!: () => void;
    tail = new Promise<void>((resolve) => { release = resolve; });
    await preceding;
    const before = structuredClone({ records: mocks.records, audits: mocks.audits });
    try { return await operation(mocks.db); }
    catch (error) { mocks.records = before.records; mocks.audits = before.audits; throw error; }
    finally { release(); }
  });
});
afterEach(async () => { await Promise.all(apps.splice(0).map((instance) => instance.close())); });

const update = (payload: Record<string, unknown> = { status: "REVIEWING" }, id = "request") => ({ method: "PATCH" as const, url: `/v1/admin/care-requests/${id}`, payload });
const submission = { method: "POST" as const, url: "/v1/patient/care-requests", payload: { type: "DIAGNOSTIC", title: "Synthetic diagnostic request" } };

describe("care request persistence and audit", () => {
  it("returns the saved admin projection and exposes the persisted stage only to its patient", async () => {
    const instance = await app();
    const response = await instance.inject(update({ status: "SCHEDULED", expectedStatus: "REQUESTED", expectedUpdatedAt: "2026-01-01T00:00:00.000Z" }));
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: "request", status: "SCHEDULED", patient });
    expect(response.json().patient).not.toHaveProperty("userId");
    expect(mocks.records[0].status).toBe("SCHEDULED");
    expect(mocks.audits[0]).toMatchObject({ action: "CARE_REQUEST_UPDATED", outcome: "SUCCESS", metadata: { previousStatus: "REQUESTED", status: "SCHEDULED" } });
    mocks.actor.role = "PATIENT";
    const listed = await instance.inject("/v1/patient/care-requests");
    expect(listed.json()[0].status).toBe("SCHEDULED");
    expect(mocks.notification).toHaveBeenCalledWith(expect.objectContaining({ userId: "patient-user", role: "PATIENT", title: "Care request updated" }));
    expect(mocks.db.careRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "request", status: "REQUESTED", updatedAt: new Date("2026-01-01T00:00:00Z") } }));
  });

  it("rolls back a stage change when its audit insert fails", async () => {
    mocks.db.auditLog.create.mockRejectedValue(new Error("Synthetic audit failure"));
    const response = await (await app()).inject(update());
    expect(response.statusCode).toBe(500);
    expect(mocks.records[0].status).toBe("REQUESTED");
    expect(mocks.notification).not.toHaveBeenCalled();
  });

  it("keeps a committed stage and independently audits notification failure", async () => {
    mocks.notification.mockRejectedValue(new Error("Synthetic notification failure"));
    const response = await (await app()).inject(update());
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("REVIEWING");
    expect(mocks.records[0].status).toBe("REVIEWING");
    expect(mocks.audits.map(({ action, outcome }) => ({ action, outcome }))).toEqual([
      { action: "CARE_REQUEST_UPDATED", outcome: "SUCCESS" },
      { action: "CARE_REQUEST_NOTIFICATION_FAILED", outcome: "FAILURE" },
    ]);
    expect(mocks.audits[1].metadata).toEqual({ recipientRole: "PATIENT" });
  });

  it("still returns a committed save if recording the subsequent delivery failure is unavailable", async () => {
    mocks.notification.mockRejectedValue(new Error("Synthetic notification failure"));
    const insertAudit = mocks.db.auditLog.create.getMockImplementation()!;
    mocks.db.auditLog.create.mockImplementation(async (input) => {
      if (input.data.outcome === "FAILURE") throw new Error("Synthetic second audit failure");
      return insertAudit(input);
    });
    const response = await (await app()).inject(update());
    expect(response.statusCode).toBe(200);
    expect(mocks.records[0].status).toBe("REVIEWING");
  });

  it("treats an unchanged save as a no-op without duplicate notifications or audits", async () => {
    const response = await (await app()).inject(update({ status: "REQUESTED", expectedStatus: "REQUESTED" }));
    expect(response.statusCode).toBe(200);
    expect(mocks.db.careRequest.updateMany).not.toHaveBeenCalled();
    expect(mocks.notification).not.toHaveBeenCalled();
    expect(mocks.audits).toEqual([]);
  });

  it("advances the version even when multiple edits share a clock millisecond", async () => {
    const previous = new Date(Date.now() + 60_000);
    mocks.records[0].updatedAt = previous;
    const response = await (await app()).inject(update());
    expect(response.statusCode).toBe(200);
    expect(Date.parse(response.json().updatedAt)).toBe(previous.getTime() + 1);
  });

  it("audits a date-only correction and permits clearing the target date", async () => {
    const targetDate = "2026-12-10T00:00:00.000Z";
    const instance = await app();
    const first = await instance.inject(update({ status: "REQUESTED", targetDate }));
    expect(first.statusCode).toBe(200);
    expect(first.json().targetDate).toBe(targetDate);
    const second = await instance.inject(update({ status: "REQUESTED", targetDate: null, expectedUpdatedAt: first.json().updatedAt }));
    expect(second.statusCode).toBe(200);
    expect(second.json().targetDate).toBeNull();
    expect(mocks.audits.map(({ metadata }) => metadata)).toEqual([
      { previousStatus: "REQUESTED", status: "REQUESTED", previousTargetDate: null, targetDate },
      { previousStatus: "REQUESTED", status: "REQUESTED", previousTargetDate: targetDate, targetDate: null },
    ]);
  });

  it("allows administrators to correct or reopen coordination stages", async () => {
    mocks.records[0].status = "COMPLETED";
    const response = await (await app()).inject(update({ status: "REQUESTED", expectedStatus: "COMPLETED" }));
    expect(response.statusCode).toBe(200);
    expect(mocks.records[0].status).toBe("REQUESTED");
    expect(mocks.db.careRequest.updateMany.mock.calls[0][0].data).toEqual({ status: "REQUESTED", updatedAt: expect.any(Date) });
  });

  it("permits correction of a legacy stage while still matching its stale-edit precondition", async () => {
    mocks.records[0].status = "LEGACY_PENDING";
    const response = await (await app()).inject(update({ status: "REVIEWING", expectedStatus: "LEGACY_PENDING" }));
    expect(response.statusCode).toBe(200);
    expect(mocks.records[0].status).toBe("REVIEWING");
    expect(mocks.audits[0].metadata.previousStatus).toBe("LEGACY_PENDING");
  });
});

describe("care request analytics scope", () => {
  it("counts scheduled coordination as open and unread alerts only for the current administrator", async () => {
    const response = await (await app()).inject("/v1/admin/analytics/overview");
    expect(response.statusCode).toBe(200);
    expect(mocks.db.careRequest.count).toHaveBeenCalledWith({ where: { status: { in: ["REQUESTED", "REVIEWING", "APPROVED", "SCHEDULED"] } } });
    expect(mocks.db.notification.count).toHaveBeenCalledWith({ where: { userId: "admin-user", status: "UNREAD" } });
  });
});

describe("care request stale edit protection", () => {
  it.each([
    { status: "APPROVED", expectedStatus: "REVIEWING" },
    { status: "APPROVED", expectedStatus: "REQUESTED", expectedUpdatedAt: "2025-01-01T00:00:00.000Z" },
  ])("rejects stale preconditions before changing the record: %j", async (payload) => {
    const response = await (await app()).inject(update(payload));
    expect(response.statusCode).toBe(409);
    expect(mocks.records[0].status).toBe("REQUESTED");
    expect(mocks.db.careRequest.updateMany).not.toHaveBeenCalled();
    expect(mocks.notification).not.toHaveBeenCalled();
    expect(mocks.audits).toEqual([]);
  });

  it("rejects a concurrent change between reading and updating even without a client precondition", async () => {
    mocks.db.careRequest.updateMany.mockResolvedValue({ count: 0 });
    const response = await (await app()).inject(update());
    expect(response.statusCode).toBe(409);
    expect(mocks.records[0].status).toBe("REQUESTED");
    expect(mocks.audits).toEqual([]);
  });

  it("returns a sanitized conflict for transaction contention", async () => {
    mocks.db.$transaction.mockRejectedValue({ code: "P2034", message: "private database detail" });
    const response = await (await app()).inject(update());
    expect(response.statusCode).toBe(409);
    expect(response.body).not.toContain("private database");
    expect(mocks.notification).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing request", async () => {
    const response = await (await app()).inject(update({ status: "REVIEWING" }, "missing"));
    expect(response.statusCode).toBe(404);
    expect(mocks.db.careRequest.updateMany).not.toHaveBeenCalled();
  });

  it("validates stage and version inputs", async () => {
    const instance = await app();
    for (const payload of [{ status: "PAID" }, { status: "REVIEWING", expectedUpdatedAt: "yesterday" }]) {
      expect((await instance.inject(update(payload))).statusCode).toBe(400);
    }
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });
});

describe("care request creation and authorization", () => {
  beforeEach(() => { mocks.actor.role = "PATIENT"; mocks.actor.id = "patient-user"; });

  it("serializes duplicate submissions and commits one request with one creation audit", async () => {
    const instance = await app();
    const responses = await Promise.all([instance.inject(submission), instance.inject(submission)]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 201]);
    expect(responses[0].json().id).toBe(responses[1].json().id);
    expect(mocks.records.filter((record) => record.type === "DIAGNOSTIC")).toHaveLength(1);
    expect(mocks.audits).toHaveLength(1);
    expect(mocks.audits[0].action).toBe("CARE_REQUEST_CREATED");
    expect(mocks.notification).toHaveBeenCalledOnce();
    expect(mocks.notifyRole).toHaveBeenCalledOnce();
    expect(mocks.db.patient.updateMany.mock.invocationCallOrder[0]).toBeLessThan(mocks.db.careRequest.findFirst.mock.invocationCallOrder[0]);
    expect(mocks.db.patient.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "patient", userId: "patient-user" } }));
  });

  it("rolls back a new request if its creation audit cannot be saved", async () => {
    mocks.db.auditLog.create.mockRejectedValue(new Error("Synthetic audit failure"));
    const response = await (await app()).inject(submission);
    expect(response.statusCode).toBe(500);
    expect(mocks.records).toHaveLength(1);
    expect(mocks.notification).not.toHaveBeenCalled();
    expect(mocks.notifyRole).not.toHaveBeenCalled();
  });

  it("notifies administrators even if the patient notification fails after creation", async () => {
    mocks.notification.mockRejectedValue(new Error("Synthetic notification failure"));
    const response = await (await app()).inject(submission);
    expect(response.statusCode).toBe(201);
    expect(mocks.records).toHaveLength(2);
    expect(mocks.notifyRole).toHaveBeenCalledOnce();
    expect(mocks.audits).toEqual(expect.arrayContaining([expect.objectContaining({ action: "CARE_REQUEST_NOTIFICATION_FAILED", metadata: { recipientRole: "PATIENT" } })]));
  });

  it("retries a rolled-back serialization conflict without duplicating the request", async () => {
    const transaction = mocks.db.$transaction.getMockImplementation()!;
    mocks.db.$transaction.mockRejectedValueOnce({ code: "P2034" }).mockImplementation(transaction);
    const response = await (await app()).inject(submission);
    expect(response.statusCode).toBe(201);
    expect(mocks.records).toHaveLength(2);
    expect(mocks.audits).toHaveLength(1);
  });

  it("limits patient reads to the session owner", async () => {
    mocks.records.push({ ...initial(), id: "other-request", patientId: "other-patient" });
    const response = await (await app()).inject("/v1/patient/care-requests");
    expect(response.statusCode).toBe(200);
    expect(response.json().map((record: any) => record.id)).toEqual(["request"]);
    expect(mocks.db.careRequest.findMany).toHaveBeenCalledWith({ where: { patientId: "patient" }, orderBy: { createdAt: "desc" } });
  });

  it.each(["PATIENT", "DOCTOR"])("denies %s access to administrative listing and mutation", async (role) => {
    mocks.actor.role = role;
    const instance = await app();
    expect((await instance.inject("/v1/admin/care-requests")).statusCode).toBe(403);
    expect((await instance.inject(update())).statusCode).toBe(403);
    expect(mocks.db.careRequest.findMany).not.toHaveBeenCalled();
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it("does not expose patient requests through a doctor session", async () => {
    mocks.actor.role = "DOCTOR";
    const response = await (await app()).inject("/v1/patient/care-requests");
    expect(response.statusCode).toBe(403);
    expect(mocks.db.careRequest.findMany).not.toHaveBeenCalled();
  });
});
