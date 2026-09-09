# CareBridge Progress Tracker

## Phase 1 MVP
Status values: NOT STARTED | IN PROGRESS | BLOCKED | IN REVIEW | DONE | DEFERRED

| ID | Workstream | Deliverable | Status |
|---|---|---|---|
| P01 | Product | Master blueprint | DONE |
| P02 | Product | Phase 1 scope freeze | DONE |
| P03 | Product | Phase 2/3 parked | DONE |
| E01 | Engineering | GitHub repo | DONE |
| E02 | Engineering | Branch strategy | DONE |
| E03 | Engineering | Test/QA environment foundation | DONE |
| E04 | Engineering | Monorepo scaffolding | IN PROGRESS |
| E05 | Engineering | Shared design system | IN PROGRESS |
| E06 | Engineering | API foundation | NOT STARTED |
| E07 | Engineering | PostgreSQL schema | NOT STARTED |
| E08 | Engineering | Auth + RBAC | NOT STARTED |
| PAT01 | Patient | Landing page | IN PROGRESS |
| PAT02 | Patient | Login/signup | NOT STARTED |
| PAT03 | Patient | Dashboard | NOT STARTED |
| PAT04 | Patient | Specialist discovery | IN PROGRESS |
| PAT05 | Patient | Doctor profile | IN PROGRESS |
| PAT06 | Patient | Smart Cost | IN PROGRESS |
| PAT07 | Patient | Booking | NOT STARTED |
| PAT08 | Patient | Payment | NOT STARTED |
| PAT09 | Patient | Medical intake | NOT STARTED |
| PAT10 | Patient | Video consultation | NOT STARTED |
| DOC01 | Doctor | Doctor onboarding | NOT STARTED |
| DOC02 | Doctor | Verification workflow | NOT STARTED |
| DOC03 | Doctor | Dashboard | IN PROGRESS |
| DOC04 | Doctor | Patient workspace | NOT STARTED |
| DOC05 | Doctor | Consultation workspace | NOT STARTED |
| DOC06 | Doctor | Notes/prescription | NOT STARTED |
| ADM01 | Admin | Admin login | NOT STARTED |
| ADM02 | Admin | Provider verification | IN PROGRESS |
| ADM03 | Admin | Operations dashboard | IN PROGRESS |
| QA01 | QA | Unit tests | IN PROGRESS |
| QA02 | QA | Integration tests | NOT STARTED |
| QA03 | QA | E2E patient journey | NOT STARTED |
| SEC01 | Security | Threat model | NOT STARTED |
| SEC02 | Security | Authorization testing | NOT STARTED |
| REL01 | Release | Staging readiness | NOT STARTED |
| REL02 | Release | Pilot readiness | NOT STARTED |

## Environment flow
feature/* -> develop -> test -> qa -> staging -> main

## Test-data policy
Use synthetic/demo patient and provider data only. Never use real patient health information in development, QA, staging or CI.

## Current build target
v0.2 Foundation + Patient discovery slice. Next engineering focus: API/database/auth foundation, then connect specialist/doctor/cost data to the UI.
