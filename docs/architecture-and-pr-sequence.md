# Target Architecture and PR Sequence

## Target Architecture (Final State)

### Backend
- REST API service with strict RBAC middleware.
- Layered architecture:
  - `controllers` (transport concerns)
  - `services` (business logic)
  - `repositories` (DB access)
  - `policies` (role and privacy firewall enforcement)
- OpenAPI spec as source-of-truth for contract.

### Frontend
- Role-aware dashboard UI (SUPER_ADMIN, BRAND, PARTNER, USER).
- API client generated or validated against OpenAPI.
- PII masking and role-conditioned rendering to enforce privacy and least privilege at UI level.

### Database
Core domains:
- identities: users, role assignments, auth sessions/tokens
- compliance: KYC profiles and verification state
- payments: bank accounts, payout requests, payout execution records
- audit: append-only `audit_logs`

Sensitive data handling:
- KYC and bank data encrypted at rest (application-level envelope or field encryption).
- Only masked values (e.g., last 4) exposed in API/UI when required.

### Privacy Firewall
- Central response sanitizer policy for BRAND-facing endpoints.
- Contract tests to verify no PII leakage in BRAND-visible APIs.

## Proposed PR Plan

### PR-0 (current)
- Audit and planning documentation only.

### PR-1
- Bootstrap backend/frontend project skeletons.
- Add baseline lint/test/build pipelines.
- Add initial OpenAPI skeleton + health endpoints.

### PR-2
- Auth foundation + RBAC role model (`SUPER_ADMIN`, `BRAND`, `PARTNER`, `USER`).
- Migrations for users/roles/auth.
- Frontend role-aware navigation shell.

### PR-3
- User profile domain + privacy firewall v1.
- Ensure BRAND APIs never expose PII fields.
- Contract tests for data redaction.

### PR-4
- KYC domain v1 + encrypted storage + audit logs.
- Admin review flows (approve/reject).
- UI KYC status pages by role.

### PR-5
- Bank account domain v1 + encrypted storage + masking + audit logs.
- CRUD + verification workflow with role restrictions.

### PR-6
- Payout request domain + approval pipeline + audit logs.
- Role-based payout visibility and actions.

### PR-7
- Partner management + relationship mappings.
- Role-scoped analytics summaries (no PII leakage).

### PR-8
- Notification/eventing integration for status transitions.
- Immutable event records for sensitive actions.

### PR-9
- Hardening pass: rate limits, API security headers, threat-focused tests.
- Expanded privacy and authorization regression suite.

### PR-10
- End-to-end verification, docs completion, release-readiness checklist.
- Final OpenAPI and operational runbooks.

## Delivery Rules per PR (PR-1+)
Every implementation PR must include:
1. Backend changes
2. Frontend changes
3. DB migrations
4. Tests
5. OpenAPI updates
6. How-to-test section with commands/sample data
7. UI screenshots when UI changed
