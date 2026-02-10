const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');

async function login(baseUrl, email, password = 'password123') {
  const resp = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  assert.equal(resp.status, 200);
  return resp.json();
}

test('BRAND endpoint never returns user PII fields', async () => {
  const app = createApp();
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const { accessToken } = await login(baseUrl, 'brand@example.com');
    const resp = await fetch(`${baseUrl}/api/brand/users`, {
      headers: { authorization: `Bearer ${accessToken}` }
    });
    assert.equal(resp.status, 200);
    const body = await resp.json();
    for (const row of body.items) {
      assert.equal(Object.hasOwn(row, 'email'), false);
      assert.equal(Object.hasOwn(row, 'fullName'), false);
      assert.equal(Object.hasOwn(row, 'mobile'), false);
      assert.deepEqual(Object.keys(row).sort(), ['brandId', 'id', 'partnerId', 'role']);
    }
  } finally {
    server.close();
  }
});

test('Role restrictions and tenant scoping for brand/partner', async () => {
  const app = createApp();
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const brand = await login(baseUrl, 'brand@example.com');
    const partner = await login(baseUrl, 'partner@example.com');

    const adminForBrand = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { authorization: `Bearer ${brand.accessToken}` }
    });
    assert.equal(adminForBrand.status, 403);

    const brandOrdersResp = await fetch(`${baseUrl}/api/brand/orders`, {
      headers: { authorization: `Bearer ${brand.accessToken}` }
    });
    const brandOrders = await brandOrdersResp.json();
    assert.equal(brandOrders.items.length, 1);
    assert.equal(brandOrders.items[0].brand_id, 1);

    const partnerOrdersResp = await fetch(`${baseUrl}/api/partner/orders`, {
      headers: { authorization: `Bearer ${partner.accessToken}` }
    });
    const partnerOrders = await partnerOrdersResp.json();
    assert.equal(partnerOrders.items.length, 1);
    assert.equal(partnerOrders.items[0].partner_id, 100);
  } finally {
    server.close();
  }
});

test('Partner profile + KYC + bank workflow and masking', async () => {
  const app = createApp();
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const partner = await login(baseUrl, 'partner@example.com');

    let resp = await fetch(`${baseUrl}/api/partner/profile`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${partner.accessToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ displayName: 'Partner Prime', phone: '9876543210', companyName: 'Prime Co' })
    });
    assert.equal(resp.status, 200);

    resp = await fetch(`${baseUrl}/api/partner/kyc`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${partner.accessToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ docType: 'PAN', file: 'pan-content' })
    });
    assert.equal(resp.status, 200);

    resp = await fetch(`${baseUrl}/api/partner/bank`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${partner.accessToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ accountHolderName: 'Partner Prime', accountNumber: '123456789012', ifsc: 'HDFC0000123' })
    });
    assert.equal(resp.status, 200);

    const bankResp = await fetch(`${baseUrl}/api/partner/bank`, {
      headers: { authorization: `Bearer ${partner.accessToken}` }
    });
    const bankBody = await bankResp.json();
    assert.equal(bankResp.status, 200);
    assert.equal(bankBody.bank.bankVerified, false);
    assert.equal(bankBody.bank.accountMasked.endsWith('9012'), true);
  } finally {
    server.close();
  }
});

test('Admin can approve KYC, verify bank and read totals; BRAND cannot access partner sensitive endpoints', async () => {
  const app = createApp();
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const partner = await login(baseUrl, 'partner@example.com');
    const admin = await login(baseUrl, 'admin@example.com');
    const brand = await login(baseUrl, 'brand@example.com');

    await fetch(`${baseUrl}/api/partner/profile`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${partner.accessToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ displayName: 'Partner Prime', phone: '9876543210', companyName: 'Prime Co' })
    });

    await fetch(`${baseUrl}/api/partner/kyc`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${partner.accessToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ docType: 'PAN', file: 'pan-content' })
    });

    await fetch(`${baseUrl}/api/partner/bank`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${partner.accessToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ accountHolderName: 'Partner Prime', accountNumber: '123456789012', ifsc: 'HDFC0000123' })
    });

    const approveResp = await fetch(`${baseUrl}/api/admin/partners/100/kyc/decision`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${admin.accessToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ decision: 'APPROVED' })
    });
    assert.equal(approveResp.status, 200);

    const verifyResp = await fetch(`${baseUrl}/api/admin/partners/100/bank/verify`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${admin.accessToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({})
    });
    assert.equal(verifyResp.status, 200);

    const detailResp = await fetch(`${baseUrl}/api/admin/partners/100`, {
      headers: { authorization: `Bearer ${admin.accessToken}` }
    });
    const detail = await detailResp.json();
    assert.equal(detailResp.status, 200);
    assert.equal(detail.partner.kyc.status, 'APPROVED');
    assert.equal(detail.partner.bank.bankVerified, true);
    assert.ok(detail.partner.totals.totalOrders >= 1);
    assert.ok(detail.partner.totals.totalReviews >= 1);
    assert.ok(detail.partner.totals.totalPayouts >= 1);

    const brandKycResp = await fetch(`${baseUrl}/api/brand/partners/100/kyc`, {
      headers: { authorization: `Bearer ${brand.accessToken}` }
    });
    const brandBankResp = await fetch(`${baseUrl}/api/brand/partners/100/bank`, {
      headers: { authorization: `Bearer ${brand.accessToken}` }
    });
    assert.equal(brandKycResp.status, 403);
    assert.equal(brandBankResp.status, 403);

    const auditResp = await fetch(`${baseUrl}/api/audit-logs`, {
      headers: { authorization: `Bearer ${admin.accessToken}` }
    });
    const auditBody = await auditResp.json();
    assert.equal(auditResp.status, 200);
    const actions = auditBody.items.map((i) => i.action);
    assert.ok(actions.includes('PARTNER_PROFILE_UPDATED'));
    assert.ok(actions.includes('PARTNER_KYC_SUBMITTED'));
    assert.ok(actions.includes('PARTNER_BANK_UPDATED'));
    assert.ok(actions.includes('PARTNER_KYC_DECISION'));
    assert.ok(actions.includes('PARTNER_BANK_VERIFIED'));
  } finally {
    server.close();
  }
});

test('Brand product catalog CRUD/search is scoped to own brand and audited', async () => {
  const app = createApp();
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const brand = await login(baseUrl, 'brand@example.com');
    const admin = await login(baseUrl, 'admin@example.com');

    const createResp = await fetch(`${baseUrl}/api/brand/products`, {
      method: 'POST',
      headers: { authorization: `Bearer ${brand.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        skuAsin: 'ASIN-NEW-1',
        title: 'Whey Isolate',
        category: 'Supplements',
        images: ['https://img/p3.png'],
        marketplaceLinks: ['https://market/p3']
      })
    });
    assert.equal(createResp.status, 201);
    const { id: newProductId } = await createResp.json();

    const editResp = await fetch(`${baseUrl}/api/brand/products/${newProductId}`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${brand.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Whey Isolate Gold' })
    });
    assert.equal(editResp.status, 200);

    const listResp = await fetch(`${baseUrl}/api/brand/products?q=Whey&status=active`, {
      headers: { authorization: `Bearer ${brand.accessToken}` }
    });
    assert.equal(listResp.status, 200);
    const listBody = await listResp.json();
    assert.ok(listBody.items.every((p) => p.brandId === 1));
    assert.ok(listBody.items.some((p) => p.id === newProductId));

    const archiveResp = await fetch(`${baseUrl}/api/brand/products/${newProductId}/archive`, {
      method: 'POST',
      headers: { authorization: `Bearer ${brand.accessToken}`, 'content-type': 'application/json' },
      body: '{}'
    });
    assert.equal(archiveResp.status, 200);

    const adminAllResp = await fetch(`${baseUrl}/api/admin/products?status=all`, {
      headers: { authorization: `Bearer ${admin.accessToken}` }
    });
    const adminAll = await adminAllResp.json();
    assert.equal(adminAllResp.status, 200);
    const found = adminAll.items.find((p) => p.id === newProductId);
    assert.equal(Boolean(found), true);
    assert.equal(found.isArchived, true);

    const auditResp = await fetch(`${baseUrl}/api/audit-logs`, {
      headers: { authorization: `Bearer ${admin.accessToken}` }
    });
    const auditBody = await auditResp.json();
    const actions = auditBody.items.map((i) => i.action);
    assert.ok(actions.includes('PRODUCT_CREATED'));
    assert.ok(actions.includes('PRODUCT_UPDATED'));
    assert.ok(actions.includes('PRODUCT_ARCHIVED'));
  } finally {
    server.close();
  }
});

test('Admin moderation lock blocks brand edits; partner only sees eligible campaign products', async () => {
  const app = createApp();
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const brand = await login(baseUrl, 'brand@example.com');
    const admin = await login(baseUrl, 'admin@example.com');
    const partner = await login(baseUrl, 'partner@example.com');

    const brandProductsResp = await fetch(`${baseUrl}/api/brand/products`, {
      headers: { authorization: `Bearer ${brand.accessToken}` }
    });
    const brandProductsBody = await brandProductsResp.json();
    const target = brandProductsBody.items[0];
    assert.ok(target);

    const modResp = await fetch(`${baseUrl}/api/admin/products/${target.id}/moderate`, {
      method: 'POST',
      headers: { authorization: `Bearer ${admin.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ lock: true, note: 'Policy review' })
    });
    assert.equal(modResp.status, 200);

    const blockedEditResp = await fetch(`${baseUrl}/api/brand/products/${target.id}`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${brand.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Should be blocked' })
    });
    assert.equal(blockedEditResp.status, 423);

    const partnerProductsResp = await fetch(`${baseUrl}/api/partner/products`, {
      headers: { authorization: `Bearer ${partner.accessToken}` }
    });
    assert.equal(partnerProductsResp.status, 200);
    const partnerProducts = await partnerProductsResp.json();
    assert.ok(partnerProducts.items.every((p) => p.id !== target.id));
    assert.ok(partnerProducts.items.every((p) => p.isArchived === false));
    assert.ok(partnerProducts.items.every((p) => p.isLocked === false));

    const adminAuditResp = await fetch(`${baseUrl}/api/audit-logs`, {
      headers: { authorization: `Bearer ${admin.accessToken}` }
    });
    const adminAudit = await adminAuditResp.json();
    assert.ok(adminAudit.items.map((i) => i.action).includes('PRODUCT_MODERATED'));
  } finally {
    server.close();
  }
});

test('Brand can create/manage campaigns with product mapping and eligibility; partner sees only eligible ACTIVE campaigns', async () => {
  const app = createApp();
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const brand = await login(baseUrl, 'brand@example.com');
    const partner = await login(baseUrl, 'partner@example.com');

    const createResp = await fetch(`${baseUrl}/api/brand/campaigns`, {
      method: 'POST',
      headers: { authorization: `Bearer ${brand.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Brand Private Push',
        marketplace: 'AMAZON',
        startAt: '2026-01-01T00:00:00Z',
        endAt: '2026-12-31T00:00:00Z',
        targetReviews: 25,
        budget: 120000,
        guidelines: 'Only verified buyers',
        status: 'ACTIVE'
      })
    });
    assert.equal(createResp.status, 201);
    const { id: campaignId } = await createResp.json();

    const brandProductsResp = await fetch(`${baseUrl}/api/brand/products`, {
      headers: { authorization: `Bearer ${brand.accessToken}` }
    });
    const brandProducts = await brandProductsResp.json();
    const brandProductIds = brandProducts.items.slice(0, 1).map((p) => p.id);

    const mapResp = await fetch(`${baseUrl}/api/brand/campaigns/${campaignId}/products`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${brand.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ productIds: brandProductIds })
    });
    assert.equal(mapResp.status, 200);

    const eligResp = await fetch(`${baseUrl}/api/brand/campaigns/${campaignId}/eligibility`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${brand.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        openToAllPartners: false,
        allowedPartners: [100],
        partnerLimits: [{ partnerId: 100, maxReviews: 10, maxOrders: 20 }]
      })
    });
    assert.equal(eligResp.status, 200);

    const partnerCampaignsResp = await fetch(`${baseUrl}/api/partner/campaigns`, {
      headers: { authorization: `Bearer ${partner.accessToken}` }
    });
    assert.equal(partnerCampaignsResp.status, 200);
    const partnerCampaigns = await partnerCampaignsResp.json();
    const found = partnerCampaigns.items.find((c) => c.id === campaignId);
    assert.ok(found);
    assert.equal(found.status, 'ACTIVE');
    assert.equal(found.partnerLimits.maxReviews, 10);

    const auditAsAdmin = await login(baseUrl, 'admin@example.com');
    const auditResp = await fetch(`${baseUrl}/api/audit-logs`, {
      headers: { authorization: `Bearer ${auditAsAdmin.accessToken}` }
    });
    const actions = (await auditResp.json()).items.map((i) => i.action);
    assert.ok(actions.includes('CAMPAIGN_CREATED'));
    assert.ok(actions.includes('CAMPAIGN_PRODUCTS_MAPPED'));
    assert.ok(actions.includes('CAMPAIGN_ELIGIBILITY_UPDATED'));
  } finally {
    server.close();
  }
});

test('Admin campaign override can lock edits and override status', async () => {
  const app = createApp();
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const brand = await login(baseUrl, 'brand@example.com');
    const admin = await login(baseUrl, 'admin@example.com');

    const createResp = await fetch(`${baseUrl}/api/brand/campaigns`, {
      method: 'POST',
      headers: { authorization: `Bearer ${brand.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Campaign To Lock', status: 'DRAFT' })
    });
    const { id: campaignId } = await createResp.json();

    const overrideResp = await fetch(`${baseUrl}/api/admin/campaigns/${campaignId}/override`, {
      method: 'POST',
      headers: { authorization: `Bearer ${admin.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'PAUSED', lockEdits: true })
    });
    assert.equal(overrideResp.status, 200);

    const editResp = await fetch(`${baseUrl}/api/brand/campaigns/${campaignId}`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${brand.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Should Fail' })
    });
    assert.equal(editResp.status, 423);

    const listResp = await fetch(`${baseUrl}/api/brand/campaigns`, {
      headers: { authorization: `Bearer ${brand.accessToken}` }
    });
    const list = await listResp.json();
    const updated = list.items.find((c) => c.id === campaignId);
    assert.equal(updated.status, 'PAUSED');
    assert.equal(updated.isEditLocked, true);
  } finally {
    server.close();
  }
});

test('Partner order submission flow DRAFT -> SUBMITTED and brand decision transitions with audit', async () => {
  const app = createApp();
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const partner = await login(baseUrl, 'partner@example.com');
    const brand = await login(baseUrl, 'brand@example.com');
    const admin = await login(baseUrl, 'admin@example.com');

    const createResp = await fetch(`${baseUrl}/api/partner/orders`, {
      method: 'POST',
      headers: { authorization: `Bearer ${partner.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ campaignId: 1, productId: 1, amount: 15000, quantity: 2, notes: 'Promo order' })
    });
    assert.equal(createResp.status, 201);
    const created = await createResp.json();

    const submitResp = await fetch(`${baseUrl}/api/partner/orders/${created.id}/submit`, {
      method: 'POST',
      headers: { authorization: `Bearer ${partner.accessToken}`, 'content-type': 'application/json' },
      body: '{}'
    });
    assert.equal(submitResp.status, 200);

    const approveResp = await fetch(`${baseUrl}/api/brand/orders/${created.id}/decision`, {
      method: 'POST',
      headers: { authorization: `Bearer ${brand.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'BRAND_APPROVED' })
    });
    assert.equal(approveResp.status, 200);

    const adminOrdersResp = await fetch(`${baseUrl}/api/admin/orders`, {
      headers: { authorization: `Bearer ${admin.accessToken}` }
    });
    assert.equal(adminOrdersResp.status, 200);
    const adminOrders = await adminOrdersResp.json();
    const row = adminOrders.items.find((o) => o.id === created.id);
    assert.ok(row);
    assert.equal(row.status, 'BRAND_APPROVED');

    const auditResp = await fetch(`${baseUrl}/api/audit-logs`, {
      headers: { authorization: `Bearer ${admin.accessToken}` }
    });
    const actions = (await auditResp.json()).items.map((i) => i.action);
    assert.ok(actions.includes('ORDER_CREATED_DRAFT'));
    assert.ok(actions.includes('ORDER_SUBMITTED'));
    assert.ok(actions.includes('ORDER_BRAND_DECIDED'));
  } finally {
    server.close();
  }
});

test('Admin can override order status and brand cannot decide non-submitted order', async () => {
  const app = createApp();
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const partner = await login(baseUrl, 'partner@example.com');
    const brand = await login(baseUrl, 'brand@example.com');
    const admin = await login(baseUrl, 'admin@example.com');

    const createResp = await fetch(`${baseUrl}/api/partner/orders`, {
      method: 'POST',
      headers: { authorization: `Bearer ${partner.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ campaignId: 1, productId: 1, amount: 12000, quantity: 1, notes: 'Draft only' })
    });
    const created = await createResp.json();

    const badBrandDecision = await fetch(`${baseUrl}/api/brand/orders/${created.id}/decision`, {
      method: 'POST',
      headers: { authorization: `Bearer ${brand.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'BRAND_APPROVED' })
    });
    assert.equal(badBrandDecision.status, 400);

    const overrideResp = await fetch(`${baseUrl}/api/admin/orders/${created.id}/override`, {
      method: 'POST',
      headers: { authorization: `Bearer ${admin.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'SUBMITTED', note: 'Admin moved forward' })
    });
    assert.equal(overrideResp.status, 200);

    const listResp = await fetch(`${baseUrl}/api/admin/orders?status=SUBMITTED`, {
      headers: { authorization: `Bearer ${admin.accessToken}` }
    });
    const list = await listResp.json();
    assert.ok(list.items.some((o) => o.id === created.id));

    const auditResp = await fetch(`${baseUrl}/api/audit-logs`, {
      headers: { authorization: `Bearer ${admin.accessToken}` }
    });
    const actions = (await auditResp.json()).items.map((i) => i.action);
    assert.ok(actions.includes('ORDER_ADMIN_OVERRIDDEN'));
  } finally {
    server.close();
  }
});
