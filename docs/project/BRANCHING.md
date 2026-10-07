# CareBridge Branching & Environment Flow

```text
feature/*
   ↓
develop
   ↓
test
   ↓
qa
   ↓
staging
   ↓
main / production
```

## Rules

- Feature work starts from `develop`.
- `develop` is the active integration branch.
- `test` is the shared integration/testing branch.
- `qa` is the validation environment for manual and automated acceptance testing.
- `main` represents release-ready code.
- No real patient data is permitted in local, test or QA environments.
- Every environment must use environment-specific credentials and endpoints.
