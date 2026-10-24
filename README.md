# CareBridge

**Global Healthcare. Trusted Care. Smarter Costs.**

CareBridge is a healthcare platform focused on convenient specialist consultations, transparent pricing information, and a structured patient care journey.

## Current build

Phase 1 is the active product scope. Phase 2 (international treatment exploration/care coordination) and Phase 3 (travel, accommodation and broader ecosystem services) are intentionally parked.

The current codebase contains:

- Patient application built with Next.js + TypeScript
- Fastify + TypeScript REST API
- PostgreSQL + Prisma data layer
- Synthetic specialist and availability seed data
- Smart Cost comparison data model and API
- Local appointment availability and demo reservation flow
- Patient / Doctor / Admin role model and RBAC foundation
- Local PostgreSQL Docker Compose setup

## Run locally

```bash
cp .env.example .env
pnpm install

docker compose up -d postgres
pnpm --filter @carebridge/database db:generate
pnpm --filter @carebridge/database db:push
pnpm --filter @carebridge/database db:seed
```

In one terminal:

```bash
pnpm --filter @carebridge/api dev
```

In another terminal, start the Patient app:

```bash
pnpm --filter @carebridge/patient dev -- --port 3000
```

Start the Doctor workspace in a separate terminal:

```bash
pnpm --filter @carebridge/doctor dev -- --port 3001
```

Start the Admin console in another terminal:

```bash
pnpm --filter @carebridge/admin dev -- --port 3002
```

Open these local URLs:

- Patient app: `http://localhost:3000`
- Doctor sign-in: `http://localhost:3001/login`
- Admin sign-in: `http://localhost:3002/login`
- API health check: `http://localhost:4000/health`

The Patient sign-in page links to the Doctor and Admin portals. For non-local environments, set `NEXT_PUBLIC_DOCTOR_PORTAL_URL` and `NEXT_PUBLIC_ADMIN_PORTAL_URL` in the Patient app's build environment to the corresponding portal login URLs. The default links are for local development only.

## Data safety

Local/test/QA use synthetic data only. The demo booking identity is deliberately not production authentication. Do not add real patient health information or production credentials to this repository.

## Repository layout

```text
apps/
  patient/        # Patient experience
  doctor/         # Doctor workspace (next production increment)
  admin/          # Admin console (next production increment)
services/
  api/            # REST API
  worker/         # background jobs (future)
  notifications/  # notification service (future)
packages/
  ui/             # shared UI primitives
  types/          # shared types
  validation/     # shared validation
  api-client/     # shared API client
  config/         # shared configuration
database/
  prisma/         # PostgreSQL schema and seed
docs/
  backend/        # local backend runbooks
  security/       # auth/RBAC boundaries
  project/        # product progress tracking
infrastructure/   # deployment/infrastructure definitions (future)
```

See `docs/project/PROGRESS.md` for the implementation tracker.
