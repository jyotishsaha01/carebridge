# CareBridge local booking flow

This document describes the local-only booking slice added for development. It is not production authentication or payment infrastructure.

## Local stack

1. Start PostgreSQL: `docker compose up -d postgres`
2. Copy `.env.example` to `.env`.
3. Install dependencies: `pnpm install`
4. Generate Prisma client: `pnpm --filter @carebridge/database db:generate`
5. Apply schema: `pnpm --filter @carebridge/database db:push`
6. Seed demo data: `pnpm --filter @carebridge/database db:seed`
7. Start API: `pnpm --filter @carebridge/api dev`
8. Start Patient app in another terminal: `pnpm --filter @carebridge/patient dev`

## Booking API

- `GET /v1/doctors/:slug/availability?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `POST /v1/appointments`

The local appointment endpoint uses a synthetic/demo patient identity header and is deliberately disabled unless `ALLOW_DEMO_AUTH=true`. Replace this mechanism with the approved identity provider before any shared or production environment.

## Security boundary

The demo identity mechanism must never be treated as production authentication. Production requirements include managed identity, MFA as appropriate, server-side authorization, session/token validation, audit logging, rate limiting, and least-privilege access to patient information.
