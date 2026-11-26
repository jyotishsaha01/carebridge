# CareBridge authentication and access controls

## Roles and object ownership

- `PATIENT`: may access the signed-in patient's own profile, appointments, consultation summaries and documents. Patient identifiers come from the authenticated session, not a caller-supplied identity header.
- `DOCTOR`: onboarding/profile endpoints require the doctor role. Clinical and document endpoints additionally require an active, verified profile and the permitted care relationship. Documents explicitly attached to an appointment are scoped to that appointment's doctor; cancelled relationships do not authorize clinical/document access.
- `ADMIN`: operational endpoints require the administrator role. Sensitive mutations and record access must be audited.

Roles are stored on `User.role` and evaluated server-side. Client route guards improve privacy and navigation but do not grant API access. Browser requests can assert `X-CareBridge-Expected-User`; the server compares it with the authenticated user and returns a static 409/`ACCOUNT_CHANGED` on mismatch before proceeding. This optional assertion narrows an authenticated request and never supplies identity or replaces ownership checks.

## Passwords, sessions and account recovery

Passwords use salted asynchronous scrypt. Login uses a dummy password check for unknown accounts and constant-time comparison for derived hashes. Authentication endpoints share a bounded per-IP limiter that uses the canonical matched route, including percent-encoded URL spellings. When its source table fills, it returns 429 for new sources instead of evicting active blocked buckets; shared ingress abuse controls are still required.

Sessions are opaque random tokens. Only SHA-256 token hashes are stored in the database. Production uses the `__Host-carebridge_session` cookie with Path=/, HttpOnly, Secure, SameSite=Lax and no Domain attribute. The older production cookie name is ignored, requiring sign-in again; development/test keeps `carebridge_session`. Duplicate session cookies, noncanonical token values and oversized Cookie headers are rejected. The API checks expiration/revocation and required email verification on authenticated requests. Reset/verification tokens are hashed, short-lived and claimed atomically. Password reset revokes sessions; concurrent old-password login is serialized against reset before a session can be created.

Notification streams authenticate independently, revalidate on delivery and while idle, limit connections/lifetime, and close on revocation or shutdown. Frontend private views recheck access when returning to a tab and hide stale views during verification.

## Browser and ingress boundaries

State-changing browser requests must have an allowed origin; production cookie requests without an origin are rejected. `CORS_ORIGIN` is an exact frontend-origin list. Approved frontend preflights permit GET, HEAD, POST, PUT, PATCH and DELETE, including the optional expected-user header. Unapproved origins receive no CORS access grant. `TRUSTED_PROXY_CIDRS` optionally lists numeric trusted proxy addresses/networks; its default is false. Arbitrary forwarded headers and blanket trust are not accepted. Deploy a shared ingress limiter before real traffic; the in-process limiter is per replica.

Account-link tokens should use a URL fragment. Legacy query links are scrubbed after capture, but ingress logs must also be configured to avoid recording their query strings. No account tokens belong in browser persistent storage or application logs.

## Production boundary

Production registration, password-reset requests and verification resend return 503 until real security email delivery is implemented. Recovery requests do not look up accounts or invalidate/replace tokens while delivery is unavailable. Production startup also requires an explicit PostgreSQL URL and refuses local SQLite configuration; TLS and infrastructure controls must still be validated in deployment. MFA/managed identity, encrypted document storage, provider integrations, initial privileged-account provisioning, monitoring, backup recovery and independent security/privacy review remain launch requirements. Readiness cannot be enabled by setting flags for missing adapters.

Never place provider secrets, private keys or real patient information in source control. See [the security baseline](phase12-security-compliance.md) and [deployment runbook](../deployment/phase13-production-runbook.md).

Feature-level authentication failures hide private content while the portal checks `/v1/auth/me`; a confirmed invalid session or changed account redirects to sign-in. Explicit `ACCOUNT_CHANGED` responses still clear stale private state immediately. Doctor/admin login requests specify their intended role before the API can replace a browser session, so a wrong-role attempt does not revoke an existing session.
