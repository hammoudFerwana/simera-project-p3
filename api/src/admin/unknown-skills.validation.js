const { z } = require('zod');

const UNKNOWN_SKILL_STATUSES = ['pending', 'accepted', 'rejected'];
const RESOLVE_ACTIONS = ['link', 'add', 'reject'];

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

/**
 * Validates body for POST /api/admin/unknown-skills/:id/resolve.
 *
 * @param {unknown} body
 * @returns {{ success: true, data: object } | { success: false, errors: object }}
 */
function validateResolveUnknownSkillBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      success: false,
      errors: { body: 'Invalid request body' }
    };
  }

  const errors = {};
  const { action, skillId, canonicalName, confidence, reason } = body;

  if (!action || !RESOLVE_ACTIONS.includes(action)) {
    errors.action = `Action must be one of: ${RESOLVE_ACTIONS.join(', ')}`;
  }

  if (confidence === undefined || confidence === null || confidence === '') {
    errors.confidence = 'Confidence is required';
  } else {
    const num =
      typeof confidence === 'number'
        ? confidence
        : typeof confidence === 'string' && confidence.trim() !== ''
          ? Number(confidence)
          : NaN;

    if (Number.isNaN(num) || num < 0 || num > 1) {
      errors.confidence = 'Confidence must be between 0 and 1';
    }
  }

  if (action === 'link') {
    const isPosInt =
      (typeof skillId === 'number' &&
        Number.isInteger(skillId) &&
        skillId > 0) ||
      (typeof skillId === 'string' && /^[1-9]\d*$/.test(skillId.trim()));
    if (!isPosInt) {
      errors.skillId = 'Skill id is required for link action';
    }
  }

  if (action === 'add') {
    if (
      canonicalName === undefined ||
      canonicalName === null ||
      typeof canonicalName !== 'string' ||
      canonicalName.trim().length === 0 ||
      canonicalName.trim().length > 500
    ) {
      errors.canonicalName = 'Canonical name is required for add action';
    }
  }

  if (reason !== undefined && reason !== null) {
    if (typeof reason !== 'string' || reason.length > 1000) {
      errors.reason = 'Reason must be at most 1000 characters';
    }
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      action,
      skillId: action === 'link' ? Number(skillId) : undefined,
      canonicalName: action === 'add' ? canonicalName.trim() : undefined,
      confidence: Number(confidence),
      reason: reason ?? null
    }
  };
}

module.exports = {
  UNKNOWN_SKILL_STATUSES,
  RESOLVE_ACTIONS,
  validateListUnknownSkillsQuery,
  validateUnknownSkillId,
  validateSearchSkillsQuery,
  validateResolveUnknownSkillBody
};
