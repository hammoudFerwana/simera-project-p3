const {
  createReviewItem,
  saveReviewItems,
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
    expect(() => createReviewItem({ ...validConflict, options: [] })).toThrow(
      TypeError
    );
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

  test('allows null evidence when fromStored is true', () => {
    const item = createReviewItem({
      targetType: 'conflict',
      candidateId: 6,
      reviewReason: 'conflict',
      itemType: 'candidate_profile',
      itemId: '6',
      fieldName: 'title',
      options: [
        {
          value: 'Senior Developer',
          sourceFileId: 10,
          confidence: 0.9,
          evidence: null,
          fromStored: true
        }
      ]
    });

    expect(item.options[0].evidence).toBeNull();
    expect(item.options[0]).not.toHaveProperty('fromStored');
  });

  test('rejects non-string evidence when fromStored is true and evidence is provided', () => {
    expect(() =>
      createReviewItem({
        targetType: 'conflict',
        candidateId: 6,
        reviewReason: 'conflict',
        itemType: 'candidate_profile',
        itemId: '6',
        fieldName: 'title',
        options: [
          {
            value: 'Senior Developer',
            fromStored: true,
            evidence: 123
          }
        ]
      })
    ).toThrow(TypeError);
  });
});

describe('saveReviewItems', () => {
  test('throws when client is missing or invalid', async () => {
    await expect(saveReviewItems(null, [])).rejects.toThrow(
      'A database client is required.'
    );
    await expect(saveReviewItems({}, [])).rejects.toThrow(
      'A database client is required.'
    );
  });

  test('returns 0 for non-array or empty reviewItems', async () => {
    const mockClient = { query: jest.fn() };
    expect(await saveReviewItems(mockClient, [])).toBe(0);
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  test('creates a new conflict and human review when no pending conflict exists', async () => {
    const mockClient = {
      query: jest
        .fn()
        // 1. SELECT existing pending conflict
        .mockResolvedValueOnce({ rows: [] })
        // 2. INSERT conflict
        .mockResolvedValueOnce({ rows: [{ id: 101 }] })
        // 3. INSERT human_reviews
        .mockResolvedValueOnce({ rows: [{ id: 501 }] })
        // 4. INSERT conflict_options
        .mockResolvedValueOnce({ rows: [{ id: 201 }] })
    };

    const reviewItems = [
      createReviewItem({
        targetType: 'conflict',
        candidateId: 5,
        reviewReason: 'low_confidence',
        itemType: 'candidate_profile',
        itemId: '5',
        fieldName: 'first_name',
        options: [
          {
            value: 'Alice',
            sourceFileId: 10,
            confidence: 0.3,
            evidence: 'Name: Alice'
          }
        ]
      })
    ];

    const result = await saveReviewItems(mockClient, reviewItems);

    expect(result).toBe(1);
    expect(mockClient.query).toHaveBeenCalledTimes(4);

    // Verify SELECT FOR UPDATE was used
    expect(mockClient.query.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(mockClient.query.mock.calls[0][1]).toEqual([
      5,
      'candidate_profile',
      '5',
      'first_name'
    ]);

    // Verify INSERT into conflicts
    expect(mockClient.query.mock.calls[1][0]).toContain(
      'INSERT INTO conflicts'
    );

    // Verify INSERT into human_reviews
    expect(mockClient.query.mock.calls[2][0]).toContain(
      'INSERT INTO human_reviews'
    );
    expect(mockClient.query.mock.calls[2][1]).toEqual([
      5,
      101,
      'low_confidence'
    ]);

    // Verify INSERT into conflict_options
    expect(mockClient.query.mock.calls[3][0]).toContain(
      'INSERT INTO conflict_options'
    );
    expect(mockClient.query.mock.calls[3][1]).toEqual([
      101,
      JSON.stringify('Alice'),
      10,
      0.3,
      'Name: Alice'
    ]);
  });

  test('reuses existing pending conflict and does not create new conflict or human review', async () => {
    const mockClient = {
      query: jest
        .fn()
        // 1. SELECT existing pending conflict -> found!
        .mockResolvedValueOnce({ rows: [{ id: 101 }] })
        // 2. INSERT conflict_options
        .mockResolvedValueOnce({ rows: [{ id: 202 }] })
    };

    const reviewItems = [
      createReviewItem({
        targetType: 'conflict',
        candidateId: 5,
        reviewReason: 'conflict',
        itemType: 'candidate_profile',
        itemId: '5',
        fieldName: 'first_name',
        options: [
          {
            value: 'Alicia',
            sourceFileId: 11,
            confidence: 0.9,
            evidence: 'Name: Alicia'
          }
        ]
      })
    ];

    const result = await saveReviewItems(mockClient, reviewItems);

    expect(result).toBe(0);
    expect(mockClient.query).toHaveBeenCalledTimes(2);

    expect(mockClient.query.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(mockClient.query.mock.calls[1][0]).toContain(
      'INSERT INTO conflict_options'
    );
    expect(mockClient.query.mock.calls[1][1]).toEqual([
      101,
      JSON.stringify('Alicia'),
      11,
      0.9,
      'Name: Alicia'
    ]);
  });
});
