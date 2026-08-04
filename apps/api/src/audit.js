function logAudit(db, { actorUserId = null, action, resourceType, resourceId = null, metadata = {} }) {
  db.prepare(
    `INSERT INTO audit_logs(actor_user_id, action, resource_type, resource_id, metadata_json)
     VALUES (?, ?, ?, ?, ?)`
  ).run(actorUserId, action, resourceType, resourceId, JSON.stringify(metadata));
}

module.exports = { logAudit };
