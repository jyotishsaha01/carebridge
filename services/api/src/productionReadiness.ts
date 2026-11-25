import type { FastifyInstance } from "fastify";
import { prisma } from "./server";

// Environment flags cannot prove that provider integrations are verified for production.
export const productionCapabilities = Object.freeze({
  emailProvider: false,
  identityMfa: false,
  encryptedObjectStorage: false,
  paymentProvider: false,
  videoProvider: false,
});

export async function checkDatabaseReadiness(production: boolean) {
  try {
    if (production) {
      // This query proves the connected database is PostgreSQL, not a generated SQLite client.
      await prisma.$queryRaw`SELECT current_setting('server_version') AS version`;
    } else {
      await prisma.$queryRaw`SELECT 1`;
    }
    return true;
  } catch {
    return false;
  }
}

/** A live dependency probe and explicit release gates; configuration alone is not proof of readiness. */
export function registerProductionReadiness(app: FastifyInstance) {
  app.get("/v1/ops/readiness", async (_request, reply) => {
    const production = process.env.NODE_ENV === "production";
    const corsOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:3000,http://localhost:3001,http://localhost:3002").split(",").map((origin) => origin.trim());
    const cors = corsOrigins.length > 0 && corsOrigins.every((origin) => {
      try {
        const url = new URL(origin);
        return url.origin === origin && (production ? url.protocol === "https:" : ["http:", "https:"].includes(url.protocol));
      } catch { return false; }
    });
    const gates = {
      database: await checkDatabaseReadiness(production),
      cors,
      demoAuthDisabled: process.env.ALLOW_DEMO_AUTH !== "true",
      ...productionCapabilities,
      auditRetention: /^\d+$/.test(process.env.AUDIT_RETENTION_DAYS ?? "") && Number(process.env.AUDIT_RETENTION_DAYS) > 0,
      monitoring: Boolean(process.env.OBSERVABILITY_ENDPOINT),
      backups: process.env.BACKUP_VERIFIED === "true",
      securityAssessment: process.env.SECURITY_ASSESSMENT_PASSED === "true",
      privacyLegalReview: process.env.PRIVACY_LEGAL_APPROVED === "true",
    };
    const missing = Object.entries(gates).filter(([, value]) => !value).map(([key]) => key);
    const ready = production ? missing.length === 0 : gates.database && gates.cors;
    return reply.code(ready ? 200 : 503).send({ ready, production, gates, missing });
  });
}
