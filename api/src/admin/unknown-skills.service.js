const Fuse = require('fuse.js');
const {
  recordHumanChange,
  getAdminIdForUser
} = require('shared/src/audit/human-audit');

class ServiceError extends Error {
  constructor(status, errors, extra = {}) {
    super(JSON.stringify(errors));
    this.status = status;
    this.errors = errors;
    Object.assign(this, extra);
  }
}

/**
 * Formats a raw database row into the standard unknown skill item shape.
 *
 * @param {object} row
 * @returns {object}
 */
function formatUnknownSkill(row) {
  return {
    id: row.id,
    skillName: row.skillName,
    status: row.status,
    confidence:
      row.confidence !== null && row.confidence !== undefined
        ? Number(row.confidence)
        : null,
    evidence: row.evidence,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
    resolvedSkill: row.resolvedSkillId
      ? {
          id: row.resolvedSkillId,
          canonicalName: row.resolvedCanonicalName
        }
      : null,
    candidate: {
      id: row.candidateId,
      firstName: row.candidateFirstName,
      lastName: row.candidateLastName,
      email: row.candidateEmail
    },
    sourceFile: {
      id: row.sourceFileId,
      sourceType: row.sourceType,
      originalFilename: row.originalFilename,
      uploadedAt: row.uploadedAt
    }
  };
}

/**
 * Returns a paginated list of unknown skills ordered newest first.
 *
 * @param {object} db - pg Pool or Client
 * @param {object} query - validated query parameters
 * @returns {Promise<{ items: Array<object>, page: number, pageSize: number, total: number }>}
 */
async function listUnknownSkills(db, query) {
  const { status = 'pending', candidateId, page = 1, pageSize = 20 } = query;

  const whereClauses = [];
  const params = [];

  if (status) {
    params.push(status);
    whereClauses.push(`us.status = $${params.length}`);
  }

  if (candidateId) {
    params.push(candidateId);
    whereClauses.push(`us.candidate_id = $${params.length}`);
  }

  const whereSql =
    whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const totalQuery = `
    SELECT COUNT(*)::int AS total
    FROM unknown_skills us
    ${whereSql}
  `;

  const offset = (page - 1) * pageSize;
  const listParams = [...params, pageSize, offset];
  const limitIdx = params.length + 1;
  const offsetIdx = params.length + 2;

  const itemsQuery = `
    SELECT
      us.id,
      us.skill_name AS "skillName",
      us.status,
      us.confidence,
      us.evidence,
      us.created_at AS "createdAt",
      us.resolved_at AS "resolvedAt",
      s.id AS "resolvedSkillId",
      s.canonical_name AS "resolvedCanonicalName",
      cp.id AS "candidateId",
      cp.first_name AS "candidateFirstName",
      cp.last_name AS "candidateLastName",
      u.email AS "candidateEmail",
      uf.id AS "sourceFileId",
      uf.source_type AS "sourceType",
      uf.original_filename AS "originalFilename",
      uf.uploaded_at AS "uploadedAt"
    FROM unknown_skills us
    JOIN candidate_profiles cp ON cp.id = us.candidate_id
    JOIN users u ON u.id = cp.user_id
    JOIN uploaded_files uf ON uf.id = us.source_file_id
    LEFT JOIN skills s ON s.id = us.resolved_skill_id
    ${whereSql}
    ORDER BY us.created_at DESC, us.id DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  const [totalResult, itemsResult] = await Promise.all([
    db.query(totalQuery, params),
    db.query(itemsQuery, listParams)
  ]);

  const total = totalResult.rows[0]?.total ?? 0;
  const items = itemsResult.rows.map(formatUnknownSkill);

  return {
    items,
    page,
    pageSize,
    total
  };
}

/**
 * Returns an unknown skill by id, or null if not found.
 *
 * @param {object} db - pg Pool or Client
 * @param {number} id - unknown skill id
 * @returns {Promise<object|null>}
 */
async function getUnknownSkillById(db, id) {
  const query = `
    SELECT
      us.id,
      us.skill_name AS "skillName",
      us.status,
      us.confidence,
      us.evidence,
      us.created_at AS "createdAt",
      us.resolved_at AS "resolvedAt",
      s.id AS "resolvedSkillId",
      s.canonical_name AS "resolvedCanonicalName",
      cp.id AS "candidateId",
      cp.first_name AS "candidateFirstName",
      cp.last_name AS "candidateLastName",
      u.email AS "candidateEmail",
      uf.id AS "sourceFileId",
      uf.source_type AS "sourceType",
      uf.original_filename AS "originalFilename",
      uf.uploaded_at AS "uploadedAt"
    FROM unknown_skills us
    JOIN candidate_profiles cp ON cp.id = us.candidate_id
    JOIN users u ON u.id = cp.user_id
    JOIN uploaded_files uf ON uf.id = us.source_file_id
    LEFT JOIN skills s ON s.id = us.resolved_skill_id
    WHERE us.id = $1
  `;

  const result = await db.query(query, [id]);
  if (result.rows.length === 0) {
    return null;
  }

  return formatUnknownSkill(result.rows[0]);
}

/**
 * Searches skills using fuzzy matching via Fuse.js.
 *
 * @param {object} db - pg Pool or Client
 * @param {{ q: string }} params
 * @returns {Promise<{ items: Array<{ id: number, canonicalName: string, similarity: number }> }>}
 */
async function searchSkills(db, { q }) {
  const minSim =
    process.env.SKILL_MIN_SIMILARITY !== undefined &&
    process.env.SKILL_MIN_SIMILARITY !== null
      ? Number(process.env.SKILL_MIN_SIMILARITY)
      : 0.5;

  const result = await db.query('SELECT id, canonical_name FROM skills');
  const fuse = new Fuse(result.rows, {
    keys: ['canonical_name'],
    includeScore: true,
    ignoreLocation: true,
    threshold: 1 - minSim
  });

  const searchResults = fuse.search(q.trim());
  const items = [];

  for (const res of searchResults) {
    const similarity = 1 - (res.score ?? 0);
    if (similarity >= minSim) {
      items.push({
        id: res.item.id,
        canonicalName: res.item.canonical_name,
        similarity
      });
    }
  }

  items.sort((a, b) => b.similarity - a.similarity);
  return { items: items.slice(0, 20) };
}

/**
 * Resolves an unknown skill inside a single transaction.
 *
 * @param {object} pool - pg Pool
 * @param {number} id - unknown skill id
 * @param {object} body - validated resolution body
 * @param {number} userId - user id of the admin performing resolution
 * @returns {Promise<{ unknownSkill: object, candidateSkillId: number|null, created: boolean }>}
 */
async function resolveUnknownSkill(pool, id, body, userId) {
  const client =
    typeof pool.connect === 'function' ? await pool.connect() : pool;
  let inTransaction = false;

  try {
    await client.query('BEGIN');
    inTransaction = true;

    const lockResult = await client.query(
      'SELECT * FROM unknown_skills WHERE id = $1 FOR UPDATE',
      [id]
    );

    if (lockResult.rows.length === 0) {
      throw new ServiceError(404, {
        unknownSkillId: 'Unknown skill not found'
      });
    }

    const unknownSkillRow = lockResult.rows[0];
    if (unknownSkillRow.status !== 'pending') {
      throw new ServiceError(409, {
        unknownSkillId: 'Unknown skill already resolved'
      });
    }

    const { action, skillId, canonicalName, confidence, reason } = body;
    let targetSkillId = null;
    let candidateSkillId = null;
    let created = false;

    const adminId = await getAdminIdForUser(client, userId);
    if (!adminId) {
      throw new ServiceError(403, { auth: 'Admin profile required' });
    }

    if (action === 'link') {
      const skillRes = await client.query(
        'SELECT id, canonical_name FROM skills WHERE id = $1',
        [skillId]
      );
      if (skillRes.rows.length === 0) {
        throw new ServiceError(400, { skillId: 'Skill not found' });
      }
      targetSkillId = skillRes.rows[0].id;
    } else if (action === 'add') {
      const trimmedCanonicalName = canonicalName.trim();
      const existingRes = await client.query(
        'SELECT id FROM skills WHERE LOWER(canonical_name) = LOWER($1)',
        [trimmedCanonicalName]
      );
      if (existingRes.rows.length > 0) {
        throw new ServiceError(
          409,
          { canonicalName: 'Skill already exists, link it instead' },
          { existingSkillId: existingRes.rows[0].id }
        );
      }

      const insertSkillRes = await client.query(
        'INSERT INTO skills (canonical_name, created_at) VALUES ($1, NOW()) RETURNING id',
        [trimmedCanonicalName]
      );
      targetSkillId = insertSkillRes.rows[0].id;
    }

    if (action === 'link' || action === 'add') {
      const insertCsRes = await client.query(
        `INSERT INTO candidate_skills (candidate_id, skill_id, created_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (candidate_id, skill_id) DO NOTHING
         RETURNING id`,
        [unknownSkillRow.candidate_id, targetSkillId]
      );

      if (insertCsRes.rows.length > 0) {
        created = true;
        candidateSkillId = insertCsRes.rows[0].id;
      } else {
        created = false;
        const existingCs = await client.query(
          'SELECT id FROM candidate_skills WHERE candidate_id = $1 AND skill_id = $2',
          [unknownSkillRow.candidate_id, targetSkillId]
        );
        candidateSkillId = existingCs.rows[0].id;
      }

      if (created) {
        await client.query(
          `INSERT INTO data_provenance (candidate_id, item_type, item_id, field_name, resolution_method, approved_at)
           VALUES ($1, 'candidate_skills', $2, 'skill_id', 'human_reviewed', NOW())
           ON CONFLICT (item_type, item_id, field_name)
           DO UPDATE SET candidate_id = EXCLUDED.candidate_id, resolution_method = EXCLUDED.resolution_method, approved_at = EXCLUDED.approved_at`,
          [unknownSkillRow.candidate_id, String(candidateSkillId)]
        );

        await recordHumanChange(client, {
          candidateId: unknownSkillRow.candidate_id,
          itemType: 'candidate_skills',
          itemId: candidateSkillId,
          fieldName: 'skill_id',
          previousValue: null,
          newValue: targetSkillId,
          changedBy: adminId,
          reason: reason ?? null
        });
      }

      await client.query(
        `UPDATE unknown_skills
         SET status = 'accepted', resolved_skill_id = $1, resolved_at = NOW()
         WHERE id = $2`,
        [targetSkillId, id]
      );
    } else if (action === 'reject') {
      await client.query(
        `UPDATE unknown_skills
         SET status = 'rejected', resolved_at = NOW()
         WHERE id = $1`,
        [id]
      );
      candidateSkillId = null;
      created = false;
    }

    let reviewResult;
    if (action === 'link') {
      reviewResult = `linked:${targetSkillId}`;
    } else if (action === 'add') {
      reviewResult = `added:${targetSkillId}`;
    } else {
      reviewResult = 'rejected';
    }

    const existingHr = await client.query(
      `SELECT id FROM human_reviews
       WHERE review_target_type = 'unknown_skill'
         AND item_id = $1
         AND review_status IN ('pending', 'in_review')
       ORDER BY id ASC
       LIMIT 1
       FOR UPDATE`,
      [id]
    );

    if (existingHr.rows.length > 0) {
      await client.query(
        `UPDATE human_reviews
         SET review_status = 'completed',
             admin_id = $1,
             reviewed_at = NOW(),
             review_result = $2,
             confidence = $3
         WHERE id = $4`,
        [adminId, reviewResult, confidence, existingHr.rows[0].id]
      );
    } else {
      await client.query(
        `INSERT INTO human_reviews (
           candidate_id, review_target_type, item_id, review_reason,
           review_status, admin_id, reviewed_at, review_result, confidence, created_at
         )
         VALUES ($1, 'unknown_skill', $2, 'unknown_skill', 'completed', $3, NOW(), $4, $5, NOW())`,
        [unknownSkillRow.candidate_id, id, adminId, reviewResult, confidence]
      );
    }

    const updatedResult = await client.query(
      `SELECT
         us.id,
         us.skill_name AS "skillName",
         us.status,
         us.confidence,
         us.evidence,
         us.created_at AS "createdAt",
         us.resolved_at AS "resolvedAt",
         s.id AS "resolvedSkillId",
         s.canonical_name AS "resolvedCanonicalName",
         cp.id AS "candidateId",
         cp.first_name AS "candidateFirstName",
         cp.last_name AS "candidateLastName",
         u.email AS "candidateEmail",
         uf.id AS "sourceFileId",
         uf.source_type AS "sourceType",
         uf.original_filename AS "originalFilename",
         uf.uploaded_at AS "uploadedAt"
       FROM unknown_skills us
       JOIN candidate_profiles cp ON cp.id = us.candidate_id
       JOIN users u ON u.id = cp.user_id
       JOIN uploaded_files uf ON uf.id = us.source_file_id
       LEFT JOIN skills s ON s.id = us.resolved_skill_id
       WHERE us.id = $1`,
      [id]
    );

    const updatedSkill = formatUnknownSkill(updatedResult.rows[0]);

    await client.query('COMMIT');
    inTransaction = false;

    return {
      unknownSkill: updatedSkill,
      candidateSkillId,
      created
    };
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
  formatUnknownSkill,
  listUnknownSkills,
  getUnknownSkillById,
  searchSkills,
  resolveUnknownSkill
};
