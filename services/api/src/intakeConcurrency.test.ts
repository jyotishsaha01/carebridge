import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type State = { intake: Record<string, any>; consultation: Record<string, any> | null };
const mocks = vi.hoisted(() => ({
  state: { intake: { id: "intake", consentToConsult: true, status: "COMPLETED" }, consultation: null } as State,
  afterRead: vi.fn(), beforeLock: vi.fn(),
  db: { appointment: { findFirst: vi.fn(), updateMany: vi.fn() }, $transaction: vi.fn(), auditLog: { create: vi.fn() } },
}));
vi.mock("./server", () => ({ prisma: mocks.db }));
vi.mock("./auth", () => ({
  requireRole: vi.fn(async () => ({ id: "patient-user", role: "PATIENT", patient: { id: "patient", userId: "patient-user" } })),
  requireVerifiedDoctor: vi.fn(async () => ({ id: "doctor-user", role: "DOCTOR", doctor: { id: "doctor" } })),
}));
vi.mock("./notificationsPrototype", () => ({ createNotification: vi.fn() }));
import { registerClinicalRoutes } from "./clinical";
import { registerMedicalIntakeRoutes } from "./medicalIntake";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
const apps: ReturnType<typeof Fastify>[] = [];
async function readAppointment(state: State, where: { id: string; patientId?: string; doctorId?: string }) {
  const result = structuredClone({ id: "appointment", patientId: "patient", doctorId: "doctor", status: "BOOKED", medicalIntake: state.intake, consultation: state.consultation });
  await mocks.afterRead(where.patientId ? "patient" : "doctor");
  return result;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.state = { intake: { id: "intake", consentToConsult: true, status: "COMPLETED" }, consultation: null };
  let lockTail = Promise.resolve();
  mocks.db.appointment.findFirst.mockImplementation(({ where }) => readAppointment(mocks.state, where));
  mocks.db.$transaction.mockImplementation(async (operation) => {
    const writes: Partial<State> = {};
    let release: (() => void) | undefined;
    const transaction = {
      appointment: {
        updateMany: async ({ where }: { where: { patientId?: string } }) => {
          const previous = lockTail;
          const current = deferred(); lockTail = current.promise;
          await mocks.beforeLock(where.patientId ? "patient" : "doctor");
          await previous;
          release = current.resolve;
          return { count: 1 };
        },
        findFirst: ({ where }: { where: any }) => readAppointment({ ...mocks.state, ...writes }, where),
      },
      consultation: { upsert: async ({ update }: { update: Record<string, any> }) => {
        writes.consultation = { id: "consultation", ...update };
        return { id: "consultation", patientId: "patient", ...update };
      } },
      medicalIntake: { upsert: async ({ update }: { update: Record<string, any> }) => {
        writes.intake = { ...mocks.state.intake, ...update };
        return writes.intake;
      } },
      auditLog: { create: vi.fn(async () => ({ id: "audit" })) },
    };
    try {
      const result = await operation(transaction);
      Object.assign(mocks.state, writes);
      return result;
    } finally { release?.(); }
  });
});
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

describe("intake freeze and clinical start share one appointment lock", () => {
  it.each(["doctor", "patient"] as const)("re-reads authoritative state when %s acquires the appointment first", async (first) => {
    const app = Fastify(); apps.push(app);
    await registerClinicalRoutes(app); await registerMedicalIntakeRoutes(app);
    const firstSnapshot = deferred(); const releaseFirst = deferred(); const secondAttempt = deferred();
    const second = first === "doctor" ? "patient" : "doctor";
    let paused = false;
    mocks.afterRead.mockImplementation(async (actor) => {
      if (actor === first && !paused) { paused = true; firstSnapshot.resolve(); await releaseFirst.promise; }
      else if (actor === second) secondAttempt.resolve();
    });
    mocks.beforeLock.mockImplementation(async (actor) => { if (actor === second) secondAttempt.resolve(); });
    const doctorRequest = { method: "PUT" as const, url: "/v1/doctor/appointments/appointment/consultation", payload: { status: "IN_PROGRESS" } };
    const patientRequest = { method: "PUT" as const, url: "/v1/appointments/appointment/intake", payload: { symptoms: "Synthetic new draft", consentToConsult: false } };
    const firstResponse = app.inject(first === "doctor" ? doctorRequest : patientRequest).then((response) => response);
    await firstSnapshot.promise;
    const secondResponse = app.inject(second === "doctor" ? doctorRequest : patientRequest).then((response) => response);
    await secondAttempt.promise;
    releaseFirst.resolve();
    const [firstResult, secondResult] = await Promise.all([firstResponse, secondResponse]);
    expect(firstResult.statusCode).toBe(200);
    expect(secondResult.statusCode).toBe(409);
    expect(secondResult.body).not.toContain("Prisma");
    if (first === "doctor") {
      expect(mocks.state.consultation?.status).toBe("IN_PROGRESS");
      expect(mocks.state.intake).toMatchObject({ consentToConsult: true, status: "COMPLETED" });
    } else {
      expect(mocks.state.consultation).toBeNull();
      expect(mocks.state.intake).toMatchObject({ consentToConsult: false, status: "DRAFT" });
    }
  });
});
