import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  write: vi.fn(), remove: vi.fn(), scan: vi.fn(), notify: vi.fn(),
  db: { supportTicket: { findUnique: vi.fn(), update: vi.fn() }, supportAttachment: { create: vi.fn() }, auditLog: { create: vi.fn() }, $transaction: vi.fn() },
}));
vi.mock("./server", () => ({ prisma: mocks.db }));
vi.mock("./auth", () => ({ getAuthenticatedUser: vi.fn(async () => ({ id: "patient-user", role: "PATIENT" })), requireRole: vi.fn() }));
vi.mock("./storage", () => ({ MAX_DOCUMENT_BYTES: 10 * 1024 * 1024, documentStorage: { writeDocument: mocks.write, deleteDocument: mocks.remove, readDocument: vi.fn() } }));
vi.mock("./malwareScanner", () => ({ scanUploadedFile: mocks.scan }));
vi.mock("./notificationsPrototype", () => ({ createNotification: vi.fn(), notifyUsersByRole: mocks.notify }));
import { registerSupportRoutes } from "./support";
const apps: ReturnType<typeof Fastify>[] = [];
beforeEach(() => {
  vi.resetAllMocks();
  mocks.db.supportTicket.findUnique.mockResolvedValue({ id: "ticket", userId: "patient-user" });
  mocks.db.supportAttachment.create.mockResolvedValue({ id: "attachment", ticketId: "ticket" });
  mocks.db.$transaction.mockImplementation((operation) => operation(mocks.db));
  mocks.scan.mockResolvedValue({ status: "clean" });
});
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });
async function upload() {
  const app = Fastify(); apps.push(app); await registerSupportRoutes(app);
  return app.inject({ method: "POST", url: "/v1/support/tickets/ticket/attachments", payload: { fileName: "synthetic.pdf", contentType: "application/pdf", contentBase64: Buffer.from("%PDF-1.4 synthetic").toString("base64") } });
}
describe("support attachment commit boundary", () => {
  it("retains committed bytes and success when notification delivery fails", async () => {
    mocks.notify.mockRejectedValue(new Error("notification outage"));
    expect((await upload()).statusCode).toBe(201);
    expect(mocks.write).toHaveBeenCalledOnce();
    expect(mocks.db.$transaction).toHaveBeenCalledOnce();
    expect(mocks.db.auditLog.create).toHaveBeenCalledOnce();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("cleans bytes only when metadata/audit commit fails", async () => {
    mocks.db.auditLog.create.mockRejectedValue(new Error("audit outage"));
    expect((await upload()).statusCode).toBe(500);
    expect(mocks.remove).toHaveBeenCalledOnce();
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it.each([['infected', 422], ['unavailable', 503]] as const)("does not persist %s attachments", async (status, code) => {
    mocks.scan.mockResolvedValue({ status });
    expect((await upload()).statusCode).toBe(code);
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.db.supportAttachment.create).not.toHaveBeenCalled();
  });
});
