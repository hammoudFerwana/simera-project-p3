const { createCallLlmStep } = require('./call-llm');
const { createCheckEmailStep } = require('./check-email');
const { createNormalizeSkillsStep } = require('./normalize-skills');
const { createValidateWithCodeStep } = require('./validate-with-code');
const { mapExtractionToStorage } = require('shared/src/mapper');
const { writeExtraction } = require('shared/src/storage-writer');
const db = require('shared/src/database');

const stub = (name) => async (ctx) => {
  ctx.completedSteps = [...(ctx.completedSteps || []), name];
  return ctx;
};

const createStoreStep =
  (confidenceThreshold = 0.5) =>
  async (ctx) => {
    if (!ctx.extraction) {
      throw new Error('Cannot store without a validated extraction.');
    }

    const mappedData = mapExtractionToStorage(
      ctx.extraction,
      ctx.failedChecks || [],
      ctx.skillResolutions || []
    );

    const safeProfile = { ...mappedData.profile };
    const reviewItems = [];

    const failedChecks = ctx.failedChecks || [];

    for (const check of failedChecks) {
      if (check.section !== 'candidate') {
        continue;
      }

      const wrapper = ctx.extraction.candidate?.[check.field];

      if (
        !wrapper ||
        wrapper.value === null ||
        typeof wrapper.evidence !== 'string' ||
        !wrapper.evidence.trim()
      ) {
        continue;
      }

      reviewItems.push({
        targetType: 'conflict',
        reviewReason: 'validation_failure',
        itemType: 'candidate_profile',
        fieldName: check.field,
        options: [
          {
            value: wrapper.value,
            confidence: wrapper.confidence,
            evidence: wrapper.evidence
          }
        ]
      });
    }

    for (const [fieldName, wrapper] of Object.entries(
      ctx.extraction.candidate
    )) {
      const alreadyFailed = (ctx.failedChecks || []).some(
        (check) => check.section === 'candidate' && check.field === fieldName
      );

      if (
        !alreadyFailed &&
        wrapper.value !== null &&
        wrapper.confidence < confidenceThreshold
      ) {
        reviewItems.push({
          targetType: 'conflict',
          reviewReason: 'low_confidence',
          itemType: 'candidate_profile',
          fieldName,
          options: [
            {
              value: wrapper.value,
              confidence: wrapper.confidence,
              evidence: wrapper.evidence
            }
          ]
        });

        delete safeProfile[fieldName];
      }
    }

    const storageResult = await writeExtraction({
      userId: ctx.userId,
      jobId: ctx.jobId,
      mappedData: {
        ...mappedData,
        profile: safeProfile
      },
      reviewItems,
      confidenceThreshold
    });

    ctx.pendingReviewCount =
      (ctx.pendingReviewCount || 0) + (storageResult.pendingReviewCount || 0);

    ctx.completedSteps = [...(ctx.completedSteps || []), 'store'];

    return ctx;
  };

const createSteps = (confidenceThreshold = 0.5) => [
  stub('extractTextAndLinks'), // US-06
  createCheckEmailStep({ db }),
  createCallLlmStep({ db }),
  createNormalizeSkillsStep({ db }), // US-13
  createValidateWithCodeStep(), // US-09, US-14
  stub('compareAndApplyLatest'), // US-15, US-16, US-17
  createStoreStep(confidenceThreshold) // US-10, US-17
];

const defaultSteps = createSteps();

module.exports = defaultSteps;
module.exports.createSteps = createSteps;
