import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

const mocks = vi.hoisted(() => ({
  actor: { id: "patient-user", role: "PATIENT" },
  tickets: [] as any[], messages: [] as any[], audits: [] as any[], notify: vi.fn(), notifyRole: vi.fn(),
  db: {
    user: { update: vi.fn(), findUnique: vi.fn() },
    supportTicket: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
    supportMessage: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    auditLog: { create: vi.fn() }, $transaction: vi.fn(),
  },
}));
vi.mock("./server", () => ({ prisma: mocks.db }));
vi.mock("./auth", () => ({
  getAuthenticatedUser: vi.fn(async () => mocks.actor),
  requireRole: vi.fn(async (_request, reply, roles) => { if (roles.includes(mocks.actor.role)) return mocks.actor; reply.code(403).send({ error: "Forbidden" }); return null; }),
}));
vi.mock("./notificationsPrototype", () => ({ createNotification: mocks.notify, notifyUsersByRole: mocks.notifyRole }));
vi.mock("./storage", () => ({ MAX_DOCUMENT_BYTES: 10_000, documentStorage: {} }));
vi.mock("./malwareScanner", () => ({ scanUploadedFile: vi.fn() }));
import { registerSupportRoutes } from "./support";

const owner = { id: "patient-user", email: "synthetic@example.test", role: "PATIENT" };
const initial = () => ({ id: "ticket", userId: owner.id, category: "General", message: "Synthetic support request", status: "OPEN", priority: "NORMAL", escalatedAt: null, resolvedAt: null, slaDueAt: new Date("2026-01-02T00:00:00Z"), createdAt: new Date(), updatedAt: new Date("2026-01-01T00:00:00Z") });
function matches(row: any, where: any) {
  return Object.entries(where).every(([key, expected]) => {
    if (expected instanceof Date) return row[key]?.getTime() === expected.getTime();
    if (key === "createdAt") return row.createdAt >= (expected as { gte: Date }).gte;
    return row[key] === expected;
  });
}
const apps: ReturnType<typeof Fastify>[] = [];
async function app() {
  const instance = Fastify(); apps.push(instance);
  instance.setErrorHandler((error, _request, reply) => reply.code(error instanceof ZodError ? 400 : 500).send({ error: "Synthetic failure" }));
  await registerSupportRoutes(instance); return instance;
}
beforeEach(() => {
  vi.resetAllMocks(); Object.assign(mocks.actor, { id: owner.id, role: "PATIENT" });
  mocks.tickets = [initial()]; mocks.messages = []; mocks.audits = [];
  mocks.db.user.update.mockResolvedValue(owner); mocks.db.user.findUnique.mockResolvedValue(owner);
  mocks.db.supportTicket.findUnique.mockImplementation(async ({ where, include }) => {
    const ticket = mocks.tickets.find(row => row.id === where.id);
    return ticket ? structuredClone({ ...ticket, ...(include ? { user: owner } : {}) }) : null;
  });
  mocks.db.supportTicket.findFirst.mockImplementation(async ({ where }) => structuredClone(mocks.tickets.find(row => matches(row, where)) ?? null));
  mocks.db.supportTicket.create.mockImplementation(async ({ data }) => { const ticket = { ...initial(), ...data, id: "created-ticket" }; mocks.tickets.push(ticket); return structuredClone(ticket); });
  mocks.db.supportTicket.updateMany.mockImplementation(async ({ where, data }) => { const ticket = mocks.tickets.find(row => matches(row, where)); if (!ticket) return { count: 0 }; Object.assign(ticket, data); return { count: 1 }; });
  mocks.db.supportMessage.findFirst.mockImplementation(async ({ where }) => structuredClone(mocks.messages.find(row => matches(row, where)) ?? null));
  mocks.db.supportMessage.create.mockImplementation(async ({ data }) => { const message = { id: `message-${mocks.messages.length}`, createdAt: new Date(), ...data, author: { id: mocks.actor.id, role: mocks.actor.role } }; mocks.messages.push(message); return structuredClone(message); });
  mocks.db.supportMessage.findMany.mockResolvedValue([]);
  mocks.db.auditLog.create.mockImplementation(async ({ data }) => { mocks.audits.push(data); return { id: "audit", ...data }; });
  let tail = Promise.resolve();
  mocks.db.$transaction.mockImplementation(async (operation) => {
    const preceding = tail; let release!: () => void; tail = new Promise<void>(resolve => { release = resolve; }); await preceding;
    const before = structuredClone({ tickets: mocks.tickets, messages: mocks.messages, audits: mocks.audits });
    try { return await operation(mocks.db); }
    catch (error) { mocks.tickets = before.tickets; mocks.messages = before.messages; mocks.audits = before.audits; throw error; }
    finally { release(); }
  });
});
afterEach(async () => { await Promise.all(apps.splice(0).map(instance => instance.close())); });
const post = { method: "POST" as const, url: "/v1/support/tickets", payload: { category: "Billing", message: "A synthetic billing question" } };
const reply = { method: "POST" as const, url: "/v1/support/tickets/ticket/messages", payload: { message: "A synthetic response" } };
const patch = (payload: Record<string, unknown>) => ({ method: "PATCH" as const, url: "/v1/admin/support/tickets/ticket", payload });
const admin = () => Object.assign(mocks.actor, { id: "admin-user", role: "ADMIN" });

describe("support commit consistency", () => {
  it("serializes duplicate submissions into one ticket, audit and notification", async () => {
    const instance = await app(); const results = await Promise.all([instance.inject(post), instance.inject(post)]);
    expect(results.map(result => result.statusCode).sort()).toEqual([200, 201]);
    expect(results[0].json().id).toBe(results[1].json().id);
    expect(mocks.audits.filter(row => row.action === "SUPPORT_TICKET_CREATED")).toHaveLength(1);
    expect(mocks.notifyRole).toHaveBeenCalledOnce();
  });
  it("rolls back ticket creation when its audit fails", async () => {
    mocks.db.auditLog.create.mockRejectedValue(new Error("audit outage"));
    expect((await (await app()).inject(post)).statusCode).toBe(500);
    expect(mocks.tickets).toHaveLength(1); expect(mocks.notifyRole).not.toHaveBeenCalled();
  });
  it("returns committed ticket creation despite notification failure", async () => {
    mocks.notifyRole.mockRejectedValue(new Error("delivery outage"));
    expect((await (await app()).inject(post)).statusCode).toBe(201);
    expect(mocks.tickets).toHaveLength(2);
    expect(mocks.audits.map(row => row.action)).toEqual(["SUPPORT_TICKET_CREATED", "SUPPORT_NOTIFICATION_FAILED"]);
  });
  it("deduplicates replies from the same author without duplicate audits or notifications", async () => {
    const instance = await app(); const results = await Promise.all([instance.inject(reply), instance.inject(reply)]);
    expect(results.map(result => result.statusCode).sort()).toEqual([200, 201]); expect(mocks.messages).toHaveLength(1);
    expect(mocks.audits.filter(row => row.action === "SUPPORT_MESSAGE_SENT")).toHaveLength(1); expect(mocks.notifyRole).toHaveBeenCalledOnce();
  });
  it("rolls back both message and ticket version if auditing fails", async () => {
    const original = mocks.tickets[0].updatedAt;
    mocks.db.auditLog.create.mockRejectedValue(new Error("audit outage"));
    expect((await (await app()).inject(reply)).statusCode).toBe(500);
    expect(mocks.messages).toHaveLength(0); expect(mocks.tickets[0].updatedAt).toEqual(original); expect(mocks.notifyRole).not.toHaveBeenCalled();
  });
  it("keeps an admin reply committed when owner notification fails", async () => {
    admin(); mocks.notify.mockRejectedValue(new Error("delivery outage"));
    expect((await (await app()).inject(reply)).statusCode).toBe(201);
    expect(mocks.messages).toHaveLength(1); expect(mocks.audits[0].action).toBe("ADMIN_SUPPORT_MESSAGE_SENT");
  });
});

describe("support settings and permissions", () => {
  it("keeps SLA unchanged on a status-only save, even if old clients submit unchanged priority", async () => {
    admin(); const due = mocks.tickets[0].slaDueAt; const instance = await app();
    const result = await instance.inject(patch({ status: "IN_PROGRESS", priority: "NORMAL", expectedUpdatedAt: mocks.tickets[0].updatedAt.toISOString() }));
    expect(result.statusCode).toBe(200); expect(result.json()).toMatchObject({ status: "IN_PROGRESS", user: owner });
    expect(mocks.tickets[0].slaDueAt).toEqual(due); expect(mocks.audits[0].metadata.previousStatus).toBe("OPEN");
  });
  it("does not reset SLA, version or notifications for a no-op", async () => {
    admin(); const original = structuredClone(mocks.tickets[0]);
    expect((await (await app()).inject(patch({ status: "OPEN", priority: "NORMAL", escalated: false }))).statusCode).toBe(200);
    expect(mocks.tickets[0]).toEqual(original); expect(mocks.audits).toEqual([]); expect(mocks.notify).not.toHaveBeenCalled();
  });
  it("recalculates SLA only for an actual priority change", async () => {
    admin(); const result = await (await app()).inject(patch({ priority: "HIGH" }));
    expect(result.statusCode).toBe(200); const saved = result.json();
    expect(new Date(saved.slaDueAt).getTime() - new Date(saved.updatedAt).getTime()).toBe(4 * 3_600_000);
  });
  it("rejects a stale editor without any status change", async () => {
    admin(); const result = await (await app()).inject(patch({ status: "RESOLVED", expectedUpdatedAt: "2025-01-01T00:00:00.000Z" }));
    expect(result.statusCode).toBe(409); expect(result.json().error).toMatch(/Refresh/); expect(mocks.tickets[0].status).toBe("OPEN"); expect(mocks.audits).toEqual([]);
  });
  it("rolls back settings when its audit cannot commit", async () => {
    admin(); mocks.db.auditLog.create.mockRejectedValue(new Error("audit outage"));
    expect((await (await app()).inject(patch({ status: "RESOLVED" }))).statusCode).toBe(500); expect(mocks.tickets[0].status).toBe("OPEN"); expect(mocks.notify).not.toHaveBeenCalled();
  });
  it("independently delivers owner updates when admin escalation notifications fail", async () => {
    admin(); mocks.notifyRole.mockRejectedValue(new Error("admin delivery outage"));
    expect((await (await app()).inject(patch({ status: "IN_PROGRESS", escalated: true }))).statusCode).toBe(200);
    expect(mocks.notify).toHaveBeenCalledTimes(2); expect(mocks.tickets[0].status).toBe("IN_PROGRESS");
  });
  it("does not allow a different patient to read or reply to a conversation", async () => {
    mocks.actor.id = "other-patient"; const instance = await app();
    expect((await instance.inject(reply)).statusCode).toBe(403);
    expect((await instance.inject("/v1/support/tickets/ticket/messages")).statusCode).toBe(403); expect(mocks.messages).toEqual([]);
  });
  it("protects direct ticket links for admins and returns safe owner metadata", async () => {
    const instance = await app(); expect((await instance.inject("/v1/admin/support/tickets/ticket")).statusCode).toBe(403);
    admin(); expect((await instance.inject("/v1/admin/support/tickets/ticket")).json().user).toEqual(owner);
    expect((await instance.inject("/v1/admin/support/tickets/missing")).statusCode).toBe(404);
  });
  it("returns the newest bounded messages in chronological order", async () => {
    mocks.db.supportMessage.findMany.mockResolvedValue([{ id: "newer" }, { id: "older" }]);
    const result = await (await app()).inject("/v1/support/tickets/ticket/messages");
    expect(result.json().map((row: any) => row.id)).toEqual(["older", "newer"]);
    expect(mocks.db.supportMessage.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 200 }));
  });
});
