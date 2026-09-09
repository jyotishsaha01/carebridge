import type { FastifyInstance } from "fastify";

/** Production release guardrails. These checks intentionally fail closed. */
export function registerProductionReadiness(app: FastifyInstance) {
  app.addHook("onSend", async (_request, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (process.env.NODE_ENV === "production") reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  });

  app.get("/v1/ops/readiness", async (_request, reply) => {
    const production = process.env.NODE_ENV === "production";
    const gates = {
      database: Boolean(process.env.DATABASE_URL),
      cors: Boolean(process.env.CORS_ORIGIN),
      demoAuthDisabled: process.env.ALLOW_DEMO_AUTH !== "true",
      emailProvider: Boolean(process.env.EMAIL_PROVIDER && process.env.EMAIL_PROVIDER !== "demo"),
      identityMfa: process.env.REQUIRE_MFA === "true",
      encryptedObjectStorage: process.env.STORAGE_ENCRYPTION === "true" && Boolean(process.env.STORAGE_PROVIDER),
      auditRetention: Boolean(process.env.AUDIT_RETENTION_DAYS),
      monitoring: Boolean(process.env.OBSERVABILITY_ENDPOINT),
      backups: process.env.BACKUP_VERIFIED === "true",
      securityAssessment: process.env.SECURITY_ASSESSMENT_PASSED === "true",
      privacyLegalReview: process.env.PRIVACY_LEGAL_APPROVED === "true",
    };
    const missing = Object.entries(gates).filter(([, value]) => !value).map(([key]) => key);
    const ready = !production ? gates.database && gates.cors : missing.length === 0;
    return reply.code(ready ? 200 : 503).send({ ready, production, gates, missing });
  });
}
