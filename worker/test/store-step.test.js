
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

  it('maps and stores the validated extraction', async () => {
    const extraction = { candidate: {}, work_experience: [] };
    const mappedData = { profile: {}, items: {} };

    mapExtractionToStorage.mockReturnValue(mappedData);
    writeExtraction.mockResolvedValue({ candidateId: 1, jobId: 10 });

    const ctx = {
      userId: 5,
      jobId: 10,
      extraction,
      completedSteps: []
    };

    const result = await runSteps(ctx, [
      require('../src/steps/index')[6]
    ]);

    expect(mapExtractionToStorage).toHaveBeenCalledWith(extraction);
    expect(writeExtraction).toHaveBeenCalledWith({
      userId: 5,
      jobId: 10,
      mappedData
    });
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

  it('throws when extraction is missing', async () => {
    const storeStep = require('../src/steps/index')[6];

    await expect(
      runSteps(
        { userId: 5, jobId: 10, completedSteps: [] },
        [storeStep]
      )
    ).rejects.toThrow('Cannot store without a validated extraction.');

    expect(writeExtraction).not.toHaveBeenCalled();
  });
});
