
/**
 * Normalizes text for deduplication key generation.
 *
 * @param {string|null} value - Original text value.
 * @returns {string|null} Normalized text or null.
 */
function normalizeTextForKey(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new TypeError('Value must be a string or null.');
  }

  const normalized = value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

  return normalized || null;
}



/**
 * Normalizes a company name and removes supported legal suffixes.
 *
 * @param {string|null} value - Original company name.
 * @returns {string|null} Normalized company name or null.
 */

function normalizeCompanyNameForKey(value) {
  const normalized = normalizeTextForKey(value);

  if (normalized === null) {
    return null;
  }

  const legalSuffixes = [
    'incorporated',
    'inc\\.?',
    'l\\.?l\\.?c\\.?',
    'l\\.?l\\.?p\\.?',
    'limited',
    'ltd\\.?',
    'corporation',
    'corp\\.?',
    'p\\.?l\\.?c\\.?'
  ];

  const suffixPattern = new RegExp(
    `(?:[\\s,.]+)(?:${legalSuffixes.join('|')})$`,
    'i'
  );

  const result = normalized.replace(suffixPattern, '').trim();

  return result || normalized;
}



/**
 * Normalizes a URL for consistent storage and deduplication.
 *
 * @param {string|null} value - Original URL.
 * @returns {string|null} Normalized URL or null.
 */
function normalizeUrlForStorage(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new TypeError('URL must be a string or null.');
  }

  const normalized = value.trim().toLowerCase().replace(/\/+$/, '');

  return normalized || null;
}


const crypto = require('node:crypto');

/**
 * Defines the fields used to identify each record.
 */
const DEDUPLICATION_FIELDS = {
  work_experience: ['company_name', 'job_title', 'start_date'],
  education: ['institution_name', 'degree_level', 'field_of_study'],
  certifications: ['name', 'issuing_organization', 'issue_date'],
  projects: ['name', 'start_date'],
  awards: ['name', 'issuer', 'award_date'],
  publications: ['title', 'publisher', 'publication_date'],
  volunteering: ['organization', 'role', 'start_date'],
  languages: ['language'],
  links: ['url']
};
const DATE_FIELDS = [
  'start_date',
  'end_date',
  'issue_date',
  'award_date',
  'publication_date',
  'graduation_date'
];

/**
 * Builds a deterministic SHA-256 deduplication key.
 *
 * @param {string} itemType - Type of record.
 * @param {Object} fields - Record fields containing value wrappers.
 * @returns {string} SHA-256 hash.
 */
function buildDeduplicationKey(itemType, fields) {
  const keyFields = DEDUPLICATION_FIELDS[itemType];

  if (!keyFields) {
    throw new Error(`Unsupported item type: ${itemType}`);
  }

  if (!fields || typeof fields !== 'object') {
    throw new TypeError('Fields must be an object.');
  }

  const values = keyFields.map((fieldName) => {
    const value = fields[fieldName]?.value ?? null;

    if (itemType === 'links' && fieldName === 'url') {
      return normalizeUrlForStorage(value);
    }

    if (
      itemType === 'work_experience' &&
      fieldName === 'company_name'
    ) {
      return normalizeCompanyNameForKey(value);
    }

    if (fieldName.includes('date')) {
      return value;
    }

    return normalizeTextForKey(value);
  });

  const structuredInput = JSON.stringify(values);

  return crypto
    .createHash('sha256')
    .update(structuredInput, 'utf8')
    .digest('hex');
}
/**
 * Merges two field wrappers when their values are compatible.
 *
 * @param {Object} first - First field wrapper.
 * @param {Object} second - Second field wrapper.
 * @returns {{ status: string, wrapper: Object|null }}
 */
function mergeFieldValues(first, second) {
  const firstValue = first?.value ?? null;
  const secondValue = second?.value ?? null;

  if (firstValue === null && secondValue === null) {
    return { status: 'resolved', wrapper: first };
  }

  if (firstValue === null) {
    return { status: 'resolved', wrapper: second };
  }

  if (secondValue === null) {
    return { status: 'resolved', wrapper: first };
  }

  let areEqual;

  if (
    typeof firstValue === 'string' &&
    typeof secondValue === 'string'
  ) {
    areEqual =
      normalizeTextForKey(firstValue) ===
      normalizeTextForKey(secondValue);
  } else {
    areEqual = Object.is(firstValue, secondValue);
  }

  if (areEqual) {
    return { status: 'resolved', wrapper: first };
  }

  return { status: 'conflict', wrapper: null };
}
/**
 * Merges two date wrappers based on date precision.
 *
 * @param {Object} first - First date wrapper.
 * @param {Object} second - Second date wrapper.
 * @returns {{ status: string, wrapper: Object|null }}
 */
function mergeDateValues(first, second) {
  const firstValue = first?.value ?? null;
  const secondValue = second?.value ?? null;

  if (firstValue === null && secondValue === null) {
    return { status: 'resolved', wrapper: first };
  }

  if (firstValue === null) {
    return { status: 'resolved', wrapper: second };
  }

  if (secondValue === null) {
    return { status: 'resolved', wrapper: first };
  }

  if (
    typeof firstValue !== 'string' ||
    typeof secondValue !== 'string'
  ) {
    throw new TypeError('Date values must be strings or null.');
  }

  if (firstValue === secondValue) {
    return { status: 'resolved', wrapper: first };
  }

  // The second date is more precise.
  if (secondValue.startsWith(`${firstValue}-`)) {
    return { status: 'resolved', wrapper: second };
  }

  // The first date is more precise.
  if (firstValue.startsWith(`${secondValue}-`)) {
    return { status: 'resolved', wrapper: first };
  }

  return { status: 'conflict', wrapper: null };
}

/**
 * Checks whether two date values are compatible by precision.
 *
 * Examples:
 * 2023 and 2023-06 => compatible
 * 2023-06 and 2023-06-15 => compatible
 * 2023-05 and 2023-06 => incompatible
 */
function areCompatibleDates(first, second) {
  return (
    first === second ||
    first.startsWith(`${second}-`) ||
    second.startsWith(`${first}-`)
  );
}

/**
 * Merges multiple date candidates.
 * More precise dates are selected only when their evidence is available.
 */
function mergeMultipleDateValues(candidates) {
  const nonNullCandidates = candidates.filter(
    ({ wrapper }) => wrapper?.value !== null &&
      wrapper?.value !== undefined
  );

  if (nonNullCandidates.length === 0) {
    return {
      status: 'resolved',
      candidate: candidates[0]
    };
  }

  const values = nonNullCandidates.map(({ wrapper }) => wrapper.value);

  if (values.some((value) => typeof value !== 'string')) {
    throw new TypeError('Date values must be strings or null.');
  }

  const allCompatible = values.every((value, index) =>
    values
      .slice(index + 1)
      .every((other) => areCompatibleDates(value, other))
  );

  if (!allCompatible) {
    return { status: 'conflict', candidates: nonNullCandidates };
  }

  const mostPrecise = [...nonNullCandidates].sort(
    (a, b) =>
      b.wrapper.value.length - a.wrapper.value.length ||
      a.sourceIndex - b.sourceIndex
  )[0];

  // A more precise date must have supporting evidence.
  if (
    mostPrecise.wrapper.value.length >
      Math.min(...values.map((value) => value.length)) &&
    (
      typeof mostPrecise.wrapper.evidence !== 'string' ||
      !mostPrecise.wrapper.evidence.trim()
    )
  ) {
    return { status: 'conflict', candidates: nonNullCandidates };
  }

  return {
    status: 'resolved',
    candidate: mostPrecise
  };
}

/**
 * Merges multiple candidates for one field.
 */
function mergeFieldCandidates(itemType, fieldName, candidates) {
  const orderedCandidates = [...candidates].sort(
    (a, b) => a.sourceIndex - b.sourceIndex
  );

  // Key fields are represented by the earliest source.
  if (DEDUPLICATION_FIELDS[itemType].includes(fieldName)) {
    const winner = orderedCandidates[0];

    if (itemType === 'links' && fieldName === 'url') {
      return {
        status: 'resolved',
        candidate: {
          ...winner,
          wrapper: {
            ...winner.wrapper,
            value: normalizeUrlForStorage(winner.wrapper.value)
          }
        }
      };
    }

    return { status: 'resolved', candidate: winner };
  }

  if (DATE_FIELDS.includes(fieldName)) {
    return mergeMultipleDateValues(orderedCandidates);
  }

  const nonNullCandidates = orderedCandidates.filter(
    ({ wrapper }) =>
      wrapper?.value !== null && wrapper?.value !== undefined
  );

  if (nonNullCandidates.length === 0) {
    return {
      status: 'resolved',
      candidate: orderedCandidates[0]
    };
  }

  const firstValue = nonNullCandidates[0].wrapper.value;

  const allEqual = nonNullCandidates.every(({ wrapper }) => {
    const value = wrapper.value;

    if (typeof firstValue === 'string' && typeof value === 'string') {
      return (
        normalizeTextForKey(firstValue) ===
        normalizeTextForKey(value)
      );
    }

    return Object.is(firstValue, value);
  });

  if (!allEqual) {
    return {
      status: 'conflict',
      candidates: nonNullCandidates
    };
  }

  return {
    status: 'resolved',
    candidate: nonNullCandidates[0]
  };
}

/**
 * Merges multiple duplicate mapped records.
 *
 * @param {string} itemType - Type of record.
 * @param {...Object} items - Mapped records with sourceIndex and fields.
 * @returns {Object} Merged record with resolved and review fields.
 */
function mergeDuplicateItems(itemType, ...items) {
  if (!DEDUPLICATION_FIELDS[itemType]) {
    throw new Error(`Unsupported item type: ${itemType}`);
  }

  if (
  items.length < 2 ||
  items.some(
    (item) =>
      !item ||
      !item.fields ||
      typeof item.fields !== 'object' ||
      Array.isArray(item.fields)
  )
) {
  throw new TypeError('At least two valid items are required.');
}

  if (
    items.some(
      (item) =>
        !Number.isInteger(item.sourceIndex) ||
        item.sourceIndex < 0
    )
  ) {
    throw new TypeError('All items must have valid source indexes.');
  }
  const sourceIndexes = items.map((item) => item.sourceIndex);
  if (new Set(sourceIndexes).size !== sourceIndexes.length) {
    throw new Error('Source indexes must be unique.');
  }


  const orderedItems = [...items].sort(
    (a, b) => a.sourceIndex - b.sourceIndex
  );

  const deduplicationKey = buildDeduplicationKey(
    itemType,
    orderedItems[0].fields
  );

  const allKeysMatch = orderedItems.every(
    (item) =>
      buildDeduplicationKey(itemType, item.fields) ===
      deduplicationKey
  );

  if (!allKeysMatch) {
    throw new Error(
      'Cannot merge items with different deduplication keys.'
    );
  }

  const allFieldNames = new Set(
    orderedItems.flatMap((item) => Object.keys(item.fields))
  );

  const fields = {};
  const fieldSources = {};
  const reviewFields = {};

  for (const fieldName of allFieldNames) {
    const candidates = orderedItems
      .filter((item) =>
        Object.prototype.hasOwnProperty.call(item.fields, fieldName)
      )
      .map((item) => ({
        wrapper: item.fields[fieldName],
        sourceIndex: item.sourceIndex
      }));

    const mergeResult = mergeFieldCandidates(
      itemType,
      fieldName,
      candidates
    );

    if (mergeResult.status === 'resolved') {
      fields[fieldName] = mergeResult.candidate.wrapper;
      fieldSources[fieldName] = mergeResult.candidate.sourceIndex;
    } else {
      reviewFields[fieldName] = {
        values: mergeResult.candidates.map((candidate) => ({
          wrapper: candidate.wrapper,
          sourceIndex: candidate.sourceIndex
        }))
      };
    }
  }

  return {
    deduplicationKey,
    sourceIndexes: orderedItems.map((item) => item.sourceIndex),
    fields,
    fieldSources,
    reviewFields
  };
}

module.exports = {
  normalizeTextForKey,
  normalizeCompanyNameForKey,
  normalizeUrlForStorage,
  buildDeduplicationKey,
  mergeFieldValues,
  mergeDateValues,
  mergeDuplicateItems,
  DATE_FIELDS,
  DEDUPLICATION_FIELDS
};