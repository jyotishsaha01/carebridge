# CareBridge databases

The canonical model is `prisma/schema.prisma`. SQLite is the local default. `DATABASE_URL=file:./dev.db` resolves against that schema; use an absolute `file:/...` path for isolated test databases.

```bash
pnpm db:setup
# Destructive, local only:
pnpm db:reset
```

Local commands generate the SQLite client, apply the schema with Prisma `db push`, and optionally seed synthetic data. Seeds are prohibited in production. Re-seeding does not make booked availability available again.

## PostgreSQL

`pnpm db:schema:prepare` generates `prisma/production/schema.prisma` from the canonical model, replacing only the database provider. Commit the generated schema with every model change. `pnpm db:schema:check` rejects drift. Always add/review a PostgreSQL migration for model changes; regeneration alone does not migrate a database.

```bash
pnpm db:generate:production
# DATABASE_URL must point to PostgreSQL for these commands:
pnpm db:deploy:production
pnpm db:status:production
pnpm db:drift:production
```

The production migrations live in `prisma/production/migrations`. The initial migration includes the complete model, including payment tables; requests never create tables at runtime. This migration is for a fresh database. Existing databases require a separately reviewed baseline and data migration. The older partial SQL files in `prisma/migrations` are historical and are not used by the production deployment commands.

Prisma generates one active client per checkout. Run `pnpm db:generate` to return to SQLite after testing PostgreSQL. Deploy builds must generate the correct client explicitly. See the [production runbook](../docs/deployment/phase13-production-runbook.md).
