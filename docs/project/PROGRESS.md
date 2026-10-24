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
- [x] Notification center supports deleting an owned notification and clearing all read notifications, with user-scoped server-side deletion
- [x] Patient Care Hub
- [x] Care plan and care-task APIs
- [x] Care request workflow for diagnostic/medication/procedure/surgery coordination
- [x] Admin care-request queue
- [x] Admin operational analytics
- [x] Patient dashboard connected to live patient counts and notifications
- [x] Doctor dashboard loads the authenticated doctor profile, real assigned appointments, intake status, and open-slot count from API endpoints
- [x] Patient appointment lifecycle: future booked appointments can be cancelled or rescheduled with slot synchronization, ownership checks, notifications and audit logging
- [x] Support request creation, status updates and admin queue
- [x] Threaded support messages with patient/admin authorization checks
- [x] Real-time notifications for support request creation, replies and status updates
- [ ] Provider-specific production payment integration and reconciliation
- [ ] Production email/SMS provider and delivery verification
- [ ] Production identity provider / MFA policy
- [ ] HIPAA/privacy/legal review and signed vendor agreements where required
- [ ] Production encrypted object storage, malware scanning and access-control validation
- [x] Support attachments: upload/list/retrieve endpoints, ticket-owner/admin authorization, PDF/PNG/JPEG signature checks, 5 MB limit, private storage, and audit events
- [x] Support priority-based SLA deadlines, overdue filtering, admin escalation controls, escalation notifications, and audit logging
- [ ] Production video provider provisioning and security review
- [ ] Security assessment / penetration testing
- [ ] Backup/restore rehearsal and disaster-recovery validation
- [ ] Production medication fulfillment, pharmacy partnerships and jurisdictional checks
- [ ] Hospital/procedure coordination contracts and cross-border care operations

## Environment policy

Development, test and QA environments use synthetic data only. No real patient health information or production credentials should be committed or used in CI.

## Current development direction

**Booking, payment checkout and video are intentionally parked.** Continue building the remaining platform around them: doctor operations, care coordination, notifications, production storage, compliance/security controls, analytics, support and deployment readiness.

## Latest functional work — 24 Oct 2026

- [x] Medical intake API: validate appointment IDs and questionnaire field lengths; return field-level 400 errors instead of unhandled validation exceptions.
- [x] Medical intake API: enforce patient ownership before read/write and persist drafts/completed consent state with an upsert.
- [x] UAT coverage added for questionnaire draft save, fresh-GET persistence, invalid field lengths, and doctor access denial.
- [x] UAT coverage added for document content ownership boundaries (doctor denied; unknown document returns not found).
- [x] Document upload API rejects malformed base64, mismatched MIME/file signatures, and storage write failures with controlled responses.
- [x] Invalid upload metadata returns a structured 400 response with field-level validation details.
- [x] Notification center API: added authenticated, user-scoped delete-one and clear-read actions; preserves unread notifications when clearing read items.
- [x] Support workflow: added LOW/NORMAL/HIGH priority with 72/24/4-hour SLA deadlines, admin filters for overdue/escalated tickets, escalation/priority updates, notifications, and audit metadata.
- [x] Support SLA filters parse true/false query values explicitly and combine status and overdue conditions without silently overriding each other.
- [x] Support attachment persistence model links files to tickets and uploaders; attachment content is returned only after ticket-owner/admin authorization.
- [x] Doctor dashboard no longer renders availability slots as fake patient appointments; it loads the real doctor appointment queue, supports status filtering, and links directly to the selected appointment in the clinical workspace.
- [x] Doctor appointment queue supports reasoned cancellation for future booked appointments with ownership/status checks, transactional slot release, patient notification, and audit logging.
- [x] Doctor consultation transitions are restricted to starting a booked appointment and completing an in-progress consultation; appointment and consultation states update in one transaction, with stale-state conflicts returned clearly to the workspace.
- [x] Clinical notes are restricted to in-progress consultations; prescriptions and follow-ups require an in-progress or completed consultation, and the doctor workspace surfaces lifecycle API errors.
- [x] Added a doctor-scoped clinical-record read endpoint and reloads saved consultation summary, latest note, prescription item, and follow-up when switching appointments in the doctor workspace.
- [x] Clinical note saves update the latest note rather than creating a duplicate on every edit; the doctor workspace reloads persisted data after successful note, prescription, and follow-up saves.
- [x] Doctor prescription editor supports multiple medication items, displays saved items on reload, shows a clinical-record loading state, prevents duplicate concurrent save actions, and avoids applying save responses to a newly selected appointment.
- [x] Patient appointment cancellation is patient-scoped, future-booking-only, transactionally updates appointment/consultation state and releases the booked slot; cancellation is audited and notifies patient and doctor.
- [x] Patient appointment rescheduling claims a future available slot, updates the booked appointment and releases its previous slot in one transaction, with stale-state/conflict handling, audit metadata and patient/doctor notifications.
- [x] Patient appointment detail page supports viewing available times, rescheduling, reasoned cancellation, and clear pending/success/error states.
- [x] Removed the appointment-level doctor/time unique constraint so cancelled slots can be booked again; the unique availability-slot constraint plus conditional transaction claim remains the double-booking guard.
- [x] UAT fixture uses a synthetic PDF signature and covers invalid metadata, malformed base64, and MIME/signature mismatch rejection.
- [ ] Run API UAT integration suite and resolve any failures. CI status is not available from the latest commits yet.
- [ ] Perform manual browser regression for patient login, questionnaire save/reload, and document preview/upload.

