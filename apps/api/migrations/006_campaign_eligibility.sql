CREATE TABLE IF NOT EXISTS campaign_allowed_partners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL,
  partner_id INTEGER NOT NULL,
  UNIQUE(campaign_id, partner_id)
);

CREATE TABLE IF NOT EXISTS campaign_partner_limits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL,
  partner_id INTEGER NOT NULL,
  max_reviews INTEGER,
  max_orders INTEGER,
  UNIQUE(campaign_id, partner_id)
);
