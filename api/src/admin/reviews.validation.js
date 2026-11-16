const { z } = require('zod');

const REVIEW_STATUSES = ['pending', 'in_review', 'completed'];

const REVIEW_REASONS = [
  'conflict',
  'intra_source_conflict',
  'low_confidence',
  'validation_failure',
  'item_match_uncertain',
  'unknown_skill'
];

const RESOLVE_ACTIONS = ['choose', 'manual', 'merge', 'add'];

const DATE_LIKE_COLUMNS = new Set([
  'start_date',
  'end_date',
  'issue_date',
  'expiration_date',
  'award_date',
  'publication_date'
]);

const listReviewsQuerySchema = z.object({
  status: z
    .preprocess(
      (val) => (val === '' || val === undefined ? 'pending' : val),
      z.enum(REVIEW_STATUSES, {
        error: `Status must be one of: ${REVIEW_STATUSES.join(', ')}`
      })
    )
    .optional(),
  reason: z.preprocess(
    (val) => (val === '' || val === undefined ? undefined : val),
    z
      .enum(REVIEW_REASONS, {
        error: `Reason must be one of: ${REVIEW_REASONS.join(', ')}`
      })
      .optional()
  ),
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

const reviewIdSchema = z
  .custom(
    (val) => {
      if (typeof val === 'number') return Number.isInteger(val) && val > 0;
      if (typeof val === 'string') return /^[1-9]\d*$/.test(val.trim());
      return false;
    },
    { message: 'Review id must be a positive integer' }
  )
  .transform(Number);

/**
 * Validates query parameters for GET /api/admin/reviews.
 *
 * @param {object} [query]
 * @returns {{ success: true, data: object } | { success: false, errors: object }}
 */
function validateListReviewsQuery(query = {}) {
  const result = listReviewsQuerySchema.safeParse(query);

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
 * Validates the review ID path parameter.
 *
 * @param {unknown} value
 * @returns {{ success: true, data: number } | { success: false, errors: object }}
 */
function validateReviewId(value) {
  const result = reviewIdSchema.safeParse(value);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    errors: {
      reviewId:
        result.error.issues[0]?.message ||
        'Review id must be a positive integer'
    }
  };
}

/**
 * Validates body for POST /api/admin/reviews/:id/resolve.
 *
 * @param {unknown} body
 * @returns {{ success: true, data: object } | { success: false, errors: object }}
 */
function validateResolveReviewBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      success: false,
      errors: { body: 'Invalid request body' }
    };
  }

  const errors = {};
  const { action, optionId, value, confidence, reason } = body;

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

  if (action === 'choose') {
    const isPosInt =
      (typeof optionId === 'number' &&
        Number.isInteger(optionId) &&
        optionId > 0) ||
      (typeof optionId === 'string' && /^[1-9]\d*$/.test(optionId.trim()));
    if (!isPosInt) {
      errors.optionId = 'Option id is required for choose action';
    }
  }

  if (action === 'manual') {
    if (value === undefined || value === null || value === '') {
      errors.value = 'Value is required for manual action';
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
      optionId: action === 'choose' ? Number(optionId) : undefined,
      value: action === 'manual' ? value : undefined,
      confidence: Number(confidence),
      reason: reason ?? null
    }
  };
}

/**
 * Validates a manual value against column metadata from information_schema.
 *
 * @param {string} dataType - e.g. 'character varying', 'text', 'integer', 'boolean', 'numeric', 'real'
 * @param {number|null} charMaxLength - character_maximum_length
 * @param {string} columnName - column name
 * @param {unknown} val - input value
 * @returns {{ success: true, data: unknown } | { success: false, message: string }}
 */
function validateManualValueByColumnType(
  dataType,
  charMaxLength,
  columnName,
  val
) {
  const normalizedType = (dataType || '').toLowerCase();

  // Date-like varchar columns named start_date, end_date, issue_date, expiration_date, award_date, publication_date
  if (DATE_LIKE_COLUMNS.has(columnName)) {
    if (typeof val !== 'string') {
      return { success: false, message: 'Date value must be a string' };
    }
    const trimmed = val.trim();
    const dateRegex =
      /^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/;
    if (!dateRegex.test(trimmed)) {
      return {
        success: false,
        message: 'Date value must be YYYY, YYYY-MM, or YYYY-MM-DD'
      };
    }
    return { success: true, data: trimmed };
  }

  if (
    normalizedType.includes('character') ||
    normalizedType.includes('varchar') ||
    normalizedType === 'text'
  ) {
    if (typeof val !== 'string') {
      return { success: false, message: 'Text value must be a string' };
    }
    const trimmed = val.trim();
    if (trimmed.length === 0) {
      return { success: false, message: 'Text value cannot be empty' };
    }
    const maxLen = charMaxLength || 5000;
    if (trimmed.length > maxLen) {
      return {
        success: false,
        message: `Text value must be at most ${maxLen} characters`
      };
    }
    return { success: true, data: trimmed };
  }

  if (
    normalizedType.includes('int') ||
    normalizedType === 'smallint' ||
    normalizedType === 'bigint'
  ) {
    let num;
    if (typeof val === 'number') {
      num = val;
    } else if (typeof val === 'string' && /^-?\d+$/.test(val.trim())) {
      num = parseInt(val.trim(), 10);
    } else {
      return { success: false, message: 'Integer value is required' };
    }
    if (!Number.isInteger(num)) {
      return { success: false, message: 'Integer value is required' };
    }
    return { success: true, data: num };
  }

  if (normalizedType === 'boolean') {
    if (typeof val === 'boolean') {
      return { success: true, data: val };
    }
    if (typeof val === 'string') {
      const lower = val.trim().toLowerCase();
      if (lower === 'true' || lower === '1')
        return { success: true, data: true };
      if (lower === 'false' || lower === '0')
        return { success: true, data: false };
    }
    return { success: false, message: 'Boolean value is required' };
  }

  if (
    normalizedType.includes('numeric') ||
    normalizedType.includes('real') ||
    normalizedType.includes('double') ||
    normalizedType.includes('float')
  ) {
    let num;
    if (typeof val === 'number') {
      num = val;
    } else if (typeof val === 'string' && val.trim() !== '') {
      num = Number(val.trim());
    } else {
      return { success: false, message: 'Finite number is required' };
    }
    if (!Number.isFinite(num)) {
      return { success: false, message: 'Finite number is required' };
    }
    return { success: true, data: num };
  }

  // Fallback default: accept value as-is
  return { success: true, data: val };
}

module.exports = {
  REVIEW_STATUSES,
  REVIEW_REASONS,
  RESOLVE_ACTIONS,
  DATE_LIKE_COLUMNS,
  validateListReviewsQuery,
  validateReviewId,
  validateResolveReviewBody,
  validateManualValueByColumnType
};
