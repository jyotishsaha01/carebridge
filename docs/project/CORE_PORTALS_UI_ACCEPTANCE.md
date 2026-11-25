# Core Portal Hardening — UI Acceptance Checklist

Use synthetic/demo accounts and data only. Do not use real patient health information.

## 1. Notifications

- [ ] Signed-out users see a clear sign-in/error state.
- [ ] Signed-in users see persisted notifications and the correct unread count.
- [ ] A newly created notification appears through the live event stream.
- [ ] Mark one notification read updates its state and unread count.
- [ ] Mark all read updates every visible unread notification.
- [ ] Failed read/update requests show an error and do not silently report success.
- [ ] If the live stream disconnects, persisted notifications remain visible and refresh works.

## 2. Doctor Portal UI

- [ ] Doctor login accepts valid credentials and rejects invalid credentials.
- [ ] Non-doctor accounts cannot access doctor-only routes or APIs.
- [ ] Dashboard clearly distinguishes demo data from API-backed appointment data.
- [ ] Appointment queue and patient details load from the API.
- [ ] Consultation start/completion, clinical notes, prescriptions, and follow-up actions report success only after API confirmation.
- [ ] API failures do not appear as successful saves.
- [ ] Doctor profile rejects invalid consultation prices and handles authorization/network failures.

## 3. Doctor Onboarding

- [ ] Onboarding requires a valid license number and issuing jurisdiction.
- [ ] Back/Continue navigation preserves entered values.
- [ ] Submission cannot be triggered repeatedly while a request is in progress.
- [ ] Signed-out/non-doctor users receive a clear authorization message.
- [ ] Successful submission creates a pending credential for admin review.
- [ ] UI clearly explains that the current document field is a reference/name only, not a secure file upload.
- [ ] Credential approval/rejection is visible after refreshing the doctor profile.

## 4. Admin Portal

- [ ] Signed-out and non-admin users cannot load admin operations.
- [ ] Authorization/load failures are shown as an in-page error, not an unhandled rejection.
- [ ] Admin can load doctors, patients, appointments, and credentials.
- [ ] Approve/reject actions are disabled while processing and refresh the credential status afterward.
- [ ] Admin actions are recorded in the audit trail.
- [ ] Empty states and API failures are understandable and do not imply data is present.

## 5. Patient Profile

- [ ] Signed-out users receive a clear sign-in message.
- [ ] Profile data loads from the authenticated patient endpoint.
- [ ] Email is read-only; editable fields are validated before saving.
- [ ] Save success is displayed only after the server confirms persistence.
- [ ] Failed saves show a useful message and retain user input.
- [ ] Notification preference failures roll back the optimistic toggle and show an error.
- [ ] Session revocation handles failure and only removes a session from the UI after API success.
- [ ] Profile and session APIs enforce patient ownership on the server.

## 6. Patient Documents and Access

- [ ] Signed-out users cannot list, upload, inspect, or open document content.
- [ ] A patient can list and open only documents owned by their authenticated patient account.
- [ ] A different patient cannot access document metadata or content by changing the document ID.
- [ ] Upload intent rejects unsupported MIME types, empty/oversized files, and invalid appointment IDs.
- [ ] Content upload rejects malformed base64, size mismatches, unsupported stored content types, and files above 10 MB.
- [ ] PDF and image previews open after an authenticated content fetch; popup-blocked and API-error states are understandable.
- [ ] Missing local content is reported clearly without exposing storage keys or internal errors.
- [ ] Upload and document-content access events are recorded in the audit trail.
- [ ] Use synthetic files only; verify PDF, JPG, PNG, unsupported type, 10 MB boundary, and cross-patient denial.

## Exit criteria

- [ ] Run lint, typecheck, unit tests, and API contract tests.
- [ ] Run the five manual UI suites above against a local test environment.
- [ ] Run regression tests for patient, doctor, and admin role boundaries.
- [ ] Record evidence for each test: result, environment, date, and defect link.
- [ ] Do not mark an area complete until required tests pass.

Current code changes are hardening work, not proof that these tests have passed.