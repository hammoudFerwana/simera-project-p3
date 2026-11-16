const {
  PROVENANCE_TABLES,
  ALLOWED_COLUMNS_BY_TABLE,
  loadPendingConflicts,
  applyAutomaticDecisions
} = require('../rules/apply-decisions');
const {
  SECTION_TO_ITEM_TYPE,
  decideLatest,
  readThreshold
} = require('../rules/latest-rules');
const {
  buildDeduplicationKey,
  DEDUPLICATION_FIELDS
} = require('../deduplication');

const CANDIDATE_FIELDS = [
  'first_name',
  'last_name',
  'headline',
  'summary',
  'phone',
  'industry',
  'profession',
  'city',
  'country_code'
];

/**
 * Checks whether a field wrapper has a non-empty value.
 *
 * @param {object|null} wrapper
 * @returns {boolean}
 */
function isNonEmpty(wrapper) {
  if (!wrapper || typeof wrapper !== 'object') return false;
  const val = wrapper.value;
  if (val === null || val === undefined) return false;
  if (typeof val === 'string' && val.trim() === '') return false;
  return true;
}

/**
 * Retrieves the database-ready mapped wrapper for a given section, item index, and field.
 *
 * @param {object} mapped
 * @param {string} section
 * @param {number|null} sourceIndex
 * @param {string} fieldName
 * @returns {object|null}
 */
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

/**
 * Default review creation hook. US-17 replaces this default hook
 * when human reviews and conflicts rows are wired.
 *
 * @returns {Promise<number>}
 */
const defaultCreateReviews = async () => 0;

/**
 * Merges a later uploaded file extraction with stored candidate data inside
 * an active database transaction.
 *
 * @param {object} client pg Client (inside active transaction)
 * @param {object} params
 * @param {number} params.candidateId
 * @param {number} params.fileId
 * @param {number} params.jobId
 * @param {object} params.diff US-15 comparison diff
 * @param {object} params.mapped Mapped extraction data
 * @param {object} [params.storedData] Previously stored candidate data
 * @param {number} [params.threshold] Confidence threshold for automatic decisions
 * @param {Date} [params.now=new Date()]
 * @param {Function} [params.createReviews] US-17 review rows creation hook
 * @returns {Promise<{ changedFieldCount: number, pendingReviewCount: number, reviewItems: Array }>}
 */
async function applyMerge(
  client,
  {
    candidateId,
    fileId,
    jobId,
    diff,
    mapped,
    storedData,
    threshold,
    now = new Date(),
    createReviews = defaultCreateReviews
  }
) {
  if (!diff) {
    return {
      changedFieldCount: 0,
      pendingReviewCount: 0,
      reviewItems: []
    };
  }

  const effectiveThreshold =
    threshold !== undefined ? threshold : readThreshold(process.env);

  // -------------------------------------------------------------------------
  // D5a. Field fills (A1 on matched items)
  // -------------------------------------------------------------------------
  let fieldsFilledCount = 0;
  for (const entry of diff.added || []) {
    if (entry.scope !== 'field') continue;
    if (entry.section === 'candidate' || entry.section === 'skills') continue;

    const mappedWrapper = getMappedWrapper(
      mapped,
      entry.section,
      entry.newIndex,
      entry.field
    );
    if (!isNonEmpty(mappedWrapper)) continue;

    const itemType = SECTION_TO_ITEM_TYPE[entry.section];
    if (!itemType) {
      throw new Error(`Unsupported section for field fill: ${entry.section}`);
    }
    const tableName = PROVENANCE_TABLES[itemType];
    if (!tableName) {
      throw new Error(`Unsupported item type for table lookup: ${itemType}`);
    }
    const allowedColumns = ALLOWED_COLUMNS_BY_TABLE[tableName];
    if (!allowedColumns || !allowedColumns.has(entry.field)) {
      throw new Error(
        `Field "${entry.field}" is not allowed to be updated on table "${tableName}"`
      );
    }

    const updateRes = await client.query(
      `UPDATE "${tableName}"
       SET "${entry.field}" = $1
       WHERE id = $2 AND "${entry.field}" IS NULL`,
      [mappedWrapper.value, entry.storedId]
    );

    if (updateRes.rowCount > 0) {
      fieldsFilledCount++;

      const provRes = await client.query(
        `INSERT INTO data_provenance (
           candidate_id,
           item_type,
           item_id,
           field_name,
           resolution_method,
           approved_at
         ) VALUES ($1, $2, $3, $4, 'no_conflict', $5)
         ON CONFLICT (item_type, item_id, field_name)
         DO UPDATE SET
           resolution_method = EXCLUDED.resolution_method,
           approved_at = EXCLUDED.approved_at
         RETURNING id`,
        [candidateId, itemType, String(entry.storedId), entry.field, now]
      );
      const provenanceId = provRes.rows[0].id;

      await client.query(
        `INSERT INTO data_provenance_sources (
           provenance_id,
           job_id,
           source_value,
           confidence,
           evidence
         ) VALUES ($1, $2, $3::jsonb, $4, $5)
         ON CONFLICT (provenance_id, job_id)
         DO UPDATE SET
           source_value = EXCLUDED.source_value,
           confidence = EXCLUDED.confidence,
           evidence = EXCLUDED.evidence`,
        [
          provenanceId,
          jobId,
          JSON.stringify(mappedWrapper.value),
          mappedWrapper.confidence,
          String(mappedWrapper.evidence ?? '')
        ]
      );
    }
  }

  // -------------------------------------------------------------------------
  // D5b. Precision upgrades (A3)
  // -------------------------------------------------------------------------
  let precisionUpgradesCount = 0;
  for (const entry of diff.precisionUpgrades || []) {
    const mappedWrapper =
      getMappedWrapper(mapped, entry.section, entry.newIndex, entry.field) ||
      entry.new;
    if (!isNonEmpty(mappedWrapper)) continue;

    const itemType = SECTION_TO_ITEM_TYPE[entry.section];
    if (!itemType) {
      throw new Error(
        `Unsupported section for precision upgrade: ${entry.section}`
      );
    }
    const tableName = PROVENANCE_TABLES[itemType];
    if (!tableName) {
      throw new Error(`Unsupported item type for table lookup: ${itemType}`);
    }
    const allowedColumns = ALLOWED_COLUMNS_BY_TABLE[tableName];
    if (!allowedColumns || !allowedColumns.has(entry.field)) {
      throw new Error(
        `Field "${entry.field}" is not allowed to be updated on table "${tableName}"`
      );
    }

    const isKeyField = DEDUPLICATION_FIELDS[itemType]?.includes(entry.field);

    if (isKeyField) {
      const rowRes = await client.query(
        `SELECT * FROM "${tableName}" WHERE id = $1`,
        [entry.storedId]
      );
      if (rowRes.rows.length > 0) {
        const storedRow = rowRes.rows[0];
        const updatedRow = {
          ...storedRow,
          [entry.field]: mappedWrapper.value
        };
        const fieldsObj = Object.fromEntries(
          DEDUPLICATION_FIELDS[itemType].map((f) => [
            f,
            { value: updatedRow[f] }
          ])
        );
        const newKey = buildDeduplicationKey(itemType, fieldsObj);

        await client.query(
          `UPDATE "${tableName}"
           SET "${entry.field}" = $1, deduplication_key = $2
           WHERE id = $3`,
          [mappedWrapper.value, newKey, entry.storedId]
        );
      }
    } else {
      await client.query(
        `UPDATE "${tableName}"
         SET "${entry.field}" = $1
         WHERE id = $2`,
        [mappedWrapper.value, entry.storedId]
      );
    }

    precisionUpgradesCount++;

    const provRes = await client.query(
      `INSERT INTO data_provenance (
         candidate_id,
         item_type,
         item_id,
         field_name,
         resolution_method,
         approved_at
       ) VALUES ($1, $2, $3, $4, 'no_conflict', $5)
       ON CONFLICT (item_type, item_id, field_name)
       DO UPDATE SET
         approved_at = EXCLUDED.approved_at
       RETURNING id`,
      [candidateId, itemType, String(entry.storedId), entry.field, now]
    );
    const provenanceId = provRes.rows[0].id;

    await client.query(
      'DELETE FROM data_provenance_sources WHERE provenance_id = $1',
      [provenanceId]
    );

    await client.query(
      `INSERT INTO data_provenance_sources (
         provenance_id,
         job_id,
         source_value,
         confidence,
         evidence
       ) VALUES ($1, $2, $3::jsonb, $4, $5)`,
      [
        provenanceId,
        jobId,
        JSON.stringify(mappedWrapper.value),
        mappedWrapper.confidence,
        String(mappedWrapper.evidence ?? '')
      ]
    );
  }

  // -------------------------------------------------------------------------
  // D5c. Second source for the same value (two-level provenance)
  // -------------------------------------------------------------------------
  for (const entry of diff.unchanged || []) {
    if (entry.section === 'candidate' || entry.section === 'skills') continue;
    if (entry.reason !== 'identical' && entry.reason !== 'format_only')
      continue;

    const mappedWrapper = getMappedWrapper(
      mapped,
      entry.section,
      entry.newIndex,
      entry.field
    );
    if (!isNonEmpty(mappedWrapper)) continue;

    const itemType = SECTION_TO_ITEM_TYPE[entry.section];
    if (!itemType) continue;

    const provRes = await client.query(
      `SELECT id FROM data_provenance
       WHERE candidate_id = $1 AND item_type = $2 AND item_id = $3 AND field_name = $4`,
      [candidateId, itemType, String(entry.storedId), entry.field]
    );

    if (provRes.rows.length > 0) {
      const provenanceId = provRes.rows[0].id;
      await client.query(
        `INSERT INTO data_provenance_sources (
           provenance_id,
           job_id,
           source_value,
           confidence,
           evidence
         ) VALUES ($1, $2, $3::jsonb, $4, $5)
         ON CONFLICT (provenance_id, job_id)
         DO UPDATE SET
           source_value = EXCLUDED.source_value,
           confidence = EXCLUDED.confidence,
           evidence = EXCLUDED.evidence`,
        [
          provenanceId,
          jobId,
          JSON.stringify(mappedWrapper.value),
          mappedWrapper.confidence,
          String(mappedWrapper.evidence ?? '')
        ]
      );
    }
  }

  // -------------------------------------------------------------------------
  // D5d. Decide latest rules
  // -------------------------------------------------------------------------
  const pendingConflicts = await loadPendingConflicts(client, candidateId);
  const decision = decideLatest(diff, {
    threshold: effectiveThreshold,
    pendingConflicts,
    candidateProfileId: candidateId
  });

  // -------------------------------------------------------------------------
  // D5e. Database-ready values for decisions
  // -------------------------------------------------------------------------
  const validAutomatic = [];
  for (const auto of decision.automatic || []) {
    const diffEntry = (diff.differences || []).find((d) => {
      if (d.section !== auto.section || d.field !== auto.field) return false;
      if (auto.section === 'candidate') {
        return d.storedId === null;
      }
      return String(d.storedId) === String(auto.itemId);
    });

    let mappedWrapper = null;
    if (auto.section === 'candidate') {
      mappedWrapper = mapped?.profile?.[auto.field];
    } else if (diffEntry) {
      mappedWrapper = getMappedWrapper(
        mapped,
        auto.section,
        diffEntry.newIndex,
        auto.field
      );
    }

    if (!isNonEmpty(mappedWrapper)) {
      continue;
    }

    auto.next = mappedWrapper;
    validAutomatic.push(auto);
  }

  const validAddOptions = [];
  for (const opt of decision.addOptions || []) {
    const diffEntry = (diff.differences || []).find(
      (d) => d.new === opt.new && d.field === opt.field
    );

    let mappedWrapper = null;
    if (diffEntry) {
      if (diffEntry.section === 'candidate') {
        mappedWrapper = mapped?.profile?.[diffEntry.field];
      } else {
        mappedWrapper = getMappedWrapper(
          mapped,
          diffEntry.section,
          diffEntry.newIndex,
          diffEntry.field
        );
      }
    }

    if (!isNonEmpty(mappedWrapper)) {
      continue;
    }

    opt.new = mappedWrapper;
    validAddOptions.push(opt);
  }

  // -------------------------------------------------------------------------
  // D5f. Apply automatic decisions
  // -------------------------------------------------------------------------
  await applyAutomaticDecisions(client, {
    candidateId,
    jobId,
    fileId,
    automatic: validAutomatic,
    addOptions: validAddOptions,
    now
  });

  // -------------------------------------------------------------------------
  // D5g. Review items and US-17 hook
  // -------------------------------------------------------------------------
  const uncertainReviewItems = (diff.uncertainMatches || []).map((u) => ({
    reason: 'item_match_uncertain',
    rule: 'C3',
    section: u.section,
    newIndex: u.newIndex
  }));
  const reviewItems = [...(decision.reviews || []), ...uncertainReviewItems];

  const pendingReviewCount = await createReviews(client, {
    candidateId,
    fileId,
    jobId,
    reviewItems
  });

  // -------------------------------------------------------------------------
  // D7. Changed field count calculation
  // -------------------------------------------------------------------------
  let newItemsFieldCount = 0;
  const addedItemIndexesBySection = new Map();
  for (const entry of diff.added || []) {
    if (entry.scope === 'item') {
      if (!addedItemIndexesBySection.has(entry.section)) {
        addedItemIndexesBySection.set(entry.section, new Set());
      }
      addedItemIndexesBySection.get(entry.section).add(entry.newIndex);
    }
  }

  for (const [section, items] of Object.entries(mapped?.items || {})) {
    const addedIndexes = addedItemIndexesBySection.get(section);
    if (!addedIndexes) continue;
    for (const item of items) {
      if (addedIndexes.has(item.sourceIndex)) {
        for (const [, wrapper] of Object.entries(item.fields || {})) {
          if (isNonEmpty(wrapper)) {
            newItemsFieldCount++;
          }
        }
      }
    }
  }

  let emptyProfileFieldsFilledCount = 0;
  const storedCandidate = storedData?.candidate || {};
  for (const field of CANDIDATE_FIELDS) {
    const storedVal = storedCandidate[field];
    const isStoredEmpty =
      storedVal === null ||
      storedVal === undefined ||
      (typeof storedVal === 'string' && storedVal.trim() === '');
    const mappedWrapper = mapped?.profile?.[field];
    if (isStoredEmpty && isNonEmpty(mappedWrapper)) {
      emptyProfileFieldsFilledCount++;
    }
  }

  const changedFieldCount =
    fieldsFilledCount +
    precisionUpgradesCount +
    validAutomatic.length +
    newItemsFieldCount +
    emptyProfileFieldsFilledCount;

  return {
    changedFieldCount,
    pendingReviewCount,
    reviewItems
  };
}

module.exports = {
  applyMerge,
  isNonEmpty,
  getMappedWrapper
};
