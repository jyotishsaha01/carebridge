# CareBridge Progress Tracker

## Release status

| Milestone | Status | Notes |
|---|---|---|
| Product blueprint v1.0 | DONE | Phase 1 defined; Phase 2/3 parked |
| v0.1 visual prototype | DONE | Initial concept prototype |
| v0.2 repository foundation | DONE | Monorepo/environment scaffolding |
| Test / QA environment foundation | DONE | `test` and `qa` branches plus test configuration |
| v0.3 Patient Discovery | IN PROGRESS | Patient landing, specialist catalog, doctor profile modal, Smart Cost |

## v0.3 acceptance criteria

- [x] CareBridge branded patient landing page
- [x] Premium responsive design system
- [x] Synthetic specialist catalog
- [x] Specialty filtering
- [x] Doctor profile interaction
- [x] Smart Cost display
- [x] Unit tests for specialist data
- [x] Playwright discovery tests
- [ ] Backend specialist API
- [ ] Real authentication
- [ ] Booking and availability

## Environment policy

Development/test/QA environments use synthetic data only. No real patient health information or production credentials should be committed or used in CI.

## Next milestone

**v0.4 — Booking Foundation**

Availability model → appointment slot selection → booking state machine → payment integration design → notifications.
