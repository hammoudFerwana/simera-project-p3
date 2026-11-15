const { parsePhoneNumberFromString } = require('libphonenumber-js');
const countries = require('i18n-iso-countries');

countries.registerLocale(require('i18n-iso-countries/langs/en.json'));

const displayNames = new Intl.DisplayNames(['en'], { type: 'language' });

const twoLetterLanguageMap = new Map();
const alphabet = 'abcdefghijklmnopqrstuvwxyz';
for (const c1 of alphabet) {
  for (const c2 of alphabet) {
    const code = c1 + c2;
    try {
      const name = displayNames.of(code);
      if (name && name.toLowerCase() !== code) {
        twoLetterLanguageMap.set(name.toLowerCase(), name);
      }
    } catch {
      // Ignore invalid BCP 47 codes
    }
  }
}

/**
 * Normalizes phone numbers to E.164 format.
 *
 * @param {string} raw
 * @returns {{ ok: true, value: string } | { ok: false, reason: string }}
 */
function normalizePhone(raw) {
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'invalid_phone' };
  }

  let cleaned = raw.replace(/[\s.\-()[\]{}\u2013\u2014]/g, '');

  if (cleaned.startsWith('00')) {
    cleaned = `+${cleaned.slice(2)}`;
  }

  if (!cleaned.startsWith('+')) {
    return { ok: false, reason: 'phone_without_country_code' };
  }

  const parsed = parsePhoneNumberFromString(cleaned);
  if (!parsed || !parsed.isValid()) {
    return { ok: false, reason: 'invalid_phone' };
  }

  return { ok: true, value: parsed.number };
}

/**
 * Normalizes and validates URLs.
 *
 * @param {string} raw
 * @returns {{ ok: true, value: string } | { ok: false, reason: string }}
 */
function normalizeUrl(raw) {
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'invalid_url' };
  }

  let s = raw.trim();
  if (!s) {
    return { ok: false, reason: 'invalid_url' };
  }

  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) {
    const hostPart = s.split(/[/?#]/)[0];
    if (
      hostPart.includes('.') &&
      !/\s/.test(hostPart) &&
      !hostPart.startsWith('.') &&
      !hostPart.endsWith('.')
    ) {
      s = `https://${s}`;
    }
  }

  let parsed;
  try {
    parsed = new URL(s);
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }

  if (
    (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
    !parsed.hostname ||
    !parsed.hostname.includes('.')
  ) {
    return { ok: false, reason: 'invalid_url' };
  }

  return { ok: true, value: s };
}

/**
 * Normalizes country strings to ISO 3166-1 alpha-2 uppercase code.
 *
 * @param {string} raw
 * @returns {{ ok: true, value: string } | { ok: false, reason: string }}
 */
function normalizeCountry(raw) {
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'invalid_country' };
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, reason: 'invalid_country' };
  }

  const upper = trimmed.toUpperCase();
  if (/^[A-Za-z]{2}$/.test(trimmed) && countries.isValid(upper)) {
    return { ok: true, value: upper };
  }

  const code = countries.getAlpha2Code(trimmed, 'en');
  if (code) {
    return { ok: true, value: code };
  }

  return { ok: false, reason: 'invalid_country' };
}

/**
 * Normalizes language strings to English name as formatted by Intl.DisplayNames.
 *
 * @param {string} raw
 * @returns {{ ok: true, value: string } | { ok: false, reason: string }}
 */
function normalizeLanguage(raw) {
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'invalid_language' };
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, reason: 'invalid_language' };
  }

  if (/^[a-zA-Z]{2,3}$/.test(trimmed)) {
    try {
      const name = displayNames.of(trimmed.toLowerCase());
      if (!name || name.toLowerCase() === trimmed.toLowerCase()) {
        return { ok: false, reason: 'invalid_language' };
      }
      return { ok: true, value: name };
    } catch {
      return { ok: false, reason: 'invalid_language' };
    }
  }

  const found = twoLetterLanguageMap.get(trimmed.toLowerCase());
  if (found) {
    return { ok: true, value: found };
  }

  return { ok: false, reason: 'invalid_language' };
}

module.exports = {
  normalizePhone,
  normalizeUrl,
  normalizeCountry,
  normalizeLanguage
};
