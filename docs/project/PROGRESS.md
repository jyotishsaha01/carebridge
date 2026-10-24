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
- [x] Support request creation, status updates and admin queue
- [x] Threaded support messages with patient/admin authorization checks
- [x] Real-time notifications for support request creation, replies and status updates
- [ ] Provider-specific production payment integration and reconciliation
- [ ] Production email/SMS provider and delivery verification
- [ ] Production identity provider / MFA policy
- [ ] HIPAA/privacy/legal review and signed vendor agreements where required
- [ ] Production encrypted object storage, malware scanning and access-control validation
- [ ] Support attachments and escalation/SLA workflow
- [ ] Production video provider provisioning and security review
- [ ] Security assessment / penetration testing
- [ ] Backup/restore rehearsal and disaster-recovery validation
- [ ] Production medication fulfillment, pharmacy partnerships and jurisdictional checks
- [ ] Hospital/procedure coordination contracts and cross-border care operations


## Pending work stream 8–20 — execution log (2026-10-24)

This section separates code already present from work that still needs evidence. “Implemented” means a code foundation exists; it does not mean production readiness or manual acceptance has passed.

| Item | Workstream | Current status | Work done / next gate |
|---:|---|---|---|
| 8 | Real-time notifications | IMPLEMENTED; acceptance pending | Persisted notification center, read/unread APIs, event stream and cross-role notification flows exist. Run live UI checks for reconnect, unread counts and failure states. |
| 9 | Doctor Portal | HARDENING IN PROGRESS | API-backed queue and consultation/note/prescription/follow-up actions exist. Removed the hard-coded demo patient fallback so failed/unauthorized API calls show a clear error and retry instead of sample patient data. CI and browser verification remain. |
| 10 | Doctor onboarding | FOUNDATION | License/jurisdiction and credential review workflow exist. Verify validation, duplicate submission, file-reference disclaimer and approval/rejection refresh in browser. |
| 11 | Admin Portal | FOUNDATION; acceptance pending | Admin overview, doctor verification and audit trail exist. Run role-denial, API-failure, approve/reject and audit persistence checks. |
| 12 | Patient Profile | IMPLEMENTED; acceptance pending | Profile/session APIs and patient profile UI exist. Verify persistence, validation, notification preference rollback and session revocation in browser. |
| 13 | Production document storage | NOT PRODUCTION READY | API upload validation, ownership isolation and local storage prototype are covered by regression additions. Next: encrypted object storage, short-lived access, malware scanning, retention/deletion policy and provider configuration. |
| 14 | Support system | IMPLEMENTED; acceptance pending | Ticket creation, admin status updates, threaded replies and live notifications exist. Next: verify error states, attachments and escalation/SLA workflow. |
| 15 | International price comparison | DEMO FOUNDATION ONLY | Smart Cost model/API exists, but seeded comparisons are illustrative. Do not present as verified real-world savings until approved data sources, currencies, exchange-rate timing, inclusions and methodology are defined. |
| 16 | Public landing website | IMPLEMENTED; acceptance pending | Branded landing and specialist discovery exist. Verify responsive behavior, navigation, authentication return paths and truthful price disclaimers. |
| 17 | UI/accessibility | NOT SIGNED OFF | Responsive styling and reduced-motion support exist. Keyboard, screen-reader, contrast, focus, zoom and mobile testing still required. |
| 18 | End-to-end regression | IN PROGRESS | Synthetic API UAT now covers cross-role boundaries, notifications, clinical workflow, support and document security. Latest commits need CI runs and execution against a seeded test database; browser suite remains. |
| 19 | Security/compliance | PARTIAL; NOT PRODUCTION READY | RBAC, sessions, audit events and targeted input/access hardening exist. Independent penetration test, threat model, privacy/legal review, MFA/identity policy and vendor agreements remain. |
| 20 | Deployment/production readiness | NOT SIGNED OFF | Local Docker and CI foundations exist. Still required: environment/secret review, monitoring/alerting, backup restore rehearsal, disaster recovery, dependency/security scans and staged release runbook. |

### Work log — latest changes

- Doctor workspace no longer falls back to a hard-coded sample patient when the API is unavailable or denies access; it now displays loading, authorization/error, empty, and retry states.
- Document UAT has a second synthetic patient and checks cross-patient listing, metadata, content, and appointment ownership.
- Cross-role UAT includes signed-out and wrong-role checks for patient, doctor, and admin endpoints.
- These commits are pushed on the relevant open pull-request branches. CI has not reported results for the newest commits, and no browser/manual acceptance is claimed.

### Next work to execute

1. Get CI green for the latest commits and run the API UAT against a migrated, seeded test database.
2. Finish Doctor/Admin/Patient browser acceptance and accessible keyboard/focus checks.
3. Replace the local document-storage prototype with a configured encrypted object-storage provider and malware-scanning flow.
4. Define approved international comparison data and disclaimers before presenting savings as factual.
5. Complete production security, privacy/legal, monitoring, backup/restore and release-readiness gates.

Payments and video provider integrations remain intentionally parked as previously decided; production payment/video provisioning must not be marked done until that scope is resumed.

## Environment policy

Development, test and QA environments use synthetic data only. No real patient health information or production credentials should be committed or used in CI.

## Current development direction

**Booking, payment checkout and video are intentionally parked.** Continue building the remaining platform around them: doctor operations, care coordination, notifications, production storage, compliance/security controls, analytics, support and deployment readiness.
