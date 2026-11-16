
const {
  createReviewItem,
  REVIEW_REASONS,
  CONFLICT_REASONS,
  REVIEW_TARGET_TYPES
} = require('../src/review-items');

describe('review item constants', () => {
  test('contains the six review reasons', () => {
    expect(REVIEW_REASONS).toHaveLength(6);
  });

  test('contains the five conflict reasons', () => {
    expect(CONFLICT_REASONS).toHaveLength(5);
    expect(CONFLICT_REASONS).not.toContain('unknown_skill');
  });

  test('contains both review target types', () => {
    expect(REVIEW_TARGET_TYPES).toEqual(['conflict', 'unknown_skill']);
  });
});

describe('createReviewItem - conflict', () => {
  const validConflict = {
    targetType: 'conflict',
    candidateId: 6,
    reviewReason: 'low_confidence',
    itemType: 'candidate_profile',
    itemId: 6,
    fieldName: 'city',
    options: [
      {
        value: 'Ramallah',
        sourceFileId: 12,
        confidence: 0.35,
        evidence: 'Lives in Ramallah'
      }
    ]
  };

  test('creates a valid conflict review item', () => {
    expect(createReviewItem(validConflict)).toEqual({
        ...validConflict,
        itemId: String(validConflict.itemId)
    });
  });
  test('supports a conflict with one option', () => {
    expect(createReviewItem(validConflict).options).toHaveLength(1);
  });

  test('trims field name and evidence', () => {
  const result = createReviewItem({
    ...validConflict,
    fieldName: ' city ',
    options: [
      {
        ...validConflict.options[0],
        evidence: ' Lives in Ramallah '
      }
    ]
  });

  expect(result.itemType).toBe('candidate_profile');
  expect(result.fieldName).toBe('city');
  expect(result.options[0].evidence).toBe('Lives in Ramallah');
});

test('rejects item types with surrounding whitespace', () => {
  expect(() =>
    createReviewItem({
      ...validConflict,
      itemType: ' candidate_profile '
    })
  ).toThrow('Invalid conflict itemType.');
});

  test('rejects unknown_skill as a conflict reason', () => {
    expect(() =>
      createReviewItem({
        ...validConflict,
        reviewReason: 'unknown_skill'
      })
    ).toThrow(TypeError);
  });

  test('rejects an empty options array', () => {
    expect(() =>
      createReviewItem({ ...validConflict, options: [] })
    ).toThrow(TypeError);
  });

  test('rejects invalid confidence', () => {
    expect(() =>
      createReviewItem({
        ...validConflict,
        options: [{ ...validConflict.options[0], confidence: 1.5 }]
      })
    ).toThrow(TypeError);
  });

  test('rejects missing evidence', () => {
    expect(() =>
      createReviewItem({
        ...validConflict,
        options: [{ ...validConflict.options[0], evidence: '' }]
      })
    ).toThrow(TypeError);
  });
});

describe('createReviewItem - unknown skill', () => {
  test('creates a valid unknown skill review item', () => {
    expect(
      createReviewItem({
        targetType: 'unknown_skill',
        candidateId: 6,
        itemId: 15,
        reviewReason: 'unknown_skill',
        confidence: 0.8
      })
    ).toEqual({
      targetType: 'unknown_skill',
      candidateId: 6,
      itemId: 15,
      reviewReason: 'unknown_skill',
      confidence: 0.8
    });
  });

  test('defaults missing confidence to null', () => {
    const result = createReviewItem({
      targetType: 'unknown_skill',
      candidateId: 6,
      itemId: 15,
      reviewReason: 'unknown_skill'
    });

    expect(result.confidence).toBeNull();
  });
});

describe('createReviewItem - common validation', () => {
  test('rejects invalid candidate id', () => {
    expect(() =>
      createReviewItem({
        targetType: 'unknown_skill',
        candidateId: 0,
        itemId: 15,
        reviewReason: 'unknown_skill'
      })
    ).toThrow(TypeError);
  });

  test('rejects invalid target type', () => {
    expect(() =>
      createReviewItem({
        targetType: 'invalid',
        candidateId: 6,
        itemId: 15,
        reviewReason: 'unknown_skill'
      })
    ).toThrow(TypeError);
  });

  test('rejects invalid review reason', () => {
    expect(() =>
      createReviewItem({
        targetType: 'unknown_skill',
        candidateId: 6,
        itemId: 15,
        reviewReason: 'invalid_reason'
      })
    ).toThrow(TypeError);
  });
});
