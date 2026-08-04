const API_BASE = 'http://localhost:3000';

const loginSection = document.getElementById('login-section');
const appSection = document.getElementById('app-section');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const dashboard = document.getElementById('dashboard');

function getStored() {
  return {
    accessToken: localStorage.getItem('accessToken'),
    role: localStorage.getItem('role')
  };
}

async function api(path, options = {}) {
  const { accessToken } = getStored();
  const headers = { ...(options.headers || {}), 'content-type': 'application/json' };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  const resp = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const body = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, body };
}

function productCard(p) {
  return `<li>#${p.id} | ${p.skuAsin} | ${p.title} | ${p.category || '-'} | archived=${p.isArchived} | locked=${p.isLocked}</li>`;
}

function campaignCard(c) {
  return `<li>#${c.id} | ${c.name} | ${c.marketplace || '-'} | status=${c.status} | locked=${c.isEditLocked}</li>`;
}

function brandShell() {
  dashboard.innerHTML = `
    <h3>Brand Dashboard</h3>
    <div class="card">
      <h4>Campaign builder</h4>
      <form id="brand-create-campaign-form">
        <input id="campName" placeholder="Campaign name" required />
        <input id="campMarketplace" placeholder="Marketplace" />
        <input id="campStart" placeholder="Start ISO" />
        <input id="campEnd" placeholder="End ISO" />
        <input id="campTargetReviews" type="number" placeholder="Target reviews" />
        <input id="campBudget" type="number" placeholder="Budget cents" />
        <input id="campGuidelines" placeholder="Guidelines" />
        <select id="campStatus"><option>DRAFT</option><option>ACTIVE</option><option>PAUSED</option><option>ENDED</option></select>
        <button type="submit">Create campaign</button>
      </form>
      <input id="mapCampaignId" placeholder="Campaign ID" />
      <input id="mapProductIds" placeholder="Product IDs CSV" />
      <button id="map-products">Map products</button>
      <input id="eligCampaignId" placeholder="Campaign ID" />
      <label><input id="openToAllPartners" type="checkbox" checked /> Open to all partners</label>
      <input id="allowedPartners" placeholder="Allowed partners CSV" />
      <input id="partnerLimits" placeholder='Limits JSON [{"partnerId":100,"maxReviews":10,"maxOrders":20}]' />
      <button id="save-eligibility">Save eligibility</button>
      <input id="statusCampaignId" placeholder="Campaign ID" />
      <select id="newCampaignStatus"><option>DRAFT</option><option>ACTIVE</option><option>PAUSED</option><option>ENDED</option></select>
      <button id="update-campaign-status">Update status</button>
      <form id="brand-campaign-search-form">
        <input id="campQ" placeholder="Search campaign" />
        <select id="campFilterStatus"><option value="">All</option><option>DRAFT</option><option>ACTIVE</option><option>PAUSED</option><option>ENDED</option></select>
        <button type="submit">Load campaigns</button>
      </form>
      <ul id="brand-campaigns"></ul>
    </div>
    <div class="card">
      <h4>Add product</h4>
      <form id="brand-add-product-form">
        <input id="skuAsin" placeholder="SKU/ASIN" required />
        <input id="title" placeholder="Title" required />
        <input id="category" placeholder="Category" />
        <input id="images" placeholder="Images CSV URLs" />
        <input id="marketplaceLinks" placeholder="Marketplace links CSV" />
        <button type="submit">Add product</button>
      </form>
    </div>
    <div class="card">
      <h4>Edit/archive product</h4>
      <form id="brand-edit-product-form">
        <input id="editProductId" placeholder="Product ID" required />
        <input id="editTitle" placeholder="New title" />
        <input id="editCategory" placeholder="New category" />
        <button type="submit">Update product</button>
        <button id="archive-product-btn" type="button">Archive product</button>
      </form>
    </div>
    <div class="card">
      <h4>List/search/filter own products</h4>
      <form id="brand-search-form">
        <input id="q" placeholder="Search title or SKU/ASIN" />
        <input id="filterCategory" placeholder="Category" />
        <select id="status">
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
        <button type="submit">Search</button>
      </form>
      <ul id="brand-products"></ul>
    </div>
    <div class="card">
      <h4>Order approvals</h4>
      <button id="load-brand-orders">Load submitted orders</button>
      <ul id="brand-orders"></ul>
      <input id="brandOrderId" placeholder="Order ID" />
      <input id="brandOrderReason" placeholder="Rejection reason" />
      <button id="brand-approve-order">Approve</button>
      <button id="brand-reject-order">Reject</button>
    </div>
    <p id="brand-msg"></p>
  `;

  document.getElementById('brand-add-product-form').addEventListener('submit', addBrandProduct);
  document.getElementById('brand-edit-product-form').addEventListener('submit', editBrandProduct);
  document.getElementById('archive-product-btn').addEventListener('click', archiveBrandProduct);
  document.getElementById('brand-search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    loadBrandProducts();
  });

  document.getElementById('brand-create-campaign-form').addEventListener('submit', createBrandCampaign);
  document.getElementById('map-products').addEventListener('click', mapCampaignProducts);
  document.getElementById('save-eligibility').addEventListener('click', saveCampaignEligibility);
  document.getElementById('update-campaign-status').addEventListener('click', updateCampaignStatus);
  document.getElementById('brand-campaign-search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    loadBrandCampaigns();
  });
  document.getElementById('load-brand-orders').addEventListener('click', loadBrandOrders);
  document.getElementById('brand-approve-order').addEventListener('click', () => brandOrderDecision('BRAND_APPROVED'));
  document.getElementById('brand-reject-order').addEventListener('click', () => brandOrderDecision('BRAND_REJECTED'));

  loadBrandProducts();
  loadBrandCampaigns();
  loadBrandOrders();
}

async function createBrandCampaign(e) {
  e.preventDefault();
  const payload = {
    name: document.getElementById('campName').value,
    marketplace: document.getElementById('campMarketplace').value,
    startAt: document.getElementById('campStart').value || null,
    endAt: document.getElementById('campEnd').value || null,
    targetReviews: Number(document.getElementById('campTargetReviews').value || 0),
    budget: Number(document.getElementById('campBudget').value || 0),
    guidelines: document.getElementById('campGuidelines').value,
    status: document.getElementById('campStatus').value
  };
  const res = await api('/api/brand/campaigns', { method: 'POST', body: JSON.stringify(payload) });
  document.getElementById('brand-msg').textContent = res.ok ? `Campaign created: ${res.body.id}` : `Error: ${res.body.error}`;
  loadBrandCampaigns();
}

async function mapCampaignProducts() {
  const campaignId = document.getElementById('mapCampaignId').value;
  const productIds = (document.getElementById('mapProductIds').value || '').split(',').map((x) => Number(x.trim())).filter(Boolean);
  const res = await api(`/api/brand/campaigns/${campaignId}/products`, { method: 'PUT', body: JSON.stringify({ productIds }) });
  document.getElementById('brand-msg').textContent = res.ok ? 'Campaign products mapped.' : `Error: ${res.body.error}`;
}

async function saveCampaignEligibility() {
  const campaignId = document.getElementById('eligCampaignId').value;
  const openToAllPartners = document.getElementById('openToAllPartners').checked;
  const allowedPartners = (document.getElementById('allowedPartners').value || '').split(',').map((x) => Number(x.trim())).filter(Boolean);
  let partnerLimits = [];
  const raw = document.getElementById('partnerLimits').value;
  if (raw) {
    try { partnerLimits = JSON.parse(raw); } catch { partnerLimits = []; }
  }
  const res = await api(`/api/brand/campaigns/${campaignId}/eligibility`, {
    method: 'PUT',
    body: JSON.stringify({ openToAllPartners, allowedPartners, partnerLimits })
  });
  document.getElementById('brand-msg').textContent = res.ok ? 'Campaign eligibility saved.' : `Error: ${res.body.error}`;
}

async function updateCampaignStatus() {
  const campaignId = document.getElementById('statusCampaignId').value;
  const status = document.getElementById('newCampaignStatus').value;
  const res = await api(`/api/brand/campaigns/${campaignId}/status`, { method: 'POST', body: JSON.stringify({ status }) });
  document.getElementById('brand-msg').textContent = res.ok ? 'Campaign status updated.' : `Error: ${res.body.error}`;
  loadBrandCampaigns();
}

async function loadBrandCampaigns() {
  const q = encodeURIComponent(document.getElementById('campQ').value || '');
  const status = encodeURIComponent(document.getElementById('campFilterStatus').value || '');
  const res = await api(`/api/brand/campaigns?q=${q}&status=${status}`);
  const list = document.getElementById('brand-campaigns');
  if (!res.ok) {
    list.innerHTML = '<li>Unable to load campaigns.</li>';
    return;
  }
  list.innerHTML = (res.body.items || []).map(campaignCard).join('') || '<li>No campaigns</li>';
}

async function addBrandProduct(e) { /* same behavior */
  e.preventDefault();
  const payload = {
    skuAsin: document.getElementById('skuAsin').value,
    title: document.getElementById('title').value,
    category: document.getElementById('category').value,
    images: (document.getElementById('images').value || '').split(',').map((s) => s.trim()).filter(Boolean),
    marketplaceLinks: (document.getElementById('marketplaceLinks').value || '').split(',').map((s) => s.trim()).filter(Boolean)
  };

  const res = await api('/api/brand/products', { method: 'POST', body: JSON.stringify(payload) });
  document.getElementById('brand-msg').textContent = res.ok ? `Product added: ${res.body.id}` : `Error: ${res.body.error}`;
  loadBrandProducts();
}

async function editBrandProduct(e) {
  e.preventDefault();
  const productId = document.getElementById('editProductId').value;
  const payload = {
    title: document.getElementById('editTitle').value || undefined,
    category: document.getElementById('editCategory').value || undefined
  };
  const res = await api(`/api/brand/products/${productId}`, { method: 'PUT', body: JSON.stringify(payload) });
  document.getElementById('brand-msg').textContent = res.ok ? 'Product updated.' : `Error: ${res.body.error}`;
  loadBrandProducts();
}

async function archiveBrandProduct() {
  const productId = document.getElementById('editProductId').value;
  const res = await api(`/api/brand/products/${productId}/archive`, { method: 'POST', body: '{}' });
  document.getElementById('brand-msg').textContent = res.ok ? 'Product archived.' : `Error: ${res.body.error}`;
  loadBrandProducts();
}

async function loadBrandProducts() {
  const q = encodeURIComponent(document.getElementById('q').value || '');
  const category = encodeURIComponent(document.getElementById('filterCategory').value || '');
  const status = encodeURIComponent(document.getElementById('status').value || 'all');
  const res = await api(`/api/brand/products?q=${q}&category=${category}&status=${status}`);
  const list = document.getElementById('brand-products');
  if (!res.ok) {
    list.innerHTML = '<li>Unable to load products.</li>';
    return;
  }
  list.innerHTML = (res.body.items || []).map(productCard).join('') || '<li>No products</li>';
}


async function loadBrandOrders() {
  const res = await api('/api/brand/orders?status=SUBMITTED');
  const list = document.getElementById('brand-orders');
  if (!list) return;
  if (!res.ok) {
    list.innerHTML = '<li>Unable to load brand orders.</li>';
    return;
  }
  list.innerHTML = (res.body.items || []).map((o) => `<li>#${o.id} campaign=${o.campaign_id} product=${o.product_id} amount=${o.amount_cents} qty=${o.quantity} status=${o.status}</li>`).join('') || '<li>No submitted orders</li>';
}

async function brandOrderDecision(decision) {
  const orderId = document.getElementById('brandOrderId').value;
  const reason = document.getElementById('brandOrderReason').value;
  const payload = decision === 'BRAND_REJECTED' ? { decision, reason } : { decision };
  const res = await api(`/api/brand/orders/${orderId}/decision`, { method: 'POST', body: JSON.stringify(payload) });
  document.getElementById('brand-msg').textContent = res.ok ? `Order ${decision} saved.` : `Error: ${res.body.error}`;
  loadBrandOrders();
}

function partnerShell() {
  dashboard.innerHTML = `
    <h3>Partner Dashboard</h3>
    <p>Manage your profile, KYC, and bank details.</p>
    <div class="card">
      <h4>Eligible ACTIVE campaigns</h4>
      <button id="load-partner-campaigns">Load eligible campaigns</button>
      <ul id="partner-campaigns"></ul>
    </div>
    <div class="card">
      <h4>Eligible campaign products</h4>
      <button id="load-partner-products">Load eligible products</button>
      <ul id="partner-products"></ul>
    </div>
    <div class="card">
      <h4>Order submission</h4>
      <form id="partner-order-form">
        <input id="orderCampaignId" placeholder="Campaign ID" required />
        <input id="orderProductId" placeholder="Product ID" required />
        <input id="orderAmount" placeholder="Amount cents" required />
        <input id="orderQuantity" placeholder="Quantity" required />
        <input id="orderNotes" placeholder="Notes" />
        <button type="submit">Create DRAFT order</button>
      </form>
      <input id="submitOrderId" placeholder="Order ID to submit" />
      <button id="submit-order-btn">Submit order</button>
      <button id="load-partner-orders">Load my orders</button>
      <ul id="partner-orders"></ul>
    </div>
    <div class="card">
      <h4>Profile</h4>
      <form id="partner-profile-form">
        <input id="displayName" placeholder="Display name" required />
        <input id="phone" placeholder="Phone" />
        <input id="companyName" placeholder="Company name" />
        <button type="submit">Save profile</button>
      </form>
    </div>
    <div class="card">
      <h4>KYC</h4>
      <form id="partner-kyc-form">
        <input id="docType" placeholder="docType e.g. PAN" required />
        <input id="file" placeholder="file content/base64" required />
        <button type="submit">Submit KYC</button>
      </form>
      <p id="kyc-status"></p>
    </div>
    <div class="card">
      <h4>Bank</h4>
      <form id="partner-bank-form">
        <input id="accountHolderName" placeholder="Account holder name" required />
        <input id="accountNumber" placeholder="Account number" required />
        <input id="ifsc" placeholder="IFSC" required />
        <button type="submit">Update bank</button>
      </form>
      <p id="bank-status"></p>
    </div>
    <p id="partner-msg"></p>
  `;

  hydratePartnerStatus();
  document.getElementById('load-partner-products').addEventListener('click', loadPartnerProducts);
  document.getElementById('load-partner-campaigns').addEventListener('click', loadPartnerCampaigns);

  document.getElementById('partner-profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      displayName: document.getElementById('displayName').value,
      phone: document.getElementById('phone').value,
      companyName: document.getElementById('companyName').value
    };
    const res = await api('/api/partner/profile', { method: 'PUT', body: JSON.stringify(payload) });
    document.getElementById('partner-msg').textContent = res.ok ? 'Profile saved.' : `Error: ${res.body.error}`;
  });

  document.getElementById('partner-kyc-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      docType: document.getElementById('docType').value,
      file: document.getElementById('file').value
    };
    const res = await api('/api/partner/kyc', { method: 'POST', body: JSON.stringify(payload) });
    document.getElementById('partner-msg').textContent = res.ok ? 'KYC submitted.' : `Error: ${res.body.error}`;
    hydratePartnerStatus();
  });

  document.getElementById('partner-bank-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      accountHolderName: document.getElementById('accountHolderName').value,
      accountNumber: document.getElementById('accountNumber').value,
      ifsc: document.getElementById('ifsc').value
    };
    const res = await api('/api/partner/bank', { method: 'PUT', body: JSON.stringify(payload) });
    document.getElementById('partner-msg').textContent = res.ok ? 'Bank updated.' : `Error: ${res.body.error}`;
    hydratePartnerStatus();
  });
}


async function createPartnerOrder(e) {
  e.preventDefault();
  const payload = {
    campaignId: Number(document.getElementById('orderCampaignId').value),
    productId: Number(document.getElementById('orderProductId').value),
    amount: Number(document.getElementById('orderAmount').value),
    quantity: Number(document.getElementById('orderQuantity').value),
    notes: document.getElementById('orderNotes').value
  };
  const res = await api('/api/partner/orders', { method: 'POST', body: JSON.stringify(payload) });
  document.getElementById('partner-msg').textContent = res.ok ? `Order draft created: ${res.body.id}` : `Error: ${res.body.error}`;
  loadPartnerOrders();
}

async function submitPartnerOrder() {
  const orderId = document.getElementById('submitOrderId').value;
  const res = await api(`/api/partner/orders/${orderId}/submit`, { method: 'POST', body: '{}' });
  document.getElementById('partner-msg').textContent = res.ok ? 'Order submitted.' : `Error: ${res.body.error}`;
  loadPartnerOrders();
}

async function loadPartnerOrders() {
  const res = await api('/api/partner/orders');
  const list = document.getElementById('partner-orders');
  if (!list) return;
  if (!res.ok) {
    list.innerHTML = '<li>Unable to load orders.</li>';
    return;
  }
  list.innerHTML = (res.body.items || []).map((o) => `<li>#${o.id} campaign=${o.campaign_id} product=${o.product_id} amount=${o.amount_cents} qty=${o.quantity} status=${o.status}</li>`).join('') || '<li>No orders</li>';
}

async function loadPartnerCampaigns() {
  const res = await api('/api/partner/campaigns');
  const list = document.getElementById('partner-campaigns');
  if (!res.ok) {
    list.innerHTML = '<li>Unable to load eligible campaigns.</li>';
    return;
  }
  list.innerHTML = (res.body.items || []).map(campaignCard).join('') || '<li>No eligible campaigns</li>';
}

async function loadPartnerProducts() {
  const res = await api('/api/partner/products');
  const list = document.getElementById('partner-products');
  if (!res.ok) {
    list.innerHTML = '<li>Unable to load eligible products.</li>';
    return;
  }
  list.innerHTML = (res.body.items || []).map(productCard).join('') || '<li>No eligible products</li>';
}

async function hydratePartnerStatus() {
  const kyc = await api('/api/partner/kyc');
  const bank = await api('/api/partner/bank');
  const kycEl = document.getElementById('kyc-status');
  const bankEl = document.getElementById('bank-status');
  if (kycEl) kycEl.textContent = kyc.ok ? `KYC status: ${kyc.body.kyc.status}` : 'KYC status unavailable';
  if (bankEl) {
    const b = bank.body.bank || {};
    bankEl.textContent = bank.ok ? `Bank: ${b.accountMasked || '-'} | verified: ${String(b.bankVerified)}` : 'Bank status unavailable';
  }
}

function adminShell() {
  dashboard.innerHTML = `
    <h3>Admin Dashboard</h3>
    <div class="card">
      <h4>Campaign override</h4>
      <input id="adminCampaignId" placeholder="Campaign ID" />
      <select id="adminCampaignStatus"><option value="">No change</option><option>DRAFT</option><option>ACTIVE</option><option>PAUSED</option><option>ENDED</option></select>
      <label><input id="adminLockEdits" type="checkbox" /> Lock edits</label>
      <button id="override-campaign">Apply override</button>
    </div>
    <div class="card">
      <h4>Order visibility + override</h4>
      <button id="load-admin-orders">Load all orders</button>
      <ul id="admin-orders"></ul>
      <input id="adminOrderId" placeholder="Order ID" />
      <select id="adminOrderStatus"><option>DRAFT</option><option>SUBMITTED</option><option>BRAND_APPROVED</option><option>BRAND_REJECTED</option><option>ENDED</option></select>
      <input id="adminOrderNote" placeholder="Override note" />
      <button id="admin-order-override">Override order</button>
    </div>
    <div class="card">
      <h4>Product moderation</h4>
      <form id="admin-product-search-form">
        <input id="adminQ" placeholder="Search title/SKU" />
        <input id="adminCategory" placeholder="Category" />
        <select id="adminStatus"><option value="all">All</option><option value="active">Active</option><option value="archived">Archived</option></select>
        <button type="submit">Load products</button>
      </form>
      <ul id="admin-products"></ul>
      <input id="moderateProductId" placeholder="Product ID" />
      <input id="moderationNote" placeholder="Moderation note" />
      <button id="lock-product">Lock</button>
      <button id="unlock-product">Unlock</button>
    </div>
    <div class="card">
      <h4>Partner review</h4>
      <label>Partner ID <input id="admin-partner-id" value="100" /></label>
      <button id="load-partner">Load details</button>
      <pre id="partner-details" style="white-space: pre-wrap"></pre>
      <div>
        <button id="approve-kyc">Approve KYC</button>
        <button id="reject-kyc">Reject KYC</button>
        <button id="verify-bank">Verify Bank</button>
      </div>
    </div>
    <p id="admin-msg"></p>
  `;

  document.getElementById('admin-product-search-form').addEventListener('submit', (e) => { e.preventDefault(); loadAdminProducts(); });
  document.getElementById('lock-product').addEventListener('click', () => moderateProduct(true));
  document.getElementById('unlock-product').addEventListener('click', () => moderateProduct(false));
  document.getElementById('override-campaign').addEventListener('click', overrideCampaign);
  document.getElementById('load-admin-orders').addEventListener('click', loadAdminOrders);
  document.getElementById('admin-order-override').addEventListener('click', overrideOrder);

  document.getElementById('load-partner').addEventListener('click', loadPartnerDetails);
  document.getElementById('approve-kyc').addEventListener('click', () => decideKyc('APPROVED'));
  document.getElementById('reject-kyc').addEventListener('click', () => decideKyc('REJECTED'));
  document.getElementById('verify-bank').addEventListener('click', verifyBank);
  loadAdminProducts();
  loadAdminOrders();
}

async function overrideCampaign() {
  const campaignId = document.getElementById('adminCampaignId').value;
  const status = document.getElementById('adminCampaignStatus').value;
  const lockEdits = document.getElementById('adminLockEdits').checked;
  const payload = { lockEdits };
  if (status) payload.status = status;
  const res = await api(`/api/admin/campaigns/${campaignId}/override`, { method: 'POST', body: JSON.stringify(payload) });
  document.getElementById('admin-msg').textContent = res.ok ? 'Campaign override applied.' : `Error: ${res.body.error}`;
}


async function loadAdminOrders() {
  const res = await api('/api/admin/orders');
  const list = document.getElementById('admin-orders');
  if (!list) return;
  if (!res.ok) {
    list.innerHTML = '<li>Unable to load orders.</li>';
    return;
  }
  list.innerHTML = (res.body.items || []).map((o) => `<li>#${o.id} brand=${o.brand_id} partner=${o.partner_id} status=${o.status} amount=${o.amount_cents}</li>`).join('') || '<li>No orders</li>';
}

async function overrideOrder() {
  const orderId = document.getElementById('adminOrderId').value;
  const status = document.getElementById('adminOrderStatus').value;
  const note = document.getElementById('adminOrderNote').value;
  const res = await api(`/api/admin/orders/${orderId}/override`, { method: 'POST', body: JSON.stringify({ status, note }) });
  document.getElementById('admin-msg').textContent = res.ok ? 'Order override applied.' : `Error: ${res.body.error}`;
  loadAdminOrders();
}

async function loadAdminProducts() {
  const q = encodeURIComponent(document.getElementById('adminQ').value || '');
  const category = encodeURIComponent(document.getElementById('adminCategory').value || '');
  const status = encodeURIComponent(document.getElementById('adminStatus').value || 'all');
  const res = await api(`/api/admin/products?q=${q}&category=${category}&status=${status}`);
  const list = document.getElementById('admin-products');
  if (!res.ok) {
    list.innerHTML = '<li>Unable to load products.</li>';
    return;
  }
  list.innerHTML = (res.body.items || []).map(productCard).join('') || '<li>No products</li>';
}

async function moderateProduct(lock) {
  const productId = document.getElementById('moderateProductId').value;
  const note = document.getElementById('moderationNote').value;
  const res = await api(`/api/admin/products/${productId}/moderate`, {
    method: 'POST',
    body: JSON.stringify({ lock, note })
  });
  document.getElementById('admin-msg').textContent = res.ok ? `Product ${lock ? 'locked' : 'unlocked'}.` : `Error: ${res.body.error}`;
  loadAdminProducts();
  loadAdminOrders();
}

async function loadPartnerDetails() {
  const partnerId = document.getElementById('admin-partner-id').value;
  const res = await api(`/api/admin/partners/${partnerId}`);
  document.getElementById('partner-details').textContent = JSON.stringify(res.body, null, 2);
}

async function decideKyc(decision) {
  const partnerId = document.getElementById('admin-partner-id').value;
  const payload = decision === 'REJECTED' ? { decision, reason: 'Needs reupload' } : { decision };
  const res = await api(`/api/admin/partners/${partnerId}/kyc/decision`, { method: 'POST', body: JSON.stringify(payload) });
  document.getElementById('admin-msg').textContent = res.ok ? `KYC ${decision.toLowerCase()}.` : `Error: ${res.body.error}`;
  loadPartnerDetails();
}

async function verifyBank() {
  const partnerId = document.getElementById('admin-partner-id').value;
  const res = await api(`/api/admin/partners/${partnerId}/bank/verify`, { method: 'POST', body: '{}' });
  document.getElementById('admin-msg').textContent = res.ok ? 'Bank verified.' : `Error: ${res.body.error}`;
  loadPartnerDetails();
}

function renderDashboard() {
  const { role } = getStored();
  const route = location.hash || '#/brand';
  if (!role) return;

  if (route === '#/admin' && role === 'SUPER_ADMIN') adminShell();
  else if (route === '#/brand' && role === 'BRAND') brandShell();
  else if (route === '#/partner' && role === 'PARTNER') partnerShell();
  else dashboard.innerHTML = `<h3>Access Restricted</h3><p>Route ${route} is not allowed for role ${role}.</p>`;
}

function setLoggedIn(role) {
  loginSection.classList.add('hidden');
  appSection.classList.remove('hidden');
  localStorage.setItem('role', role);
  if (role === 'PARTNER' && !location.hash) location.hash = '#/partner';
  if (role === 'SUPER_ADMIN' && !location.hash) location.hash = '#/admin';
  if (role === 'BRAND' && !location.hash) location.hash = '#/brand';
  renderDashboard();
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.textContent = '';
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  try {
    const resp = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!resp.ok) {
      loginError.textContent = 'Login failed';
      return;
    }
    const data = await resp.json();
    localStorage.setItem('accessToken', data.accessToken);
    setLoggedIn(data.user.role);
  } catch (error) {
    loginError.textContent = `Login error: ${error.message}`;
  }
});

window.addEventListener('hashchange', renderDashboard);

document.getElementById('logout').addEventListener('click', () => {
  localStorage.clear();
  location.hash = '#/';
  appSection.classList.add('hidden');
  loginSection.classList.remove('hidden');
});

if (getStored().accessToken && getStored().role) setLoggedIn(getStored().role);
