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
| v1.2–v1.3 Video | FOUNDATION | Provider-neutral video/session boundary; live provider onboarding pending |
| v1.4 Payments | FOUNDATION | Provider-neutral payment architecture; live provider onboarding pending |
| v1.5 Doctor platform | FOUNDATION | Doctor operations and clinical workspace foundation |
| v1.6 Admin platform | FOUNDATION | Admin operations, verification and audit operations |
| v1.7 Care journey | FOUNDATION | Optional treatment coordination roadmap layer |
| v2.0 Production readiness | FOUNDATION | Security, secrets, encryption, monitoring, recovery and compliance gates |
| v2.1 Account security + Admin UI | IN PROGRESS | Email verification/recovery, audit trail, session controls and usable Admin console |

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
- [ ] Production email provider and email-delivery verification
- [ ] Production identity provider / MFA policy
- [ ] Live payment provider and webhook reconciliation
- [ ] HIPAA/privacy/legal review and signed vendor agreements where required
- [ ] Production encrypted object storage and access-control validation
- [ ] Production video provider provisioning and security review
- [ ] Security assessment / penetration testing
- [ ] Backup/restore rehearsal and disaster-recovery validation

## Environment policy

Development, test and QA environments use synthetic data only. No real patient health information or production credentials should be committed or used in CI.

## Next milestone

**v2.1 — Account security + Admin operations hardening**

Finish production email-provider integration, enforce verification/MFA policy in production, complete admin operational controls, then move into payment/video/vendor integration and formal security/privacy release gates.
