# Local backend development

Use Node.js 22 and pnpm 10.15.0. The local backend uses SQLite and synthetic data; PostgreSQL is the deployment target, not a local prerequisite.

```bash
cp .env.example .env
pnpm install --frozen-lockfile
pnpm db:setup
pnpm --filter @carebridge/api dev
```

The development API command loads the root `.env`. The local value is `DATABASE_URL=file:./dev.db`, resolved against `database/prisma/schema.prisma`. If your older `.env` still points at PostgreSQL, update it or explicitly generate/use the PostgreSQL client. Database scripts accept exported variables and do not source the root `.env`.

The API listens on port4000 by default. Check `/health`, `/v1/ops/readiness`, `/v1/doctors`, `/v1/specialties`, and `/v1/doctors/dr-anil-sharma`.

```bash
pnpm --filter @carebridge/patient dev --port 3000
pnpm --filter @carebridge/doctor dev --port 3001
pnpm --filter @carebridge/admin dev --port 3002
```

`CORS_ORIGIN` accepts a comma-separated exact origin list. Frontend development defaults to `http://localhost:4000`; a frontend-specific `.env.local` or shell variable can override it. Production builds require explicit HTTPS origins.

Use `pnpm db:reset` only when you intend to delete local demo data. To test production migrations use a disposable PostgreSQL database and the commands in the [database guide](../../database/README.md). The optional `docker-compose.yml` PostgreSQL service is for that purpose. Never use real patient records or production credentials locally.
