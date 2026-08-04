# Data Visibility Matrix (PII & Sensitive Data Rules)

## Role Definitions

- **ADMIN**: maps to `SUPER_ADMIN` role for governance/approval operations.
- **BRAND**: business role with strict privacy firewall constraints.
- **PARTNER**: operational/business participant with limited user data access.

## Rule Summary

- BRAND must never receive direct user PII via API (name, email, mobile, bank details).
- Sensitive KYC/bank data must be encrypted at rest and masked in responses/UI.
- ADMIN access is least-privilege but may include full details where operationally required and audited.

## Matrix

| Data Field / Category | BRAND | PARTNER | ADMIN (SUPER_ADMIN) |
|---|---|---|---|
| User full name | **Denied** | Conditional (only if explicitly required by workflow) | Allowed (audited) |
| User email | **Denied** | Conditional (strict need-to-know) | Allowed (audited) |
| User mobile | **Denied** | Conditional (strict need-to-know) | Allowed (audited) |
| Bank account number | **Denied** | Masked only (last 4) | Masked by default; full only for privileged actions (audited) |
| Bank IFSC/routing details | **Denied** | Masked/limited | Allowed with audit |
| KYC document number | **Denied** | Masked only | Allowed with audit |
| KYC verification status | Allowed (status only) | Allowed | Allowed |
| Payout amount/status | Allowed (non-PII) | Allowed | Allowed |
| Audit log metadata | Limited/non-PII | Limited/non-PII | Allowed |

## Enforcement Blueprint

1. Backend response policy layer enforces role-aware field filtering.
2. OpenAPI schemas for BRAND endpoints exclude PII fields by contract.
3. Serialization tests verify no PII leakage for BRAND responses.
4. UI renders masked values only and never requests disallowed fields for BRAND.
