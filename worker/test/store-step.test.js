jest.mock('shared/src/mapper', () => ({
  mapExtractionToStorage: jest.fn()
}));

jest.mock('shared/src/storage-writer', () => ({
  writeExtraction: jest.fn()
}));

const { mapExtractionToStorage } = require('shared/src/mapper');
const { writeExtraction } = require('shared/src/storage-writer');
const { runSteps } = require('../src/orchestrator');

describe('US-10 store step integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps and stores the validated extraction with failed checks', async () => {
    const extraction = { candidate: {}, work_experience: [] };
    const failedChecks = [
      {
        section: 'candidate',
        index: null,
        field: 'phone',
        reason: 'phone_without_country_code'
      }
    ];
    const mappedData = { profile: {}, items: {} };

    mapExtractionToStorage.mockReturnValue(mappedData);
    writeExtraction.mockResolvedValue({ candidateId: 1, jobId: 10 });

    const ctx = {
      userId: 5,
      jobId: 10,
      extraction,
      failedChecks,
      completedSteps: []
    };

    const result = await runSteps(ctx, [require('../src/steps/index')[6]]);

    expect(mapExtractionToStorage).toHaveBeenCalledWith(
      extraction,
      failedChecks,
      []
    );
    expect(writeExtraction).toHaveBeenCalledWith({
  userId: 5,
  jobId: 10,
  extraction,
  mappedData,
  reviewItems: [],
  skillResolutions: [],
  confidenceThreshold: 0.5
});
    expect(result.completedSteps).toContain('store');
  });
  it('adds the storage pending review count to the job context', async () => {
  mapExtractionToStorage.mockReturnValue({ profile: {}, items: {} });
  writeExtraction.mockResolvedValue({
    candidateId: 1,
    jobId: 10,
    pendingReviewCount: 2
  });

  const ctx = {
    userId: 5,
    jobId: 10,
    extraction: { candidate: {}, work_experience: [] },
    pendingReviewCount: 1,
    completedSteps: []
  };

  const result = await runSteps(ctx, [require('../src/steps/index')[6]]);

  expect(result.pendingReviewCount).toBe(3);
  expect(result.completedSteps).toContain('store');
});

  it('does not mark store as completed when storage fails', async () => {
    mapExtractionToStorage.mockReturnValue({ profile: {}, items: {} });
    writeExtraction.mockRejectedValue(new Error('Database error'));

    const ctx = {
      userId: 5,
      jobId: 10,
      extraction: { candidate: {}, work_experience: [] },
      completedSteps: []
    };

    await expect(
      runSteps(ctx, [require('../src/steps/index')[6]])
    ).rejects.toThrow('Database error');

    expect(ctx.completedSteps).not.toContain('store');
  });
  it('routes low-confidence profile fields to human review', async () => {
  const extraction = {
    candidate: {
      first_name: {
        value: 'John',
        confidence: 0.4,
        evidence: 'Name found in CV'
      },
      last_name: {
        value: 'Doe',
        confidence: 0.9,
        evidence: 'Last name found in CV'
      }
    }
  };

  const mappedData = {
    profile: {
      first_name: { ...extraction.candidate.first_name },
      last_name: { ...extraction.candidate.last_name }
    },
    items: {}
  };

  mapExtractionToStorage.mockReturnValue(mappedData);
  writeExtraction.mockResolvedValue({
    candidateId: 1,
    jobId: 10,
    pendingReviewCount: 1
  });

  const ctx = {
    userId: 5,
    jobId: 10,
    extraction,
    completedSteps: []
  };

  const { createSteps } = require('../src/steps/index');
  const storeStep = createSteps(0.7)[6];

  const result = await runSteps(ctx, [storeStep]);

  expect(writeExtraction).toHaveBeenCalledWith({
  userId: 5,
  jobId: 10,
  extraction,
  mappedData: {
    profile: {
      last_name: extraction.candidate.last_name
    },
    items: {}
  },
  reviewItems: [
    {
      targetType: 'conflict',
      reviewReason: 'low_confidence',
      itemType: 'candidate_profile',
      fieldName: 'first_name',
      options: [
        {
          value: 'John',
          confidence: 0.4,
          evidence: 'Name found in CV'
        }
      ]
    }
  ],
  skillResolutions: [],
  confidenceThreshold: 0.7
});

  expect(result.pendingReviewCount).toBe(1);
});

  it('throws when extraction is missing', async () => {
    const storeStep = require('../src/steps/index')[6];

    await expect(
      runSteps({ userId: 5, jobId: 10, completedSteps: [] }, [storeStep])
    ).rejects.toThrow('Cannot store without a validated extraction.');

    expect(writeExtraction).not.toHaveBeenCalled();
  });
  it('routes validation failures in profile fields to human review', async () => {
  const extraction = {
    candidate: {
      phone: {
        value: '+970599123456',
        confidence: 0.9,
        evidence: 'Phone: +970599123456'
      }
    }
  };

  const mappedData = {
    profile: {},
    items: {}
  };

  mapExtractionToStorage.mockReturnValue(mappedData);
  writeExtraction.mockResolvedValue({
    candidateId: 1,
    jobId: 10,
    pendingReviewCount: 1
  });

  const ctx = {
    userId: 5,
    jobId: 10,
    extraction,
    failedChecks: [
      {
        section: 'candidate',
        index: null,
        field: 'phone',
        reason: 'invalid_phone'
      }
    ],
    completedSteps: []
  };

  const { createSteps } = require('../src/steps/index');
  const result = await runSteps(ctx, [createSteps()[6]]);

  expect(writeExtraction).toHaveBeenCalledWith({
  userId: 5,
  jobId: 10,
  extraction,
  mappedData,
  reviewItems: [
    {
      targetType: 'conflict',
      reviewReason: 'validation_failure',
      itemType: 'candidate_profile',
      fieldName: 'phone',
      options: [
        {
          value: '+970599123456',
          confidence: 0.9,
          evidence: 'Phone: +970599123456'
        }
      ]
    }
  ],
  skillResolutions: [],
  confidenceThreshold: 0.5
});

  expect(result.pendingReviewCount).toBe(1);
});
});
