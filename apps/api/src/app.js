const express = require('express');
const { createDb } = require('./db');
const { authenticate, requireRole, loginHandler, refreshHandler } = require('./auth');
const { logAudit } = require('./audit');
const { serializeBrandUser, serializeAdminUser } = require('./serializers');
const { withBrandScope, withPartnerScope } = require('./tenant');
const { encryptText, decryptText, maskLast4 } = require('./crypto');

function parseJsonArray(raw) {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function serializeProduct(row) {
  return {
    id: row.id,
    brandId: row.brand_id,
    skuAsin: row.sku_asin,
    title: row.title,
    category: row.category,
    images: parseJsonArray(row.images_json),
    marketplaceLinks: parseJsonArray(row.marketplace_links_json),
    isArchived: Boolean(row.is_archived),
    isLocked: Boolean(row.is_locked),
    moderationNote: row.moderation_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}


function normalizeCampaign(row) {
  return {
    id: row.id,
    brandId: row.brand_id,
    name: row.name,
    marketplace: row.marketplace,
    startAt: row.start_at,
    endAt: row.end_at,
    targetReviews: row.target_reviews,
    budget: row.budget_cents,
    guidelines: row.guidelines,
    status: row.status,
    openToAllPartners: Boolean(row.open_to_all_partners),
    isEditLocked: Boolean(row.is_edit_locked),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const CAMPAIGN_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'ENDED'];

function createApp({ dbPath } = {}) {
  const db = createDb(dbPath);
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.post('/api/auth/login', loginHandler(db));
  app.post('/api/auth/refresh', refreshHandler(db));

  app.get('/api/admin/users', authenticate(db), requireRole(['SUPER_ADMIN']), (_req, res) => {
    const rows = db.prepare('SELECT id, email, full_name, mobile, role, brand_id, partner_id FROM users').all();
    res.json({ items: rows.map(serializeAdminUser) });
  });

  app.get('/api/admin/products', authenticate(db), requireRole(['SUPER_ADMIN']), (req, res) => {
    const q = (req.query.q || '').toString().trim();
    const category = (req.query.category || '').toString().trim();
    const status = (req.query.status || '').toString().trim(); // active|archived|all
    const brandId = req.query.brandId ? Number(req.query.brandId) : null;

    const clauses = [];
    const params = [];

    if (q) {
      clauses.push('(title LIKE ? OR sku_asin LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }
    if (category) {
      clauses.push('category = ?');
      params.push(category);
    }
    if (brandId) {
      clauses.push('brand_id = ?');
      params.push(brandId);
    }
    if (status === 'active') clauses.push('is_archived = 0');
    if (status === 'archived') clauses.push('is_archived = 1');

    const sql = `SELECT * FROM products ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY id DESC`;
    const rows = db.prepare(sql).all(...params);
    res.json({ items: rows.map(serializeProduct) });
  });

  app.post('/api/admin/products/:productId/moderate', authenticate(db), requireRole(['SUPER_ADMIN']), (req, res) => {
    const productId = Number(req.params.productId);
    const { lock, note } = req.body || {};

    db.prepare(
      `UPDATE products SET is_locked = ?, moderation_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(lock ? 1 : 0, note || null, productId);

    logAudit(db, {
      actorUserId: req.user.id,
      action: 'PRODUCT_MODERATED',
      resourceType: 'product',
      resourceId: String(productId),
      metadata: { lock: Boolean(lock), note: note || null }
    });

    res.json({ ok: true });
  });

  app.post('/api/admin/campaigns/:campaignId/override', authenticate(db), requireRole(['SUPER_ADMIN']), (req, res) => {
    const campaignId = Number(req.params.campaignId);
    const { status, lockEdits } = req.body || {};

    if (status && !CAMPAIGN_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    db.prepare(
      `UPDATE campaigns
       SET status = COALESCE(?, status),
           is_edit_locked = CASE WHEN ? IS NULL THEN is_edit_locked ELSE ? END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(status || null, typeof lockEdits === 'boolean' ? Number(lockEdits) : null, typeof lockEdits === 'boolean' ? Number(lockEdits) : null, campaignId);

    logAudit(db, {
      actorUserId: req.user.id,
      action: 'CAMPAIGN_ADMIN_OVERRIDE',
      resourceType: 'campaign',
      resourceId: String(campaignId),
      metadata: { status: status || null, lockEdits: typeof lockEdits === 'boolean' ? lockEdits : null }
    });

    res.json({ ok: true });
  });


  app.get('/api/admin/orders', authenticate(db), requireRole(['SUPER_ADMIN']), (req, res) => {
    const status = (req.query.status || '').toString().trim();
    const clauses = [];
    const params = [];
    if (status) {
      clauses.push('status = ?');
      params.push(status);
    }
    const sql = `SELECT id, campaign_id, product_id, brand_id, partner_id, amount_cents, quantity, notes, status, brand_decision_reason, admin_override_note, updated_at FROM orders ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY id DESC`;
    res.json({ items: db.prepare(sql).all(...params) });
  });

  app.post('/api/admin/orders/:orderId/override', authenticate(db), requireRole(['SUPER_ADMIN']), (req, res) => {
    const orderId = Number(req.params.orderId);
    const { status, note } = req.body || {};
    if (!['DRAFT', 'SUBMITTED', 'BRAND_APPROVED', 'BRAND_REJECTED', 'ENDED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const existing = db.prepare('SELECT id FROM orders WHERE id = ?').get(orderId);
    if (!existing) return res.status(404).json({ error: 'Order not found' });

    db.prepare(
      `UPDATE orders SET status = ?, admin_override_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(status, note || null, orderId);

    logAudit(db, {
      actorUserId: req.user.id,
      action: 'ORDER_ADMIN_OVERRIDDEN',
      resourceType: 'order',
      resourceId: String(orderId),
      metadata: { status, note: note || null }
    });

    res.json({ ok: true });
  });


  app.get('/api/admin/partners/:partnerId', authenticate(db), requireRole(['SUPER_ADMIN']), (req, res) => {
    const partnerId = Number(req.params.partnerId);
    const partnerUser = db
      .prepare('SELECT id, email, full_name, mobile, role, partner_id FROM users WHERE role = ? AND partner_id = ?')
      .get('PARTNER', partnerId);

    if (!partnerUser) return res.status(404).json({ error: 'Partner not found' });

    const profile = db
      .prepare('SELECT partner_id, display_name, phone, company_name, updated_at FROM partner_profiles WHERE partner_id = ?')
      .get(partnerId);

    const kyc = db
      .prepare('SELECT doc_type, file_encrypted, status, rejection_reason, submitted_at, decided_at FROM partner_kyc WHERE partner_id = ?')
      .get(partnerId);

    const bank = db
      .prepare(`SELECT account_holder_name_encrypted, account_number_encrypted, ifsc_encrypted, bank_verified, verified_at
                FROM partner_bank_accounts WHERE partner_id = ?`)
      .get(partnerId);

    const totals = {
      totalOrders: db.prepare('SELECT COUNT(*) AS c FROM orders WHERE partner_id = ?').get(partnerId).c,
      totalReviews: db.prepare('SELECT COUNT(*) AS c FROM reviews WHERE partner_id = ?').get(partnerId).c,
      totalPayouts: db.prepare('SELECT COALESCE(SUM(amount_cents), 0) AS c FROM payouts WHERE partner_id = ?').get(partnerId).c
    };

    res.json({
      partner: {
        id: partnerUser.id,
        partnerId: partnerUser.partner_id,
        email: partnerUser.email,
        fullName: partnerUser.full_name,
        mobile: partnerUser.mobile,
        profile,
        kyc: kyc
          ? {
              docType: kyc.doc_type,
              file: decryptText(kyc.file_encrypted),
              status: kyc.status,
              rejectionReason: kyc.rejection_reason,
              submittedAt: kyc.submitted_at,
              decidedAt: kyc.decided_at
            }
          : null,
        bank: bank
          ? {
              accountHolderName: decryptText(bank.account_holder_name_encrypted),
              accountNumber: decryptText(bank.account_number_encrypted),
              ifsc: decryptText(bank.ifsc_encrypted),
              bankVerified: Boolean(bank.bank_verified),
              verifiedAt: bank.verified_at
            }
          : null,
        totals
      }
    });
  });

  app.post('/api/admin/partners/:partnerId/kyc/decision', authenticate(db), requireRole(['SUPER_ADMIN']), (req, res) => {
    const partnerId = Number(req.params.partnerId);
    const { decision, reason } = req.body || {};
    if (!['APPROVED', 'REJECTED'].includes(decision)) {
      return res.status(400).json({ error: 'decision must be APPROVED or REJECTED' });
    }
    if (decision === 'REJECTED' && !reason) {
      return res.status(400).json({ error: 'reason required when rejecting' });
    }

    const existing = db.prepare('SELECT id FROM partner_kyc WHERE partner_id = ?').get(partnerId);
    if (!existing) return res.status(404).json({ error: 'KYC record not found' });

    db.prepare(
      `UPDATE partner_kyc
       SET status = ?, rejection_reason = ?, decided_at = CURRENT_TIMESTAMP, decided_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE partner_id = ?`
    ).run(decision, decision === 'REJECTED' ? reason : null, req.user.id, partnerId);

    logAudit(db, {
      actorUserId: req.user.id,
      action: 'PARTNER_KYC_DECISION',
      resourceType: 'partner_kyc',
      resourceId: String(partnerId),
      metadata: { decision, reason: reason || null }
    });

    res.json({ ok: true });
  });

  app.post('/api/admin/partners/:partnerId/bank/verify', authenticate(db), requireRole(['SUPER_ADMIN']), (req, res) => {
    const partnerId = Number(req.params.partnerId);
    const existing = db.prepare('SELECT id FROM partner_bank_accounts WHERE partner_id = ?').get(partnerId);
    if (!existing) return res.status(404).json({ error: 'Bank record not found' });

    db.prepare(
      `UPDATE partner_bank_accounts
       SET bank_verified = 1, verified_at = CURRENT_TIMESTAMP, verified_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE partner_id = ?`
    ).run(req.user.id, partnerId);

    logAudit(db, {
      actorUserId: req.user.id,
      action: 'PARTNER_BANK_VERIFIED',
      resourceType: 'partner_bank',
      resourceId: String(partnerId)
    });

    res.json({ ok: true });
  });

  app.get('/api/brand/users', authenticate(db), requireRole(['BRAND']), (req, res) => {
    const rows = db
      .prepare('SELECT id, role, brand_id, partner_id FROM users WHERE brand_id = ?')
      .all(req.user.brand_id);

    logAudit(db, {
      actorUserId: req.user.id,
      action: 'BRAND_USERS_LISTED',
      resourceType: 'users',
      metadata: { brandId: req.user.brand_id, count: rows.length }
    });

    res.json({ items: rows.map(serializeBrandUser) });
  });

  app.get('/api/brand/products', authenticate(db), requireRole(['BRAND']), (req, res) => {
    const q = (req.query.q || '').toString().trim();
    const category = (req.query.category || '').toString().trim();
    const status = (req.query.status || '').toString().trim(); // active|archived|all

    const clauses = ['brand_id = ?'];
    const params = [req.user.brand_id];

    if (q) {
      clauses.push('(title LIKE ? OR sku_asin LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }
    if (category) {
      clauses.push('category = ?');
      params.push(category);
    }
    if (status === 'active') clauses.push('is_archived = 0');
    if (status === 'archived') clauses.push('is_archived = 1');

    const rows = db.prepare(`SELECT * FROM products WHERE ${clauses.join(' AND ')} ORDER BY id DESC`).all(...params);
    res.json({ items: rows.map(serializeProduct) });
  });

  app.post('/api/brand/products', authenticate(db), requireRole(['BRAND']), (req, res) => {
    const { skuAsin, title, category, images = [], marketplaceLinks = [] } = req.body || {};
    if (!skuAsin || !title) return res.status(400).json({ error: 'skuAsin and title required' });

    const result = db.prepare(
      `INSERT INTO products
       (brand_id, sku_asin, title, category, images_json, marketplace_links_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    ).run(
      req.user.brand_id,
      skuAsin,
      title,
      category || null,
      JSON.stringify(images),
      JSON.stringify(marketplaceLinks)
    );

    logAudit(db, {
      actorUserId: req.user.id,
      action: 'PRODUCT_CREATED',
      resourceType: 'product',
      resourceId: String(result.lastInsertRowid),
      metadata: { brandId: req.user.brand_id, skuAsin }
    });

    res.status(201).json({ id: Number(result.lastInsertRowid) });
  });

  app.put('/api/brand/products/:productId', authenticate(db), requireRole(['BRAND']), (req, res) => {
    const productId = Number(req.params.productId);
    const current = db.prepare('SELECT * FROM products WHERE id = ? AND brand_id = ?').get(productId, req.user.brand_id);
    if (!current) return res.status(404).json({ error: 'Product not found' });
    if (current.is_locked) return res.status(423).json({ error: 'Product is locked by admin moderation' });

    const { skuAsin, title, category, images, marketplaceLinks } = req.body || {};
    db.prepare(
      `UPDATE products
       SET sku_asin = ?, title = ?, category = ?, images_json = ?, marketplace_links_json = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND brand_id = ?`
    ).run(
      skuAsin || current.sku_asin,
      title || current.title,
      typeof category === 'undefined' ? current.category : category,
      JSON.stringify(images || parseJsonArray(current.images_json)),
      JSON.stringify(marketplaceLinks || parseJsonArray(current.marketplace_links_json)),
      productId,
      req.user.brand_id
    );

    logAudit(db, {
      actorUserId: req.user.id,
      action: 'PRODUCT_UPDATED',
      resourceType: 'product',
      resourceId: String(productId)
    });

    res.json({ ok: true });
  });

  app.post('/api/brand/products/:productId/archive', authenticate(db), requireRole(['BRAND']), (req, res) => {
    const productId = Number(req.params.productId);
    const current = db.prepare('SELECT id FROM products WHERE id = ? AND brand_id = ?').get(productId, req.user.brand_id);
    if (!current) return res.status(404).json({ error: 'Product not found' });

    db.prepare('UPDATE products SET is_archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(productId);

    logAudit(db, {
      actorUserId: req.user.id,
      action: 'PRODUCT_ARCHIVED',
      resourceType: 'product',
      resourceId: String(productId)
    });

    res.json({ ok: true });
  });

  app.get('/api/brand/campaigns', authenticate(db), requireRole(['BRAND']), (req, res) => {
    const status = (req.query.status || '').toString().trim();
    const q = (req.query.q || '').toString().trim();
    const clauses = ['brand_id = ?'];
    const params = [req.user.brand_id];
    if (status) {
      clauses.push('status = ?');
      params.push(status);
    }
    if (q) {
      clauses.push('name LIKE ?');
      params.push(`%${q}%`);
    }
    const rows = db.prepare(`SELECT * FROM campaigns WHERE ${clauses.join(' AND ')} ORDER BY id DESC`).all(...params);
    res.json({ items: rows.map(normalizeCampaign) });
  });

  app.post('/api/brand/campaigns', authenticate(db), requireRole(['BRAND']), (req, res) => {
    const { name, marketplace, startAt, endAt, targetReviews, budget, guidelines, status } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name required' });
    const campaignStatus = status || 'DRAFT';
    if (!CAMPAIGN_STATUSES.includes(campaignStatus)) return res.status(400).json({ error: 'Invalid status' });

    const result = db.prepare(
      `INSERT INTO campaigns
       (brand_id, name, marketplace, start_at, end_at, target_reviews, budget_cents, guidelines, status, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    ).run(
      req.user.brand_id,
      name,
      marketplace || null,
      startAt || null,
      endAt || null,
      Number(targetReviews || 0),
      Number(budget || 0),
      guidelines || null,
      campaignStatus
    );

    logAudit(db, {
      actorUserId: req.user.id,
      action: 'CAMPAIGN_CREATED',
      resourceType: 'campaign',
      resourceId: String(result.lastInsertRowid)
    });

    res.status(201).json({ id: Number(result.lastInsertRowid) });
  });

  app.put('/api/brand/campaigns/:campaignId', authenticate(db), requireRole(['BRAND']), (req, res) => {
    const campaignId = Number(req.params.campaignId);
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ? AND brand_id = ?').get(campaignId, req.user.brand_id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (campaign.is_edit_locked) return res.status(423).json({ error: 'Campaign edits locked by admin' });

    const { name, marketplace, startAt, endAt, targetReviews, budget, guidelines } = req.body || {};

    db.prepare(
      `UPDATE campaigns
       SET name = ?, marketplace = ?, start_at = ?, end_at = ?, target_reviews = ?, budget_cents = ?, guidelines = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND brand_id = ?`
    ).run(
      name || campaign.name,
      typeof marketplace === 'undefined' ? campaign.marketplace : marketplace,
      typeof startAt === 'undefined' ? campaign.start_at : startAt,
      typeof endAt === 'undefined' ? campaign.end_at : endAt,
      typeof targetReviews === 'undefined' ? campaign.target_reviews : Number(targetReviews),
      typeof budget === 'undefined' ? campaign.budget_cents : Number(budget),
      typeof guidelines === 'undefined' ? campaign.guidelines : guidelines,
      campaignId,
      req.user.brand_id
    );

    logAudit(db, {
      actorUserId: req.user.id,
      action: 'CAMPAIGN_UPDATED',
      resourceType: 'campaign',
      resourceId: String(campaignId)
    });

    res.json({ ok: true });
  });

  app.post('/api/brand/campaigns/:campaignId/status', authenticate(db), requireRole(['BRAND']), (req, res) => {
    const campaignId = Number(req.params.campaignId);
    const { status } = req.body || {};
    if (!CAMPAIGN_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ? AND brand_id = ?').get(campaignId, req.user.brand_id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (campaign.is_edit_locked) return res.status(423).json({ error: 'Campaign edits locked by admin' });

    db.prepare('UPDATE campaigns SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, campaignId);

    logAudit(db, {
      actorUserId: req.user.id,
      action: 'CAMPAIGN_STATUS_CHANGED',
      resourceType: 'campaign',
      resourceId: String(campaignId),
      metadata: { status }
    });

    res.json({ ok: true });
  });

  app.put('/api/brand/campaigns/:campaignId/products', authenticate(db), requireRole(['BRAND']), (req, res) => {
    const campaignId = Number(req.params.campaignId);
    const { productIds = [] } = req.body || {};
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ? AND brand_id = ?').get(campaignId, req.user.brand_id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (campaign.is_edit_locked) return res.status(423).json({ error: 'Campaign edits locked by admin' });

    const productRows = productIds.length
      ? db.prepare(`SELECT id FROM products WHERE brand_id = ? AND id IN (${productIds.map(() => '?').join(',')})`).all(req.user.brand_id, ...productIds)
      : [];
    if (productRows.length !== productIds.length) return res.status(400).json({ error: 'All products must belong to brand' });

    db.prepare('DELETE FROM campaign_products WHERE campaign_id = ?').run(campaignId);
    const insert = db.prepare('INSERT INTO campaign_products (campaign_id, product_id) VALUES (?, ?)');
    for (const pid of productIds) insert.run(campaignId, pid);

    logAudit(db, {
      actorUserId: req.user.id,
      action: 'CAMPAIGN_PRODUCTS_MAPPED',
      resourceType: 'campaign',
      resourceId: String(campaignId),
      metadata: { productIds }
    });

    res.json({ ok: true });
  });

  app.put('/api/brand/campaigns/:campaignId/eligibility', authenticate(db), requireRole(['BRAND']), (req, res) => {
    const campaignId = Number(req.params.campaignId);
    const { openToAllPartners = true, allowedPartners = [], partnerLimits = [] } = req.body || {};

    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ? AND brand_id = ?').get(campaignId, req.user.brand_id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (campaign.is_edit_locked) return res.status(423).json({ error: 'Campaign edits locked by admin' });

    db.prepare('UPDATE campaigns SET open_to_all_partners = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(openToAllPartners ? 1 : 0, campaignId);

    db.prepare('DELETE FROM campaign_allowed_partners WHERE campaign_id = ?').run(campaignId);
    db.prepare('DELETE FROM campaign_partner_limits WHERE campaign_id = ?').run(campaignId);

    const insertAllowed = db.prepare('INSERT INTO campaign_allowed_partners (campaign_id, partner_id) VALUES (?, ?)');
    for (const pid of allowedPartners) insertAllowed.run(campaignId, Number(pid));

    const insertLimit = db.prepare(
      'INSERT INTO campaign_partner_limits (campaign_id, partner_id, max_reviews, max_orders) VALUES (?, ?, ?, ?)'
    );
    for (const row of partnerLimits) {
      if (!row || typeof row.partnerId === 'undefined') continue;
      insertLimit.run(campaignId, Number(row.partnerId), row.maxReviews ?? null, row.maxOrders ?? null);
    }

    logAudit(db, {
      actorUserId: req.user.id,
      action: 'CAMPAIGN_ELIGIBILITY_UPDATED',
      resourceType: 'campaign',
      resourceId: String(campaignId),
      metadata: { openToAllPartners, allowedPartners, partnerLimits }
    });

    res.json({ ok: true });
  });


  app.get('/api/brand/orders', authenticate(db), requireRole(['BRAND']), (req, res) => {
    const status = (req.query.status || '').toString().trim();
    const clauses = ['brand_id = ?'];
    const params = [req.user.brand_id];
    if (status) {
      clauses.push('status = ?');
      params.push(status);
    }
    const sql = `SELECT id, campaign_id, product_id, brand_id, partner_id, amount_cents, quantity, notes, status, brand_decision_reason, updated_at FROM orders WHERE ${clauses.join(' AND ')} ORDER BY id DESC`;
    res.json({ items: db.prepare(sql).all(...params) });
  });

  app.post('/api/brand/orders/:orderId/decision', authenticate(db), requireRole(['BRAND']), (req, res) => {
    const orderId = Number(req.params.orderId);
    const { decision, reason } = req.body || {};
    if (!['BRAND_APPROVED', 'BRAND_REJECTED'].includes(decision)) {
      return res.status(400).json({ error: 'decision must be BRAND_APPROVED or BRAND_REJECTED' });
    }
    if (decision === 'BRAND_REJECTED' && !reason) {
      return res.status(400).json({ error: 'reason required when rejecting' });
    }

    const order = db.prepare('SELECT * FROM orders WHERE id = ? AND brand_id = ?').get(orderId, req.user.brand_id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'SUBMITTED') return res.status(400).json({ error: 'Only SUBMITTED orders can be decided' });

    db.prepare(
      `UPDATE orders SET status = ?, brand_decision_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(decision, decision === 'BRAND_REJECTED' ? reason : null, orderId);

    logAudit(db, {
      actorUserId: req.user.id,
      action: 'ORDER_BRAND_DECIDED',
      resourceType: 'order',
      resourceId: String(orderId),
      metadata: { decision, reason: reason || null }
    });

    res.json({ ok: true });
  });

  app.get('/api/brand/reviews', authenticate(db), requireRole(['BRAND']), (req, res) => {
    const scoped = withBrandScope(req, 'SELECT id, order_id, brand_id, partner_id, rating, comment FROM reviews');
    res.json({ items: db.prepare(scoped.sql).all(...scoped.params) });
  });

  app.get('/api/brand/partners/:partnerId/kyc', authenticate(db), requireRole(['BRAND']), (_req, res) => {
    return res.status(403).json({ error: 'Forbidden' });
  });

  app.get('/api/brand/partners/:partnerId/bank', authenticate(db), requireRole(['BRAND']), (_req, res) => {
    return res.status(403).json({ error: 'Forbidden' });
  });

  app.get('/api/partner/orders', authenticate(db), requireRole(['PARTNER']), (req, res) => {
    const status = (req.query.status || '').toString().trim();
    const clauses = ['partner_id = ?'];
    const params = [req.user.partner_id];
    if (status) {
      clauses.push('status = ?');
      params.push(status);
    }
    const sql = `SELECT id, campaign_id, product_id, brand_id, partner_id, amount_cents, quantity, notes, status, brand_decision_reason, updated_at FROM orders WHERE ${clauses.join(' AND ')} ORDER BY id DESC`;
    res.json({ items: db.prepare(sql).all(...params) });
  });

  app.post('/api/partner/orders', authenticate(db), requireRole(['PARTNER']), (req, res) => {
    const { campaignId, productId, amount, quantity, notes } = req.body || {};
    if (!campaignId || !productId || !amount || !quantity) {
      return res.status(400).json({ error: 'campaignId, productId, amount, quantity required' });
    }

    const campaign = db
      .prepare(
        `SELECT c.* FROM campaigns c
         WHERE c.id = ? AND (
           c.open_to_all_partners = 1
           OR EXISTS (SELECT 1 FROM campaign_allowed_partners cap WHERE cap.campaign_id = c.id AND cap.partner_id = ?)
         )`
      )
      .get(Number(campaignId), req.user.partner_id);
    if (!campaign) return res.status(403).json({ error: 'Not eligible for campaign' });

    const product = db
      .prepare('SELECT * FROM products WHERE id = ? AND brand_id = ? AND is_archived = 0 AND is_locked = 0')
      .get(Number(productId), campaign.brand_id);
    if (!product) return res.status(400).json({ error: 'Invalid product for campaign brand' });

    const map = db.prepare('SELECT 1 FROM campaign_products WHERE campaign_id = ? AND product_id = ?').get(Number(campaignId), Number(productId));
    if (!map) return res.status(400).json({ error: 'Product not mapped to campaign' });

    const result = db.prepare(
      `INSERT INTO orders (campaign_id, product_id, brand_id, partner_id, amount_cents, quantity, notes, status, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'DRAFT', CURRENT_TIMESTAMP)`
    ).run(Number(campaignId), Number(productId), campaign.brand_id, req.user.partner_id, Number(amount), Number(quantity), notes || null);

    logAudit(db, {
      actorUserId: req.user.id,
      action: 'ORDER_CREATED_DRAFT',
      resourceType: 'order',
      resourceId: String(result.lastInsertRowid)
    });

    res.status(201).json({ id: Number(result.lastInsertRowid), status: 'DRAFT' });
  });

  app.post('/api/partner/orders/:orderId/submit', authenticate(db), requireRole(['PARTNER']), (req, res) => {
    const orderId = Number(req.params.orderId);
    const order = db.prepare('SELECT * FROM orders WHERE id = ? AND partner_id = ?').get(orderId, req.user.partner_id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'DRAFT') return res.status(400).json({ error: 'Only DRAFT orders can be submitted' });

    db.prepare('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('SUBMITTED', orderId);

    logAudit(db, {
      actorUserId: req.user.id,
      action: 'ORDER_SUBMITTED',
      resourceType: 'order',
      resourceId: String(orderId)
    });

    res.json({ ok: true, status: 'SUBMITTED' });
  });


  app.get('/api/partner/campaigns', authenticate(db), requireRole(['PARTNER']), (req, res) => {
    const rows = db
      .prepare(
        `SELECT c.*
         FROM campaigns c
         WHERE c.status = 'ACTIVE'
           AND (
             c.open_to_all_partners = 1
             OR EXISTS (
               SELECT 1 FROM campaign_allowed_partners cap
               WHERE cap.campaign_id = c.id AND cap.partner_id = ?
             )
           )
         ORDER BY c.id DESC`
      )
      .all(req.user.partner_id);

    const limitRows = db
      .prepare('SELECT campaign_id, partner_id, max_reviews, max_orders FROM campaign_partner_limits WHERE partner_id = ?')
      .all(req.user.partner_id);
    const limitMap = new Map(limitRows.map((r) => [r.campaign_id, r]));

    res.json({
      items: rows.map((r) => ({
        ...normalizeCampaign(r),
        partnerLimits: limitMap.has(r.id)
          ? {
              maxReviews: limitMap.get(r.id).max_reviews,
              maxOrders: limitMap.get(r.id).max_orders
            }
          : null
      }))
    });
  });

  app.get('/api/partner/products', authenticate(db), requireRole(['PARTNER']), (req, res) => {
    const rows = db
      .prepare(
        `SELECT DISTINCT p.*
         FROM products p
         JOIN campaign_products cp ON cp.product_id = p.id
         JOIN campaigns c ON c.id = cp.campaign_id
         WHERE c.status = 'ACTIVE'
           AND p.is_archived = 0
           AND p.is_locked = 0
           AND (
             c.open_to_all_partners = 1
             OR EXISTS (
               SELECT 1 FROM campaign_allowed_partners cap
               WHERE cap.campaign_id = c.id AND cap.partner_id = ?
             )
           )
         ORDER BY p.id DESC`
      )
      .all(req.user.partner_id);

    res.json({ items: rows.map(serializeProduct) });
  });


  app.get('/api/partner/users', authenticate(db), requireRole(['PARTNER']), (req, res) => {
    const scoped = withPartnerScope(req, 'SELECT id, role, brand_id, partner_id FROM users');
    res.json({ items: db.prepare(scoped.sql).all(...scoped.params) });
  });

  app.get('/api/partner/profile', authenticate(db), requireRole(['PARTNER']), (req, res) => {
    const profile = db
      .prepare('SELECT partner_id, display_name, phone, company_name, updated_at FROM partner_profiles WHERE partner_id = ?')
      .get(req.user.partner_id);

    res.json({
      profile: profile || {
        partner_id: req.user.partner_id,
        display_name: '',
        phone: '',
        company_name: '',
        updated_at: null
      }
    });
  });

  app.put('/api/partner/profile', authenticate(db), requireRole(['PARTNER']), (req, res) => {
    const { displayName, phone, companyName } = req.body || {};
    if (!displayName) return res.status(400).json({ error: 'displayName required' });

    db.prepare(
      `INSERT INTO partner_profiles (partner_id, display_name, phone, company_name, updated_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(partner_id)
       DO UPDATE SET display_name=excluded.display_name, phone=excluded.phone, company_name=excluded.company_name, updated_at=CURRENT_TIMESTAMP`
    ).run(req.user.partner_id, displayName, phone || null, companyName || null);

    logAudit(db, {
      actorUserId: req.user.id,
      action: 'PARTNER_PROFILE_UPDATED',
      resourceType: 'partner_profile',
      resourceId: String(req.user.partner_id)
    });

    res.json({ ok: true });
  });

  app.get('/api/partner/kyc', authenticate(db), requireRole(['PARTNER']), (req, res) => {
    const row = db
      .prepare('SELECT doc_type, status, rejection_reason, submitted_at, decided_at FROM partner_kyc WHERE partner_id = ?')
      .get(req.user.partner_id);

    if (!row) {
      return res.json({ kyc: { docType: null, status: 'NOT_SUBMITTED', rejectionReason: null } });
    }

    res.json({
      kyc: {
        docType: row.doc_type,
        status: row.status,
        rejectionReason: row.rejection_reason,
        submittedAt: row.submitted_at,
        decidedAt: row.decided_at
      }
    });
  });

  app.post('/api/partner/kyc', authenticate(db), requireRole(['PARTNER']), (req, res) => {
    const { docType, file } = req.body || {};
    if (!docType || !file) return res.status(400).json({ error: 'docType and file required' });

    db.prepare(
      `INSERT INTO partner_kyc (partner_id, doc_type, file_encrypted, status, rejection_reason, submitted_at, updated_at)
       VALUES (?, ?, ?, 'SUBMITTED', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(partner_id)
       DO UPDATE SET doc_type=excluded.doc_type, file_encrypted=excluded.file_encrypted, status='SUBMITTED',
                     rejection_reason=NULL, submitted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP`
    ).run(req.user.partner_id, docType, encryptText(file));

    logAudit(db, {
      actorUserId: req.user.id,
      action: 'PARTNER_KYC_SUBMITTED',
      resourceType: 'partner_kyc',
      resourceId: String(req.user.partner_id),
      metadata: { docType }
    });

    res.json({ ok: true, status: 'SUBMITTED' });
  });

  app.get('/api/partner/bank', authenticate(db), requireRole(['PARTNER']), (req, res) => {
    const row = db
      .prepare('SELECT account_number_encrypted, bank_verified, updated_at FROM partner_bank_accounts WHERE partner_id = ?')
      .get(req.user.partner_id);

    if (!row) {
      return res.json({ bank: { accountMasked: null, bankVerified: false, updatedAt: null } });
    }

    res.json({
      bank: {
        accountMasked: maskLast4(decryptText(row.account_number_encrypted)),
        bankVerified: Boolean(row.bank_verified),
        updatedAt: row.updated_at
      }
    });
  });

  app.put('/api/partner/bank', authenticate(db), requireRole(['PARTNER']), (req, res) => {
    const { accountHolderName, accountNumber, ifsc } = req.body || {};
    if (!accountHolderName || !accountNumber || !ifsc) {
      return res.status(400).json({ error: 'accountHolderName, accountNumber, ifsc required' });
    }

    db.prepare(
      `INSERT INTO partner_bank_accounts
       (partner_id, account_holder_name_encrypted, account_number_encrypted, ifsc_encrypted, bank_verified, verified_at, verified_by_user_id, updated_at)
       VALUES (?, ?, ?, ?, 0, NULL, NULL, CURRENT_TIMESTAMP)
       ON CONFLICT(partner_id)
       DO UPDATE SET account_holder_name_encrypted=excluded.account_holder_name_encrypted,
                     account_number_encrypted=excluded.account_number_encrypted,
                     ifsc_encrypted=excluded.ifsc_encrypted,
                     bank_verified=0,
                     verified_at=NULL,
                     verified_by_user_id=NULL,
                     updated_at=CURRENT_TIMESTAMP`
    ).run(req.user.partner_id, encryptText(accountHolderName), encryptText(accountNumber), encryptText(ifsc));

    logAudit(db, {
      actorUserId: req.user.id,
      action: 'PARTNER_BANK_UPDATED',
      resourceType: 'partner_bank',
      resourceId: String(req.user.partner_id)
    });

    res.json({ ok: true, bankVerified: false, accountMasked: maskLast4(accountNumber) });
  });

  app.get('/api/me', authenticate(db), requireRole(['SUPER_ADMIN', 'BRAND', 'PARTNER', 'USER']), (req, res) => {
    res.json({
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
      brandId: req.user.brand_id,
      partnerId: req.user.partner_id
    });
  });

  app.get('/api/audit-logs', authenticate(db), requireRole(['SUPER_ADMIN']), (_req, res) => {
    const rows = db
      .prepare('SELECT id, actor_user_id, action, resource_type, resource_id, metadata_json, created_at FROM audit_logs ORDER BY id DESC')
      .all();
    res.json({ items: rows });
  });

  app.locals.db = db;
  return app;
}

module.exports = { createApp };
