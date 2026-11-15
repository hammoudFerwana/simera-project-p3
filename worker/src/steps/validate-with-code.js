const {
  buildHaystack,
  findMissingEvidence
} = require('../validation/evidence');
const {
  normalizePhone,
  normalizeUrl,
  normalizeCountry,
  normalizeLanguage
} = require('../validation/formats');

/**
 * Creates the validateWithCode step.
 *
 * @param {{ log?: (entry: { jobId: unknown, section: string, index: number|null, field: string, reason: string }) => void }} [options]
 * @returns {(ctx: object) => Promise<object>}
 */
function createValidateWithCodeStep({ log = console.warn } = {}) {
  return async function validateWithCode(ctx) {
    const failedChecks = [];
    const extraction = ctx.extraction;

    if (!extraction) {
      ctx.failedChecks = failedChecks;
      return ctx;
    }

    const haystack = buildHaystack(ctx.text, ctx.links);
    const missingEvidence = findMissingEvidence(extraction, haystack);
    for (const failure of missingEvidence) {
      failedChecks.push(failure);
    }

    function checkField(wrapper, normalizer, section, index, field) {
      if (!wrapper || wrapper.value === null) {
        return;
      }
      const res = normalizer(wrapper.value);
      if (res.ok) {
        wrapper.value = res.value;
      } else {
        failedChecks.push({ section, index, field, reason: res.reason });
      }
    }

    if (extraction.candidate) {
      checkField(
        extraction.candidate.phone,
        normalizePhone,
        'candidate',
        null,
        'phone'
      );
      checkField(
        extraction.candidate.country_code,
        normalizeCountry,
        'candidate',
        null,
        'country_code'
      );
    }

    if (Array.isArray(extraction.languages)) {
      extraction.languages.forEach((item, index) => {
        if (item) {
          checkField(
            item.language,
            normalizeLanguage,
            'languages',
            index,
            'language'
          );
        }
      });
    }

    if (Array.isArray(extraction.links)) {
      extraction.links.forEach((item, index) => {
        if (item) {
          checkField(item.url, normalizeUrl, 'links', index, 'url');
        }
      });
    }

    if (Array.isArray(extraction.work_experience)) {
      extraction.work_experience.forEach((item, index) => {
        if (item) {
          checkField(
            item.company_url,
            normalizeUrl,
            'work_experience',
            index,
            'company_url'
          );
        }
      });
    }

    if (Array.isArray(extraction.certifications)) {
      extraction.certifications.forEach((item, index) => {
        if (item) {
          checkField(
            item.credential_url,
            normalizeUrl,
            'certifications',
            index,
            'credential_url'
          );
        }
      });
    }

    if (Array.isArray(extraction.projects)) {
      extraction.projects.forEach((item, index) => {
        if (item) {
          checkField(
            item.project_url,
            normalizeUrl,
            'projects',
            index,
            'project_url'
          );
        }
      });
    }

    if (Array.isArray(extraction.publications)) {
      extraction.publications.forEach((item, index) => {
        if (item) {
          checkField(item.url, normalizeUrl, 'publications', index, 'url');
        }
      });
    }

    for (const failure of failedChecks) {
      log({
        jobId: ctx.jobId,
        section: failure.section,
        index: failure.index,
        field: failure.field,
        reason: failure.reason
      });
    }

    ctx.failedChecks = failedChecks;
    return ctx;
  };
}

module.exports = { createValidateWithCodeStep };
