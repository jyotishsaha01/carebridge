# CareBridge production deployment runbook

## Current release decision

Deployment artifacts and automated checks do not yet authorize a real-patient launch. The API readiness endpoint deliberately reports unavailable email delivery, MFA, encrypted object storage, payments, and video integrations as false. Setting environment flags cannot turn these placeholders into working providers. The UI must describe unavailable services accurately.

No hosting/provider accounts have been selected. An S3-compatible storage adapter and external malware-scanner boundary are included, but their real infrastructure and operational behavior remain unverified. The encrypted-storage release gate therefore stays false. Use this runbook to prepare a synthetic-data staging environment and finish the integrations below before enabling patient traffic.

## Topology and configuration

Deploy four services behind HTTPS: patient web, doctor web, admin web, and API. Use subdomains of the same registered domain (for example `app.example.com`, `doctor.example.com`, `admin.example.com`, `api.example.com`) so browser session-cookie behavior remains consistent. The API issues `__Host-carebridge_session` with Path=/, HttpOnly, Secure, SameSite=Lax and no Domain attribute in production. Older production session cookies are ignored; users must sign in again after this change. Development/test retains `carebridge_session`. Frontends send credentials to the API; configure `CORS_ORIGIN` as an exact comma-separated list of the three HTTPS frontend origins. Different unrelated domains need a separately designed cookie/CSRF strategy.

Use managed PostgreSQL with TLS, a private network, backups, restore verification, least-privilege runtime credentials, and separate release-job credentials. The API refuses to start in production with a missing, malformed or non-PostgreSQL database URL. This validation does not enforce the provider's TLS settings; configure and verify transport encryption separately. Database schema changes run once per release with the migration identity; application requests do not execute DDL. Keep application replicas on the same version during release validation.

Use Node.js 22 and pnpm 10.15.0. Supply secrets from the hosting provider's secret manager. `.env.production.example` lists configuration names and placeholders. Do not bake database credentials into images or browser variables. The `NEXT_PUBLIC_*` variables contain public origins only and are embedded at build time; changing runtime variables does not rewrite a built frontend.

Set `TRUSTED_PROXY_CIDRS` only to the exact numeric IPs or CIDRs of the actual ingress proxies. It is unset by default, so forwarded client-IP headers are ignored. Hostnames, `true`, wildcards, and zero-prefix trust-all networks are rejected. Validate the forwarding chain in staging and keep the API unreachable except through the intended ingress. Shared ingress rate limiting is still required across replicas. A full in-process auth-source table rejects new sources with 429 while preserving existing blocked buckets; it is a bounded fallback, not a distributed abuse-control service.

Before enabling a real payment provider, set the patient build variable `NEXT_PUBLIC_PAYMENT_CHECKOUT_ORIGINS` to a comma-separated list of its approved exact HTTPS origins. Empty disables checkout navigation. Supply it as a Docker `--build-arg` when building the patient image. Checkout links with credentials or an unapproved origin are rejected. Account email links should use a `#token=` fragment to avoid sending bearer tokens in HTTP request URLs; the UI also accepts legacy query links and removes their credentials from the visible URL after capture. Keep web ingress logs free of legacy query tokens.

## Build and migration sequence

From a clean checkout, install with the committed lockfile:

```bash
pnpm install --frozen-lockfile
pnpm db:generate
NEXT_PUBLIC_API_URL=https://api.example.com \
NEXT_PUBLIC_DOCTOR_APP_URL=https://doctor.example.com \
NEXT_PUBLIC_ADMIN_APP_URL=https://admin.example.com \
pnpm check
pnpm --filter @carebridge/patient exec playwright install chromium
pnpm test:e2e
pnpm audit --audit-level high
```

For the API release artifact, generate the PostgreSQL client before compiling:

```bash
pnpm db:generate:production
pnpm --filter @carebridge/api build
```

The production schema is generated from the canonical local model. Commit `database/prisma/production/schema.prisma` and reviewed migration SQL together. `pnpm db:schema:check` detects model drift; it does not prove a missing migration exists. CI applies the full migration history to a clean PostgreSQL database and runs the compiled API against it.

With `DATABASE_URL` supplied to a reviewed release job:

```bash
pnpm db:deploy:production
pnpm db:status:production
pnpm db:drift:production
```

The initial migration is for an empty database. Existing deployments need a reviewed baseline and data-transfer plan; it does not import local SQLite data. Do not use `db:push`, `db:reset`, or `db:seed` in production. To return a developer checkout to SQLite, run `pnpm db:generate`.

## Containers

Build from the repository root. The web container runs the Next.js standalone server as an unprivileged user. Build one image per workspace:

```bash
docker build -f infrastructure/Dockerfile.api -t carebridge-api:RELEASE .
docker build --target migrations -f infrastructure/Dockerfile.api -t carebridge-api-migrations:RELEASE .

docker build -f infrastructure/Dockerfile.web -t carebridge-patient:RELEASE \
  --build-arg APP=patient \
  --build-arg NEXT_PUBLIC_API_URL=https://api.example.com \
  --build-arg NEXT_PUBLIC_DOCTOR_APP_URL=https://doctor.example.com \
  --build-arg NEXT_PUBLIC_ADMIN_APP_URL=https://admin.example.com .

docker build -f infrastructure/Dockerfile.web -t carebridge-doctor:RELEASE \
  --build-arg APP=doctor --build-arg NEXT_PUBLIC_API_URL=https://api.example.com \
  --build-arg NEXT_PUBLIC_PATIENT_APP_URL=https://app.example.com .

docker build -f infrastructure/Dockerfile.web -t carebridge-admin:RELEASE \
  --build-arg APP=admin --build-arg NEXT_PUBLIC_API_URL=https://api.example.com \
  --build-arg NEXT_PUBLIC_PATIENT_APP_URL=https://app.example.com .
```

API listens on port 4000 and web images on port 3000. Both accept a hosting platform's `PORT` override. Supply `NODE_ENV=production`, `DATABASE_URL`, `CORS_ORIGIN`, and `ALLOW_DEMO_AUTH=false` to the API at runtime. Keep health/readiness paths accessible to the orchestrator. Use immutable image tags/digests and scan images in the hosting pipeline.

The API runtime contains compiled code, production dependencies, and the generated Prisma client; it excludes TypeScript, Vitest, tsx and the Prisma CLI. Use the separate `migrations` image for a one-off release job with migration credentials. Its default command is `pnpm db:deploy:production`. With `DATABASE_URL` injected by the secret manager and network access to the managed database, run `docker run --rm -e DATABASE_URL carebridge-api-migrations:RELEASE`. Never give the live API migration credentials. CI also checks that the migration image can execute its cached pnpm/Prisma tooling without network access.

## Health, traffic, and operations

- `/health` is process liveness; a successful response does not prove database or provider health.
- `/v1/ops/readiness` probes the real database and reports release requirements. Production database readiness requires an actual PostgreSQL connection. Until integrations are implemented this endpoint returns 503, and production ingress must keep patient traffic disabled.
- Verify login/logout, wrong-role rejection, patient record isolation, doctor clinical records, support replies, and notification delivery in synthetic staging before each release.
- Place a shared rate limiter/WAF at the API ingress. The in-process authentication limiter is bounded but is per replica; it is not an organization-wide abuse control. Configure `TRUSTED_PROXY_CIDRS` for the actual ingress so clients do not share the proxy's IP bucket. Unconfigured or untrusted proxies cannot supply a client IP; never enable blanket trust for forwarded headers.
- Live notification fanout currently runs inside one API process. Use a single API replica for synthetic staging or implement a shared notification transport before scaling; notification records remain database-backed.
- Keep access logs free of cookies, authorization headers, reset/verification tokens, request bodies, and PHI. Connect real error/latency/availability monitoring and alert routing; the presence of `OBSERVABILITY_ENDPOINT` alone does not prove delivery.
- Restrict application/database/network access, define retention and deletion procedures, rotate secrets, and keep encrypted backups. Test restore into an isolated environment and record results.

## Remaining implementation and launch work

| Area | Required work before enabling it |
| --- | --- |
| Email | Select and implement a transactional provider; verification/recovery links, retry handling, delivery monitoring, and tested account recovery. Production signup, reset requests and verification resend return 503 before account lookup/token mutation while the delivery adapter is unavailable. |
| Identity/MFA | Implement the chosen MFA/identity policy, enrollment/recovery and privileged-access controls. An environment flag is insufficient. |
| Clinical consent/corrections | Implement and approve the formal consent-withdrawal and audit-preserving clinical-correction workflows. The application hides unsubmitted intake, requires submitted consultation consent, and prevents destructive rewrites once care begins; the current correction response directs users to their care team. |
| Initial access | Design and verify an audited operator-controlled first-admin and doctor provisioning workflow. A fresh migration creates no accounts; production demo seeding and registration are disabled. |
| Medical documents | Provision and validate the included S3-compatible storage and external scanner adapters: private bucket/IAM, encryption, authorization-bound access, malware verdicts, retention/deletion and failure recovery. Configure the `STORAGE_*` and `MALWARE_SCANNER_*` values in `.env.production.example` through the secret manager. The API returns 503 for unconfigured production storage; explicit S3 selection requires complete validated settings. Local plaintext storage is blocked in production. |
| Payments | Implement a real provider, raw-body signature verification as required by that provider, sandbox end-to-end validation, reconciliation, refunds, and monitoring. The demo provider is blocked in production. |
| Video | Provision a provider and implement short-lived participant authorization and session lifecycle. Placeholder join links must stay unavailable. |
| Observability | Connect metrics, redacted error tracking, alerts, dashboards, and on-call ownership. |
| Database/recovery | Provision managed PostgreSQL/TLS, runtime/migration roles, backups, restore rehearsal, capacity and migration validation. |
| Security/privacy | Complete the repository's security, privacy/legal and vendor review requirements, independent assessment, and operational approval before real patient data. |

These are concrete project dependencies, not a claim of legal or healthcare compliance. Do not mark launch approved based only on passing software tests.

## Rollback

Keep the previous image digest and configuration revision. Prefer additive schema changes that support both the current and previous application versions. On a failed release, disable ingress, restore the prior application images, and verify health, login, patient isolation and notification behavior. Do not automatically reverse database migrations. If a migration or data change cannot support the previous app, follow the reviewed recovery plan and restore a verified backup into a separate database before changing traffic. Record incident ownership and recovery objectives before launch.
