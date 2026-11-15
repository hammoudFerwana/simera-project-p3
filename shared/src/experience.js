const DATE_PATTERN = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

/**
 * Parses a date string in one of three accepted shapes:
 * "YYYY", "YYYY-MM", or "YYYY-MM-DD".
 *
 * @param {string|null|undefined} s
 * @returns {{ year: number, month: number|null, day: number|null } | null}
 */
function parseDate(s) {
  if (typeof s !== 'string') {
    return null;
  }
  const match = s.match(DATE_PATTERN);
  if (!match) {
    return null;
  }
  return {
    year: parseInt(match[1], 10),
    month: match[2] !== undefined ? parseInt(match[2], 10) : null,
    day: match[3] !== undefined ? parseInt(match[3], 10) : null
  };
}

/**
 * Determines whether a year is a leap year.
 *
 * @param {number} year
 * @returns {boolean}
 */
function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Returns the number of days in a given month of a given year.
 *
 * @param {number} year
 * @param {number} month - 1-based (1 to 12)
 * @returns {number}
 */
function getDaysInMonth(year, month) {
  switch (month) {
    case 1:
    case 3:
    case 5:
    case 7:
    case 8:
    case 10:
    case 12:
      return 31;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    case 2:
      return isLeapYear(year) ? 29 : 28;
    default:
      return 0;
  }
}

/**
 * Validates that the parsed date components correspond to a real calendar date
 * and fall within [minYear, maxYear].
 *
 * @param {{ year: number, month: number|null, day: number|null }|string} parts
 * @param {{ minYear?: number, maxYear: number }} options
 * @returns {{ ok: true } | { ok: false, reason: 'invalid_date' | 'year_out_of_range' }}
 */
function isRealDate(parts, { minYear = 1950, maxYear } = {}) {
  if (
    maxYear === undefined ||
    maxYear === null ||
    typeof maxYear !== 'number'
  ) {
    throw new TypeError('maxYear is required');
  }

  const parsed = typeof parts === 'string' ? parseDate(parts) : parts;
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof parsed.year !== 'number'
  ) {
    return { ok: false, reason: 'invalid_date' };
  }

  const { year, month, day } = parsed;

  if (month !== null && month !== undefined) {
    if (month < 1 || month > 12) {
      return { ok: false, reason: 'invalid_date' };
    }
    if (day !== null && day !== undefined) {
      if (day < 1 || day > getDaysInMonth(year, month)) {
        return { ok: false, reason: 'invalid_date' };
      }
    }
  } else if (day !== null && day !== undefined) {
    return { ok: false, reason: 'invalid_date' };
  }

  if (year < minYear || year > maxYear) {
    return { ok: false, reason: 'year_out_of_range' };
  }

  return { ok: true };
}

/**
 * Converts a date string or parsed date object into a continuous month index:
 * year * 12 + (month - 1).
 *
 * Year-only values assume month 1 for 'start' and month 12 for 'end' (D1).
 *
 * @param {string|{ year: number, month: number|null }|null|undefined} s
 * @param {'start'|'end'} side
 * @returns {number|null}
 */
function toMonthIndex(s, side) {
  if (!s || (side !== 'start' && side !== 'end')) {
    return null;
  }
  const parsed = typeof s === 'string' ? parseDate(s) : s;
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof parsed.year !== 'number'
  ) {
    return null;
  }

  let m = parsed.month;
  if (m === null || m === undefined) {
    m = side === 'start' ? 1 : 12;
  } else if (m < 1 || m > 12) {
    return null;
  }

  return parsed.year * 12 + (m - 1);
}

/**
 * Resolves a `now` option into year and 1-based month.
 *
 * @param {Date|(() => Date)|string|object} [now]
 * @returns {{ year: number, month: number }}
 */
function resolveNow(now) {
  const d = typeof now === 'function' ? now() : now || new Date();
  if (d && typeof d.year === 'number' && typeof d.month === 'number') {
    return { year: d.year, month: d.month };
  }
  if (typeof d === 'string') {
    const parts = parseDate(d);
    if (parts) {
      return { year: parts.year, month: parts.month || 1 };
    }
    const parsed = new Date(d);
    return { year: parsed.getFullYear(), month: parsed.getMonth() + 1 };
  }
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/**
 * Calculates inclusive duration in months for a single job (A1).
 *
 * @param {{ start_date?: string|null, end_date?: string|null, is_current?: boolean|null }} job
 * @param {{ now?: Date|(() => Date) }} [options]
 * @returns {number|null}
 */
function jobMonths(
  { start_date = null, end_date = null, is_current = false } = {},
  { now } = {}
) {
  if (!start_date) {
    return null;
  }

  const startIndex = toMonthIndex(start_date, 'start');
  if (startIndex === null) {
    return null;
  }

  const isCurrent = Boolean(is_current);
  let endIndex;

  if (isCurrent) {
    const currentNow = resolveNow(now);
    endIndex = currentNow.year * 12 + (currentNow.month - 1);
  } else {
    if (!end_date) {
      return null;
    }
    endIndex = toMonthIndex(end_date, 'end');
    if (endIndex === null) {
      return null;
    }
  }

  if (endIndex < startIndex) {
    return null;
  }

  return endIndex - startIndex + 1;
}

/**
 * Calculates total experience months across multiple jobs, merging overlapping intervals.
 *
 * @param {Array<{ start_date?: string|null, end_date?: string|null, is_current?: boolean|null }>} jobs
 * @param {{ now?: Date|(() => Date) }} [options]
 * @returns {{ totalMonths: number, perJob: Array<number|null> }}
 */
function calculateExperienceMonths(jobs, { now } = {}) {
  if (!Array.isArray(jobs) || jobs.length === 0) {
    return { totalMonths: 0, perJob: [] };
  }

  const perJob = [];
  const intervals = [];

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const months = jobMonths(job, { now });
    perJob.push(months);

    if (months !== null) {
      const start = toMonthIndex(job.start_date, 'start');
      let end;
      if (job && Boolean(job.is_current)) {
        const currentNow = resolveNow(now);
        end = currentNow.year * 12 + (currentNow.month - 1);
      } else {
        end = toMonthIndex(job.end_date, 'end');
      }
      intervals.push({ start, end });
    }
  }

  if (intervals.length === 0) {
    return { totalMonths: 0, perJob };
  }

  intervals.sort((a, b) => a.start - b.start || a.end - b.end);

  const merged = [];
  let current = { ...intervals[0] };

  for (let i = 1; i < intervals.length; i++) {
    const next = intervals[i];
    if (next.start <= current.end) {
      current.end = Math.max(current.end, next.end);
    } else {
      merged.push(current);
      current = { ...next };
    }
  }
  merged.push(current);

  let totalMonths = 0;
  for (const interval of merged) {
    totalMonths += interval.end - interval.start + 1;
  }

  return { totalMonths, perJob };
}

module.exports = {
  parseDate,
  isRealDate,
  toMonthIndex,
  jobMonths,
  calculateExperienceMonths
};
