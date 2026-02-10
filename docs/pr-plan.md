# Delivery Plan (PR-1 to PR-10)

## PR-1: Project Bootstrap
- Create backend/frontend skeletons.
- Add developer tooling (lint/test/build).
- Add health endpoints and baseline OpenAPI structure.

## PR-2: Auth + RBAC Foundation
- Implement auth lifecycle and token/session handling.
- Add role schema and policy middleware for `SUPER_ADMIN`, `BRAND`, `PARTNER`, `USER`.
- Add frontend role-aware shell/navigation.

## PR-3: User Domain + Privacy Firewall v1
- Implement core user profile APIs.
- Enforce BRAND PII redaction across responses.
- Add tests proving BRAND never receives disallowed fields.

## PR-4: KYC Domain v1
- Add KYC schema + encrypted persistence.
- Build submit/review/approve/reject APIs.
- Add audit logs for KYC-sensitive actions.

## PR-5: Bank Domain v1
- Add bank account schema + encrypted storage.
- Add masking logic (last-4) in API/UI.
- Add bank change/review audit logs.

## PR-6: Payout Workflow v1
- Add payout request schema and APIs.
- Implement approval/rejection/execution lifecycle.
- Add payout-related audit events.

## PR-7: Order & Review UX Integration
- Integrate frontend flows for order/review/payout states.
- Add role-specific pages and access control in UI.
- Expand API docs with concrete examples.

## PR-8: Privacy/Authorization Hardening
- Add broader policy test matrix for all roles.
- Add regression tests for PII leakage prevention.
- Validate sensitive endpoint behavior end-to-end.

## PR-9: Operational Readiness
- Add observability hooks, structured logs, failure handling.
- Add runbooks for key operational workflows.
- Complete OpenAPI and data dictionary coverage.

## PR-10: Final Stabilization
- Perform full integration test pass and defect closure.
- Finalize docs (architecture, flows, controls, how-to-test).
- Publish release readiness checklist.

## PR Quality Bar (applies to every implementation PR)
1. Backend + frontend + DB migration changes included.
2. OpenAPI updated for all changed endpoints.
3. Tests added/updated and passing.
4. How-to-test steps with commands and sample data.
5. UI screenshots when UI is changed.
