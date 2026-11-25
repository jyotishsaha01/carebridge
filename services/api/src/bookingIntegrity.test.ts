import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  state: { status: "BOOKED", consultation: "SCHEDULED", scheduledAt: "2036-01-01T12:00:00.000Z", slot: "AVAILABLE" },
  afterLock: vi.fn(), notify: vi.fn(),
  db: { appointment: { findFirst: vi.fn() }, $transaction: vi.fn(), auditLog: { create: vi.fn() } },
  tx: {
    appointment: { updateMany: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
    consultation: { updateMany: vi.fn() }, availabilitySlot: { findFirst: vi.fn(), updateMany: vi.fn() }, auditLog: { create: vi.fn() },
  },
}));
vi.mock("./server", () => ({ prisma: mocks.db }));
vi.mock("./auth", () => ({ requireRole: vi.fn(async () => ({ id: "patient-user", patient: { id: "patient" } })) }));
vi.mock("./notificationsPrototype", () => ({ createNotification: mocks.notify, notifyUsersByRole: mocks.notify }));
import { registerBookingRoutes } from "./booking";
const apps: ReturnType<typeof Fastify>[] = [];
const appointment = () => ({ id: "appointment", patientId: "patient", doctorId: "doctor", status: mocks.state.status, scheduledAt: new Date(mocks.state.scheduledAt), durationMin: 30, doctor: { userId: "doctor-user", name: "Synthetic Doctor" }, consultation: { status: mocks.state.consultation } });
const requests = [
  { method: "POST" as const, url: "/v1/patient/appointments/appointment/cancel", payload: { reason: "Synthetic cancellation" } },
  { method: "PUT" as const, url: "/v1/patient/appointments/appointment/reschedule", payload: { scheduledAt: "2036-01-02T12:00:00.000Z" } },
];
beforeEach(() => {
  vi.resetAllMocks();
  Object.assign(mocks.state, { status: "BOOKED", consultation: "SCHEDULED", scheduledAt: "2036-01-01T12:00:00.000Z", slot: "AVAILABLE" });
  mocks.db.appointment.findFirst.mockImplementation(async () => structuredClone(appointment()));
  mocks.tx.appointment.findFirst.mockImplementation(async () => structuredClone(appointment()));
  mocks.tx.appointment.updateMany.mockImplementation(async () => { await mocks.afterLock(); return { count: 1 }; });
  mocks.tx.appointment.update.mockImplementation(async ({ data }) => {
    if (data.status) mocks.state.status = data.status;
    if (data.scheduledAt) mocks.state.scheduledAt = data.scheduledAt.toISOString();
    return appointment();
  });
  mocks.tx.consultation.updateMany.mockImplementation(async ({ data }) => { mocks.state.consultation = data.status; return { count: 1 }; });
  mocks.tx.availabilitySlot.findFirst.mockResolvedValue({ id: "new-slot", startsAt: new Date("2036-01-02T12:00:00Z"), endsAt: new Date("2036-01-02T12:30:00Z") });
  mocks.tx.availabilitySlot.updateMany.mockImplementation(async ({ where, data }) => { if (where.id) mocks.state.slot = data.status; return { count: 1 }; });
  mocks.tx.auditLog.create.mockResolvedValue({ id: "audit" });
  mocks.db.auditLog.create.mockResolvedValue({ id: "unscoped-audit" });
  mocks.db.$transaction.mockImplementation(async (operation) => {
    const before = structuredClone(mocks.state);
    try { return await operation(mocks.tx); } catch (error) { Object.assign(mocks.state, before); throw error; }
  });
});
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });
async function app() { const app = Fastify(); apps.push(app); await registerBookingRoutes(app, false); return app; }

describe("patient appointment lifecycle shares the clinical state lock", () => {
  it.each(requests)("rejects $url if care starts before the patient acquires the lock", async request => {
    mocks.afterLock.mockImplementation(() => { mocks.state.consultation = "IN_PROGRESS"; });
    const response = await (await app()).inject(request);
    expect(response.statusCode).toBe(409);
    expect(mocks.tx.appointment.update).not.toHaveBeenCalled();
    expect(mocks.tx.availabilitySlot.updateMany).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it.each(requests)("rolls back $url if its audit event cannot commit", async request => {
    const before = structuredClone(mocks.state);
    mocks.tx.auditLog.create.mockRejectedValue(new Error("synthetic audit outage"));
    const response = await (await app()).inject(request);
    expect(response.statusCode).toBe(500);
    expect(mocks.state).toEqual(before);
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it.each(requests)("returns successful $url after commit even when notifications fail", async request => {
    mocks.notify.mockRejectedValue(new Error("synthetic notification outage"));
    const response = await (await app()).inject(request);
    expect(response.statusCode).toBe(200);
    expect(mocks.tx.auditLog.create).toHaveBeenCalledOnce();
    expect(mocks.db.auditLog.create).not.toHaveBeenCalled();
    expect(mocks.state.status === "CANCELLED" || mocks.state.scheduledAt === "2036-01-02T12:00:00.000Z").toBe(true);
  });
});
