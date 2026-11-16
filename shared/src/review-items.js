const REVIEW_REASONS = Object.freeze([
  'conflict',
  'intra_source_conflict',
  'low_confidence',
  'validation_failure',
  'item_match_uncertain',
  'unknown_skill'
]);

const CONFLICT_REASONS = Object.freeze([
  'conflict',
  'intra_source_conflict',
  'low_confidence',
  'validation_failure',
  'item_match_uncertain'
]);

const REVIEW_TARGET_TYPES = Object.freeze(['conflict', 'unknown_skill']);

const REVIEW_ITEM_TYPES = Object.freeze([
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

function validateConfidence(confidence) {
  if (
    confidence !== null &&
    confidence !== undefined &&
    (typeof confidence !== 'number' ||
      !Number.isFinite(confidence) ||
      confidence < 0 ||
      confidence > 1)
  ) {
    throw new TypeError('Confidence must be a number between 0 and 1.');
  }
}

function createReviewItem(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new TypeError('Review item data must be an object.');
  }

  const { targetType, candidateId, reviewReason, itemId } = data;

  if (!REVIEW_TARGET_TYPES.includes(targetType)) {
    throw new TypeError('Invalid review target type.');
  }

  if (!Number.isInteger(candidateId) || candidateId <= 0) {
    throw new TypeError('candidateId must be a positive integer.');
  }

  if (!REVIEW_REASONS.includes(reviewReason)) {
    throw new TypeError('Invalid review reason.');
  }

  if (targetType === 'unknown_skill') {
    if (!Number.isInteger(itemId) || itemId <= 0) {
      throw new TypeError('Unknown skill itemId must be a positive integer.');
    }
  } else if (
    (typeof itemId !== 'string' && typeof itemId !== 'number') ||
    !String(itemId).trim()
  ) {
    throw new TypeError('Conflict itemId must be a non-empty identifier.');
  }

  if (targetType === 'unknown_skill') {
    if (reviewReason !== 'unknown_skill') {
      throw new TypeError(
        'Unknown skill reviews must use the unknown_skill reason.'
      );
    }

    validateConfidence(data.confidence);

    return {
      targetType,
      candidateId,
      itemId,
      reviewReason,
      confidence: data.confidence ?? null
    };
  }

  if (reviewReason === 'unknown_skill') {
    throw new TypeError(
      'Conflict reviews cannot use the unknown_skill reason.'
    );
  }

  if (!REVIEW_ITEM_TYPES.includes(data.itemType)) {
    throw new TypeError('Invalid conflict itemType.');
  }

  if (typeof data.fieldName !== 'string' || !data.fieldName.trim()) {
    throw new TypeError('Conflict fieldName is required.');
  }

  if (!Array.isArray(data.options) || data.options.length === 0) {
    throw new TypeError('Conflict reviews require at least one option.');
  }

  const options = data.options.map((option) => {
    if (!option || typeof option !== 'object' || Array.isArray(option)) {
      throw new TypeError('Each conflict option must be an object.');
    }

    if (!Object.hasOwn(option, 'value')) {
      throw new TypeError('Each conflict option must include a value.');
    }

    if (
      option.sourceFileId !== null &&
      option.sourceFileId !== undefined &&
      (!Number.isInteger(option.sourceFileId) || option.sourceFileId <= 0)
    ) {
      throw new TypeError('sourceFileId must be a positive integer.');
    }

    validateConfidence(option.confidence);

    const isFromStored = Boolean(option.fromStored);
    if (!isFromStored) {
      if (typeof option.evidence !== 'string' || !option.evidence.trim()) {
        throw new TypeError('Each conflict option requires evidence.');
      }
    } else if (option.evidence !== null && option.evidence !== undefined) {
      if (typeof option.evidence !== 'string' || !option.evidence.trim()) {
        throw new TypeError(
          'Evidence, when provided, must be a non-empty string.'
        );
      }
    }

    return {
      value: option.value,
      sourceFileId: option.sourceFileId ?? null,
      confidence: option.confidence ?? null,
      evidence:
        option.evidence !== null && option.evidence !== undefined
          ? option.evidence.trim()
          : null
    };
  });

  return {
    targetType,
    candidateId,
    reviewReason,
    itemType: data.itemType,
    itemId: String(itemId).trim(),
    fieldName: data.fieldName.trim(),
    options
  };
}

async function saveReviewItems(client, reviewItems) {
  if (!client || typeof client.query !== 'function') {
    throw new TypeError('A database client is required.');
  }

  if (!Array.isArray(reviewItems) || reviewItems.length === 0) {
    return 0;
  }

  let newConflictsCount = 0;

  for (const reviewItem of reviewItems) {
    if (!reviewItem || reviewItem.targetType !== 'conflict') {
      continue;
    }

    const existingConflictResult = await client.query(
      `SELECT id
       FROM conflicts
       WHERE candidate_id = $1
         AND item_type = $2
         AND item_id = $3
         AND field_name = $4
         AND status = 'pending'
       ORDER BY id
       LIMIT 1
       FOR UPDATE`,
      [
        reviewItem.candidateId,
        reviewItem.itemType,
        reviewItem.itemId,
        reviewItem.fieldName
      ]
    );

    let conflictId;
    const existingConflict = existingConflictResult.rows[0];

    if (existingConflict) {
      conflictId = existingConflict.id;
    } else {
      const conflictResult = await client.query(
        `INSERT INTO conflicts (
           candidate_id,
           item_type,
           item_id,
           field_name,
           status
         )
         VALUES ($1, $2, $3, $4, 'pending')
         RETURNING id`,
        [
          reviewItem.candidateId,
          reviewItem.itemType,
          reviewItem.itemId,
          reviewItem.fieldName
        ]
      );

      conflictId = conflictResult.rows[0].id;

      await client.query(
        `INSERT INTO human_reviews (
           candidate_id,
           review_target_type,
           item_id,
           review_reason,
           review_status,
           created_at
         )
         VALUES ($1, 'conflict', $2, $3, 'pending', CURRENT_TIMESTAMP)`,
        [reviewItem.candidateId, conflictId, reviewItem.reviewReason]
      );

      newConflictsCount += 1;
    }

    if (Array.isArray(reviewItem.options)) {
      for (const option of reviewItem.options) {
        await client.query(
          `INSERT INTO conflict_options (
             conflict_id,
             value,
             source_file_id,
             confidence,
             evidence
           )
           VALUES ($1, $2, $3, $4, $5)`,
          [
            conflictId,
            JSON.stringify(option.value),
            option.sourceFileId ?? null,
            option.confidence ?? null,
            option.evidence ?? null
          ]
        );
      }
    }
  }

  return newConflictsCount;
}

module.exports = {
  REVIEW_REASONS,
  CONFLICT_REASONS,
  REVIEW_TARGET_TYPES,
  REVIEW_ITEM_TYPES,
  createReviewItem,
  saveReviewItems
};
