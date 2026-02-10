# Gap Analysis (Current State vs Required Platform)

## Current State Snapshot

- Repository is currently documentation-only with no runtime apps.
- No frontend routes, backend endpoints, DB schema, auth, or business workflows are implemented.

## Missing Features

### A. Foundation
- Monorepo app scaffolding (frontend + backend).
- Environment configuration and local dev orchestration.
- Lint/test/build pipelines for runtime code.

### B. Identity, Auth, and RBAC
- User identity model and authentication lifecycle.
- Role assignments for `SUPER_ADMIN`, `BRAND`, `PARTNER`, `USER`.
- Authorization middleware and policy tests.

### C. Privacy Firewall
- Centralized redaction policy for BRAND-visible data.
- Contract/integration tests proving PII exclusion in BRAND APIs.

### D. KYC & Bank Security
- Encrypted storage for KYC/bank fields.
- Key management/encryption service integration.
- Masking conventions and output serializers.

### E. Auditability
- `audit_logs` schema and append-only write path.
- Audit emitters for all sensitive actions:
  - KYC updates/approvals/rejections
  - Bank updates/approvals/rejections
  - Payout creation/approval/rejection/execution

### F. Product Domains
- Order lifecycle and status management.
- Review workflows and decisioning queues.
- Payout workflow with approvals and execution records.

### G. API & UI
- Endpoint implementation + OpenAPI completeness.
- Role-aware frontend routes, pages, and state handling.
- UI-level masking and role-restricted views.

### H. Validation & Quality
- Unit, integration, and end-to-end tests.
- Security/privacy regression suite.
- CI gates enforcing lint, tests, and build.
