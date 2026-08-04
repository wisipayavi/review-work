# PR-5 How to Test

## Setup
```bash
npm install
npm test
npm run start:api
python -m http.server 4173 --directory apps/web
```

## Partner submits order
1. Create DRAFT order:
```bash
curl -s -X POST http://localhost:3000/api/partner/orders \
  -H 'content-type: application/json' -H "authorization: Bearer <PARTNER_TOKEN>" \
  -d '{"campaignId":1,"productId":1,"amount":15000,"quantity":2,"notes":"Promo order"}'
```
2. Submit order:
```bash
curl -s -X POST http://localhost:3000/api/partner/orders/<ORDER_ID>/submit \
  -H 'content-type: application/json' -H "authorization: Bearer <PARTNER_TOKEN>" -d '{}'
```

## Brand approval/rejection
```bash
curl -s http://localhost:3000/api/brand/orders?status=SUBMITTED -H "authorization: Bearer <BRAND_TOKEN>"
```
Approve:
```bash
curl -s -X POST http://localhost:3000/api/brand/orders/<ORDER_ID>/decision \
  -H 'content-type: application/json' -H "authorization: Bearer <BRAND_TOKEN>" \
  -d '{"decision":"BRAND_APPROVED"}'
```
Reject:
```bash
curl -s -X POST http://localhost:3000/api/brand/orders/<ORDER_ID>/decision \
  -H 'content-type: application/json' -H "authorization: Bearer <BRAND_TOKEN>" \
  -d '{"decision":"BRAND_REJECTED","reason":"Invalid invoice"}'
```

## Admin visibility + override
```bash
curl -s http://localhost:3000/api/admin/orders -H "authorization: Bearer <ADMIN_TOKEN>"
```
Override:
```bash
curl -s -X POST http://localhost:3000/api/admin/orders/<ORDER_ID>/override \
  -H 'content-type: application/json' -H "authorization: Bearer <ADMIN_TOKEN>" \
  -d '{"status":"BRAND_APPROVED","note":"Admin override"}'
```

## Audit verification
```bash
curl -s http://localhost:3000/api/audit-logs -H "authorization: Bearer <ADMIN_TOKEN>"
```
Expected actions include `ORDER_CREATED_DRAFT`, `ORDER_SUBMITTED`, `ORDER_BRAND_DECIDED`, `ORDER_ADMIN_OVERRIDDEN`.
