import type { FastifyInstance } from "fastify";

/** Production release guardrails. These checks intentionally fail closed. */
export function registerProductionReadiness(app: FastifyInstance) {
  app.addHook("onSend", async (_request, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (process.env.NODE_ENV === "production") {
      reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
  });

  app.get("/v1/ops/readiness", async (_request, reply) => {
    const required = ["DATABASE_URL", "CORS_ORIGIN"];
    const missing = required.filter((key) => !process.env[key]);
    const production = process.env.NODE_ENV === "production";
    const demoAuth = process.env.ALLOW_DEMO_AUTH === "true";
    const ready = missing.length === 0 && (!production || !demoAuth);
    return reply.code(ready ? 200 : 503).send({ ready, production, demoAuthEnabled: demoAuth, missing });
  });
}
