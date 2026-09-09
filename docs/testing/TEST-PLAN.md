# CareBridge Phase 1 Test Plan

## Scope

The test plan covers Patient, Doctor and Admin applications plus shared API/data workflows.

## Test layers

### Unit
- Validation rules
- Cost comparison calculations/presentation rules
- Appointment state transitions
- Permission rules
- Reusable UI components

### Integration
- API to PostgreSQL
- Authentication and authorization
- Appointment booking
- Payment sandbox callbacks
- Document metadata/storage workflow
- Notification events

### End-to-end
- Patient registration and login
- Doctor discovery and profile
- Smart Cost display
- Booking and payment
- Medical intake
- Video consultation lifecycle
- Doctor note and prescription workflow
- Patient consultation summary
- Follow-up creation
- Admin provider verification

### Non-functional
- Accessibility
- Security
- Performance
- Browser compatibility
- Failure/recovery scenarios

## Release gates

A candidate cannot move from QA to staging unless required unit/integration/E2E checks pass and no unresolved critical or high-severity defect remains.
