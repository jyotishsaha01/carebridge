# CareBridge Test Environment

## Purpose
Provide an isolated environment for integration and acceptance testing of the Phase 1 MVP.

## Environment contract

```text
Local -> test -> qa -> staging -> main
```

### TEST
- Synthetic data only.
- Isolated test database.
- Test-only credentials and secrets.
- External integrations in sandbox/test mode.
- Safe to reset and reseed.

### QA
- Synthetic data only.
- Stable release-candidate validation.
- Product/QA/UAT environment.

### STAGING
- Production-like configuration.
- Synthetic data only until security/privacy/legal approvals permit otherwise.
- Final pre-release validation.

### MAIN / PRODUCTION
- Production services and controls only.
- Real patient information is permitted only after required privacy, security, legal, contractual and operational controls are complete.

## Example test configuration

```text
NODE_ENV=test
APP_ENV=test
DATABASE_URL=<test-database>
AUTH_ISSUER=<test-auth>
PAYMENT_MODE=test
VIDEO_MODE=test
STORAGE_BUCKET=<test-bucket>
ALLOW_SYNTHETIC_DATA=true
```

Never commit secrets. Use environment-specific secret storage.

## Reset policy
The test database may be reset/reseeded. Seed data must be synthetic patients, synthetic doctors and synthetic medical documents.

## QA promotion criteria
- Unit tests pass.
- Integration tests pass.
- Critical E2E flows pass.
- No unresolved critical/high defects.
- Security checks pass for changed scope.
- Test evidence is linked to the PR.
