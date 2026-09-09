# CareBridge authentication and RBAC foundation

## Roles

- `PATIENT`: may access the signed-in patient's own profile, appointments, consultation summaries and documents.
- `DOCTOR`: may access only patient data required for an authorized care relationship and may create/update clinical records permitted by the workflow.
- `ADMIN`: operational access only, using least privilege. Sensitive patient access must be audited.

## Current state

The Prisma data model includes `UserRole` and the API includes a reusable server-side `requireRole` guard. The local booking demo currently uses an explicit demo identity header and is not production authentication.

## Production boundary

Before any real patient data is introduced, replace the demo identity with the approved managed identity provider and enforce authentication at the API boundary. Required controls include secure session/token validation, MFA where appropriate, server-side authorization, audit logging, rate limiting, secret management, and environment separation.

Never put provider API secrets, payment credentials, private keys, or patient health information in source control.
