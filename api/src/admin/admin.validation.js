const { z } = require('zod');

const PROCESSING_STATUSES = [
  'queued',
  'processing',
  'completed',
  'completed_with_review',
  'failed'
];

const listQuerySchema = z.object({
  status: z
    .enum(PROCESSING_STATUSES, {
      error: `Status must be one of: ${PROCESSING_STATUSES.join(', ')}`
    })
    .optional(),
  hasPendingReview: z
    .preprocess(
      (val) => (typeof val === 'boolean' ? String(val) : val),
      z.enum(['true', 'false'], {
        error: 'hasPendingReview must be true or false'
      })
    )
    .optional(),
  search: z
    .string()
    .trim()
    .max(100, 'Search term must be at most 100 characters')
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

const candidateIdSchema = z
  .custom(
    (val) => {
      if (typeof val === 'number') return Number.isInteger(val) && val > 0;
      if (typeof val === 'string') return /^[1-9]\d*$/.test(val.trim());
      return false;
    },
    { message: 'Candidate id must be a positive integer' }
  )
  .transform(Number);

/**
 * Validates the query parameters for GET /api/admin/candidates.
 *
 * @param {object} [query]
 * @returns {{ success: true, data: object } | { success: false, errors: object }}
 */
function validateListQuery(query = {}) {
  const result = listQuerySchema.safeParse(query);

  if (result.success) {
    const data = { ...result.data };
    if (data.search === '') {
      data.search = undefined;
    }
    if (data.hasPendingReview !== undefined) {
      data.hasPendingReview = data.hasPendingReview === 'true';
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
 * Validates the candidate ID path parameter.
 *
 * @param {unknown} value
 * @returns {{ success: true, data: number } | { success: false, errors: object }}
 */
function validateCandidateId(value) {
  const result = candidateIdSchema.safeParse(value);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    errors: {
      candidateId:
        result.error.issues[0]?.message ||
        'Candidate id must be a positive integer'
    }
  };
}

module.exports = {
  PROCESSING_STATUSES,
  validateListQuery,
  validateCandidateId
};
