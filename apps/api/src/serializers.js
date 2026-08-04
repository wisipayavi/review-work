function serializeBrandUser(row) {
  return {
    id: row.id,
    role: row.role,
    brandId: row.brand_id,
    partnerId: row.partner_id
  };
}

function serializeAdminUser(row) {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    mobile: row.mobile,
    role: row.role,
    brandId: row.brand_id,
    partnerId: row.partner_id
  };
}

module.exports = { serializeBrandUser, serializeAdminUser };
