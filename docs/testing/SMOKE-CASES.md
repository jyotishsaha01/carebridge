# QA Smoke Cases — v0.2

These are the first gates for the shared QA environment.

| ID | Scenario | Expected result |
|---|---|---|
| QA-001 | Patient app loads | CareBridge landing route loads without console/build errors |
| QA-002 | Doctor app loads | Doctor application shell loads |
| QA-003 | Admin app loads | Admin console shell loads |
| QA-004 | Test config guard | QA configuration exists and does not contain production secrets |
| QA-005 | Monorepo validation | Workspace lint/typecheck/test/build commands complete successfully |

These smoke cases will be expanded as real application flows are implemented.
