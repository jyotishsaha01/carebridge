# CI baseline

Use pnpm 10.15.0, Node.js 22, the committed `pnpm-lock.yaml`, and `pnpm install --frozen-lockfile`.

The foundation job checks generated production schema freshness, lint, types, unit tests, all production builds, and application/tooling dependencies for high/critical advisories. The integration matrix applies schemas to disposable SQLite and PostgreSQL databases, checks migration drift, and runs clinical, document, support, notification and payment journeys with cross-patient isolation against the compiled API. Security journeys also check account binding and concurrent consent/clinical-start writes. The PostgreSQL job launches a separate production-mode API with synthetic fixtures to verify protected cookies, cross-origin mutation preflights, account binding, unavailable recovery without token mutation, logout, and redacted logs. Its readiness endpoint must remain 503 for missing integrations.

The browser job checks all three applications with deterministic API fixtures and retains failure traces for seven days. The container matrix builds all four deployment images and checks process liveness; this is separate from database/provider readiness. Container execution remains unverified locally where Docker is unavailable.

Builds require explicit HTTPS API and workspace origins; CI uses reserved `.test` hosts and never connects to production. Every environment here uses synthetic data. Dependency changes must update the lockfile and pass the same gates.
