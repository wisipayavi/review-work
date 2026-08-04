ALTER TABLE orders ADD COLUMN product_id INTEGER;
ALTER TABLE orders ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1;
ALTER TABLE orders ADD COLUMN notes TEXT;
ALTER TABLE orders ADD COLUMN brand_decision_reason TEXT;
ALTER TABLE orders ADD COLUMN admin_override_note TEXT;
ALTER TABLE orders ADD COLUMN updated_at TEXT;
UPDATE orders SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL;
