const {
  PROVENANCE_TABLES,
  ALLOWED_COLUMNS_BY_TABLE
} = require('shared/src/rules/apply-decisions');
const {
  recordHumanChange,
  getAdminIdForUser
} = require('shared/src/audit/human-audit');
const {
  buildDeduplicationKey,
  DEDUPLICATION_FIELDS
} = require('shared/src/deduplication');
const { validateManualValueByColumnType } = require('./reviews.validation');

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

/**
 * Resolves a human review inside a single database transaction.
 *
 * @param {object} pool - pg Pool or Client
 * @param {number|string} id - human review id
 * @param {object} body - validated resolution body { action, optionId, value, confidence, reason }
 * @param {number} userId - authenticated admin user id
 * @returns {Promise<{ review: object, applied: object }>}
 */
async function resolveReview(pool, id, body, userId) {
  const client =
    typeof pool.connect === 'function' ? await pool.connect() : pool;
  let inTransaction = false;

  try {
    await client.query('BEGIN');
    inTransaction = true;

    const reviewId = Number(id);
    const reviewLockRes = await client.query(
      'SELECT * FROM human_reviews WHERE id = $1 FOR UPDATE',
      [reviewId]
    );
    if (reviewLockRes.rows.length === 0) {
      throw new ServiceError(404, { reviewId: 'Review not found' });
    }
    const review = reviewLockRes.rows[0];

    if (review.review_target_type === 'unknown_skill') {
      throw new ServiceError(409, {
        review:
          'Unknown skill reviews must be resolved through /api/admin/unknown-skills/:id/resolve'
      });
    }

    if (review.review_status === 'completed') {
      throw new ServiceError(409, { review: 'Review already completed' });
    }

    const conflictLockRes = await client.query(
      'SELECT * FROM conflicts WHERE id = $1 FOR UPDATE',
      [review.item_id]
    );
    if (conflictLockRes.rows.length === 0) {
      throw new ServiceError(409, { review: 'Review target is not valid' });
    }
    const conflict = conflictLockRes.rows[0];

    if (conflict.status === 'resolved') {
      throw new ServiceError(409, { conflict: 'Conflict already resolved' });
    }

    const { action, optionId, value, confidence, reason } = body;
    const isC3 =
      review.review_reason === 'item_match_uncertain' ||
      conflict.field_name === '__item__';

    if ((action === 'choose' || action === 'manual') && isC3) {
      throw new ServiceError(400, {
        action: 'Cannot choose or manual on item match review'
      });
    }

    if ((action === 'merge' || action === 'add') && !isC3) {
      throw new ServiceError(400, {
        action:
          'Merge or add action is only allowed for item_match_uncertain reviews'
      });
    }

    const tableName = PROVENANCE_TABLES[conflict.item_type];
    if (!tableName) {
      throw new ServiceError(409, { review: 'Review target is not valid' });
    }

    const allowedColumns = ALLOWED_COLUMNS_BY_TABLE[tableName];
    if (!allowedColumns) {
      throw new ServiceError(409, { review: 'Review target is not valid' });
    }

    if (!isC3 && !allowedColumns.has(conflict.field_name)) {
      throw new ServiceError(409, { review: 'Review target is not valid' });
    }

    const isProfile =
      conflict.item_type === 'candidate_profile' ||
      tableName === 'candidate_profiles';

    const isPosInt =
      (typeof conflict.item_id === 'number' &&
        Number.isInteger(conflict.item_id) &&
        conflict.item_id > 0) ||
      (typeof conflict.item_id === 'string' &&
        /^[1-9]\d*$/.test(conflict.item_id.trim()));

    if (!isPosInt) {
      throw new ServiceError(409, { review: 'Review target is not valid' });
    }

    const targetId = parseInt(String(conflict.item_id).trim(), 10);

    if (isProfile) {
      if (targetId !== conflict.candidate_id) {
        throw new ServiceError(409, { review: 'Review target is not valid' });
      }
      const candCheck = await client.query(
        'SELECT id FROM candidate_profiles WHERE id = $1',
        [targetId]
      );
      if (candCheck.rows.length === 0) {
        throw new ServiceError(409, { review: 'Review target is not valid' });
      }
    } else {
      const itemCheck = await client.query(
        `SELECT id FROM "${tableName}" WHERE id = $1 AND candidate_id = $2`,
        [targetId, conflict.candidate_id]
      );
      if (itemCheck.rows.length === 0) {
        throw new ServiceError(409, { review: 'Review target is not valid' });
      }
    }

    const adminId = await getAdminIdForUser(client, userId);
    if (!adminId) {
      throw new ServiceError(403, { auth: 'Admin profile required' });
    }
    const now = new Date();
    let applied;

    if (action === 'choose' || action === 'manual') {
      let newValue;
      if (action === 'choose') {
        const optRes = await client.query(
          'SELECT * FROM conflict_options WHERE id = $1 AND conflict_id = $2',
          [optionId, conflict.id]
        );
        if (optRes.rows.length === 0) {
          throw new ServiceError(400, {
            optionId: 'Option does not belong to this conflict'
          });
        }
        newValue = optRes.rows[0].value;
      } else {
        const colInfoRes = await client.query(
          `SELECT data_type, character_maximum_length
           FROM information_schema.columns
           WHERE table_name = $1 AND column_name = $2`,
          [tableName, conflict.field_name]
        );
        const colDataType = colInfoRes.rows[0]?.data_type;
        const colMaxLen = colInfoRes.rows[0]?.character_maximum_length;
        const valValidation = validateManualValueByColumnType(
          colDataType,
          colMaxLen,
          conflict.field_name,
          value
        );
        if (!valValidation.success) {
          throw new ServiceError(400, { value: valValidation.message });
        }
        newValue = valValidation.data;
      }

      const curRowRes = await client.query(
        `SELECT * FROM "${tableName}" WHERE id = $1 FOR UPDATE`,
        [targetId]
      );
      if (curRowRes.rows.length === 0) {
        throw new ServiceError(409, { review: 'Review target is not valid' });
      }
      const storedRow = curRowRes.rows[0];
      const previousValue =
        storedRow[conflict.field_name] !== undefined
          ? storedRow[conflict.field_name]
          : null;

      const keyFields = DEDUPLICATION_FIELDS[conflict.item_type];
      let newKey = null;
      if (keyFields && keyFields.includes(conflict.field_name)) {
        const updatedRow = { ...storedRow, [conflict.field_name]: newValue };
        const fieldsObj = Object.fromEntries(
          keyFields.map((f) => [f, { value: updatedRow[f] }])
        );
        newKey = buildDeduplicationKey(conflict.item_type, fieldsObj);

        const collisionRes = await client.query(
          `SELECT id FROM "${tableName}" WHERE candidate_id = $1 AND deduplication_key = $2 AND id != $3`,
          [conflict.candidate_id, newKey, targetId]
        );
        if (collisionRes.rows.length > 0) {
          throw new ServiceError(409, {
            value: 'Duplicate item exists for candidate'
          });
        }
      }

      if (newKey !== null) {
        if (isProfile) {
          await client.query(
            `UPDATE "${tableName}"
             SET "${conflict.field_name}" = $1, deduplication_key = $2, updated_at = $3
             WHERE id = $4`,
            [newValue, newKey, now, targetId]
          );
        } else {
          await client.query(
            `UPDATE "${tableName}"
             SET "${conflict.field_name}" = $1, deduplication_key = $2
             WHERE id = $3`,
            [newValue, newKey, targetId]
          );
        }
      } else {
        if (isProfile) {
          await client.query(
            `UPDATE "${tableName}"
             SET "${conflict.field_name}" = $1, updated_at = $2
             WHERE id = $3`,
            [newValue, now, targetId]
          );
        } else {
          await client.query(
            `UPDATE "${tableName}"
             SET "${conflict.field_name}" = $1
             WHERE id = $2`,
            [newValue, targetId]
          );
        }
      }

      const provRes = await client.query(
        `INSERT INTO data_provenance (
           candidate_id, item_type, item_id, field_name, resolution_method, approved_at
         ) VALUES ($1, $2, $3, $4, 'human_reviewed', $5)
         ON CONFLICT (item_type, item_id, field_name)
         DO UPDATE SET
           resolution_method = 'human_reviewed',
           approved_at = EXCLUDED.approved_at
         RETURNING id`,
        [
          conflict.candidate_id,
          conflict.item_type,
          String(targetId),
          conflict.field_name,
          now
        ]
      );
      const provenanceId = provRes.rows[0].id;
      await client.query(
        'DELETE FROM data_provenance_sources WHERE provenance_id = $1',
        [provenanceId]
      );

      await recordHumanChange(client, {
        candidateId: conflict.candidate_id,
        itemType: conflict.item_type,
        itemId: String(targetId),
        fieldName: conflict.field_name,
        previousValue,
        newValue,
        changedBy: adminId,
        reason: reason ?? null,
        timestamp: now
      });

      await client.query(
        `UPDATE conflicts
         SET status = 'resolved',
             resolution_method = 'human_review',
             resolved_value = $1::jsonb,
             resolved_at = $2
         WHERE id = $3`,
        [JSON.stringify(newValue), now, conflict.id]
      );

      applied = {
        itemType: conflict.item_type,
        itemId: String(targetId),
        fieldName: conflict.field_name,
        previousValue,
        newValue
      };
    } else if (action === 'merge') {
      const optRes = await client.query(
        'SELECT * FROM conflict_options WHERE conflict_id = $1 ORDER BY id ASC LIMIT 1',
        [conflict.id]
      );
      if (optRes.rows.length === 0) {
        throw new ServiceError(400, {
          review: 'No conflict option available for merge'
        });
      }
      const optVal = optRes.rows[0].value;
      const itemData = optVal?.item ?? optVal ?? {};

      const curRowRes = await client.query(
        `SELECT * FROM "${tableName}" WHERE id = $1 AND candidate_id = $2 FOR UPDATE`,
        [targetId, conflict.candidate_id]
      );
      if (curRowRes.rows.length === 0) {
        throw new ServiceError(409, { review: 'Review target is not valid' });
      }
      const storedRow = curRowRes.rows[0];

      const filledFields = [];
      const updatedRow = { ...storedRow };

      for (const col of allowedColumns) {
        if (col === 'updated_at' || col === 'created_at') continue;
        const isStoredEmpty =
          storedRow[col] === null ||
          storedRow[col] === undefined ||
          storedRow[col] === '';
        const itemVal = itemData[col];
        const isItemNonEmpty =
          itemVal !== null && itemVal !== undefined && itemVal !== '';

        if (isStoredEmpty && isItemNonEmpty) {
          updatedRow[col] = itemVal;
          filledFields.push(col);
        }
      }

      const keyFields = DEDUPLICATION_FIELDS[conflict.item_type];
      let newKey = null;
      if (keyFields && filledFields.some((f) => keyFields.includes(f))) {
        const fieldsObj = Object.fromEntries(
          keyFields.map((f) => [f, { value: updatedRow[f] }])
        );
        newKey = buildDeduplicationKey(conflict.item_type, fieldsObj);
        const dupRes = await client.query(
          `SELECT id FROM "${tableName}" WHERE candidate_id = $1 AND deduplication_key = $2 AND id != $3`,
          [conflict.candidate_id, newKey, targetId]
        );
        if (dupRes.rows.length > 0) {
          throw new ServiceError(409, {
            review: 'Duplicate item exists for candidate after merge'
          });
        }
      }

      if (filledFields.length > 0 || newKey !== null) {
        const setClauses = [];
        const updateParams = [];
        let pIdx = 1;
        for (const col of filledFields) {
          setClauses.push(`"${col}" = $${pIdx++}`);
          updateParams.push(itemData[col]);
        }
        if (newKey !== null) {
          setClauses.push(`deduplication_key = $${pIdx++}`);
          updateParams.push(newKey);
        }
        if (isProfile) {
          setClauses.push(`updated_at = $${pIdx++}`);
          updateParams.push(now);
        }
        updateParams.push(targetId);
        await client.query(
          `UPDATE "${tableName}" SET ${setClauses.join(', ')} WHERE id = $${pIdx}`,
          updateParams
        );
      }

      for (const col of filledFields) {
        const provRes = await client.query(
          `INSERT INTO data_provenance (
             candidate_id, item_type, item_id, field_name, resolution_method, approved_at
           ) VALUES ($1, $2, $3, $4, 'human_reviewed', $5)
           ON CONFLICT (item_type, item_id, field_name)
           DO UPDATE SET
             resolution_method = 'human_reviewed',
             approved_at = EXCLUDED.approved_at
           RETURNING id`,
          [
            conflict.candidate_id,
            conflict.item_type,
            String(targetId),
            col,
            now
          ]
        );
        const provenanceId = provRes.rows[0].id;
        await client.query(
          'DELETE FROM data_provenance_sources WHERE provenance_id = $1',
          [provenanceId]
        );

        await recordHumanChange(client, {
          candidateId: conflict.candidate_id,
          itemType: conflict.item_type,
          itemId: String(targetId),
          fieldName: col,
          previousValue: null,
          newValue: itemData[col],
          changedBy: adminId,
          reason: reason ?? null,
          timestamp: now
        });
      }

      const resolvedValue = { action: 'merge', filledFields };
      await client.query(
        `UPDATE conflicts
         SET status = 'resolved',
             resolution_method = 'human_review',
             resolved_value = $1::jsonb,
             resolved_at = $2
         WHERE id = $3`,
        [JSON.stringify(resolvedValue), now, conflict.id]
      );

      applied = {
        itemType: conflict.item_type,
        itemId: String(targetId),
        filledFields
      };
    } else if (action === 'add') {
      const optRes = await client.query(
        'SELECT * FROM conflict_options WHERE conflict_id = $1 ORDER BY id ASC LIMIT 1',
        [conflict.id]
      );
      if (optRes.rows.length === 0) {
        throw new ServiceError(400, {
          review: 'No conflict option available for add'
        });
      }
      const optVal = optRes.rows[0].value;
      const itemData = optVal?.item ?? optVal ?? {};

      const keyFields = DEDUPLICATION_FIELDS[conflict.item_type];
      let newKey = null;
      if (keyFields) {
        const fieldsObj = Object.fromEntries(
          keyFields.map((f) => [f, { value: itemData[f] ?? null }])
        );
        newKey = buildDeduplicationKey(conflict.item_type, fieldsObj);
        const dupRes = await client.query(
          `SELECT id FROM "${tableName}" WHERE candidate_id = $1 AND deduplication_key = $2`,
          [conflict.candidate_id, newKey]
        );
        if (dupRes.rows.length > 0) {
          throw new ServiceError(409, {
            deduplicationKey: 'Duplicate item exists for candidate'
          });
        }
      }

      const insertCols = ['candidate_id'];
      const insertVals = [conflict.candidate_id];
      const insertedFields = [];

      if (newKey !== null) {
        insertCols.push('deduplication_key');
        insertVals.push(newKey);
      }

      for (const col of allowedColumns) {
        if (col === 'updated_at' || col === 'created_at') continue;
        const val = itemData[col];
        if (val !== undefined && val !== null && val !== '') {
          insertCols.push(`"${col}"`);
          insertVals.push(val);
          insertedFields.push(col);
        }
      }

      const placeholders = insertVals.map((_, i) => `$${i + 1}`).join(', ');
      const insertRes = await client.query(
        `INSERT INTO "${tableName}" (${insertCols.join(', ')})
         VALUES (${placeholders})
         RETURNING id`,
        insertVals
      );
      const newItemId = insertRes.rows[0].id;

      for (const col of insertedFields) {
        const provRes = await client.query(
          `INSERT INTO data_provenance (
             candidate_id, item_type, item_id, field_name, resolution_method, approved_at
           ) VALUES ($1, $2, $3, $4, 'human_reviewed', $5)
           ON CONFLICT (item_type, item_id, field_name)
           DO UPDATE SET
             resolution_method = 'human_reviewed',
             approved_at = EXCLUDED.approved_at
           RETURNING id`,
          [
            conflict.candidate_id,
            conflict.item_type,
            String(newItemId),
            col,
            now
          ]
        );
        const provenanceId = provRes.rows[0].id;
        await client.query(
          'DELETE FROM data_provenance_sources WHERE provenance_id = $1',
          [provenanceId]
        );

        await recordHumanChange(client, {
          candidateId: conflict.candidate_id,
          itemType: conflict.item_type,
          itemId: String(newItemId),
          fieldName: col,
          previousValue: null,
          newValue: itemData[col],
          changedBy: adminId,
          reason: reason ?? null,
          timestamp: now
        });
      }

      const resolvedValue = { action: 'add', newItemId };
      await client.query(
        `UPDATE conflicts
         SET status = 'resolved',
             resolution_method = 'human_review',
             resolved_value = $1::jsonb,
             resolved_at = $2
         WHERE id = $3`,
        [JSON.stringify(resolvedValue), now, conflict.id]
      );

      applied = {
        itemType: conflict.item_type,
        newItemId
      };
    }

    await client.query(
      `UPDATE human_reviews
       SET review_status = 'completed',
           admin_id = $1,
           reviewed_at = $2,
           confidence = $3,
           review_result = $4
       WHERE id = $5`,
      [adminId, now, confidence, action, review.id]
    );

    const updatedReview = await getReviewById(client, review.id);
    await client.query('COMMIT');
    inTransaction = false;

    return { review: updatedReview, applied };
  } catch (error) {
    if (inTransaction) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Rollback error ignored
      }
    }
    throw error;
  } finally {
    if (typeof pool.connect === 'function') {
      client.release();
    }
  }
}

module.exports = {
  ServiceError,
  listReviews,
  getReviewById,
  resolveReview
};
