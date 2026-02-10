# PR-2 How to Test

## Install and run tests
```bash
npm install
npm test
```

## Start API
```bash
npm run start:api
```

## Partner flow (profile + KYC + bank)
1. Login as partner:
```bash
curl -s http://localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"partner@example.com","password":"password123"}'
```
2. Update profile:
```bash
curl -s -X PUT http://localhost:3000/api/partner/profile \
  -H 'content-type: application/json' -H "authorization: Bearer <PARTNER_TOKEN>" \
  -d '{"displayName":"Partner Prime","phone":"9876543210","companyName":"Prime Co"}'
```
3. Submit KYC:
```bash
curl -s -X POST http://localhost:3000/api/partner/kyc \
  -H 'content-type: application/json' -H "authorization: Bearer <PARTNER_TOKEN>" \
  -d '{"docType":"PAN","file":"pan-file-content"}'
```
4. Update bank:
```bash
curl -s -X PUT http://localhost:3000/api/partner/bank \
  -H 'content-type: application/json' -H "authorization: Bearer <PARTNER_TOKEN>" \
  -d '{"accountHolderName":"Partner Prime","accountNumber":"123456789012","ifsc":"HDFC0000123"}'
```
5. Fetch partner bank (masked):
```bash
curl -s http://localhost:3000/api/partner/bank -H "authorization: Bearer <PARTNER_TOKEN>"
```

## Admin flow (approve/reject KYC + verify bank + full details)
1. Login as admin (`admin@example.com` / `password123`).
2. Get partner detail:
```bash
curl -s http://localhost:3000/api/admin/partners/100 -H "authorization: Bearer <ADMIN_TOKEN>"
```
3. Approve KYC:
```bash
curl -s -X POST http://localhost:3000/api/admin/partners/100/kyc/decision \
  -H 'content-type: application/json' -H "authorization: Bearer <ADMIN_TOKEN>" \
  -d '{"decision":"APPROVED"}'
```
4. Verify bank:
```bash
curl -s -X POST http://localhost:3000/api/admin/partners/100/bank/verify \
  -H 'content-type: application/json' -H "authorization: Bearer <ADMIN_TOKEN>" -d '{}'
```

## BRAND firewall check
```bash
curl -i -s http://localhost:3000/api/brand/partners/100/kyc -H "authorization: Bearer <BRAND_TOKEN>"
curl -i -s http://localhost:3000/api/brand/partners/100/bank -H "authorization: Bearer <BRAND_TOKEN>"
```
Expected: both `403 Forbidden`.
