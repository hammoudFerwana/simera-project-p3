const { z } = require('zod');

const UNKNOWN_SKILL_STATUSES = ['pending', 'accepted', 'rejected'];

const listUnknownSkillsQuerySchema = z.object({
  status: z
    .preprocess(
      (val) => (val === '' || val === undefined ? 'pending' : val),
      z.enum(UNKNOWN_SKILL_STATUSES, {
        error: `Status must be one of: ${UNKNOWN_SKILL_STATUSES.join(', ')}`
      })
    )
    .optional(),
  candidateId: z
    .custom(
      (val) => {
        if (val === undefined || val === '') return true;
        if (typeof val === 'number') return Number.isInteger(val) && val > 0;
        if (typeof val === 'string') return /^[1-9]\d*$/.test(val.trim());
        return false;
      },
      { message: 'Candidate id must be a positive integer' }
    )
    .optional(),
  page: z.preprocess(
    (val) => (val === undefined || val === '' ? 1 : val),
    z
      .custom(
        (val) => {
          if (typeof val === 'number') return Number.isInteger(val) && val > 0;
          if (typeof val === 'string') return /^[1-9]\d*$/.test(val.trim());
          return false;
        },
        { message: 'Page must be a positive integer' }
      )
      .transform(Number)
  ),
  pageSize: z.preprocess(
    (val) => (val === undefined || val === '' ? 20 : val),
    z
      .custom(
        (val) => {
          if (typeof val === 'number') {
            return Number.isInteger(val) && val > 0 && val <= 100;
          }
          if (typeof val === 'string') {
            const trimmed = val.trim();
            if (!/^[1-9]\d*$/.test(trimmed)) return false;
            const parsed = parseInt(trimmed, 10);
            return parsed > 0 && parsed <= 100;
          }
          return false;
        },
        { message: 'Page size must be a positive integer at most 100' }
      )
      .transform(Number)
  )
});

const unknownSkillIdSchema = z
  .custom(
    (val) => {
      if (typeof val === 'number') return Number.isInteger(val) && val > 0;
      if (typeof val === 'string') return /^[1-9]\d*$/.test(val.trim());
      return false;
    },
    { message: 'Unknown skill id must be a positive integer' }
  )
  .transform(Number);

/**
 * Validates query parameters for GET /api/admin/unknown-skills.
 *
 * @param {object} [query]
 * @returns {{ success: true, data: object } | { success: false, errors: object }}
 */
function validateListUnknownSkillsQuery(query = {}) {
  const result = listUnknownSkillsQuerySchema.safeParse(query);

  if (result.success) {
    const data = { ...result.data };
    if (!data.status) {
      data.status = 'pending';
    }
    if (data.candidateId !== undefined && data.candidateId !== '') {
      data.candidateId = Number(data.candidateId);
    } else {
      data.candidateId = undefined;
    }
    return { success: true, data };
  }

  const errors = {};
  for (const issue of result.error.issues) {
    const fieldName = issue.path[0];
    if (fieldName && !errors[fieldName]) {
      errors[fieldName] = issue.message;
    }
  }

  return { success: false, errors };
}

/**
 * Validates the unknown skill ID path parameter.
 *
 * @param {unknown} value
 * @returns {{ success: true, data: number } | { success: false, errors: object }}
 */
function validateUnknownSkillId(value) {
  const result = unknownSkillIdSchema.safeParse(value);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    errors: {
      unknownSkillId:
        result.error.issues[0]?.message ||
        'Unknown skill id must be a positive integer'
    }
  };
}

/**
 * Validates query parameters for GET /api/admin/skills/search.
 *
 * @param {object} [query]
 * @returns {{ success: true, data: { q: string } } | { success: false, errors: object }}
 */
function validateSearchSkillsQuery(query = {}) {
  const q = query ? query.q : undefined;

  if (q === undefined || typeof q !== 'string' || q.trim().length === 0) {
    return {
      success: false,
      errors: { q: 'Query is required' }
    };
  }

  const trimmed = q.trim();
  if (trimmed.length > 100) {
    return {
      success: false,
      errors: { q: 'Query must be at most 100 characters' }
    };
  }

  return {
    success: true,
    data: { q: trimmed }
  };
}

module.exports = {
  UNKNOWN_SKILL_STATUSES,
  validateListUnknownSkillsQuery,
  validateUnknownSkillId,
  validateSearchSkillsQuery
};
