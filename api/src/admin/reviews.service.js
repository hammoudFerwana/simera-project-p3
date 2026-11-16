const {
  PROVENANCE_TABLES,
  ALLOWED_COLUMNS_BY_TABLE
} = require('shared/src/rules/apply-decisions');

class ServiceError extends Error {
  constructor(status, errors, extra = {}) {
    super(JSON.stringify(errors));
    this.status = status;
    this.errors = errors;
    Object.assign(this, extra);
  }
}

/**
 * Returns a paginated list of admin human reviews ordered newest first.
 *
 * @param {object} db - pg Pool or Client
 * @param {object} [query] - query parameters
 * @param {string} [query.status] - filter by review_status ('pending', 'in_review', 'completed'), default 'pending'
 * @param {string} [query.reason] - filter by review_reason
 * @param {number|string} [query.candidateId] - filter by candidate_profiles.id
 * @param {number|string} [query.page] - 1-based page number, default 1
 * @param {number|string} [query.pageSize] - items per page, default 20, max 100
 * @returns {Promise<{ items: Array<object>, page: number, pageSize: number, total: number }>}
 */
async function listReviews(db, query = {}) {
  const status =
    query.status === undefined || query.status === null || query.status === ''
      ? 'pending'
      : query.status;

  const whereClauses = [];
  const params = [];

  if (status && status !== 'all') {
    params.push(status);
    whereClauses.push(`hr.review_status = $${params.length}`);
  }

  if (query.reason) {
    params.push(query.reason);
    whereClauses.push(`hr.review_reason = $${params.length}`);
  }

  if (
    query.candidateId !== undefined &&
    query.candidateId !== null &&
    query.candidateId !== ''
  ) {
    const parsedCandId = Number(query.candidateId);
    if (Number.isInteger(parsedCandId) && parsedCandId > 0) {
      params.push(parsedCandId);
      whereClauses.push(`hr.candidate_id = $${params.length}`);
    }
  }

  const whereSql =
    whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const totalQuery = `
    SELECT COUNT(*)::int AS total
    FROM human_reviews hr
    ${whereSql}
  `;

  const pageNum = Number(query.page);
  const pageSizeNum = Number(query.pageSize);
  const page = Number.isInteger(pageNum) && pageNum > 0 ? pageNum : 1;
  const pageSize =
    Number.isInteger(pageSizeNum) && pageSizeNum > 0
      ? Math.min(100, pageSizeNum)
      : 20;
  const offset = (page - 1) * pageSize;

  const listParams = [...params, pageSize, offset];
  const limitIdx = params.length + 1;
  const offsetIdx = params.length + 2;

  const itemsQuery = `
    SELECT
      hr.id,
      hr.review_reason AS "reason",
      hr.review_status AS "status",
      hr.review_target_type AS "targetType",
      hr.created_at AS "createdAt",
      hr.item_id AS "itemId",
      cp.id AS "candidateId",
      cp.first_name AS "candidateFirstName",
      cp.last_name AS "candidateLastName",
      u.email AS "candidateEmail",
      c.item_type AS "conflictItemType",
      c.item_id AS "conflictItemId",
      c.field_name AS "conflictFieldName"
    FROM human_reviews hr
    JOIN candidate_profiles cp ON cp.id = hr.candidate_id
    JOIN users u ON u.id = cp.user_id
    LEFT JOIN conflicts c ON hr.review_target_type = 'conflict' AND c.id = hr.item_id
    ${whereSql}
    ORDER BY hr.created_at DESC, hr.id DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  const totalResult = await db.query(totalQuery, params);
  const itemsResult = await db.query(itemsQuery, listParams);

  const total = totalResult.rows[0]?.total ?? 0;
  const items = itemsResult.rows.map((row) => {
    const isConflict = row.targetType === 'conflict';
    return {
      id: row.id,
      reason: row.reason,
      status: row.status,
      targetType: row.targetType,
      createdAt: row.createdAt,
      candidate: {
        id: row.candidateId,
        firstName: row.candidateFirstName,
        lastName: row.candidateLastName,
        email: row.candidateEmail
      },
      itemType: isConflict
        ? (row.conflictItemType ?? null)
        : 'candidate_skills',
      itemId: isConflict ? (row.conflictItemId ?? null) : null,
      fieldName: isConflict ? (row.conflictFieldName ?? null) : null,
      unknownSkillId: isConflict ? null : row.itemId
    };
  });

  return {
    items,
    page,
    pageSize,
    total
  };
}

/**
 * Returns a human review by ID with details, options, and stored value, or null if not found.
 * Opening the detail does NOT change review_status.
 *
 * @param {object} db - pg Pool or Client
 * @param {number|string} id - human review ID
 * @returns {Promise<object|null>}
 */
async function getReviewById(db, id) {
  const reviewId = Number(id);
  if (!Number.isInteger(reviewId) || reviewId <= 0) {
    return null;
  }

  const reviewRes = await db.query(
    `SELECT
       hr.id,
       hr.review_reason AS "reason",
       hr.review_status AS "status",
       hr.review_target_type AS "targetType",
       hr.created_at AS "createdAt",
       hr.item_id AS "itemId",
       hr.candidate_id AS "candidateId",
       cp.id AS "candidateProfileId",
       cp.first_name AS "candidateFirstName",
       cp.last_name AS "candidateLastName",
       u.email AS "candidateEmail"
     FROM human_reviews hr
     JOIN candidate_profiles cp ON cp.id = hr.candidate_id
     JOIN users u ON u.id = cp.user_id
     WHERE hr.id = $1`,
    [reviewId]
  );

  if (reviewRes.rows.length === 0) {
    return null;
  }

  const row = reviewRes.rows[0];
  const candidate = {
    id: row.candidateProfileId,
    firstName: row.candidateFirstName,
    lastName: row.candidateLastName,
    email: row.candidateEmail
  };

  if (row.targetType === 'unknown_skill') {
    return {
      id: row.id,
      reason: row.reason,
      status: row.status,
      targetType: 'unknown_skill',
      createdAt: row.createdAt,
      candidate,
      unknownSkillId: row.itemId
    };
  }

  // targetType === 'conflict'
  const conflictRes = await db.query(
    `SELECT
       c.id,
       c.candidate_id AS "candidateId",
       c.item_type AS "itemType",
       c.item_id AS "itemId",
       c.field_name AS "fieldName",
       c.status
     FROM conflicts c
     WHERE c.id = $1`,
    [row.itemId]
  );

  const conflictRow = conflictRes.rows[0];
  if (!conflictRow) {
    return {
      id: row.id,
      reason: row.reason,
      status: row.status,
      targetType: 'conflict',
      createdAt: row.createdAt,
      candidate,
      conflict: null,
      storedValue: null,
      options: []
    };
  }

  const optionsRes = await db.query(
    `SELECT
       co.id,
       co.value,
       co.confidence,
       co.evidence,
       co.source_file_id AS "sourceFileId",
       uf.id AS "ufId",
       uf.source_type AS "ufSourceType",
       uf.original_filename AS "ufOriginalFilename",
       uf.uploaded_at AS "ufUploadedAt"
     FROM conflict_options co
     LEFT JOIN uploaded_files uf ON uf.id = co.source_file_id
     WHERE co.conflict_id = $1
     ORDER BY co.id ASC`,
    [conflictRow.id]
  );

  const options = optionsRes.rows.map((co) => ({
    id: co.id,
    value: co.value,
    confidence:
      co.confidence !== null && co.confidence !== undefined
        ? Number(co.confidence)
        : null,
    evidence: co.evidence ?? null,
    sourceFile:
      co.sourceFileId && co.ufId
        ? {
            id: co.ufId,
            sourceType: co.ufSourceType,
            originalFilename: co.ufOriginalFilename,
            uploadedAt: co.ufUploadedAt,
            rawUrl: `/api/uploads/${co.ufId}/raw`
          }
        : null
  }));

  // Query storedValue
  let storedValue = null;
  const tableName =
    PROVENANCE_TABLES[conflictRow.itemType] ||
    (ALLOWED_COLUMNS_BY_TABLE[conflictRow.itemType]
      ? conflictRow.itemType
      : null);
  const allowedColumns = tableName ? ALLOWED_COLUMNS_BY_TABLE[tableName] : null;

  if (tableName && allowedColumns) {
    const isProfile =
      conflictRow.itemType === 'candidate_profile' ||
      tableName === 'candidate_profiles';
    const targetRowId = isProfile
      ? conflictRow.candidateId || conflictRow.itemId
      : conflictRow.itemId;

    const parsedId =
      typeof targetRowId === 'number'
        ? targetRowId
        : parseInt(String(targetRowId).trim(), 10);

    if (Number.isInteger(parsedId) && parsedId > 0) {
      if (conflictRow.fieldName === '__item__') {
        const storedRes = await db.query(
          `SELECT * FROM "${tableName}" WHERE id = $1`,
          [parsedId]
        );
        if (storedRes.rows.length > 0) {
          const fullRow = storedRes.rows[0];
          storedValue = {};
          for (const col of allowedColumns) {
            storedValue[col] = fullRow[col] !== undefined ? fullRow[col] : null;
          }
        } else {
          storedValue = null;
        }
      } else if (allowedColumns.has(conflictRow.fieldName)) {
        const storedRes = await db.query(
          `SELECT "${conflictRow.fieldName}" AS val FROM "${tableName}" WHERE id = $1`,
          [parsedId]
        );
        if (storedRes.rows.length > 0) {
          storedValue = storedRes.rows[0].val ?? null;
        } else {
          storedValue = null;
        }
      } else {
        storedValue = null;
      }
    }
  }

  return {
    id: row.id,
    reason: row.reason,
    status: row.status,
    targetType: 'conflict',
    createdAt: row.createdAt,
    candidate,
    conflict: {
      id: conflictRow.id,
      itemType: conflictRow.itemType,
      itemId: conflictRow.itemId,
      fieldName: conflictRow.fieldName,
      status: conflictRow.status
    },
    storedValue,
    options
  };
}

module.exports = {
  ServiceError,
  listReviews,
  getReviewById
};
