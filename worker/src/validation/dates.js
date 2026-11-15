const {
  parseDate,
  isRealDate,
  toMonthIndex
} = require('../../../shared/src/experience');

/**
 * Validates date fields across all sections in the extraction data contract.
 *
 * Checks performed:
 * a) parseDate then isRealDate (valid calendar date and within [minYear, maxYear]).
 * b) Future check on start dates and single dates: cannot be later than current month.
 * c) Order check: start date cannot be after end date.
 * d) Consistency check: is_current cannot be true when end_date is present.
 *
 * @param {object} extraction
 * @param {{ now?: Date|(() => Date), minYear?: number }} [options]
 * @returns {Array<{ section: string, index: number|null, field: string, reason: string }>}
 */
function checkDates(extraction, { now, minYear = 1950 } = {}) {
  const failedChecks = [];

  if (!extraction || typeof extraction !== 'object') {
    return failedChecks;
  }

  const nowDate = typeof now === 'function' ? now() : now || new Date();
  const nowYear = nowDate.getFullYear();
  const nowMonth = nowDate.getMonth() + 1;
  const nowMonthIndex = nowYear * 12 + (nowMonth - 1);
  const maxYear = nowYear + 10;

  function checkStartEndSection(sectionName, hasIsCurrent = false) {
    const list = extraction[sectionName];
    if (!Array.isArray(list)) {
      return;
    }

    list.forEach((item, index) => {
      if (!item || typeof item !== 'object') {
        return;
      }

      let startReal = false;
      const startWrapper = item.start_date;
      if (startWrapper && startWrapper.value !== null) {
        const parts = parseDate(startWrapper.value);
        const real = isRealDate(parts, { minYear, maxYear });
        if (!real.ok) {
          failedChecks.push({
            section: sectionName,
            index,
            field: 'start_date',
            reason: real.reason
          });
        } else {
          startReal = true;
          const startIdx = toMonthIndex(startWrapper.value, 'start');
          if (startIdx !== null && startIdx > nowMonthIndex) {
            failedChecks.push({
              section: sectionName,
              index,
              field: 'start_date',
              reason: 'future_date'
            });
          }
        }
      }

      const endWrapper = item.end_date;
      if (endWrapper && endWrapper.value !== null) {
        const parts = parseDate(endWrapper.value);
        const real = isRealDate(parts, { minYear, maxYear });
        if (!real.ok) {
          failedChecks.push({
            section: sectionName,
            index,
            field: 'end_date',
            reason: real.reason
          });
        } else {
          if (startReal) {
            const startIdx = toMonthIndex(startWrapper.value, 'start');
            const endIdx = toMonthIndex(endWrapper.value, 'end');
            if (startIdx !== null && endIdx !== null && startIdx > endIdx) {
              failedChecks.push({
                section: sectionName,
                index,
                field: 'end_date',
                reason: 'start_after_end'
              });
            }
          }

          if (
            hasIsCurrent &&
            item.is_current &&
            item.is_current.value === true
          ) {
            failedChecks.push({
              section: sectionName,
              index,
              field: 'end_date',
              reason: 'current_with_end_date'
            });
          }
        }
      }
    });
  }

  // 1. work_experience
  checkStartEndSection('work_experience', true);

  // 2. education
  checkStartEndSection('education', true);

  // 3. volunteering
  checkStartEndSection('volunteering', true);

  // 4. projects
  checkStartEndSection('projects', false);

  // 5. certifications: issue_date, expiration_date
  if (Array.isArray(extraction.certifications)) {
    extraction.certifications.forEach((item, index) => {
      if (!item || typeof item !== 'object') {
        return;
      }

      let issueReal = false;
      const issueWrapper = item.issue_date;
      if (issueWrapper && issueWrapper.value !== null) {
        const parts = parseDate(issueWrapper.value);
        const real = isRealDate(parts, { minYear, maxYear });
        if (!real.ok) {
          failedChecks.push({
            section: 'certifications',
            index,
            field: 'issue_date',
            reason: real.reason
          });
        } else {
          issueReal = true;
          const issueIdx = toMonthIndex(issueWrapper.value, 'start');
          if (issueIdx !== null && issueIdx > nowMonthIndex) {
            failedChecks.push({
              section: 'certifications',
              index,
              field: 'issue_date',
              reason: 'future_date'
            });
          }
        }
      }

      const expWrapper = item.expiration_date;
      if (expWrapper && expWrapper.value !== null) {
        const parts = parseDate(expWrapper.value);
        const real = isRealDate(parts, { minYear, maxYear });
        if (!real.ok) {
          failedChecks.push({
            section: 'certifications',
            index,
            field: 'expiration_date',
            reason: real.reason
          });
        } else if (issueReal) {
          const issueIdx = toMonthIndex(issueWrapper.value, 'start');
          const expIdx = toMonthIndex(expWrapper.value, 'end');
          if (issueIdx !== null && expIdx !== null && issueIdx > expIdx) {
            failedChecks.push({
              section: 'certifications',
              index,
              field: 'expiration_date',
              reason: 'start_after_end'
            });
          }
        }
      }
    });
  }

  // 6. awards: award_date
  if (Array.isArray(extraction.awards)) {
    extraction.awards.forEach((item, index) => {
      if (!item || typeof item !== 'object') {
        return;
      }
      const awardWrapper = item.award_date;
      if (awardWrapper && awardWrapper.value !== null) {
        const parts = parseDate(awardWrapper.value);
        const real = isRealDate(parts, { minYear, maxYear });
        if (!real.ok) {
          failedChecks.push({
            section: 'awards',
            index,
            field: 'award_date',
            reason: real.reason
          });
        } else {
          const idx = toMonthIndex(awardWrapper.value, 'start');
          if (idx !== null && idx > nowMonthIndex) {
            failedChecks.push({
              section: 'awards',
              index,
              field: 'award_date',
              reason: 'future_date'
            });
          }
        }
      }
    });
  }

  // 7. publications: publication_date
  if (Array.isArray(extraction.publications)) {
    extraction.publications.forEach((item, index) => {
      if (!item || typeof item !== 'object') {
        return;
      }
      const pubWrapper = item.publication_date;
      if (pubWrapper && pubWrapper.value !== null) {
        const parts = parseDate(pubWrapper.value);
        const real = isRealDate(parts, { minYear, maxYear });
        if (!real.ok) {
          failedChecks.push({
            section: 'publications',
            index,
            field: 'publication_date',
            reason: real.reason
          });
        } else {
          const idx = toMonthIndex(pubWrapper.value, 'start');
          if (idx !== null && idx > nowMonthIndex) {
            failedChecks.push({
              section: 'publications',
              index,
              field: 'publication_date',
              reason: 'future_date'
            });
          }
        }
      }
    });
  }

  return failedChecks;
}

module.exports = { checkDates };
