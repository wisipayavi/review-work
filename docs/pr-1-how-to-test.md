# PR-1 How to Test

## 1) Install dependencies
```bash
npm install
```

## 2) Run backend tests
```bash
npm test
```

## 3) Start API server
```bash
npm run start:api
```

## 4) Manual auth checks (sample data)
Use seeded users (password for all: `password123`):
- `admin@example.com`
- `brand@example.com`
- `partner@example.com`

Example login:
```bash
curl -s http://localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"brand@example.com","password":"password123"}'
```

## 5) Privacy firewall check (BRAND)
After login, call:
```bash
curl -s http://localhost:3000/api/brand/users \
  -H "authorization: Bearer <ACCESS_TOKEN>"
```
Expected: no `email`, `fullName`, `full_name`, or `mobile` fields in items.

## 6) Frontend shell
Serve static web app:
```bash
python -m http.server 4173 --directory apps/web
```
Then open `http://localhost:4173` and login with seeded credentials.
