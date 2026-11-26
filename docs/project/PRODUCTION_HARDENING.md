# Production preparation — 18 November 2026

For the later security review, confirmed fixes, and updated audit/test results, see [25 November security review](../security/phase12-security-compliance.md#security-review--25-november-2026). The results below are the earlier preparation snapshot, including the dependency findings that were subsequently resolved.

The application has completed this hardening and deployment-preparation pass. A real-patient launch remains gated by the integrations and operational work in the [production runbook](../deployment/phase13-production-runbook.md). No hosting or provider accounts have been selected, and no deployment was performed.

## Changes

- Fixed patient checkout loading/recovery, unavailable payment links, stale specialist requests, booking errors, email verification links, modal keyboard behavior, and failed-request handling across patient pages.
- Added role-gated doctor/admin workspaces, session handling, actionable errors, clinical draft isolation, complete prescription preservation, and a guard against completing encounters with unsaved clinical edits.
- Hardened API validation, origin checks, authentication rate limits, password hashing, email-verification enforcement, one-time token use, logging, and sensitive-response caching.
- Tightened treating-doctor/patient authorization, intake audit transactions, booking validation, cancelled-encounter writes, payment ownership/idempotency, and signed demo webhook processing.
- Added document content checks and blocked local plaintext document storage in production. Missing email, payment, storage, and video adapters cannot pretend to succeed in production.
- Restricted notification-stream origins, resource use and lifetime; revalidated sessions; and made shutdown close open streams.
- Upgraded vulnerable direct dependencies and patched affected transitives. Added explicit HTTPS build configuration, security headers, standalone web output, and route error/loading/404 fallbacks.
- Added a generated PostgreSQL schema, full initial migration, drift checks, safe local database commands, production seed/reset guards, API/web containers, a separate migration image, and CI gates.

## Verified results

| Check | Result |
| --- | --- |
| Lint and TypeScript across the workspace | Pass |
| Unit/regression tests | 58 pass: API 36, patient 8, doctor 8, admin 6 |
| Combined Chromium browser command | 22 pass: patient 14, doctor 5, admin 3 |
| Production compilation | API and all three Next.js applications pass |
| Responsive/keyboard checks | Desktop and mobile discovery/dialog layouts, focus restoration and role isolation pass |
| Fresh PostgreSQL migration | Applies successfully; no schema drift |
| Compiled API on SQLite and PostgreSQL | Clinical, intake, documents, support, notifications and payment journeys pass, including cross-patient isolation |
| Production-mode API smoke | Live PostgreSQL probe, Secure/HttpOnly/SameSite cookie flags, trusted origins, no-store responses, validation and blocked providers pass |
| Local database safeguards | Fresh-file setup works; re-seeding preserves reserved slots; production reset/demo seeding rejected |
| Standalone API package | Health and a real SQLite query pass in an isolated artifact; Prisma CLI, TypeScript, tsx and Vitest are absent |
| Dependency lockfile and generated schema | Frozen lockfile and schema-freshness checks pass |
| Production dependency advisory audit | Zero known advisories reported |

Local checks ran on Node.js 24.14.0. Deployment images and CI target Node.js 22. Browser tests use controlled API responses; integration tests use disposable synthetic databases. The developer's existing local database was not used for integration testing. The active Prisma client was restored to SQLite, and the legacy local-demo URL in the root `.env` was corrected to match it.

## Limits and remaining work

Docker is unavailable on the local machine, so container images have not been built or run locally. CI now includes image builds, process-liveness checks and an offline migration-tooling check; those remote CI jobs have not been executed in this session. The portable API package and standalone web artifact paths were verified locally.

The full development-tooling audit still reports [the unpatched picomatch repeated-extglob advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) in two installed development dependency versions. The application does not accept user-supplied glob patterns. Keep repository/tool configuration trusted and track the upstream fix. Those development tools are excluded from the API runtime package. The production dependency audit is separate and reports zero advisories. The available minimatch tooling fix was applied and rechecked.

Before launch, select and implement email, identity/MFA, encrypted document storage, payment and video providers; establish audited initial-account provisioning; configure trusted proxy handling and shared ingress rate limits; connect monitoring; and complete backup/restore, security and privacy approvals. Live notification fanout remains per process and needs a shared transport before scaling API replicas. The production readiness endpoint intentionally returns 503 while these release requirements remain unmet.

See the [deployment runbook](../deployment/phase13-production-runbook.md), [production configuration example](../../.env.production.example), and [database guide](../../database/README.md) for release commands and remaining integration details.
