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

module.exports = {
  ServiceError,
  formatUnknownSkill,
  listUnknownSkills,
  getUnknownSkillById,
  searchSkills
};
