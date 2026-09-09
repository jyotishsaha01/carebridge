# CareBridge Progress Tracker

## Release status

| Milestone | Status | Notes |
|---|---|---|
| Product blueprint v1.0 | DONE | Phase 1 defined; Phase 2/3 parked |
| v0.1 visual prototype | DONE | Initial concept prototype |
| v0.2 repository foundation | DONE | Monorepo/environment scaffolding |
| Test / QA environment foundation | DONE | `test` and `qa` branches plus test configuration |
| v0.3 Patient Discovery | DONE | Patient discovery UI now consumes the local API |
| v0.4 API + PostgreSQL foundation | DONE | Fastify, Prisma, PostgreSQL, seed data and discovery endpoints |
| v0.5 Availability + demo booking | DONE | Seeded slots, slot API and local reservation flow |
| v0.6 Medical intake foundation | IN PROGRESS | Consent-aware intake API and medical-document metadata model |
| Authentication / RBAC | FOUNDATION | Role model + server-side guard; production identity provider still required |

## Current acceptance criteria

- [x] CareBridge branded patient landing page
- [x] Premium responsive design system
- [x] Specialist discovery from PostgreSQL through API
- [x] Specialty filtering through API
- [x] Doctor profile data from API
- [x] Smart Cost values stored in database
- [x] Local PostgreSQL Docker setup
- [x] Seeded synthetic doctors and availability slots
- [x] Availability endpoint
- [x] Local demo appointment reservation
- [x] User roles for Patient / Doctor / Admin
- [x] Reusable API RBAC guard foundation
- [x] Medical intake schema with consent state
- [x] Medical intake GET/PUT API
- [x] Medical document metadata model
- [ ] Production authentication / session validation
- [ ] Production appointment/payment workflow
- [ ] Secure binary document storage/upload
- [ ] Video consultation
- [ ] Doctor workspace
- [ ] Admin workspace

## Environment policy

Development/test/QA environments use synthetic data only. No real patient health information or production credentials should be committed or used in CI.

## Next milestone

**v0.7 — Clinical workflow foundation**

Secure document storage → consultation record → doctor assessment/notes → prescription model → consultation summary → follow-up events.
