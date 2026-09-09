# Phase 13 — Production Deployment Runbook

## Environments
- Development: local development and synthetic data only.
- Test: automated tests and disposable seeded data.
- Staging: production-like infrastructure, synthetic data, release candidate validation.
- Production: approved release only; real patient data only after security/compliance gate.

## Release sequence
1. Build immutable application artifacts.
2. Run lint/typecheck/unit/integration/E2E/security gates.
3. Apply database migrations using a reviewed migration job.
4. Deploy API and web applications.
5. Run `/health` and critical smoke journeys.
6. Verify logs, metrics and error tracking.
7. Enable traffic gradually where infrastructure supports it.

## Production requirements
- Managed PostgreSQL with automated backups and tested restore.
- Managed object storage for medical documents with private buckets and signed access.
- TLS/HTTPS and secure DNS.
- Secret manager for DATABASE_URL, auth keys and provider credentials.
- Centralized logs with PHI minimization/redaction.
- Error tracking and service metrics.
- Uptime/health monitoring.
- Documented rollback procedure.
- Disaster recovery objectives and restore drills.

## Environment variables
Keep environment-specific configuration outside source control. Use separate credentials and databases for dev/test/staging/production.

## Go-live blockers
Do not launch with real patient data until booking/payment/video decisions, HIPAA/privacy review, BAAs where required, production object storage, authentication hardening, audit controls, backup/restore verification and security testing are complete.
