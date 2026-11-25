import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ $queryRaw: vi.fn() }));
vi.mock("./server", () => ({ prisma: db }));
import { registerProductionReadiness } from "./productionReadiness";
const apps: ReturnType<typeof Fastify>[] = [];
beforeEach(() => { vi.resetAllMocks(); });
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); vi.unstubAllEnvs(); });
function createApp() { const app = Fastify(); apps.push(app); registerProductionReadiness(app); return app; }

describe("production release gates", () => {
  it("checks the live database rather than accepting a configured URL", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", "postgres://configured-but-unreachable");
    db.$queryRaw.mockRejectedValue(new Error("database offline"));
    const response = await createApp().inject("/v1/ops/readiness");
    expect(response.statusCode).toBe(503);
    expect(response.json().gates.database).toBe(false);
    expect(response.body).not.toContain("database offline");
  });
  it("does not allow environment flags to make unimplemented providers ready", async () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const [key, value] of Object.entries({ CORS_ORIGIN: "https://app.example.com", DATABASE_URL: "postgresql://configured", ALLOW_DEMO_AUTH: "false", EMAIL_PROVIDER: "real", REQUIRE_MFA: "true", STORAGE_ENCRYPTION: "true", STORAGE_PROVIDER: "real", AUDIT_RETENTION_DAYS: "2555", OBSERVABILITY_ENDPOINT: "https://monitor.example.com", BACKUP_VERIFIED: "true", SECURITY_ASSESSMENT_PASSED: "true", PRIVACY_LEGAL_APPROVED: "true" })) vi.stubEnv(key, value);
    db.$queryRaw.mockResolvedValue([{ version: "16" }]);
    const response = await createApp().inject("/v1/ops/readiness");
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ ready: false, gates: { database: true, emailProvider: false, identityMfa: false, encryptedObjectStorage: false, paymentProvider: false, videoProvider: false } });
    expect(db.$queryRaw.mock.calls[0][0][0]).toContain("current_setting");
  });
});
