# Core Product Flows (Target)

> These diagrams represent the intended product behavior to implement incrementally from PR-1 onward.

## 1) Order Flow

```mermaid
flowchart TD
    U[USER places order] --> V[Order validation]
    V --> O[Create order record]
    O --> R[Assign to PARTNER/operation queue]
    R --> S[Status updates]
    S --> N[Notify USER + visible stakeholders]
    N --> C[Order completed/cancelled]
```

## 2) Review Flow (KYC / Sensitive Review)

```mermaid
flowchart TD
    U[USER submits KYC/bank details] --> E[Encrypt sensitive fields]
    E --> K[Store in compliance/payment tables]
    K --> A[Create audit log: submission/update]
    A --> Q[Queue for SUPER_ADMIN review]
    Q --> D{Decision}
    D -->|Approve| AP[Set approved status]
    D -->|Reject| RJ[Set rejected status + reason]
    AP --> A2[Create audit log: approval]
    RJ --> A3[Create audit log: rejection]
```

## 3) Payout Flow

```mermaid
flowchart TD
    P[PARTNER/eligible actor requests payout] --> V[Validate eligibility + limits]
    V --> C[Compliance checks + KYC status]
    C --> R[Create payout request]
    R --> A[Create audit log: payout requested]
    A --> Q[SUPER_ADMIN approval queue]
    Q --> D{Approve?}
    D -->|Yes| X[Execute payout]
    D -->|No| N[Mark payout rejected]
    X --> A2[Create audit log: payout executed]
    N --> A3[Create audit log: payout rejected]
```
