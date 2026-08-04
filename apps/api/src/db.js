const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { encryptText } = require('./crypto');

function hashPassword(password) {
  return crypto.scryptSync(password, 'platform-salt', 64).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT UNIQUE NOT NULL,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const migrationDir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(migrationDir).filter((f) => f.endsWith('.sql')).sort();
  const stmt = db.prepare('INSERT INTO schema_migrations(filename) VALUES (?)');

  for (const file of files) {
    const exists = db.prepare('SELECT 1 FROM schema_migrations WHERE filename = ?').get(file);
    if (exists) continue;
    db.exec(fs.readFileSync(path.join(migrationDir, file), 'utf8'));
    stmt.run(file);
  }
}

function seed(db) {
  const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (userCount > 0) return;

  db.prepare('INSERT INTO brands (name) VALUES (?)').run('Brand One');
  db.prepare('INSERT INTO brands (name) VALUES (?)').run('Brand Two');
  db.prepare("INSERT INTO campaigns (brand_id, name, marketplace, start_at, end_at, target_reviews, budget_cents, guidelines, status, open_to_all_partners) VALUES (?, ?, ?, datetime('now'), datetime('now', '+30 days'), ?, ?, ?, ?, ?)").run(1, 'Launch Campaign', 'AMAZON', 100, 500000, 'Focus on quality reviews', 'ACTIVE', 1);
  db.prepare("INSERT INTO campaigns (brand_id, name, marketplace, start_at, end_at, target_reviews, budget_cents, guidelines, status, open_to_all_partners) VALUES (?, ?, ?, datetime('now'), datetime('now', '+45 days'), ?, ?, ?, ?, ?)").run(2, 'Growth Campaign', 'FLIPKART', 80, 300000, 'Fitness category push', 'ACTIVE', 0);

  const insertUser = db.prepare(`
    INSERT INTO users(email, password_hash, full_name, mobile, role, brand_id, partner_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  insertUser.run('admin@example.com', hashPassword('password123'), 'Admin User', '9990000001', 'SUPER_ADMIN', null, null);
  insertUser.run('brand@example.com', hashPassword('password123'), 'Brand User', '9990000002', 'BRAND', 1, null);
  insertUser.run('partner@example.com', hashPassword('password123'), 'Partner User', '9990000003', 'PARTNER', null, 100);
  insertUser.run('user1@example.com', hashPassword('password123'), 'User One', '9990000004', 'USER', 1, 100);
  insertUser.run('user2@example.com', hashPassword('password123'), 'User Two', '9990000005', 'USER', 2, 200);

  db.prepare(`
    INSERT INTO orders (campaign_id, product_id, brand_id, partner_id, user_id, amount_cents, quantity, notes, status)
    VALUES (1, 1, 1, 100, 4, 5000, 2, 'Initial draft order', 'DRAFT'),
           (2, 2, 2, 200, 5, 12000, 1, 'Submitted from seeded flow', 'SUBMITTED')
  `).run();

  db.prepare(`
    INSERT INTO reviews (order_id, brand_id, partner_id, rating, comment)
    VALUES (1, 1, 100, 5, 'Great'),
           (2, 2, 200, 3, 'Okay')
  `).run();

  db.prepare(`
    INSERT INTO payouts (partner_id, amount_cents, status)
    VALUES (100, 150000, 'PAID'),
           (100, 50000, 'REQUESTED'),
           (200, 90000, 'PAID')
  `).run();

  db.prepare(
    `INSERT INTO partner_profiles (partner_id, display_name, phone, company_name)
     VALUES (?, ?, ?, ?)`
  ).run(100, 'Partner User', '9990000003', 'Partner Co');

  db.prepare(
    `INSERT INTO partner_kyc (partner_id, doc_type, file_encrypted, status)
     VALUES (?, ?, ?, 'NOT_SUBMITTED')`
  ).run(100, 'PAN', encryptText(''));

  db.prepare(
    `INSERT INTO products (brand_id, sku_asin, title, category, images_json, marketplace_links_json)
     VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)`
  ).run(
    1,
    'SKU-100',
    'Protein Powder 1kg',
    'Supplements',
    JSON.stringify(['https://img.example.com/p1.png']),
    JSON.stringify(['https://market.example.com/p1']),
    2,
    'SKU-200',
    'Yoga Mat Pro',
    'Fitness',
    JSON.stringify(['https://img.example.com/p2.png']),
    JSON.stringify(['https://market.example.com/p2'])
  );

  db.prepare('INSERT INTO campaign_products (campaign_id, product_id) VALUES (?, ?), (?, ?)').run(1, 1, 2, 2);

  db.prepare('INSERT INTO campaign_allowed_partners (campaign_id, partner_id) VALUES (?, ?)').run(2, 200);
  db.prepare('INSERT INTO campaign_partner_limits (campaign_id, partner_id, max_reviews, max_orders) VALUES (?, ?, ?, ?)').run(2, 200, 40, 60);
}

function createDb(dbPath = ':memory:') {
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  seed(db);
  return db;
}

module.exports = { createDb, hashPassword, hashToken };
