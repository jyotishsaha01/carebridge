# Phase 12 — Security & Compliance Baseline

## Security review — 25 November 2026

This second pass challenged the earlier controls with duplicate and oversized cookies, source-address exhaustion, account switching during requests, failed account recovery, consent changes during clinical startup, and real cross-origin mutation preflights. The 24 November section below remains a historical snapshot. This pass used synthetic data and did not deploy the application or assess a deployed environment.

| Finding or boundary | Resolution and evidence |
| --- | --- |
| Filling the authentication source-address table could evict an active blocked bucket and reset its quota | Active buckets are retained. At the 10,000-source bound, new sources receive 429 until capacity becomes available; expired entries are cleaned up. A regression fills the table and confirms the original source remains blocked. Shared ingress abuse controls are still required across replicas. |
| Duplicate session cookies silently selected the last value; unrestricted parsing also accepted oversized cookie headers | Ambiguous session-cookie names, noncanonical token values and Cookie headers over 8 KiB are rejected before session lookup. Expired and revoked session replays remain rejected. Production now issues `__Host-carebridge_session` with Secure, HttpOnly, SameSite=Lax, Path=/ and no Domain attribute, using [browser cookie-prefix restrictions](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie#cookie_prefixes) to resist sibling-domain cookie planting. The older production cookie name is ignored, so affected users must sign in again. Development/test retains `carebridge_session`. |
| Production recovery requests could return accepted and replace tokens even though no email provider could deliver them | Registration, password-reset requests and verification resends return unavailable responses while production email is unimplemented. Reset/resend requests return the same 503 for known and unknown accounts before account lookup or token mutation. This does not constitute working account recovery. |
| A production process could retain the local SQLite URL default | Startup requires an explicitly configured PostgreSQL `DATABASE_URL` and rejects missing, SQLite and other URL schemes before listening. This configuration guard does not prove connectivity, TLS or correct deployment permissions; the database readiness probe and infrastructure checks remain necessary. |
| An old private view or delayed request could complete after the browser changed accounts | Frontends bind private requests to the discovered account and a client generation, abort or discard stale completions, and invalidate private views on an account/session change. Authenticated requests can send `X-CareBridge-Expected-User`; the API compares it with the actual session principal before activity or route writes. Invalid, duplicate or mismatched expectations receive a static 409 `ACCOUNT_CHANGED` response. Matching and absent expectations remain supported; the header grants no authority and does not replace server-side ownership/RBAC checks. `/v1/auth/me` discovers the current account without a frontend expectation. |
| Intake drafts and consent/state transitions needed a stronger clinical boundary | Unsubmitted intake details are hidden from the doctor appointment response. Starting/completing care and creating clinical records require submitted consultation consent and the appropriate encounter state. Intake edits and consultation status changes acquire the same appointment-row lock before reading authoritative state, so an edit cannot race clinical startup into an inconsistent record. Intake becomes immutable once care has started; completed/cancelled consultations cannot be reopened through these endpoints. Live database race tests exercise the competing operations. |
| Clinical writes could commit separately from their audit events, and nested queries fetched unnecessary internal fields | Intake, consultation status, clinical notes, prescriptions and follow-up mutations commit with their audit events in transactions. Patient-facing doctor projections and nested notification-user selections are narrowed to required fields; private clinician notes remain outside patient responses. Notification failure after a committed clinical mutation does not turn that successful write into a retry-inducing error. |
| Browser preflights did not explicitly permit required cross-origin mutation methods | CORS now explicitly permits PUT, PATCH and DELETE alongside GET, HEAD and POST for approved origins. Preflight regressions cover these methods and `X-CareBridge-Expected-User`. Credentialed requests and the existing origin/CSRF checks remain enforced; allowing the header does not authenticate its sender. |

The optional `TRUSTED_PROXY_CIDRS` configuration continues to default to no proxy trust. Only validated numeric IP/CIDR allowlists are accepted; the actual ingress must overwrite untrusted forwarding headers, and staging must verify the forwarding chain. The existing notification-stream connection caps, bounded lifetime, session revalidation and shutdown cleanup remain in place. A request already authorized before a concurrent revocation is an in-flight authorization snapshot, not evidence that subsequent session replay is accepted.

Validation recorded during this pass:

- 173 unit/regression tests passed: API 119 across 17 files, and 54 frontend tests. Workspace lint, TypeScript and all four production builds passed. API tests, TypeScript and compilation passed again after the final CORS change.
- 32 Chromium browser tests passed. Browser fixtures test client behavior; they do not validate real email, payment, storage or video providers.
- Live clinical/payment/support/document/notification UAT and security checks passed on isolated SQLite and PostgreSQL databases, including actual consent/startup races and account-expectation enforcement.
- The final production-mode PostgreSQL smoke check passed, including cross-origin preflight behavior.
- Both production-only and full dependency audits reported zero known vulnerabilities. These are dated registry results, not proof against unknown vulnerabilities.
- Selected credential/private-key patterns produced no matches in 223 current repository text files. This was a pattern scan, not a complete inventory of ignored local files, binaries, large files or deployed secrets.
- Docker was unavailable, so container images were not built or run locally. No remote container CI result or deployed-environment validation is claimed by this pass.

Real email/account recovery, identity/MFA, encrypted private object storage and malware scanning, payment/video providers, operational secret management, shared ingress rate limiting, monitoring/alerting, tested backups/restores and independent security/privacy review remain launch requirements. Preserving an intake after care starts protects record integrity; it does not implement consent withdrawal, correction or amendment workflows. Those policies and audited workflows still require clinical/privacy ownership before real patient data is introduced. Readiness remains unavailable while the release gates are unmet; passing local tests does not approve a production launch.

## Security review — 24 November 2026

This review covered authentication/session boundaries, clinician and patient object access, uploads, browser credentials, redirects, logging, dependency advisories, source/history credential patterns, and deployment configuration. Confirmed defects were fixed and regression coverage was added. No production deployment or evidence of a compromise was established by this review.

| Finding | Resolution and evidence |
| --- | --- |
| A treating doctor could read a document explicitly attached to another doctor's appointment for the same patient | Lists, metadata and bytes now enforce appointment-aware access; symmetric two-doctor positive/negative controls pass against SQLite and PostgreSQL. |
| Cancelled appointments still returned nested clinical/intake/document data to doctors | Clinical appointment lists exclude cancelled relationships; cancellation/access revocation is covered by live database tests. |
| Percent-encoded login URLs bypassed raw-path authentication throttles | Limits use the canonical matched route; encoded variants return 429 after the shared quota is exhausted. |
| Concurrent password reset could finish before an in-flight old-password login created its session | Conditional user-row locking serializes session creation with password reset; stale-password login is rejected or its session is revoked by reset. Deterministic regression tests cover the race. |
| Default 404/access logs could contain raw paths and query tokens | Access logs use route templates, and unmatched requests have a sanitized handler. Sensitive path/query canaries are absent from logs in both live database runs. |
| Local prototype storage accepted transformed unsafe keys and followed existing symlinks | Keys are rejected, path components checked, leaf reads use no-follow semantics, reads are bounded and writes remain exclusive. This was a local-filesystem hardening issue, not an unauthenticated production storage exploit; plaintext storage stays blocked in production. |
| Availability check/delete and overlap check/insert had mutation races | Deletion is conditional on availability status; overlap insertion uses serializable transactions and handles detected conflicts. Regression tests cover the mutation boundaries. |
| Account-link tokens remained in browser URLs/forms; stale private views could remain visible after another-tab session/account changes | Tokens are captured and scrubbed from URLs, masked and cleared after use. Private views revalidate on tab return and clear on invalid/different sessions while preserving the same clinician's drafts. Browser tests cover these cases. |
| Checkout trusted any HTTPS destination | Exact approved provider origins are now required; an empty allowlist disables navigation. This was a latent integration gap while production payments were disabled. |

Unnecessary Google Fonts requests were removed from account/health pages, browser policies were tightened, trusted proxy IP/CIDR configuration was added with a secure default, and Docker build contexts now exclude local credentials, private-key material and tool caches. CI runs both the application/tooling audit and live security regressions for each database backend.

The Effect override was upgraded from 3.20.0 to 3.22.1 for the [upstream template-literal regex advisory](https://github.com/Effect-TS/effect/security/advisories/GHSA-7589-6fvf-x4pw). Both `pnpm audit --prod` and the full `pnpm audit` reported **zero known advisories** after the update. These are dated registry results, not a guarantee against unknown vulnerabilities.

Validation on 24 November:

- 96 unit/regression tests pass: API 64, patient 18, doctor 8, admin 6.
- 29 Chromium browser tests pass: patient 19, doctor 7, admin 3.
- Workspace lint, TypeScript and all four application/API production builds pass.
- Existing clinical/support/document/notification/payment UAT and the new live security UAT pass on isolated SQLite and PostgreSQL databases.
- Seven selected high-confidence credential/private-key patterns produced no matches in 208 current repository text files and 603 historical text blobs. Ignored local files, binaries and large files were outside this pattern scan; this is not a complete credential inventory.
- `.env`, local databases and prototype medical storage remain ignored by Git. Tests used isolated synthetic databases; temporary API/database services were stopped and the local Prisma client restored to SQLite.

This is a source and local automated security review, not an independent penetration test or an assessment of deployed infrastructure. Production MFA/identity, real security email, encrypted private storage/malware scanning, operational secret management, shared ingress abuse controls, backup recovery, and independent security/privacy approvals remain required. Validate the actual trusted proxy chain and restrict diagnostic endpoints to the intended monitoring network. See the [deployment runbook](../deployment/phase13-production-runbook.md) for the remaining release requirements.

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
