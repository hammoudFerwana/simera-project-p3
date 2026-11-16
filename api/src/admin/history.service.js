/**
 * Admin candidate history service (US-20).
 *
 * Retrieves the human audit log entries for a candidate profile, ordered newest first.
 */

/**
 * Returns candidate history items ordered by timestamp DESC, then id DESC.
 * Returns null if the candidate profile does not exist.
 *
 * @param {object} db - pg Pool or Client
 * @param {number} candidateId - positive integer candidate profile ID
 * @returns {Promise<{ items: Array<object> } | null>}
 */
async function getCandidateHistory(db, candidateId) {
  const candidateCheck = await db.query(
    'SELECT id FROM candidate_profiles WHERE id = $1',
    [candidateId]
  );

  if (candidateCheck.rows.length === 0) {
    return null;
  }

  const historyResult = await db.query(
    `SELECT
       hal.id,
       hal.item_type AS "itemType",
       hal.item_id AS "itemId",
       hal.field_name AS "fieldName",
       hal.previous_value AS "previousValue",
       hal.new_value AS "newValue",
       hal.timestamp,
       hal.reason,
       a.id AS admin_id,
       u.email
     FROM human_audit_log hal
     JOIN admins a ON a.id = hal.changed_by
     JOIN users u ON u.id = a.user_id
     WHERE hal.candidate_id = $1
     ORDER BY hal.timestamp DESC, hal.id DESC`,
    [candidateId]
  );

  const items = historyResult.rows.map((row) => ({
    id: row.id,
    itemType: row.itemType,
    itemId: row.itemId,
    fieldName: row.fieldName,
    previousValue: row.previousValue,
    newValue: row.newValue,
    changedBy: {
      adminId: row.admin_id,
      email: row.email
    },
    timestamp: row.timestamp,
    reason: row.reason
  }));

  return { items };
}

module.exports = {
  getCandidateHistory
};
