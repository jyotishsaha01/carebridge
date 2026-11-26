import type { FastifyInstance, FastifyRequest } from "fastify";
import { isIP } from "node:net";
import { ZodError } from "zod";

const ACCOUNT_CHANGED_RESPONSE = Object.freeze({ error: "Your signed-in account changed. Reload or sign in again.", code: "ACCOUNT_CHANGED" });
export class AccountChangedError extends Error {
  readonly code = ACCOUNT_CHANGED_RESPONSE.code;
  constructor() { super(ACCOUNT_CHANGED_RESPONSE.error); }
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const AUTH_WINDOW_MS = 15 * 60 * 1000;
const AUTH_MAX_REQUESTS = 30;
const MAX_AUTH_SOURCES = 10_000;
const AUTH_CLEANUP_INTERVAL_MS = 60_000;
const RATE_LIMITED_AUTH_PATHS = new Set(["/v1/auth/login", "/v1/auth/signup", "/v1/auth/verify-email", "/v1/auth/resend-verification", "/v1/auth/request-password-reset", "/v1/auth/reset-password"]);

/** Register before routes so validation and transport protections cover every handler. */
export function registerSecurity(app: FastifyInstance, allowedOrigins: string[]) {
  const attempts = new Map<string, { count: number; resetsAt: number }>();
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of attempts) if (entry.resetsAt <= now) attempts.delete(key);
  }, AUTH_CLEANUP_INTERVAL_MS);
  cleanup.unref();
  app.addHook("onClose", async () => clearInterval(cleanup));

  app.addHook("onRequest", async (request, reply) => {
    // Fastify decodes percent-encoded route segments before matching. Security
    // policies must use that matched route, not a bypassable spelling of the URL.
    const path = request.routeOptions.url;
    if (!SAFE_METHODS.has(request.method) && path !== "/v1/payments/webhook") {
      const origin = request.headers.origin;
      // CORS alone does not stop a browser from sending a state-changing request.
      if ((origin && !allowedOrigins.includes(origin)) ||
          (!origin && request.headers["sec-fetch-site"] === "cross-site") ||
          (!origin && request.headers.cookie && process.env.NODE_ENV === "production")) {
        return reply.code(403).send({ error: "Request origin is not allowed" });
      }
    }

    if (request.method === "POST" && RATE_LIMITED_AUTH_PATHS.has(path ?? "")) {
      const now = Date.now();
      const key = request.ip;
      let entry = attempts.get(key);
      if (!entry || entry.resetsAt <= now) {
        // Keep active limits when sources rotate. Evicting an existing bucket
        // would allow the blocked source to retry as if it were new.
        if (!entry && attempts.size >= MAX_AUTH_SOURCES) {
          return reply.header("Retry-After", Math.ceil(AUTH_CLEANUP_INTERVAL_MS / 1000)).code(429).send({ error: "Too many authentication attempts. Please try again later." });
        }
        entry = { count: 0, resetsAt: now + AUTH_WINDOW_MS };
        attempts.set(key, entry);
      }
      entry.count += 1;
      if (entry.count > AUTH_MAX_REQUESTS) {
        reply.header("Retry-After", Math.ceil((entry.resetsAt - now) / 1000));
        return reply.code(429).send({ error: "Too many authentication attempts. Please try again later." });
      }
    }
  });

  app.addHook("onSend", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    if (process.env.NODE_ENV === "production") reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  });

  // Fastify's default 404 handler logs the complete URL, including query tokens.
  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: "Resource not found" }));

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AccountChangedError) return reply.code(409).send(ACCOUNT_CHANGED_RESPONSE);
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: "Invalid request", issues: error.issues.map((issue) => ({ path: issue.path.join("."), field: issue.path.join("."), message: issue.message })) });
    }
    const code = (error as { code?: string }).code;
    if (code === "P2002") return reply.code(409).send({ error: "This resource already exists" });
    if (code === "EEXIST") return reply.code(409).send({ error: "Document content has already been uploaded" });
    if (code === "P2025") return reply.code(404).send({ error: "Resource not found" });
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.code(status).send({ error: status === 413 ? "Request body is too large" : "Invalid request" });
    }
    // Database errors can contain credentials, query parameters and patient data.
    request.log.error({ errorCode: code ?? "INTERNAL_ERROR", requestId: request.id }, "Request failed");
    return reply.code(500).send({ error: "An unexpected error occurred", requestId: request.id });
  });
}

/** Keep patient/resource IDs and attacker-controlled path/query values out of access logs. */
export function serializeRequestForLog(request: FastifyRequest) {
  return { method: request.method, route: request.routeOptions?.url ?? "<unmatched>", remoteAddress: request.ip };
}

/** Only operator-supplied numeric proxy networks may influence request.ip. */
export function parseTrustedProxyCidrs(value?: string): false | string[] {
  if (!value?.trim()) return false;
  const networks = value.split(",").map((network) => network.trim());
  for (const network of networks) {
    const [address, prefix, ...extra] = network.split("/");
    const family = isIP(address);
    if (!family || address.includes("%") || extra.length || (prefix !== undefined && (!/^\d{1,3}$/.test(prefix) || Number(prefix) < 1 || Number(prefix) > (family === 4 ? 32 : 128)))) {
      throw new Error("TRUSTED_PROXY_CIDRS must contain only numeric IP addresses or CIDRs with a nonzero prefix; trust-all values are forbidden");
    }
  }
  return networks;
}
