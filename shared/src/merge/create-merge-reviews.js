const { createReviewItem, saveReviewItems } = require('../review-items');
const { SECTION_TO_ITEM_TYPE } = require('../rules/latest-rules');
const { DEDUPLICATION_FIELDS } = require('../deduplication');

function getMappedWrapper(mapped, section, sourceIndex, fieldName) {
  if (!mapped) return null;

  if (section === 'candidate') {
    return mapped.profile?.[fieldName] || null;
  }

  if (section === 'skills') {
    const matchedSkills = mapped.skills?.matched || [];
    const skill = matchedSkills.find((s) => s.sourceIndex === sourceIndex);
    return skill?.fields?.[fieldName] || null;
  }

  const items = mapped.items?.[section] || [];
  const item = items.find((it) => it.sourceIndex === sourceIndex);
  return item?.fields?.[fieldName] || null;
}

async function getStoredProvenanceSource(
  client,
  { candidateId, itemType, itemId, fieldName }
) {
  const result = await client.query(
    `SELECT
       pj.file_id AS source_file_id,
       dps.confidence,
       dps.evidence
     FROM data_provenance dp
     JOIN data_provenance_sources dps
       ON dps.provenance_id = dp.id
     JOIN processing_jobs pj
       ON pj.id = dps.job_id
     WHERE dp.candidate_id = $1
       AND dp.item_type = $2
       AND dp.item_id = $3
       AND dp.field_name = $4
     ORDER BY dps.id DESC
     LIMIT 1`,
    [candidateId, itemType, String(itemId), fieldName]
  );

  if (result.rows.length > 0) {
    return result.rows[0];
  }
  return {
    source_file_id: null,
    confidence: null,
    evidence: null
  };
}

async function hasPendingConflict(
  client,
  { candidateId, itemType, itemId, fieldName }
) {
  const result = await client.query(
    `SELECT id
     FROM conflicts
     WHERE candidate_id = $1
       AND item_type = $2
       AND item_id = $3
       AND field_name = $4
       AND status = 'pending'
     LIMIT 1`,
    [candidateId, itemType, String(itemId), fieldName]
  );
  return result.rows.length > 0;
}

async function buildMergeReviewItems({
  candidateId,
  fileId,
  reviewItems = [],
  diff = {},
  mapped = {},
  client
}) {
  const builtItems = [];
  const processedKeys = new Set();

  for (const review of reviewItems) {
    // 1. C3 Uncertain Matches
    if (review.rule === 'C3' || review.reason === 'item_match_uncertain') {
      const match =
        (diff.uncertainMatches || []).find(
          (u) => u.section === review.section && u.newIndex === review.newIndex
        ) || review;

      const itemType = SECTION_TO_ITEM_TYPE[match.section] || match.section;
      const candidates = match.candidates || [];
      const storedId = candidates[0]?.storedId;
      if (storedId == null) {
        continue;
      }

      const key = `${itemType}:${storedId}:__item__`;
      if (processedKeys.has(key)) {
        continue;
      }
      processedKeys.add(key);

      const sectionItems = mapped.items?.[match.section] || [];
      const mappedItem = sectionItems.find(
        (it) => it.sourceIndex === match.newIndex
      );

      const plainItem = {};
      let minConfidence = 1.0;
      let hasConfidence = false;

      const itemFields =
        mappedItem?.fields ||
        (match.newItem?.fields ? match.newItem.fields : match.newItem || {});

      for (const [k, w] of Object.entries(itemFields)) {
        plainItem[k] = w?.value !== undefined ? w.value : w;
        if (
          w?.value !== null &&
          w?.value !== undefined &&
          w?.value !== '' &&
          typeof w?.confidence === 'number'
        ) {
          minConfidence = Math.min(minConfidence, w.confidence);
          hasConfidence = true;
        }
      }

      const keyFields =
        DEDUPLICATION_FIELDS[match.section] ||
        DEDUPLICATION_FIELDS[itemType] ||
        [];

      let keyEvidence = null;
      for (const kf of keyFields) {
        const w = itemFields[kf];
        if (
          w?.value !== null &&
          w?.value !== undefined &&
          w?.value !== '' &&
          typeof w?.evidence === 'string' &&
          w.evidence.trim()
        ) {
          keyEvidence = w.evidence.trim();
          break;
        }
      }

      if (!keyEvidence) {
        for (const [, w] of Object.entries(itemFields)) {
          if (
            w?.value !== null &&
            w?.value !== undefined &&
            w?.value !== '' &&
            typeof w?.evidence === 'string' &&
            w.evidence.trim()
          ) {
            keyEvidence = w.evidence.trim();
            break;
          }
        }
      }

      builtItems.push(
        createReviewItem({
          targetType: 'conflict',
          candidateId,
          reviewReason: 'item_match_uncertain',
          itemType,
          itemId: String(storedId),
          fieldName: '__item__',
          options: [
            {
              value: {
                item: plainItem,
                candidateStoredIds: candidates.map((c) => c.storedId)
              },
              sourceFileId: fileId,
              confidence: hasConfidence ? minConfidence : null,
              evidence: keyEvidence || 'Uncertain item match'
            }
          ]
        })
      );
      continue;
    }

    // 2. DecideLatest reviews (C1, C2, C6, D2) and Low-confidence field fills
    const itemType =
      review.itemType || SECTION_TO_ITEM_TYPE[review.section] || review.section;

    const itemId =
      review.section === 'candidate'
        ? String(candidateId)
        : String(review.itemId);

    const fieldName = review.field || review.fieldName;

    if (!itemType || !itemId || !fieldName) {
      continue;
    }

    const key = `${itemType}:${itemId}:${fieldName}`;
    if (processedKeys.has(key)) {
      continue;
    }
    processedKeys.add(key);

    const alreadyPending = client
      ? await hasPendingConflict(client, {
          candidateId,
          itemType,
          itemId,
          fieldName
        })
      : false;

    // Lookup database-ready mapped wrapper for new value
    const diffEntry = (diff.differences || []).find((d) => {
      if (d.section !== review.section || d.field !== fieldName) return false;
      if (review.section === 'candidate') return true;
      return String(d.storedId) === String(itemId);
    });

    let mappedWrapper = null;
    if (review.section === 'candidate') {
      mappedWrapper = mapped.profile?.[fieldName];
    } else if (diffEntry) {
      mappedWrapper = getMappedWrapper(
        mapped,
        review.section,
        diffEntry.newIndex,
        fieldName
      );
    } else if (review.newIndex !== undefined) {
      mappedWrapper = getMappedWrapper(
        mapped,
        review.section,
        review.newIndex,
        fieldName
      );
    }

    if (!mappedWrapper && review.wrapper) {
      mappedWrapper = review.wrapper;
    }
    if (!mappedWrapper && review.new && typeof review.new === 'object') {
      mappedWrapper = review.new;
    }

    const options = [];

    // 1. Stored value option (only if stored is not null and no pending conflict exists yet)
    if (
      review.stored !== null &&
      review.stored !== undefined &&
      !alreadyPending
    ) {
      const storedSource = client
        ? await getStoredProvenanceSource(client, {
            candidateId,
            itemType,
            itemId,
            fieldName
          })
        : { source_file_id: null, confidence: null, evidence: null };

      options.push({
        value: review.stored,
        sourceFileId: storedSource.source_file_id,
        confidence: storedSource.confidence,
        evidence: storedSource.evidence,
        fromStored: true
      });
    }

    // 2. New value option
    const newValue =
      mappedWrapper?.value !== undefined
        ? mappedWrapper.value
        : typeof review.new === 'object'
          ? review.new?.value
          : review.new;

    const newConfidence =
      mappedWrapper?.confidence !== undefined
        ? mappedWrapper.confidence
        : typeof review.new === 'object'
          ? review.new?.confidence
          : null;

    const newEvidence =
      typeof mappedWrapper?.evidence === 'string' &&
      mappedWrapper.evidence.trim()
        ? mappedWrapper.evidence.trim()
        : typeof review.new?.evidence === 'string' && review.new.evidence.trim()
          ? review.new.evidence.trim()
          : 'Extracted from file';

    options.push({
      value: newValue,
      sourceFileId: fileId,
      confidence: newConfidence,
      evidence: newEvidence
    });

    builtItems.push(
      createReviewItem({
        targetType: 'conflict',
        candidateId,
        reviewReason: review.reason || 'conflict',
        itemType,
        itemId,
        fieldName,
        options
      })
    );
  }

  return builtItems;
}

async function createReviews(
  client,
  {
    candidateId,
    fileId,
    jobId: _jobId,
    reviewItems = [],
    diff = {},
    mapped = {}
  }
) {
  const builtItems = await buildMergeReviewItems({
    candidateId,
    fileId,
    reviewItems,
    diff,
    mapped,
    client
  });

  return saveReviewItems(client, builtItems);
}

module.exports = {
  getMappedWrapper,
  buildMergeReviewItems,
  createReviews
};
