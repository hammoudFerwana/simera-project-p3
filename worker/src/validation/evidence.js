/**
 * Normalizes text for evidence matching:
 * Unicode NFKC, lowercase, every whitespace run collapsed to one space, trimmed.
 *
 * @param {string} s
 * @returns {string}
 */
function normalizeForMatch(s) {
  if (typeof s !== 'string') {
    return '';
  }
  return s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Builds the searchable text haystack from source text and extracted links.
 *
 * @param {string} text
 * @param {Array<{ label?: string, url?: string }>} [links]
 * @returns {string}
 */
function buildHaystack(text, links = []) {
  const parts = [];

  if (typeof text === 'string') {
    const normText = normalizeForMatch(text);
    if (normText) {
      parts.push(normText);
    }
  }

  if (Array.isArray(links)) {
    for (const link of links) {
      if (!link) continue;
      if (typeof link === 'string') {
        const norm = normalizeForMatch(link);
        if (norm) parts.push(norm);
      } else if (typeof link === 'object') {
        if (link.label) {
          const normLabel = normalizeForMatch(link.label);
          if (normLabel) parts.push(normLabel);
        }
        if (link.url) {
          const normUrl = normalizeForMatch(link.url);
          if (normUrl) parts.push(normUrl);
        }
      }
    }
  }

  return parts.join('\n');
}

function isWrapper(obj) {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'value' in obj &&
    'confidence' in obj &&
    'evidence' in obj
  );
}

/**
 * Walks 'candidate' and every list section (skipping 'meta').
 * For every wrapper whose value is not null, verifies that normalized evidence
 * is a substring of the haystack.
 *
 * @param {object} extraction
 * @param {string} haystack
 * @returns {Array<{ section: string, index: number|null, field: string, reason: string }>}
 */
function findMissingEvidence(extraction, haystack) {
  const failedChecks = [];
  if (!extraction || typeof extraction !== 'object') {
    return failedChecks;
  }

  const safeHaystack = typeof haystack === 'string' ? haystack : '';

  function checkWrapper(wrapper, section, index, field) {
    if (!isWrapper(wrapper) || wrapper.value === null) {
      return;
    }
    const normEvidence = normalizeForMatch(wrapper.evidence);
    if (!normEvidence || !safeHaystack.includes(normEvidence)) {
      failedChecks.push({
        section,
        index,
        field,
        reason: 'evidence_not_found'
      });
    }
  }

  for (const [sectionKey, sectionValue] of Object.entries(extraction)) {
    if (sectionKey === 'meta' || !sectionValue) {
      continue;
    }

    if (sectionKey === 'candidate' && typeof sectionValue === 'object') {
      for (const [field, wrapper] of Object.entries(sectionValue)) {
        checkWrapper(wrapper, 'candidate', null, field);
      }
    } else if (Array.isArray(sectionValue)) {
      sectionValue.forEach((item, index) => {
        if (item && typeof item === 'object') {
          for (const [field, wrapper] of Object.entries(item)) {
            checkWrapper(wrapper, sectionKey, index, field);
          }
        }
      });
    }
  }

  return failedChecks;
}

module.exports = {
  normalizeForMatch,
  buildHaystack,
  findMissingEvidence
};
