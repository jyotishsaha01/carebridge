# Phase 11 — Automated Testing Strategy

## Test layers
- API unit tests: validation, notification state, pricing calculations, authorization helpers.
- API integration tests: authentication, patient/doctor/admin role boundaries, document operations and care workflows.
- Patient E2E: landing → specialist discovery → profile → consultation journey; profile; notifications; support; cost comparison.
- Doctor E2E: login → dashboard → patient queue → onboarding/verification state.
- Admin E2E: login → operations dashboard → verification/support/document queues.
- Security regression: unauthenticated access, cross-role access, object ownership and unsafe document paths.

## Playwright baseline
Use isolated test data, deterministic API fixtures and storage state per role. Never use real patient/doctor information. Run Chromium on pull requests and the full supported-browser matrix on release candidates.

## CI gates
1. lint/typecheck
2. unit tests
3. API integration tests
4. Playwright smoke suite
5. security regression suite
6. build

A release candidate must pass all required gates. Flaky tests must be quarantined with an owner and expiry date rather than silently ignored.
