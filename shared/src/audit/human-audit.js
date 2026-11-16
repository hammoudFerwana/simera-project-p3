/**
 * Shared human audit log service (US-20).
 *
 * Records human decisions during review resolution inside the caller's transaction.
 * Audit log entries are append-only; this module does not provide update or delete operations.
 */

const PROVENANCE_ITEM_TYPES = Object.freeze([
  'candidate_profile',
  'work_experience',
  'education',
  'candidate_skills',
  'candidate_languages',
  'candidate_links',
  'certifications',
  'projects',
  'awards',
  'publications',
  'volunteering'
]);

/**
 * Recursively normalizes a value for stable comparison.
 * Sorts object keys so { a: 1, b: 2 } produces the same JSON as { b: 2, a: 1 }.
 *
 * @param {unknown} val
 * @returns {unknown}
 */
function normalizeForComparison(val) {
  if (val === undefined || val === null) {
    return null;
  }
  if (val instanceof Date) {
    return val.toISOString();
  }
  if (typeof val !== 'object') {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map(normalizeForComparison);
  }
  const sorted = {};
  for (const key of Object.keys(val).sort()) {
    sorted[key] = normalizeForComparison(val[key]);
  }
  return sorted;
}

/**
 * Returns a JSON string of the value after stable key sorting.
 *
 * @param {unknown} val
 * @returns {string}
 */
function stableStringify(val) {
  const normalized = normalizeForComparison(val);
  return JSON.stringify(normalized);
}

/**
 * Compares two values for equality.
 * Equal means: both null or undefined, or the same JSON after a stable key sort.
 *
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
function areValuesEqual(a, b) {
  if ((a === null || a === undefined) && (b === null || b === undefined)) {
    return true;
  }
  return stableStringify(a) === stableStringify(b);
}

/**
 * Records a human change inside the caller's transaction.
 *
 * @param {object} client - The active database transaction client.
 * @param {object} params
 * @param {number} params.candidateId - Positive integer candidate profile ID.
 * @param {string} params.itemType - Provenance item type enum.
 * @param {number|string} params.itemId - Positive integer or digit string (stored as text).
 * @param {string} params.fieldName - Non-empty string up to 150 chars.
 * @param {unknown} params.previousValue - Previous value (serialized to JSONB).
 * @param {unknown} params.newValue - New value (serialized to JSONB).
 * @param {number} params.changedBy - Positive integer administrator ID (admins.id).
 * @param {string|null} [params.reason=null] - Optional human explanation.
 * @param {Date} [params.timestamp=new Date()] - Timestamp of the change.
 * @returns {Promise<object|null>} Inserted row or null if values are equal.
 */
async function recordHumanChange(
  client,
  {
    candidateId,
    itemType,
    itemId,
    fieldName,
    previousValue,
    newValue,
    changedBy,
    reason = null,
    timestamp = new Date()
  }
) {
  if (!client || typeof client.query !== 'function') {
    throw new TypeError('client must be a database client with a query method');
  }

  if (
    typeof candidateId !== 'number' ||
    !Number.isInteger(candidateId) ||
    candidateId <= 0
  ) {
    throw new TypeError('candidateId must be a positive integer');
  }

  if (
    typeof changedBy !== 'number' ||
    !Number.isInteger(changedBy) ||
    changedBy <= 0
  ) {
    throw new TypeError('changedBy must be a positive integer');
  }

  if (
    typeof itemType !== 'string' ||
    !PROVENANCE_ITEM_TYPES.includes(itemType)
  ) {
    throw new TypeError(
      `itemType must be one of: ${PROVENANCE_ITEM_TYPES.join(', ')}`
    );
  }

  const isValidItemId =
    (typeof itemId === 'number' && Number.isInteger(itemId) && itemId > 0) ||
    (typeof itemId === 'string' && /^[1-9]\d*$/.test(itemId.trim()));

  if (!isValidItemId) {
    throw new TypeError(
      'itemId must be a positive integer or string of digits'
    );
  }

  if (
    typeof fieldName !== 'string' ||
    fieldName.trim().length === 0 ||
    fieldName.length > 150
  ) {
    throw new TypeError(
      'fieldName must be a non-empty string up to 150 characters'
    );
  }

  const normalizedReason = reason === undefined ? null : reason;
  if (normalizedReason !== null && typeof normalizedReason !== 'string') {
    throw new TypeError('reason must be null or a string');
  }

  const effectiveTimestamp =
    timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (isNaN(effectiveTimestamp.getTime())) {
    throw new TypeError('timestamp must be a valid Date');
  }

  if (areValuesEqual(previousValue, newValue)) {
    return null;
  }

  const storedItemId = String(itemId).trim();
  const prevJson = JSON.stringify(
    previousValue === undefined ? null : previousValue
  );
  const newJson = JSON.stringify(newValue === undefined ? null : newValue);

  const query = `
    INSERT INTO human_audit_log (
      candidate_id,
      item_type,
      item_id,
      field_name,
      previous_value,
      new_value,
      changed_by,
      timestamp,
      reason
    )
    VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9)
    RETURNING
      id,
      candidate_id,
      item_type,
      item_id,
      field_name,
      previous_value,
      new_value,
      changed_by,
      timestamp,
      reason
  `;

  const values = [
    candidateId,
    itemType,
    storedItemId,
    fieldName,
    prevJson,
    newJson,
    changedBy,
    effectiveTimestamp,
    normalizedReason
  ];

  const result = await client.query(query, values);
  return result.rows[0];
}

/**
 * Returns admins.id for a given user ID, or null if the user is not an admin.
 *
 * @param {object} client - pg Client or Pool
 * @param {number} userId - users.id
 * @returns {Promise<number|null>} admins.id or null
 */
async function getAdminIdForUser(client, userId) {
  if (!client || typeof client.query !== 'function') {
    throw new TypeError('client must be a database client with a query method');
  }

  if (typeof userId !== 'number' || !Number.isInteger(userId) || userId <= 0) {
    return null;
  }

  const result = await client.query(
    'SELECT id FROM admins WHERE user_id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0].id;
}

module.exports = {
  PROVENANCE_ITEM_TYPES,
  recordHumanChange,
  getAdminIdForUser
};
