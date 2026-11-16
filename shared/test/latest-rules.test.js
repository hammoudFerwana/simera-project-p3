const { decideLatest, readThreshold } = require('../src/rules/latest-rules');

const wrap = (value, confidence = 0.9, evidence = 'evidence snippet') => ({
  value,
  confidence,
  evidence
});

describe('latest-rules (decideLatest)', () => {
  it('AC1: applies B1 on stored current job when new file gives valid end date', () => {
    const diff = {
      differences: [
        {
          section: 'work_experience',
          storedIndex: 0,
          storedId: '101',
          newIndex: 0,
          field: 'end_date',
          stored: null,
          new: wrap('2024-03')
        }
      ]
    };

    const result = decideLatest(diff);

    expect(result).toEqual({
      automatic: [
        {
          rule: 'B1',
          section: 'work_experience',
          itemType: 'work_experience',
          itemId: '101',
          field: 'end_date',
          previous: null,
          next: wrap('2024-03'),
          extraUpdates: { is_current: false }
        }
      ],
      reviews: [],
      addOptions: []
    });
  });

  it('AC2: applies B2 when headline changes', () => {
    const diff = {
      differences: [
        {
          section: 'candidate',
          storedIndex: null,
          storedId: null,
          newIndex: null,
          field: 'headline',
          stored: 'Backend Developer',
          new: wrap('Senior Backend Developer')
        }
      ]
    };

    const result = decideLatest(diff, { candidateProfileId: '42' });

    expect(result).toEqual({
      automatic: [
        {
          rule: 'B2',
          section: 'candidate',
          itemType: 'candidate_profile',
          itemId: '42',
          field: 'headline',
          previous: 'Backend Developer',
          next: wrap('Senior Backend Developer'),
          extraUpdates: {}
        }
      ],
      reviews: [],
      addOptions: []
    });
  });

  it('AC3: applies B2 when city changes', () => {
    const diff = {
      differences: [
        {
          section: 'candidate',
          storedIndex: null,
          storedId: null,
          newIndex: null,
          field: 'city',
          stored: 'Amman',
          new: wrap('Dubai')
        }
      ]
    };

    const result = decideLatest(diff, { candidateProfileId: '42' });

    expect(result).toEqual({
      automatic: [
        {
          rule: 'B2',
          section: 'candidate',
          itemType: 'candidate_profile',
          itemId: '42',
          field: 'city',
          previous: 'Amman',
          next: wrap('Dubai'),
          extraUpdates: {}
        }
      ],
      reviews: [],
      addOptions: []
    });
  });

  it('AC4: applies B3 when language level changes', () => {
    const diff = {
      differences: [
        {
          section: 'languages',
          storedIndex: 0,
          storedId: '7',
          newIndex: 0,
          field: 'proficiency_level',
          stored: 'intermediate',
          new: wrap('advanced')
        }
      ]
    };

    const result = decideLatest(diff);

    expect(result).toEqual({
      automatic: [
        {
          rule: 'B3',
          section: 'languages',
          itemType: 'candidate_languages',
          itemId: '7',
          field: 'proficiency_level',
          previous: 'intermediate',
          next: wrap('advanced'),
          extraUpdates: {}
        }
      ],
      reviews: [],
      addOptions: []
    });
  });

  it('AC5: reviews C1 when stored job ended and new file says present', () => {
    const diff = {
      differences: [
        {
          section: 'work_experience',
          storedIndex: 0,
          storedId: '101',
          newIndex: 0,
          field: 'is_current',
          stored: false,
          new: wrap(true)
        }
      ]
    };

    const result = decideLatest(diff);

    expect(result).toEqual({
      automatic: [],
      reviews: [
        {
          reason: 'conflict',
          rule: 'C1',
          section: 'work_experience',
          itemType: 'work_experience',
          itemId: '101',
          field: 'is_current',
          stored: false,
          new: wrap(true)
        }
      ],
      addOptions: []
    });
  });

  it('AC6: reviews C2 when a past job start date differs', () => {
    const diff = {
      differences: [
        {
          section: 'work_experience',
          storedIndex: 0,
          storedId: '101',
          newIndex: 0,
          field: 'start_date',
          stored: '2019-05',
          new: wrap('2019-08')
        }
      ]
    };

    const result = decideLatest(diff);

    expect(result).toEqual({
      automatic: [],
      reviews: [
        {
          reason: 'conflict',
          rule: 'C2',
          section: 'work_experience',
          itemType: 'work_experience',
          itemId: '101',
          field: 'start_date',
          stored: '2019-05',
          new: wrap('2019-08')
        }
      ],
      addOptions: []
    });
  });

  it('AC7: reviews C6 when confidence is 0.3 (below threshold)', () => {
    const diff = {
      differences: [
        {
          section: 'candidate',
          storedIndex: null,
          storedId: null,
          newIndex: null,
          field: 'city',
          stored: 'Amman',
          new: wrap('Dubai', 0.3)
        }
      ]
    };

    const result = decideLatest(diff, { candidateProfileId: '42' });

    expect(result).toEqual({
      automatic: [],
      reviews: [
        {
          reason: 'low_confidence',
          rule: 'C6',
          section: 'candidate',
          itemType: 'candidate_profile',
          itemId: '42',
          field: 'city',
          stored: 'Amman',
          new: wrap('Dubai', 0.3)
        }
      ],
      addOptions: []
    });
  });

  it('AC8: adds option to existing pending conflict without applying', () => {
    const diff = {
      differences: [
        {
          section: 'candidate',
          storedIndex: null,
          storedId: null,
          newIndex: null,
          field: 'city',
          stored: 'Amman',
          new: wrap('Dubai')
        }
      ]
    };

    const pendingConflicts = [
      {
        conflictId: 55,
        itemType: 'candidate_profile',
        itemId: '42',
        fieldName: 'city'
      }
    ];

    const result = decideLatest(diff, {
      candidateProfileId: '42',
      pendingConflicts
    });

    expect(result).toEqual({
      automatic: [],
      reviews: [],
      addOptions: [
        {
          conflictId: 55,
          field: 'city',
          new: wrap('Dubai')
        }
      ]
    });
  });

  it('AC9: applies B2 to a stored human-reviewed city', () => {
    const diff = {
      differences: [
        {
          section: 'candidate',
          storedIndex: null,
          storedId: null,
          newIndex: null,
          field: 'city',
          stored: 'Amman',
          new: wrap('Abu Dhabi')
        }
      ]
    };

    const result = decideLatest(diff, { candidateProfileId: '42' });

    expect(result).toEqual({
      automatic: [
        {
          rule: 'B2',
          section: 'candidate',
          itemType: 'candidate_profile',
          itemId: '42',
          field: 'city',
          previous: 'Amman',
          next: wrap('Abu Dhabi'),
          extraUpdates: {}
        }
      ],
      reviews: [],
      addOptions: []
    });
  });

  it('D2: reviews with reason conflict when first_name differs', () => {
    const diff = {
      differences: [
        {
          section: 'candidate',
          storedIndex: null,
          storedId: null,
          newIndex: null,
          field: 'first_name',
          stored: 'John',
          new: wrap('Johnny')
        }
      ]
    };

    const result = decideLatest(diff, { candidateProfileId: '42' });

    expect(result).toEqual({
      automatic: [],
      reviews: [
        {
          reason: 'conflict',
          rule: 'D2',
          section: 'candidate',
          itemType: 'candidate_profile',
          itemId: '42',
          field: 'first_name',
          stored: 'John',
          new: wrap('Johnny')
        }
      ],
      addOptions: []
    });
  });

  it('null confidence triggers C6 review', () => {
    const diff = {
      differences: [
        {
          section: 'candidate',
          storedIndex: null,
          storedId: null,
          newIndex: null,
          field: 'city',
          stored: 'Amman',
          new: wrap('Dubai', null)
        }
      ]
    };

    const result = decideLatest(diff, { candidateProfileId: '42' });

    expect(result).toEqual({
      automatic: [],
      reviews: [
        {
          reason: 'low_confidence',
          rule: 'C6',
          section: 'candidate',
          itemType: 'candidate_profile',
          itemId: '42',
          field: 'city',
          stored: 'Amman',
          new: wrap('Dubai', null)
        }
      ],
      addOptions: []
    });
  });

  it('applies B3 when skills months_of_experience differs', () => {
    const diff = {
      differences: [
        {
          section: 'skills',
          storedIndex: 0,
          storedId: '15',
          newIndex: 0,
          field: 'months_of_experience',
          stored: 24,
          new: wrap(36)
        }
      ]
    };

    const result = decideLatest(diff);

    expect(result).toEqual({
      automatic: [
        {
          rule: 'B3',
          section: 'skills',
          itemType: 'candidate_skills',
          itemId: '15',
          field: 'months_of_experience',
          previous: 24,
          next: wrap(36),
          extraUpdates: {}
        }
      ],
      reviews: [],
      addOptions: []
    });
  });

  it('reviews C2 when an ended job end_date differs', () => {
    const diff = {
      differences: [
        {
          section: 'work_experience',
          storedIndex: 0,
          storedId: '101',
          newIndex: 0,
          field: 'end_date',
          stored: '2022-05',
          new: wrap('2022-08')
        }
      ]
    };

    const result = decideLatest(diff);

    expect(result).toEqual({
      automatic: [],
      reviews: [
        {
          reason: 'conflict',
          rule: 'C2',
          section: 'work_experience',
          itemType: 'work_experience',
          itemId: '101',
          field: 'end_date',
          stored: '2022-05',
          new: wrap('2022-08')
        }
      ],
      addOptions: []
    });
  });

  it('reviews C2 when education start_date differs', () => {
    const diff = {
      differences: [
        {
          section: 'education',
          storedIndex: 0,
          storedId: '201',
          newIndex: 0,
          field: 'start_date',
          stored: '2016',
          new: wrap('2017')
        }
      ]
    };

    const result = decideLatest(diff);

    expect(result).toEqual({
      automatic: [],
      reviews: [
        {
          reason: 'conflict',
          rule: 'C2',
          section: 'education',
          itemType: 'education',
          itemId: '201',
          field: 'start_date',
          stored: '2016',
          new: wrap('2017')
        }
      ],
      addOptions: []
    });
  });

  describe('readThreshold', () => {
    it('returns default 0.5 when env var is missing or empty', () => {
      expect(readThreshold({})).toBe(0.5);
      expect(readThreshold({ REVIEW_CONFIDENCE_THRESHOLD: '' })).toBe(0.5);
    });

    it('returns parsed number when valid string "0.7" is provided', () => {
      expect(readThreshold({ REVIEW_CONFIDENCE_THRESHOLD: '0.7' })).toBe(0.7);
    });

    it('throws when value is out of range like "2"', () => {
      expect(() =>
        readThreshold({ REVIEW_CONFIDENCE_THRESHOLD: '2' })
      ).toThrow();
    });
  });
});
