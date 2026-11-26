import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ appointment: { findFirst: vi.fn() }, paymentIntent: { findFirst: vi.fn(), create: vi.fn() } }));
vi.mock("./server", () => ({ prisma: db }));
vi.mock("./auth", () => ({ requireRole: vi.fn(async () => ({ id: "user", patient: { id: "patient_a" } })) }));
vi.mock("./notificationsPrototype", () => ({ createNotification: vi.fn(), notifyUsersByRole: vi.fn() }));
import { registerPaymentRoutes } from "./paymentRoutes";
const apps: ReturnType<typeof Fastify>[] = [];
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("NODE_ENV", "test"); db.appointment.findFirst.mockResolvedValue({ id: "apt_a", status: "BOOKED", doctor: { consultationPriceUsd: 75 } }); });
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); vi.unstubAllEnvs(); });
async function createApp() { const app = Fastify(); apps.push(app); await registerPaymentRoutes(app); return app; }
const request = { method: "POST" as const, url: "/v1/payments/intents", payload: { appointmentId: "apt_a", idempotencyKey: "shared-key-123" } };

describe("payment route authorization", () => {
  it("does not disclose another patient's intent through an idempotency-key collision", async () => {
    db.paymentIntent.findFirst.mockResolvedValue({ id: "secret-intent", patientId: "patient_b", appointmentId: "apt_b", checkoutUrl: "secret-checkout" });
    const response = await (await createApp()).inject(request);
    expect(response.statusCode).toBe(409);
    expect(response.body).not.toContain("secret-intent");
    expect(response.body).not.toContain("secret-checkout");
    expect(db.paymentIntent.create).not.toHaveBeenCalled();
  });

  it("returns the same appointment intent on retries without another insert", async () => {
    db.paymentIntent.findFirst.mockResolvedValue({ id: "owned-intent", patientId: "patient_a", appointmentId: "apt_a", status: "REQUIRES_ACTION" });
    const response = await (await createApp()).inject(request);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: "owned-intent", appointmentId: "apt_a" });
    expect(response.json().patientId).toBeUndefined();
    expect(db.paymentIntent.create).not.toHaveBeenCalled();
  });

  it("fails closed in production before reading or charging an appointment", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await (await createApp()).inject(request);
    expect(response.statusCode).toBe(503);
    expect(db.appointment.findFirst).not.toHaveBeenCalled();
  });
});
