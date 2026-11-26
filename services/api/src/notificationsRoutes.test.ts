import Fastify from "fastify";
import cors from "@fastify/cors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  seed: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn(),
  list: vi.fn(async () => []), count: vi.fn(async () => 0),
  authenticated: vi.fn(), listeners: [] as Array<(notification: unknown) => void>,
}));
vi.mock("./auth", () => ({ requireRole: vi.fn(async () => ({ id: "patient", role: "PATIENT" })), getAuthenticatedUser: mocks.authenticated }));
vi.mock("./notificationRealtime", () => ({ subscribeNotifications: mocks.subscribe }));
vi.mock("./notificationsPrototype", () => ({ seedNotificationPrototype: mocks.seed, listNotifications: mocks.list, unreadCount: mocks.count, getNotificationPreferences: vi.fn(), setNotificationPreference: vi.fn(), markNotificationRead: vi.fn(), markAllNotificationsRead: vi.fn() }));
import { registerNotificationPrototypeRoutes } from "./notificationsRoutesPrototype";
const apps: ReturnType<typeof Fastify>[] = [];
beforeEach(() => {
  mocks.authenticated.mockResolvedValue({ id: "patient", role: "PATIENT" });
  mocks.listeners.length = 0;
  mocks.subscribe.mockImplementation((_userId, listener) => { mocks.listeners.push(listener); return mocks.unsubscribe; });
});
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); vi.clearAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers(); });
async function createApp() { const app = Fastify(); apps.push(app); await registerNotificationPrototypeRoutes(app); return app; }

describe("notification security", () => {
  it("never reflects an unauthorized Origin on an authenticated event stream", async () => {
    const app = Fastify(); apps.push(app);
    await app.register(cors, { origin: ["https://app.example.com"], credentials: true });
    await registerNotificationPrototypeRoutes(app);
    const response = await app.inject({ url: "/v1/notifications/stream", headers: { origin: "https://attacker.example.com" } });
    expect(response.statusCode).toBe(403);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(mocks.subscribe).not.toHaveBeenCalled();
  });
  it("does not create fake clinical notifications in production", async () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("ALLOW_DEMO_AUTH", "true");
    const response = await (await createApp()).inject("/v1/notifications");
    expect(response.statusCode).toBe(200);
    expect(mocks.seed).not.toHaveBeenCalled();
    expect(response.json().notifications).toEqual([]);
  });
  it("caps streams per user and releases all streams during shutdown", async () => {
    const app = await createApp();
    const open = [1, 2, 3].map(() => app.inject("/v1/notifications/stream"));
    await vi.waitFor(() => expect(mocks.subscribe).toHaveBeenCalledTimes(3));
    const limited = await app.inject("/v1/notifications/stream");
    expect(limited.statusCode).toBe(429);
    expect(limited.headers["retry-after"]).toBe("30");
    await app.close();
    const responses = await Promise.all(open);
    expect(responses.every((response) => response.statusCode === 200 && response.body.includes("event: ready"))).toBe(true);
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(3);
  });
  it("rechecks a session before publishing and sends no payload after revocation", async () => {
    const app = await createApp();
    const open = app.inject("/v1/notifications/stream");
    await vi.waitFor(() => expect(mocks.subscribe).toHaveBeenCalledOnce());
    mocks.authenticated.mockResolvedValue(null);
    mocks.listeners[0]({ title: "confidential-patient-notification" });
    const response = await open;
    expect(mocks.authenticated).toHaveBeenCalledOnce();
    expect(response.body).not.toContain("confidential-patient-notification");
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });
  it("closes idle streams when their session expires or is revoked", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const app = await createApp();
    const open = app.inject("/v1/notifications/stream");
    await vi.waitFor(() => expect(mocks.subscribe).toHaveBeenCalledOnce());
    mocks.authenticated.mockResolvedValue(null);
    await vi.advanceTimersByTimeAsync(15_000);
    const response = await open;
    expect(response.body).toContain("event: ready");
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });
});
