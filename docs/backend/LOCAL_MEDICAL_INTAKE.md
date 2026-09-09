# Local medical intake

This slice is for local/demo development only. Do not enter real patient health information.

## Start PostgreSQL

```bash
docker compose up -d postgres
```

## Configure local environment

Copy `.env.example` to `.env` at the repository root. The example enables `ALLOW_DEMO_AUTH=true` only for local development.

## Prepare the database

```bash
pnpm install
pnpm --filter @carebridge/database db:generate
pnpm --filter @carebridge/database db:push
pnpm --filter @carebridge/database db:seed
```

## Start the API

```bash
pnpm --filter @carebridge/api dev
```

The API runs on `http://localhost:4000`.

## Intake API

For a local demo appointment created through the booking flow:

```text
GET /v1/appointments/:appointmentId/intake
PUT /v1/appointments/:appointmentId/intake
```

The write payload accepts reason for visit, symptoms, allergies, medications, medical history, surgeries, family history, and `consentToConsult`.

A completed intake requires explicit `consentToConsult: true`. The API records the consent timestamp and marks the intake `COMPLETED`.

## Production note

Production identity must come from the approved authentication provider/session rather than the local demo identity mechanism. Medical document records currently contain metadata (`storageKey`, type and size); binary file storage and secure download authorization are separate implementation work.
