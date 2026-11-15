const { createCallLlmStep } = require('./call-llm');
const { createCheckEmailStep } = require('./check-email');
const { createValidateWithCodeStep } = require('./validate-with-code');
const { mapExtractionToStorage } = require('shared/src/mapper');
const { writeExtraction } = require('shared/src/storage-writer');
const db = require('shared/src/database');

const stub = (name) => async (ctx) => {
  ctx.completedSteps = [...(ctx.completedSteps || []), name];
  return ctx;
};

const createStoreStep = () => async (ctx) => {
  if (!ctx.extraction) {
    throw new Error('Cannot store without a validated extraction.');
  }

  const mappedData = mapExtractionToStorage(ctx.extraction);

  await writeExtraction({
    userId: ctx.userId,
    jobId: ctx.jobId,
    mappedData
  });
  ctx.completedSteps = [...(ctx.completedSteps || []), 'store'];

  return ctx;
};

module.exports = [
  stub('extractTextAndLinks'), // US-06
  createCheckEmailStep({ db }),
  createCallLlmStep({ db }),
  stub('normalizeSkills'), // US-13
  createValidateWithCodeStep(), // US-09, US-14
  stub('compareAndApplyLatest'), // US-15, US-16, US-17
  createStoreStep() // US-10
];
