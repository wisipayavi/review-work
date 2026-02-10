# PR-4 How to Test

## Setup
```bash
npm install
npm test
npm run start:api
python -m http.server 4173 --directory apps/web
```

## Brand campaign builder flow
1. Login as brand and create campaign:
```bash
curl -s -X POST http://localhost:3000/api/brand/campaigns \
  -H 'content-type: application/json' -H "authorization: Bearer <BRAND_TOKEN>" \
  -d '{"name":"Private Launch","marketplace":"AMAZON","startAt":"2026-01-01T00:00:00Z","endAt":"2026-12-31T00:00:00Z","targetReviews":25,"budget":120000,"guidelines":"Only verified buyers","status":"ACTIVE"}'
```
2. Map products:
```bash
curl -s -X PUT http://localhost:3000/api/brand/campaigns/<CAMPAIGN_ID>/products \
  -H 'content-type: application/json' -H "authorization: Bearer <BRAND_TOKEN>" \
  -d '{"productIds":[1]}'
```
3. Set eligibility + per-partner limits:
```bash
curl -s -X PUT http://localhost:3000/api/brand/campaigns/<CAMPAIGN_ID>/eligibility \
  -H 'content-type: application/json' -H "authorization: Bearer <BRAND_TOKEN>" \
  -d '{"openToAllPartners":false,"allowedPartners":[100],"partnerLimits":[{"partnerId":100,"maxReviews":10,"maxOrders":20}]}'
```

## Admin override flow
```bash
curl -s -X POST http://localhost:3000/api/admin/campaigns/<CAMPAIGN_ID>/override \
  -H 'content-type: application/json' -H "authorization: Bearer <ADMIN_TOKEN>" \
  -d '{"status":"PAUSED","lockEdits":true}'
```
Then verify brand edit returns 423:
```bash
curl -i -s -X PUT http://localhost:3000/api/brand/campaigns/<CAMPAIGN_ID> \
  -H 'content-type: application/json' -H "authorization: Bearer <BRAND_TOKEN>" \
  -d '{"name":"Should Fail"}'
```

## Partner eligibility
Partner can browse only eligible ACTIVE campaigns:
```bash
curl -s http://localhost:3000/api/partner/campaigns -H "authorization: Bearer <PARTNER_TOKEN>"
```
Partner can browse only products from eligible active campaigns:
```bash
curl -s http://localhost:3000/api/partner/products -H "authorization: Bearer <PARTNER_TOKEN>"
```
