const { parseDate } = require('../comparison/normalize');

const DEFAULT_CONFIDENCE_THRESHOLD = 0.5;

const SECTION_TO_ITEM_TYPE = Object.freeze({
  candidate: 'candidate_profile',
  work_experience: 'work_experience',
  education: 'education',
  languages: 'candidate_languages',
  links: 'candidate_links',
  skills: 'candidate_skills',
  certifications: 'certifications',
  projects: 'projects',
  awards: 'awards',
  publications: 'publications',
  volunteering: 'volunteering'
});

const TABLE_B2_FIELDS = Object.freeze({
  candidate: new Set([
    'headline',
    'summary',
    'phone',
    'city',
    'country_code',
    'industry',
    'profession'
  ]),
  work_experience: new Set([
    'description',
    'location',
    'employment_type',
    'work_mode'
  ])
});

const TABLE_B3_FIELDS = Object.freeze({
  languages: new Set(['proficiency_level']),
  skills: new Set(['proficiency_level', 'months_of_experience'])
});

const C2_START_DATE_SECTIONS = new Set([
  'work_experience',
  'education',
  'volunteering'
]);

/**
 * Reads and validates the review confidence threshold from an environment
 * object or value. Defaults to 0.5 when missing or empty. Throws if invalid.
 *
 * @param {object|string|number} [env=process.env]
 * @returns {number} threshold between 0 and 1
 */
function readThreshold(env = process.env) {
  let raw;
  if (env && typeof env === 'object') {
    raw = env.REVIEW_CONFIDENCE_THRESHOLD;
  } else if (typeof env === 'string' || typeof env === 'number') {
    raw = env;
  }

  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return DEFAULT_CONFIDENCE_THRESHOLD;
  }

  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0 || num > 1) {
    throw new Error(
      `Invalid REVIEW_CONFIDENCE_THRESHOLD: "${raw}". Must be a number between 0 and 1.`
    );
  }
  return num;
}

/**
 * Checks whether a value represents a valid date string.
 *
 * @param {*} value
 * @returns {boolean}
 */
function isValidDate(value) {
  if (value === null || value === undefined || value === '') return false;
  const parsed = parseDate(value);
  return parsed !== null && Number.isFinite(parsed.year);
}

/**
 * Evaluates real differences between stored and newly extracted candidate data
 * using latest-value rules (Tables B and C).
 *
 * Pure function: no database calls, no side effects, does not mutate input.
 *
 * @param {object|Array} diff US-15 diff object or array of differences
 * @param {object} [options]
 * @param {number} [options.threshold] confidence threshold (defaults via readThreshold)
 * @param {Array<{ conflictId: number|string, itemType: string, itemId: string, fieldName: string }>} [options.pendingConflicts]
 * @param {number|string} [options.candidateProfileId] profile id for candidate section
 * @returns {{ automatic: Array, reviews: Array, addOptions: Array }}
 */
function decideLatest(diff, options = {}) {
  const result = {
    automatic: [],
    reviews: [],
    addOptions: []
  };

  const differences = Array.isArray(diff) ? diff : diff?.differences || [];
  if (!differences.length) {
    return result;
  }

  const threshold =
    options.threshold !== undefined
      ? Number(options.threshold)
      : readThreshold();

  const pendingConflicts = Array.isArray(options.pendingConflicts)
    ? options.pendingConflicts
    : [];

  const candidateProfileId =
    options.candidateProfileId != null
      ? String(options.candidateProfileId)
      : null;

  // Identify work_experience items where B1 will apply on end_date, so that any
  // redundant is_current difference on the same item is handled without conflicting.
  const b1ItemIds = new Set();
  for (const entry of differences) {
    if (
      entry.section === 'work_experience' &&
      entry.field === 'end_date' &&
      (entry.stored == null || entry.stored === '') &&
      isValidDate(entry.new?.value)
    ) {
      const conf = entry.new?.confidence;
      const isConfidenceOk =
        typeof conf === 'number' && Number.isFinite(conf) && conf >= threshold;
      if (isConfidenceOk) {
        const id = entry.storedId != null ? String(entry.storedId) : null;
        if (id != null) {
          b1ItemIds.add(id);
        }
      }
    }
  }

  for (const entry of differences) {
    const section = entry.section;
    const field = entry.field;
    const itemType = SECTION_TO_ITEM_TYPE[section] || section;
    const itemId =
      section === 'candidate'
        ? candidateProfileId
        : entry.storedId != null
          ? String(entry.storedId)
          : null;

    const storedValue = entry.stored;
    const newWrapper = entry.new;

    // D7 rule 1: Pending conflict first (AC8)
    const pending = pendingConflicts.find(
      (pc) =>
        pc.itemType === itemType &&
        String(pc.itemId) === String(itemId) &&
        pc.fieldName === field
    );
    if (pending) {
      result.addOptions.push({
        conflictId: pending.conflictId,
        field,
        new: newWrapper
      });
      continue;
    }

    // Skip redundant is_current difference if B1 already updates is_current for this job.
    // Runs before C6: B1 sets is_current to false, so this difference must not go to review.
    if (
      section === 'work_experience' &&
      field === 'is_current' &&
      storedValue === true &&
      newWrapper?.value === false &&
      itemId != null &&
      b1ItemIds.has(itemId)
    ) {
      continue;
    }

    // D7 rule 2: C6 - low confidence below threshold
    const confidence = newWrapper?.confidence;
    const isBelowThreshold =
      confidence === null ||
      confidence === undefined ||
      typeof confidence !== 'number' ||
      !Number.isFinite(confidence) ||
      confidence < threshold;

    if (isBelowThreshold) {
      result.reviews.push({
        reason: 'low_confidence',
        rule: 'C6',
        section,
        itemType,
        itemId,
        field,
        stored: storedValue,
        new: newWrapper
      });
      continue;
    }

    // D7 rule 3: B1 - stored job is_current = true with no end, new file gives valid end date
    if (
      section === 'work_experience' &&
      field === 'end_date' &&
      (storedValue == null || storedValue === '') &&
      isValidDate(newWrapper?.value)
    ) {
      result.automatic.push({
        rule: 'B1',
        section,
        itemType,
        itemId,
        field,
        previous: storedValue,
        next: newWrapper,
        extraUpdates: { is_current: false }
      });
      continue;
    }

    // D7 rule 4: C1 - stored job ended, new file says current or no end
    const isJobEnded =
      (field === 'is_current' && storedValue === false) ||
      (field === 'end_date' && storedValue != null && storedValue !== '');

    if (section === 'work_experience' && isJobEnded) {
      const isNewCurrentOrNoEnd =
        (field === 'is_current' && Boolean(newWrapper?.value) === true) ||
        (field === 'end_date' &&
          (newWrapper?.value === 'present' ||
            newWrapper?.value == null ||
            newWrapper?.value === ''));

      if (isNewCurrentOrNoEnd) {
        result.reviews.push({
          reason: 'conflict',
          rule: 'C1',
          section,
          itemType,
          itemId,
          field,
          stored: storedValue,
          new: newWrapper
        });
        continue;
      }
    }

    // D7 rule 5: C2 - past date differs (job start, end of an ended job, education dates)
    const isC2StartDate =
      field === 'start_date' && C2_START_DATE_SECTIONS.has(section);
    const isC2EducationDate =
      section === 'education' &&
      (field === 'start_date' || field === 'end_date');
    const isC2EndedJobEndDate =
      (section === 'work_experience' || section === 'volunteering') &&
      field === 'end_date' &&
      storedValue != null &&
      storedValue !== '';

    if (isC2StartDate || isC2EducationDate || isC2EndedJobEndDate) {
      result.reviews.push({
        reason: 'conflict',
        rule: 'C2',
        section,
        itemType,
        itemId,
        field,
        stored: storedValue,
        new: newWrapper
      });
      continue;
    }

    // D7 rule 6: B2 - values that change by nature
    const isB2Field = TABLE_B2_FIELDS[section]?.has(field);
    if (
      isB2Field &&
      newWrapper?.value !== null &&
      newWrapper?.value !== undefined &&
      newWrapper?.value !== ''
    ) {
      result.automatic.push({
        rule: 'B2',
        section,
        itemType,
        itemId,
        field,
        previous: storedValue,
        next: newWrapper,
        extraUpdates: {}
      });
      continue;
    }

    // D7 rule 7: B3 - language level, skill level, or stated skill months
    const isB3Field = TABLE_B3_FIELDS[section]?.has(field);
    if (isB3Field) {
      result.automatic.push({
        rule: 'B3',
        section,
        itemType,
        itemId,
        field,
        previous: storedValue,
        next: newWrapper,
        extraUpdates: {}
      });
      continue;
    }

    // D7 rule 8: D2 - field in neither table B nor table C goes to review with reason conflict
    result.reviews.push({
      reason: 'conflict',
      rule: 'D2',
      section,
      itemType,
      itemId,
      field,
      stored: storedValue,
      new: newWrapper
    });
  }

  return result;
}

module.exports = {
  decideLatest,
  readThreshold,
  isValidDate,
  SECTION_TO_ITEM_TYPE,
  TABLE_B2_FIELDS,
  TABLE_B3_FIELDS,
  DEFAULT_CONFIDENCE_THRESHOLD
};
