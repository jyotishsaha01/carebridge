import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  db: { user: { findMany: vi.fn() }, notificationPreference: { findMany: vi.fn() }, notification: { create: vi.fn() } },
  publish: vi.fn(),
}));
vi.mock("./server", () => ({ prisma: mocks.db }));
vi.mock("./notificationRealtime", () => ({ publishNotification: mocks.publish }));
import { notifyUsersByRole } from "./notificationsPrototype";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.db.user.findMany.mockResolvedValue([{ id: "admin-one" }, { id: "admin-two" }]);
  mocks.db.notificationPreference.findMany.mockResolvedValue([]);
  mocks.db.notification.create.mockImplementation(async ({ data }) => ({ id: data.userId, ...data, createdAt: new Date(), readAt: null }));
});
it("attempts every admin when delivery to an earlier admin fails", async () => {
  mocks.db.notificationPreference.findMany.mockRejectedValueOnce(new Error("Synthetic preference outage"));
  await expect(notifyUsersByRole("ADMIN", "SUPPORT", "Synthetic support update", "Synthetic body")).rejects.toBeInstanceOf(AggregateError);
  expect(mocks.db.notificationPreference.findMany).toHaveBeenCalledTimes(2);
  expect(mocks.publish).toHaveBeenCalledWith("admin-two", expect.objectContaining({ title: "Synthetic support update" }));
});
it("honors disabled preferences without treating them as delivery failures", async () => {
  mocks.db.notificationPreference.findMany.mockResolvedValueOnce([{ type: "SUPPORT", enabled: false }]);
  await expect(notifyUsersByRole("ADMIN", "SUPPORT", "Synthetic support update", "Synthetic body")).resolves.toBeUndefined();
  expect(mocks.db.notification.create).toHaveBeenCalledTimes(1);
});
