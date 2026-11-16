const { mapExtractionToStorage } = require('shared/src/mapper');
const { writeExtraction } = require('shared/src/storage-writer');
const { readThreshold } = require('shared/src/rules/latest-rules');
const { applyMerge } = require('shared/src/merge/apply-merge');

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
  db,
  writer = writeExtraction,
  createReviews,
  now = () => new Date(),
  log = console.log
} = {}) {
  return async function storeStep(ctx) {
    if (!ctx.extraction) {
      throw new Error('Cannot store without a validated extraction.');
    }

    const mappedData = mapExtractionToStorage(
      ctx.extraction,
      ctx.failedChecks || [],
      ctx.skillResolutions || []
    );

    // D2: A first file (ctx.storedData === null) goes through the store step exactly as today.
    if (!ctx.storedData) {
      await writer({
        userId: ctx.userId,
        jobId: ctx.jobId,
        mappedData
      });
      ctx.completedSteps = [...(ctx.completedSteps || []), 'store'];
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
      profile: mappedData.profile,
      items: reducedItems,
      skills: mappedData.skills,
      processing: mappedData.processing
    };

    const threshold = readThreshold(process.env);
    const currentDate = now();

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

    await writer({
      userId: ctx.userId,
      jobId: ctx.jobId,
      mappedData: mappedDataForWriter,
      beforeCommit
    });

    if (mergeResult) {
      ctx.changedFieldCount = mergeResult.changedFieldCount;
      ctx.pendingReviewCount = mergeResult.pendingReviewCount;
      ctx.reviewItems = mergeResult.reviewItems;
    }

    ctx.completedSteps = [...(ctx.completedSteps || []), 'store'];

    // D9: Logs: ids and counts only. Never values, evidence, names or CV text.
    log({
      jobId: ctx.jobId,
      candidateId: ctx.candidateId,
      changedFieldCount: ctx.changedFieldCount ?? 0,
      pendingReviewCount: ctx.pendingReviewCount ?? 0
    });

    return ctx;
  };
}

module.exports = { createStoreStep };
