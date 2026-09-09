# Phase 12 — Security & Compliance Baseline

## Mandatory controls before real patient data
- Enforce server-side RBAC on every protected API route.
- Verify object ownership for patient documents, records and care requests.
- Keep secrets in deployment secret stores; never commit credentials.
- Use HTTPS/TLS in every non-local environment.
- Apply secure cookie/session settings and short-lived access tokens where applicable.
- Add rate limiting to authentication, document and high-cost endpoints.
- Validate and size-limit every upload; allowlist MIME types and extensions.
- Store audit events for authentication, record access, document access, clinical changes and administrative actions.
- Minimize PHI in logs and telemetry.
- Encrypt data at rest and in transit using managed infrastructure.
- Define retention/deletion and backup policies.
- Require explicit privacy/consent flows appropriate to the final service model.

## Healthcare compliance gate
The current repository is a development prototype and must NOT be represented as HIPAA compliant merely from code-level controls. Before handling US patient PHI, complete a formal HIPAA/privacy/security assessment, execute required vendor BAAs, define the covered-entity/business-associate roles, and obtain qualified US healthcare/privacy counsel review.

## Security test cases
- unauthenticated request → 401/403
- patient accessing another patient's record → denied
- doctor accessing unauthorized patient record → denied
- admin-only operation from patient/doctor → denied
- traversal/unsafe document key → rejected
- oversized/disallowed upload → rejected
- sensitive clinical data absent from application logs
