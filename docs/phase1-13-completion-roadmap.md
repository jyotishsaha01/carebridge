# CareBridge — Development Areas 01–13

This document tracks the remaining productization work requested for the CareBridge platform. Booking, Payment, and Video remain explicitly parked and are not included here.

## 01 Notifications Center
- Patient, doctor and admin inboxes
- Read/unread state and counts
- Consultation, prescription, follow-up, care-plan and support notifications
- Notification preferences and delivery abstraction

## 02 Doctor Portal UI
- Dashboard, queue, patient records, clinical workspace
- Prescriptions, follow-ups, availability, documents and notifications
- Loading, empty and error states

## 03 Doctor Onboarding & Verification
- Professional profile and credentials
- Specialty, license and experience
- Credential documents
- Admin review, approval/rejection and status history

## 04 Admin Portal
- Patient and doctor operations
- Verification queue
- Care requests
- Audit logs
- Analytics and operational controls

## 05 Patient Profile & Settings
- Contact and emergency information
- Medical profile
- Preferences, privacy and security
- Account management

## 06 Production Document Storage
- Provider implementation behind current storage interface
- Upload completion and integrity checks
- Secure download/preview
- Retention, archive and deletion policy

## 07 Support & Communication
- Support request creation
- Conversation/thread model
- Attachments
- Status and escalation
- Admin response workflow

## 08 International Price Comparison
- Country/currency context
- Comparable consultation pricing
- CareBridge price
- Difference/savings calculation
- Source, date and disclaimer

## 09 Public Website
- Premium healthcare landing page
- How it works
- Doctor discovery positioning
- Cost comparison
- Trust, safety, FAQ and contact

## 10 UI/UX Premium Pass
- Design system consistency
- Responsive layouts
- Motion/micro-interactions
- Skeletons, toasts and error states
- Accessibility and keyboard navigation

## 11 Testing
- Unit/integration tests
- API authorization tests
- Patient/doctor/admin Playwright journeys
- Document security tests
- CI regression suite

## 12 Security & Compliance Readiness
- RBAC hardening
- Session/rate-limit protections
- Encryption and secrets management
- Audit/retention controls
- Consent/privacy flows
- HIPAA-oriented technical review and US healthcare legal review before launch

## 13 Deployment & Production
- Development/testing/staging/production environments
- Environment configuration
- Database migration process
- Cloud deployment
- Monitoring, error tracking and logging
- Backups and disaster recovery

## Definition of Done
Each area is only marked complete after its backend capability, UI where applicable, authorization, tests and deployment considerations are verified. Do not mark an area complete merely because an API stub exists.
