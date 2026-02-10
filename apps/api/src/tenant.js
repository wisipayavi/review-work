function withBrandScope(req, baseSql) {
  if (req.user.role !== 'BRAND') return { sql: baseSql, params: [] };
  return { sql: `${baseSql} WHERE brand_id = ?`, params: [req.user.brand_id] };
}

function withPartnerScope(req, baseSql) {
  if (req.user.role !== 'PARTNER') return { sql: baseSql, params: [] };
  return { sql: `${baseSql} WHERE partner_id = ?`, params: [req.user.partner_id] };
}

module.exports = { withBrandScope, withPartnerScope };
