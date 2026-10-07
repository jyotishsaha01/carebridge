# CareBridge local backend development

This slice adds a local PostgreSQL database, Prisma schema/seed data, and the first REST endpoints for Patient discovery.

## Prerequisites

- Node.js 20+
- pnpm 10.15.0
- Docker Desktop

## Start PostgreSQL

```bash
docker compose up -d postgres
```

## Configure environment

```bash
cp .env.example .env
```

## Install dependencies

```bash
pnpm install
```

## Generate Prisma Client and create the local schema

```bash
pnpm --filter @carebridge/api db:generate
pnpm --filter @carebridge/api db:push
pnpm --filter @carebridge/database db:seed
```

The seed data is synthetic/demo data only.

## Start API

```bash
pnpm --filter @carebridge/api dev
```

API: http://localhost:4000

Health check:

```bash
curl http://localhost:4000/health
```

Doctors:

```bash
curl http://localhost:4000/v1/doctors
```

Filter by specialty:

```bash
curl 'http://localhost:4000/v1/doctors?specialty=Cardiology'
```

Single doctor:

```bash
curl http://localhost:4000/v1/doctors/dr-anil-sharma
```

## Architecture

```text
Patient Next.js app (:3000)
        |
        | REST/JSON
        v
CareBridge API (:4000)
        |
        | Prisma
        v
PostgreSQL (:5432)
```

No production secrets, real patient records, payment credentials, or production database connections belong in local/test environments.
