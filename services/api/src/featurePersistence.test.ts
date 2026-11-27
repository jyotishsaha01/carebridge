import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

const mocks = vi.hoisted(() => ({
  actor: { id: "user", role: "PATIENT", patient: { id: "patient", country: "US" }, doctor: { id: "doctor" } },
  state: {} as any, notify: vi.fn(),
  db: {
    patient: { update: vi.fn(), findUnique: vi.fn() }, doctor: { update: vi.fn() },
    availabilitySlot: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    carePlanTask: { findFirst: vi.fn(), updateMany: vi.fn() }, carePlan: { create: vi.fn(), findMany: vi.fn() },
    appointment: { findMany: vi.fn(), count: vi.fn() }, medicalDocument: { findMany: vi.fn(), count: vi.fn() }, consultation: { findMany: vi.fn(), count: vi.fn() },
    auditLog: { create: vi.fn() }, $transaction: vi.fn(),
  },
}));
vi.mock("./server", () => ({ prisma: mocks.db }));
vi.mock("./auth", () => ({
  getAuthenticatedUser: vi.fn(async () => mocks.actor),
  requireRole: vi.fn(async (_request, reply, roles) => { if (roles.includes(mocks.actor.role)) return mocks.actor; reply.code(403).send({ error: "Forbidden" }); return null; }),
  requireVerifiedDoctor: vi.fn(async (_request, reply) => { if (mocks.actor.role === "DOCTOR") return mocks.actor; reply.code(403).send({ error: "Forbidden" }); return null; }),
}));
vi.mock("./notificationsPrototype", () => ({ createNotification: mocks.notify, notifyUsersByRole: vi.fn() }));
import { registerPatientRecordsRoutes } from "./patientRecords";
import { registerDoctorOperationsRoutes } from "./doctorOperations";
import { registerCarePlatformRoutes } from "./carePlatform";
import { registerPatientDashboardRoutes } from "./patientDashboard";

const apps: ReturnType<typeof Fastify>[] = [];
async function app() {
  const instance = Fastify(); apps.push(instance);
  instance.setErrorHandler((error, _request, reply) => reply.code(error instanceof ZodError ? 400 : 500).send({ error: "Synthetic failure" }));
  await registerPatientRecordsRoutes(instance); await registerDoctorOperationsRoutes(instance); await registerCarePlatformRoutes(instance); await registerPatientDashboardRoutes(instance);
  return instance;
}
function ownedTask(where: any) {
  return where.id === mocks.state.task.id && where.carePlanId === "plan" && where.carePlan.patientId === "patient"
    && (where.status === undefined || where.status === mocks.state.task.status)
    && (where.updatedAt === undefined || where.updatedAt.getTime() === mocks.state.task.updatedAt.getTime());
}
beforeEach(() => {
  vi.resetAllMocks(); Object.assign(mocks.actor, { role: "PATIENT", patient: { id: "patient", country: "US" } });
  mocks.state = { patient: { id: "patient", firstName: "Original", user: { email: "synthetic@example.test" } }, doctor: { id: "doctor", bio: "Original" }, slots: [] as any[], plans: [] as any[], audits: [] as any[], task: { id: "task", carePlanId: "plan", status: "TODO", updatedAt: new Date("2026-01-01T00:00:00Z") } };
  mocks.db.patient.update.mockImplementation(async ({ data }) => { Object.assign(mocks.state.patient, data); return structuredClone(mocks.state.patient); });
  mocks.db.patient.findUnique.mockResolvedValue({ userId: "user" });
  mocks.db.doctor.update.mockImplementation(async ({ data }) => { Object.assign(mocks.state.doctor, data); return structuredClone(mocks.state.doctor); });
  mocks.db.availabilitySlot.findFirst.mockResolvedValue(null); mocks.db.availabilitySlot.findMany.mockResolvedValue([]);
  mocks.db.availabilitySlot.create.mockImplementation(async ({ data }) => { const row = { id: "slot", ...data }; mocks.state.slots.push(row); return structuredClone(row); });
  mocks.db.availabilitySlot.deleteMany.mockImplementation(async () => { mocks.state.slots = []; return { count: 1 }; });
  mocks.db.carePlanTask.findFirst.mockImplementation(async ({ where }) => ownedTask(where) ? structuredClone(mocks.state.task) : null);
  mocks.db.carePlanTask.updateMany.mockImplementation(async ({ where, data }) => { if (!ownedTask(where)) return { count: 0 }; Object.assign(mocks.state.task, data); return { count: 1 }; });
  mocks.db.carePlan.create.mockImplementation(async ({ data }) => { const plan = { id: "plan", ...data }; mocks.state.plans.push(plan); return structuredClone(plan); });
  mocks.db.carePlan.findMany.mockResolvedValue([]);
  mocks.db.appointment.findMany.mockResolvedValue([]); mocks.db.appointment.count.mockResolvedValue(17);
  mocks.db.medicalDocument.findMany.mockResolvedValue([]); mocks.db.medicalDocument.count.mockResolvedValue(22);
  mocks.db.consultation.findMany.mockResolvedValue([]); mocks.db.consultation.count.mockResolvedValue(14);
  mocks.db.auditLog.create.mockImplementation(async ({ data }) => { mocks.state.audits.push(data); return { id: "audit", ...data }; });
  mocks.db.$transaction.mockImplementation(async operation => {
    const before = structuredClone(mocks.state);
    try { return await operation(mocks.db); }
    catch (error) { mocks.state = before; throw error; }
  });
});
afterEach(async () => { await Promise.all(apps.splice(0).map(instance => instance.close())); });
const taskUpdate = (extra = {}) => ({ method: "PATCH" as const, url: "/v1/patient/care-plans/plan/tasks/task", payload: { status: "DONE", ...extra } });

describe("feature save and audit boundaries", () => {
  it.each(["patient", "doctor"])("rolls back the %s profile when auditing fails", async role => {
    mocks.actor.role = role.toUpperCase(); mocks.db.auditLog.create.mockRejectedValue(new Error("audit outage"));
    const request = role === "patient" ? { url: "/v1/patient/profile", payload: { firstName: "Changed" } } : { url: "/v1/doctor/me/profile", payload: { bio: "Changed" } };
    expect((await (await app()).inject({ method: "PATCH", ...request })).statusCode).toBe(500);
    expect(mocks.state.patient.firstName).toBe("Original"); expect(mocks.state.doctor.bio).toBe("Original");
  });
  it("does not create a slot without its audit record", async () => {
    mocks.actor.role = "DOCTOR"; mocks.db.auditLog.create.mockRejectedValue(new Error("audit outage"));
    const result = await (await app()).inject({ method: "POST", url: "/v1/doctor/availability", payload: { startsAt: "2030-01-01T12:00:00Z", endsAt: "2030-01-01T12:30:00Z" } });
    expect(result.statusCode).toBe(500); expect(mocks.state.slots).toEqual([]);
  });
  it("restores a deleted slot if the deletion audit cannot commit", async () => {
    mocks.actor.role = "DOCTOR"; mocks.state.slots = [{ id: "slot", status: "AVAILABLE" }];
    mocks.db.availabilitySlot.findFirst.mockResolvedValue(mocks.state.slots[0]); mocks.db.auditLog.create.mockRejectedValue(new Error("audit outage"));
    expect((await (await app()).inject({ method: "DELETE", url: "/v1/doctor/availability/slot" })).statusCode).toBe(500);
    expect(mocks.state.slots).toHaveLength(1);
  });
  it("rolls back a care task progress change if its audit fails", async () => {
    mocks.db.auditLog.create.mockRejectedValue(new Error("audit outage"));
    expect((await (await app()).inject(taskUpdate())).statusCode).toBe(500); expect(mocks.state.task.status).toBe("TODO");
  });
  it("rejects stale task stages and versions while retaining the saved task", async () => {
    const instance = await app();
    expect((await instance.inject(taskUpdate({ expectedStatus: "DONE" }))).statusCode).toBe(409);
    expect((await instance.inject(taskUpdate({ expectedUpdatedAt: "2025-01-01T00:00:00Z" }))).statusCode).toBe(409);
    expect(mocks.state.task.status).toBe("TODO"); expect(mocks.state.audits).toEqual([]);
  });
  it("returns the saved task with a new version and before/after audit", async () => {
    const result = await (await app()).inject(taskUpdate({ expectedStatus: "TODO", expectedUpdatedAt: mocks.state.task.updatedAt.toISOString() }));
    expect(result.statusCode).toBe(200); expect(result.json().status).toBe("DONE");
    expect(Date.parse(result.json().updatedAt)).toBeGreaterThan(Date.parse("2026-01-01T00:00:00Z"));
    expect(mocks.state.audits[0].metadata).toEqual({ previousStatus: "TODO", status: "DONE" });
  });
  it("does not update a task belonging to another patient", async () => {
    mocks.actor.patient.id = "other-patient";
    expect((await (await app()).inject(taskUpdate())).statusCode).toBe(404); expect(mocks.state.task.status).toBe("TODO");
  });
  it("keeps a care plan committed when notification delivery fails", async () => {
    mocks.actor.role = "ADMIN"; mocks.notify.mockRejectedValue(new Error("delivery outage"));
    const result = await (await app()).inject({ method: "POST", url: "/v1/admin/care-plans", payload: { patientId: "patient", title: "Synthetic care plan", tasks: [] } });
    expect(result.statusCode).toBe(201); expect(mocks.state.plans).toHaveLength(1); expect(mocks.state.audits[0].action).toBe("CARE_PLAN_CREATED");
  });
  it("does not create a care plan when its audit fails", async () => {
    mocks.actor.role = "ADMIN"; mocks.db.auditLog.create.mockRejectedValue(new Error("audit outage"));
    expect((await (await app()).inject({ method: "POST", url: "/v1/admin/care-plans", payload: { patientId: "patient", title: "Synthetic care plan" } })).statusCode).toBe(500);
    expect(mocks.state.plans).toEqual([]); expect(mocks.notify).not.toHaveBeenCalled();
  });
  it("does not silently return an empty care plan history on a records outage", async () => {
    mocks.db.carePlan.findMany.mockRejectedValue(new Error("records outage"));
    const result = await (await app()).inject("/v1/patient/records"); expect(result.statusCode).toBe(500); expect(result.json()).not.toHaveProperty("carePlans");
  });
});

describe("bounded feature details", () => {
  it("keeps patient-only features protected when a different role retains a patient relation", async () => {
    mocks.actor.role = "DOCTOR"; const instance = await app();
    for (const path of ["/v1/patient/profile", "/v1/patient/records", "/v1/patient/dashboard", "/v1/patient/appointments"]) expect((await instance.inject(path)).statusCode).toBe(401);
    expect(mocks.db.appointment.findMany).not.toHaveBeenCalled();
  });
  it("returns true dashboard totals independently of the recent samples", async () => {
    const result = await (await app()).inject("/v1/patient/dashboard");
    expect(result.statusCode).toBe(200); expect(result.json()).toMatchObject({ appointmentCount: 17, documentCount: 22, consultationCount: 14, appointments: [] });
    expect(mocks.db.appointment.count).toHaveBeenCalledWith({ where: { patientId: "patient", status: "BOOKED", scheduledAt: { gte: expect.any(Date) } } });
  });
  it("scopes paginated appointment history to the current patient", async () => {
    const result = await (await app()).inject("/v1/patient/appointments?limit=20&offset=20&status=COMPLETED");
    expect(result.statusCode).toBe(200); expect(result.json()).toEqual({ appointments: [], total: 17, limit: 20, offset: 20 });
    expect(mocks.db.appointment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { patientId: "patient", status: "COMPLETED" }, take: 20, skip: 20 }));
  });
  it("keeps upcoming filters and counts within the same patient scope", async () => {
    await (await app()).inject("/v1/patient/appointments?view=upcoming");
    expect(mocks.db.appointment.count).toHaveBeenCalledWith({ where: { patientId: "patient", status: "BOOKED", scheduledAt: { gte: expect.any(Date) } } });
  });
  it("validates page sizes and availability date ranges", async () => {
    const instance = await app(); expect((await instance.inject("/v1/patient/appointments?limit=1000")).statusCode).toBe(400);
    mocks.actor.role = "DOCTOR";
    expect((await instance.inject("/v1/doctor/availability?from=2030-02-01&to=2030-01-01")).statusCode).toBe(400);
    await instance.inject("/v1/doctor/availability?to=2030-01-01");
    expect(mocks.db.availabilitySlot.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { doctorId: "doctor", startsAt: { lte: new Date("2030-01-01") } } }));
  });
  it("rejects availability durations that the booking workflow cannot accept", async () => {
    mocks.actor.role = "DOCTOR"; const instance = await app();
    for (const endsAt of ["2030-01-01T12:05:00Z", "2030-01-01T14:00:00Z", "2030-01-01T12:30:30Z"]) {
      expect((await instance.inject({ method: "POST", url: "/v1/doctor/availability", payload: { startsAt: "2030-01-01T12:00:00Z", endsAt } })).statusCode).toBe(400);
    }
    expect(mocks.state.slots).toEqual([]);
  });
});
