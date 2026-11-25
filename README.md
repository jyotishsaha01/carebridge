# CareBridge

CareBridge is a patient, doctor, and administration platform for specialist discovery, appointments, clinical records, care coordination, notifications, and support.

This repository can run with synthetic data locally and has deployment tooling for PostgreSQL and three Next.js applications. **It is not yet approved for real patient data.** Email delivery, MFA, encrypted document storage, payment and video providers, and operational/security reviews remain release blockers. See the [hardening and verification report](docs/project/PRODUCTION_HARDENING.md) and [production runbook](docs/deployment/phase13-production-runbook.md).

## Local development

Use Node.js 22 and pnpm 10.15.0. Local development uses SQLite; Docker and PostgreSQL are optional.

```bash
cp .env.example .env
pnpm install --frozen-lockfile
pnpm db:setup
pnpm --filter @carebridge/api dev
```

Start each frontend in a separate terminal:

```bash
pnpm --filter @carebridge/patient dev --port 3000
pnpm --filter @carebridge/doctor dev --port 3001
pnpm --filter @carebridge/admin dev --port 3002
```

Open [Patient](http://localhost:3000), [Doctor](http://localhost:3001), [Admin](http://localhost:3002), and [API health](http://localhost:4000/health).

The patient sign-in page links to the doctor and admin portals. For non-local builds, set `NEXT_PUBLIC_DOCTOR_APP_URL` and `NEXT_PUBLIC_ADMIN_APP_URL` to their HTTPS origins; the app validates these origins before offering navigation. Set `NEXT_PUBLIC_PATIENT_APP_URL` to enable patient sign-in links from the doctor and admin workspaces.

The API development command loads the root `.env`. If an older local `.env` contains a PostgreSQL URL, change it to `DATABASE_URL=file:./dev.db` for the local SQLite client. The path resolves against `database/prisma/schema.prisma`. Database commands accept an exported `DATABASE_URL`, defaulting to this local SQLite file; they do not source the root `.env`.

`pnpm db:setup` generates the SQLite client, creates/updates the schema, and seeds synthetic accounts. It preserves reserved slots on repeated runs. `pnpm db:reset` explicitly deletes local database data. Demo seeding and local database commands refuse production mode.

Seeded synthetic accounts use `CAREBRIDGE_UAT_PASSWORD` or the local-only default documented in `database/prisma/seed.ts`. Set the variable before seeding if you want a different password. No demo credentials belong in production. Registration defaults to patient accounts; development doctor signup creates a pending, inactive profile. Clinical workflows require the correct role and an approved, active doctor profile. Production registration remains unavailable until security email delivery is implemented.

## Validation

The [25 November security review](docs/security/phase12-security-compliance.md#security-review--25-november-2026) records the latest confirmed fixes, dependency results and remaining production-security requirements.

```bash
export NEXT_PUBLIC_API_URL=https://api.example.com
export NEXT_PUBLIC_DOCTOR_APP_URL=https://doctor.example.com
export NEXT_PUBLIC_ADMIN_APP_URL=https://admin.example.com
pnpm check
pnpm --filter @carebridge/patient exec playwright install chromium
pnpm test:e2e
```

Production frontend builds require explicit public HTTPS origins, even when building locally. Replace the example domains with deployment origins for release artifacts. Browser test servers override the API URL with their controlled local fixtures.

CI runs lint, TypeScript, unit tests, production builds, an application and tooling dependency advisory audit, browser regressions, and a compiled-API cross-role integration journey against both SQLite and PostgreSQL. A separate PostgreSQL smoke test exercises production-mode security. Browser regressions use controlled API responses; database integration tests use disposable synthetic data.

## Production preparation

Use [.env.production.example](.env.production.example) as a configuration reference. Frontend `NEXT_PUBLIC_*` values are fixed at build time. Generate the PostgreSQL client before building the API:

```bash
pnpm db:generate:production
pnpm --filter @carebridge/api build
# In a reviewed release job with DATABASE_URL supplied by your secret manager:
pnpm db:deploy:production
pnpm --filter @carebridge/api start
```

Do not use `db:push`, `db:reset`, or demo seeds against production. The initial PostgreSQL migration targets an **empty** database. Existing databases need a reviewed baseline/data migration; SQLite records are not copied automatically.

The runbook includes container commands, topology, probes, rollback, and the remaining integration work. `/health` is a liveness probe. `/v1/ops/readiness` probes database connectivity and reports release blockers; environment attestations cannot enable missing provider implementations.

## Layout

- `apps/patient`, `apps/doctor`, `apps/admin`: Next.js applications.
- `services/api`: Fastify API, authentication, role enforcement, clinical and operational workflows.
- `database/prisma/schema.prisma`: canonical local data model.
- `database/prisma/production`: generated PostgreSQL schema and reviewed migrations.
- `infrastructure`: API and frontend Dockerfiles.
- `docs`: architecture, product scope, security, and release notes.

Booking, checkout, and video retain provider-neutral/demo foundations. Phase 2/3 travel and international coordination services remain outside the active product scope. Local, CI, QA, and staging use synthetic data only.
