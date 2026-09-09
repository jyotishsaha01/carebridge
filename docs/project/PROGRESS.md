# CareBridge Progress Tracker

## Release status

| Milestone | Status | Notes |
|---|---|---|
| Product blueprint v1.0 | DONE | Phase 1 defined; Phase 2/3 intentionally parked for later |
| v0.1 visual prototype | DONE | Initial CareBridge concept |
| v0.2 repository + environments | DONE | Monorepo, develop/test/qa and CI foundation |
| v0.3 Patient Discovery | DONE | PostgreSQL-backed specialist discovery and Smart Cost display |
| v0.4 API + PostgreSQL | DONE | Fastify, Prisma, seed data and discovery APIs |
| v0.5 Availability + booking | DONE | Availability API and transactional local booking |
| v0.6 Medical intake | DONE | Consent-aware intake and document metadata model |
| v0.7 Clinical workflow | DONE | Consultation, clinical notes, prescription and follow-up foundations |
| v0.8 Secure document boundary | DONE | Storage abstraction and upload-intent architecture; production storage provider pending |
| v0.9 Identity + sessions | DONE | Patient auth, hashed passwords, opaque sessions and role enforcement |
| v1.0 Patient dashboard | DONE | Authenticated dashboard experience |
| v1.1 Patient dashboard data | DONE | Patient-scoped appointment/clinical data APIs |
| v1.2–v1.3 Video | FOUNDATION | Provider-neutral video/session boundary; intentionally parked |
| v1.4 Payments | FOUNDATION | Provider-neutral payment architecture; intentionally parked |
| v1.5 Doctor platform | FOUNDATION | Doctor operations and clinical workspace foundation |
| v1.6 Admin platform | FOUNDATION | Admin operations, verification and audit operations |
| v1.7 Care journey | IMPLEMENTED | Care plans, care tasks and treatment/procedure coordination request foundation |
| v2.0 Production readiness | FOUNDATION | Security, secrets, encryption, monitoring, recovery and compliance gates |
| v2.1 Account security + Admin UI | IMPLEMENTED | Email verification/recovery, audit trail, session controls and usable Admin console |
| v2.2 Payments + Webhooks | IMPLEMENTED | Provider-neutral payment intent, lifecycle, webhook signature boundary and local/test idempotency |
| v2.3 Patient Checkout | IN PROGRESS | PostgreSQL payment persistence, secure checkout handoff and patient payment history; intentionally parked for now |
| v2.4 Platform Completion | IMPLEMENTED | Notifications, Care Hub, care requests, care plans/tasks, admin command center and operational analytics |

## Current acceptance criteria

- [x] CareBridge branded patient landing page
- [x] Premium responsive design system with motion and reduced-motion support
- [x] Specialist discovery from PostgreSQL through API
- [x] Specialty filtering through API
- [x] Doctor profile data from API
- [x] Smart Cost values stored in database
- [x] Local PostgreSQL Docker setup
- [x] Seeded synthetic doctors and availability slots
- [x] Transaction-safe local appointment reservation
- [x] Patient / Doctor / Admin role model
- [x] Server-side RBAC foundation
- [x] Medical intake GET/PUT API with consent state
- [x] Consultation, clinical-note, prescription and follow-up models/APIs
- [x] Provider-neutral video and payment boundaries
- [x] Patient dashboard and patient-scoped data APIs
- [x] Identity/session foundation with HttpOnly session cookie
- [x] Email verification and password-reset token lifecycle
- [x] Session listing/revocation
- [x] Sensitive authentication audit events
- [x] Admin metrics, doctor verification and audit-log UI/API foundation
- [x] Payment intent contract with idempotency key
- [x] Payment lifecycle states
- [x] Webhook signature verification boundary
- [x] Duplicate webhook event protection in local/test processor
- [x] Payment intents persisted in PostgreSQL
- [x] Processed webhook IDs persisted in PostgreSQL
- [x] Patient checkout/status UI foundation
- [x] Patient payment history UI
- [x] Patient notification center
- [x] Notification read/unread APIs
- [x] Patient Care Hub
- [x] Care plan and care-task APIs
- [x] Care request workflow for diagnostic/medication/procedure/surgery coordination
- [x] Admin care-request queue
- [x] Admin operational analytics
- [x] Patient dashboard connected to live patient counts and notifications
- [ ] Provider-specific production payment integration and reconciliation
- [ ] Production email/SMS provider and delivery verification
- [ ] Production identity provider / MFA policy
- [ ] HIPAA/privacy/legal review and signed vendor agreements where required
- [ ] Production encrypted object storage, malware scanning and access-control validation
- [ ] Production video provider provisioning and security review
- [ ] Security assessment / penetration testing
- [ ] Backup/restore rehearsal and disaster-recovery validation
- [ ] Production medication fulfillment, pharmacy partnerships and jurisdictional checks
- [ ] Hospital/procedure coordination contracts and cross-border care operations

## Environment policy

Development, test and QA environments use synthetic data only. No real patient health information or production credentials should be committed or used in CI.

## Current development direction

**Booking, payment checkout and video are intentionally parked.** Continue building the remaining platform around them: doctor operations, care coordination, notifications, production storage, compliance/security controls, analytics, support and deployment readiness.
