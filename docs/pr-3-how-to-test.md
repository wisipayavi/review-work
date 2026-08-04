# PR-3 How to Test

## Install + test
```bash
npm install
npm test
```

## Start backend + frontend static host
```bash
npm run start:api
python -m http.server 4173 --directory apps/web
```

## Brand product flow
1. Login as brand (`brand@example.com` / `password123`) to get token.
2. Add product:
```bash
curl -s -X POST http://localhost:3000/api/brand/products \
  -H 'content-type: application/json' -H "authorization: Bearer <BRAND_TOKEN>" \
  -d '{"skuAsin":"ASIN-NEW-1","title":"Whey Isolate","category":"Supplements","images":["https://img/p3.png"],"marketplaceLinks":["https://market/p3"]}'
```
3. Edit product:
```bash
curl -s -X PUT http://localhost:3000/api/brand/products/<PRODUCT_ID> \
  -H 'content-type: application/json' -H "authorization: Bearer <BRAND_TOKEN>" \
  -d '{"title":"Whey Isolate Gold"}'
```
4. Search/filter own products:
```bash
curl -s "http://localhost:3000/api/brand/products?q=Whey&category=Supplements&status=active" \
  -H "authorization: Bearer <BRAND_TOKEN>"
```
5. Archive product:
```bash
curl -s -X POST http://localhost:3000/api/brand/products/<PRODUCT_ID>/archive \
  -H 'content-type: application/json' -H "authorization: Bearer <BRAND_TOKEN>" -d '{}'
```

## Admin moderation flow
1. Login as admin (`admin@example.com` / `password123`).
2. View all products:
```bash
curl -s "http://localhost:3000/api/admin/products?status=all" -H "authorization: Bearer <ADMIN_TOKEN>"
```
3. Lock product:
```bash
curl -s -X POST http://localhost:3000/api/admin/products/<PRODUCT_ID>/moderate \
  -H 'content-type: application/json' -H "authorization: Bearer <ADMIN_TOKEN>" \
  -d '{"lock":true,"note":"Policy review"}'
```

## Partner visibility rule
Partner can only view eligible campaign products, not full catalog:
```bash
curl -s http://localhost:3000/api/partner/products -H "authorization: Bearer <PARTNER_TOKEN>"
```

## BRAND privacy firewall retained
BRAND still blocked from partner sensitive KYC/bank APIs:
```bash
curl -i -s http://localhost:3000/api/brand/partners/100/kyc -H "authorization: Bearer <BRAND_TOKEN>"
curl -i -s http://localhost:3000/api/brand/partners/100/bank -H "authorization: Bearer <BRAND_TOKEN>"
```
