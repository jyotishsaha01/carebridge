# CareBridge Testing Environment

## Environments

- `local`: developer machines; synthetic data only.
- `qa`: dedicated automated and manual testing environment; synthetic data only.
- `test` branch: integration branch for QA validation.
- `develop`: active integration branch.
- `main`: protected release branch; production-ready changes only.

## Testing principles

1. Never use real patient health information in local or QA environments.
2. Use deterministic synthetic patients, doctors, appointments and documents.
3. Run lint, typecheck, unit tests and build on every pull request.
4. Run Playwright end-to-end tests against the QA environment after deployment.
5. Keep test credentials and service keys in GitHub/environment secrets; never commit secrets.
6. Track defects against the relevant product requirement/version.

## Test data

- Demo patient: `patient.demo@carebridge.test`
- Demo doctor: `doctor.demo@carebridge.test`
- Demo admin: `admin.demo@carebridge.test`

These addresses are placeholders for synthetic accounts only.
