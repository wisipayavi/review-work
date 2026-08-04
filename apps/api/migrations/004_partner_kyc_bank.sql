CREATE TABLE IF NOT EXISTS partner_profiles (
  partner_id INTEGER PRIMARY KEY,
  display_name TEXT NOT NULL,
  phone TEXT,
  company_name TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS partner_kyc (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_id INTEGER NOT NULL UNIQUE,
  doc_type TEXT NOT NULL,
  file_encrypted TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('NOT_SUBMITTED','SUBMITTED','APPROVED','REJECTED')) DEFAULT 'NOT_SUBMITTED',
  rejection_reason TEXT,
  submitted_at TEXT,
  decided_at TEXT,
  decided_by_user_id INTEGER,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS partner_bank_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_id INTEGER NOT NULL UNIQUE,
  account_holder_name_encrypted TEXT NOT NULL,
  account_number_encrypted TEXT NOT NULL,
  ifsc_encrypted TEXT NOT NULL,
  bank_verified INTEGER NOT NULL DEFAULT 0,
  verified_at TEXT,
  verified_by_user_id INTEGER,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_id INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'REQUESTED',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
