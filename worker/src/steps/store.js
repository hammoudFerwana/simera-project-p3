const { mapExtractionToStorage } = require('shared/src/mapper');
const { writeExtraction } = require('shared/src/storage-writer');
const {
  readThreshold,
  SECTION_TO_ITEM_TYPE
} = require('shared/src/rules/latest-rules');
const { applyMerge } = require('shared/src/merge/apply-merge');
const {
  createReviews: defaultCreateReviews
} = require('shared/src/merge/create-merge-reviews');

/**
 * Creates the store step for writing extraction data to storage.
 * Handles both first-time files (D2) and returning candidate files (D3-D7).
 *
 * @param {object} [options]
 * @param {object} [options.db] pg Pool or client
 * @param {Function} [options.writer=writeExtraction]
 * @param {Function} [options.createReviews] US-17 review rows creation hook
 * @param {Function} [options.now]
 * @param {Function} [options.log] Logging function (ids and counts only)
 * @returns {Function} async (ctx) => ctx
 */
function createStoreStep({
  db: _db,
  writer = writeExtraction,
  createReviews = defaultCreateReviews,
  now = () => new Date(),
  log = console.log
} = {}) {
  return async function storeStep(ctx) {
    if (!ctx.extraction) {
      throw new Error('Cannot store without a validated extraction.');
    }

    const threshold = readThreshold(process.env);
    const currentDate = now();

    const mappedData = mapExtractionToStorage(
      ctx.extraction,
      ctx.failedChecks || [],
      ctx.skillResolutions || []
    );

    const safeProfile = { ...mappedData.profile };
    const reviewItems = [];
    const failedChecks = ctx.failedChecks || [];

    // Candidate validation_failure reviews from ctx.failedChecks
    for (const check of failedChecks) {
      if (check.section !== 'candidate') {
        continue;
      }

      const wrapper = ctx.extraction.candidate?.[check.field];

      if (
        !wrapper ||
        wrapper.value === null ||
        wrapper.value === undefined ||
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

    // Low-confidence candidate profile fields removed from profile and sent as low_confidence reviews
    for (const [fieldName, wrapper] of Object.entries(
      ctx.extraction.candidate || {}
    )) {
      const alreadyFailed = failedChecks.some(
        (check) => check.section === 'candidate' && check.field === fieldName
      );

      if (
        !alreadyFailed &&
        wrapper?.value !== null &&
        wrapper?.value !== undefined &&
        typeof wrapper.confidence === 'number' &&
        wrapper.confidence < threshold
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

    // Item validation_failure (D4)
    for (const check of failedChecks) {
      if (check.section === 'candidate' || check.section === 'skills') {
        continue;
      }

      const itemType = SECTION_TO_ITEM_TYPE[check.section];
      if (!itemType) {
        continue;
      }

      const rawWrapper =
        ctx.extraction?.[check.section]?.[check.index]?.[check.field];

      if (
        !rawWrapper ||
        rawWrapper.value === null ||
        rawWrapper.value === undefined ||
        typeof rawWrapper.evidence !== 'string' ||
        !rawWrapper.evidence.trim()
      ) {
        continue;
      }

      let itemId = null;

      // b. For a matched item on a later file: storedId from ctx.diff
      if (ctx.diff) {
        const diffEntries = [
          ...(ctx.diff.differences || []),
          ...(ctx.diff.unchanged || []),
          ...(ctx.diff.precisionUpgrades || []),
          ...(ctx.diff.added || []).filter((e) => e.scope === 'field')
        ];
        const match = diffEntries.find(
          (e) => e.section === check.section && e.newIndex === check.index
        );
        if (match && match.storedId != null) {
          itemId = String(match.storedId);
        }
      }

      // If later file and not matched and not in added items: check if it's an added item
      if (ctx.diff && itemId === null) {
        const isAddedItem = (ctx.diff.added || []).some(
          (e) =>
            e.scope === 'item' &&
            e.section === check.section &&
            e.newIndex === check.index
        );
        if (!isAddedItem) {
          log({
            jobId: ctx.jobId,
            section: check.section,
            reason: 'validation_failure_item_not_found'
          });
          continue;
        }
      }

      reviewItems.push({
        targetType: 'conflict',
        reviewReason: 'validation_failure',
        itemType,
        itemId,
        fieldName: check.field,
        section: check.section,
        sourceIndex: check.index,
        options: [
          {
            value: rawWrapper.value,
            confidence: rawWrapper.confidence,
            evidence: rawWrapper.evidence
          }
        ]
      });
    }

    // D2: A first file (ctx.storedData === null) goes through the store step
    if (!ctx.storedData) {
      const storageResult = await writer({
        userId: ctx.userId,
        jobId: ctx.jobId,
        mappedData: {
          ...mappedData,
          profile: safeProfile
        },
        reviewItems,
        confidenceThreshold: threshold
      });

      ctx.pendingReviewCount = storageResult?.pendingReviewCount || 0;
      ctx.completedSteps = [...(ctx.completedSteps || []), 'store'];

      log({
        jobId: ctx.jobId,
        candidateId: ctx.candidateId ?? storageResult?.candidateId,
        changedFieldCount: ctx.changedFieldCount ?? 0,
        pendingReviewCount: ctx.pendingReviewCount ?? 0
      });

      return ctx;
    }

    // D3: A later file receives reduced mappedData
    const addedItemIndexesBySection = new Map();
    for (const entry of ctx.diff?.added || []) {
      if (entry.scope === 'item') {
        if (!addedItemIndexesBySection.has(entry.section)) {
          addedItemIndexesBySection.set(entry.section, new Set());
        }
        addedItemIndexesBySection.get(entry.section).add(entry.newIndex);
      }
    }

    const reducedItems = {};
    for (const [section, items] of Object.entries(mappedData.items || {})) {
      const addedIndexes = addedItemIndexesBySection.get(section);
      if (!addedIndexes || addedIndexes.size === 0) {
        reducedItems[section] = [];
      } else {
        reducedItems[section] = items.filter((item) =>
          addedIndexes.has(item.sourceIndex)
        );
      }
    }

    const mappedDataForWriter = {
      profile: safeProfile,
      items: reducedItems,
      skills: mappedData.skills,
      processing: mappedData.processing
    };

    let mergeResult = null;
    const beforeCommit = async (client, { candidateId, fileId, jobId }) => {
      mergeResult = await applyMerge(client, {
        candidateId,
        fileId,
        jobId,
        diff: ctx.diff,
        mapped: mappedData,
        storedData: ctx.storedData,
        threshold,
        now: currentDate,
        createReviews
      });
    };

    const storageResult = await writer({
      userId: ctx.userId,
      jobId: ctx.jobId,
      mappedData: mappedDataForWriter,
      reviewItems,
      confidenceThreshold: threshold,
      beforeCommit
    });

    if (mergeResult) {
      ctx.changedFieldCount = mergeResult.changedFieldCount;
      ctx.reviewItems = mergeResult.reviewItems;
    }

    ctx.pendingReviewCount =
      (storageResult?.pendingReviewCount || 0) +
      (mergeResult?.pendingReviewCount || 0);

    ctx.completedSteps = [...(ctx.completedSteps || []), 'store'];

    // D9: Logs: ids and counts only. Never values, evidence, names or CV text.
    log({
      jobId: ctx.jobId,
      candidateId: ctx.candidateId ?? storageResult?.candidateId,
      changedFieldCount: ctx.changedFieldCount ?? 0,
      pendingReviewCount: ctx.pendingReviewCount ?? 0
    });

    return ctx;
  };
}

module.exports = { createStoreStep };
