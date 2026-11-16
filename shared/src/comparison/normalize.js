/**
 * Normalizers used to compare a stored value with a new one. They only decide
 * whether two values are the same after formatting is removed; they never
 * change what is stored.
 */

// Words that end a company name and say nothing about which company it is.
const LEGAL_SUFFIXES = new Set([
  'inc',
  'incorporated',
  'llc',
  'ltd',
  'limited',
  'corp',
  'corporation',
  'co',
  'company',
  'gmbh',
  'ag',
  'sa',
  'plc',
  'llp',
  'lp',
  'pllc',
  'pte',
  'pvt',
  'bv',
  'nv',
  'srl',
  'spa',
  'oy',
  'ab'
]);

const DATE_PATTERN = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

function stripDiacritics(value) {
  return String(value).normalize('NFD').replace(/\p{M}/gu, '');
}

function isEmpty(value) {
  return (
    value === null ||
    value === undefined ||
    (typeof value === 'string' && value.trim() === '')
  );
}

/** Lowercase, one space between words, no punctuation at the ends. */
function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, '')
    .trim();
}

/** For names and titles: only letters and digits, one space between words. */
function normalizeKey(value) {
  return stripDiacritics(String(value ?? ''))
    .normalize('NFKC')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** "Acme Inc." and "ACME" give the same name. Open Decision 18. */
function normalizeCompany(value) {
  // "S.A." is one word, not "s" and "a".
  const words = normalizeKey(String(value ?? '').replace(/\./g, ''))
    .split(' ')
    .filter(Boolean);
  while (words.length > 1 && LEGAL_SUFFIXES.has(words[words.length - 1])) {
    words.pop();
  }
  return words.join(' ');
}

/** Digits with a leading +. "00962..." and "+962..." are the same number. */
function normalizePhone(value) {
  let digits = String(value ?? '').replace(/[^\d+]/g, '');
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`;
  return digits.replace(/(?!^)\+/g, '');
}

/** Lowercase, no trailing slash (the same rule as the stored links). */
function normalizeUrl(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\/+$/, '');
}

function normalizeCode(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase();
}

/** @returns {{ year: number, month: number|null, day: number|null, rank: 1|2|3 } | null} */
function parseDate(value) {
  const match = DATE_PATTERN.exec(String(value ?? '').trim());
  if (!match) return null;
  const month = match[2] ? Number(match[2]) : null;
  const day = match[3] ? Number(match[3]) : null;
  return { year: Number(match[1]), month, day, rank: day ? 3 : month ? 2 : 1 };
}

/** The first month a date can mean ("2022" means January 2022). */
function earliestMonth(date) {
  return date.year * 12 + (date.month || 1);
}

/** The last month a date can mean ("2022" means December 2022). */
function latestMonth(date) {
  return date.year * 12 + (date.month || 12);
}

/**
 * Compares two dates written at any precision.
 * - same: the same value
 * - new_more_precise: the new date adds detail ("2022" then "2022-05")
 * - stored_more_precise: the stored date has more detail ("2022-05" then "2022")
 * - different: they cannot be the same date ("2019-05" and "2019-08")
 */
function compareDates(stored, next) {
  const a = parseDate(stored);
  const b = parseDate(next);
  if (!a || !b) {
    return normalizeText(stored) === normalizeText(next) ? 'same' : 'different';
  }
  const compatible =
    a.year === b.year &&
    (a.month === null || b.month === null || a.month === b.month) &&
    (a.day === null || b.day === null || a.day === b.day);
  if (!compatible) return 'different';
  if (b.rank > a.rank) return 'new_more_precise';
  if (b.rank < a.rank) return 'stored_more_precise';
  return 'same';
}

module.exports = {
  compareDates,
  earliestMonth,
  isEmpty,
  latestMonth,
  normalizeCode,
  normalizeCompany,
  normalizeKey,
  normalizePhone,
  normalizeText,
  normalizeUrl,
  parseDate
};
