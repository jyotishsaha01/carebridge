# CareBridge local database

CareBridge now uses SQLite + Prisma for local development, so the Patient, Doctor and Admin apps can run without an external database service.

## Setup

From the repository root:

```bash
pnpm install
pnpm db:setup
```

This creates `database/prisma/dev.db`, applies the Prisma schema, and seeds demo specialists, availability slots, and a demo patient.

## Run the API

```bash
pnpm --filter @carebridge/api dev
```

The API defaults to port 4000 and uses the local SQLite database.

## Reset local data

```bash
pnpm db:reset
```

This is development/demo data only. Do not put real patient information into the local database.

## Later production migration

Prisma remains the database abstraction, so the local SQLite implementation can later be migrated to PostgreSQL/cloud infrastructure after production security, privacy, HIPAA, backup, and deployment requirements are completed.
