# CareBridge Progress Tracker

## Release status

| Item | Status |
|---|---|
| Product blueprint v1.0 | DONE |
| Phase 1 scope frozen | DONE |
| Phase 2/3 parked | DONE |
| GitHub repository | DONE |
| `develop` branch | DONE |
| `test` branch | DONE |
| `qa` branch | DONE |
| Testing environment policy | DONE |
| Test environment variables template | DONE |
| CI foundation | DONE |
| Patient production UI | NEXT |
| Doctor production UI | NEXT |
| Admin production UI | NEXT |
| Backend/API | NEXT |
| PostgreSQL schema | NEXT |
| Authentication/RBAC | NEXT |

## Branch strategy

- `main`: release-ready baseline.
- `develop`: active integration.
- `test`: shared integration/validation branch.
- `qa`: QA validation branch.
- `feature/*`: isolated implementation work.

## Environment strategy

`local` → `test` → `qa` → `staging` → `production`

Only synthetic data is permitted through `local`, `test` and `qa`.

## Next milestone

**v0.2 — Application Foundation**

Build the Patient, Doctor and Admin application shells, shared design system, API skeleton, authentication foundation and core database schema.
