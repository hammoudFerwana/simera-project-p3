const {
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
} = require('./normalize');

/**
 * Compares a new extraction with the stored final data (requirements 3.7:
 * item matching and table A). Pure functions: no database, no side effects.
 * Deciding B or C for a real difference is US-16; creating review items is
 * US-17.
 *
 * Shapes:
 * - extraction: the validated extraction (shared/src/extraction/schema.js).
 *   Every field is a wrapper { value, confidence, evidence }. A skill may carry
 *   `canonical_name` (a string, or null/missing when the skill is not in the
 *   universal list), set by US-13.
 * - stored: the same sections with plain values (no wrapper), read from the
 *   database. A stored item may carry its `id`. A stored skill has
 *   `canonical_name` (or `name`) and `months_of_experience`.
 */

const SECTION_NAMES = [
  'candidate',
  'work_experience',
  'education',
  'skills',
  'languages',
  'links',
  'certifications',
  'projects',
  'awards',
  'publications',
  'volunteering'
];

/** The plain value of a wrapper, or the value itself. */
function valueOf(field) {
  if (field && typeof field === 'object' && !Array.isArray(field)) {
    return 'value' in field ? field.value : field;
  }
  return field;
}

const text = (name) => ({ name, type: 'text' });
const date = (name) => ({ name, type: 'date' });

/** The parts of a key joined; null when the first part is empty. */
function joinKey(...parts) {
  if (!parts[0]) return null;
  return parts.join('|');
}

/** Months of experience: "2 years" is 24 months. */
function monthsOf(duration) {
  if (!duration || typeof duration !== 'object') return null;
  const months =
    duration.unit === 'years' ? duration.amount * 12 : duration.amount;
  return Number.isFinite(months) ? Math.round(months) : null;
}

const WORK_PERIOD = ['start_date', 'end_date', 'is_current'];

// For each list section:
// - period: the item has a period, so two items match only if the periods overlap
// - strong: the key that says "the same item" (after normalization)
// - entity: the key that says "the same company, school...", used for an uncertain match
// - fields: what is compared once two items are matched
const SECTIONS = {
  work_experience: {
    period: WORK_PERIOD,
    strong: (item) => {
      const company = normalizeCompany(valueOf(item.company_name));
      const title = normalizeKey(valueOf(item.job_title));
      return company && title ? `${company}|${title}` : null;
    },
    entity: (item) => normalizeCompany(valueOf(item.company_name)) || null,
    fields: [
      { name: 'job_title', type: 'key' },
      { name: 'company_name', type: 'company' },
      date('start_date'),
      date('end_date'),
      { name: 'is_current', type: 'bool' },
      text('location'),
      text('employment_type'),
      text('work_mode'),
      text('description'),
      text('responsibilities'),
      text('achievements'),
      text('skills_used'),
      { name: 'company_url', type: 'url' }
    ]
  },
  education: {
    period: WORK_PERIOD,
    strong: (item) =>
      joinKey(
        normalizeCompany(valueOf(item.institution_name)),
        normalizeKey(valueOf(item.degree_level)),
        normalizeKey(valueOf(item.field_of_study))
      ),
    entity: (item) => normalizeCompany(valueOf(item.institution_name)) || null,
    fields: [
      { name: 'institution_name', type: 'company' },
      { name: 'degree_level', type: 'key' },
      text('degree_name'),
      { name: 'field_of_study', type: 'key' },
      date('start_date'),
      date('end_date'),
      { name: 'is_current', type: 'bool' },
      text('gpa'),
      text('honors'),
      text('location'),
      text('description')
    ]
  },
  volunteering: {
    period: WORK_PERIOD,
    strong: (item) => {
      const organization = normalizeCompany(valueOf(item.organization));
      const role = normalizeKey(valueOf(item.role));
      return organization && role ? `${organization}|${role}` : null;
    },
    entity: (item) => normalizeCompany(valueOf(item.organization)) || null,
    fields: [
      { name: 'organization', type: 'company' },
      { name: 'role', type: 'key' },
      text('description'),
      date('start_date'),
      date('end_date'),
      { name: 'is_current', type: 'bool' }
    ]
  },
  certifications: {
    strong: (item) => {
      const name = normalizeKey(valueOf(item.name));
      const issuer = normalizeCompany(valueOf(item.issuing_organization));
      return name && issuer ? `${name}|${issuer}` : null;
    },
    entity: (item) => normalizeKey(valueOf(item.name)) || null,
    fields: [
      { name: 'name', type: 'key' },
      { name: 'issuing_organization', type: 'company' },
      date('issue_date'),
      date('expiration_date'),
      text('credential_id'),
      { name: 'credential_url', type: 'url' },
      text('description')
    ]
  },
  projects: {
    strong: (item) => normalizeKey(valueOf(item.name)) || null,
    entity: () => null,
    fields: [
      { name: 'name', type: 'key' },
      text('description'),
      text('role'),
      { name: 'project_url', type: 'url' },
      date('start_date'),
      date('end_date')
    ]
  },
  awards: {
    strong: (item) => {
      const name = normalizeKey(valueOf(item.name));
      const issuer = normalizeCompany(valueOf(item.issuer));
      return name && issuer ? `${name}|${issuer}` : null;
    },
    entity: (item) => normalizeKey(valueOf(item.name)) || null,
    fields: [
      { name: 'name', type: 'key' },
      { name: 'issuer', type: 'company' },
      date('award_date'),
      text('description')
    ]
  },
  publications: {
    strong: (item) => {
      const title = normalizeKey(valueOf(item.title));
      const publisher = normalizeCompany(valueOf(item.publisher));
      return title && publisher ? `${title}|${publisher}` : null;
    },
    entity: (item) => normalizeKey(valueOf(item.title)) || null,
    fields: [
      { name: 'title', type: 'key' },
      { name: 'publisher', type: 'company' },
      date('publication_date'),
      { name: 'url', type: 'url' },
      text('description')
    ]
  },
  languages: {
    strong: (item) => normalizeKey(valueOf(item.language)) || null,
    entity: () => null,
    fields: [
      { name: 'language', type: 'key' },
      { name: 'proficiency_level', type: 'key' }
    ]
  },
  links: {
    strong: (item) => normalizeUrl(valueOf(item.url)) || null,
    entity: () => null,
    fields: [
      { name: 'url', type: 'url' },
      { name: 'link_type', type: 'key' },
      text('label')
    ]
  },
  skills: {
    strong: (item) => {
      // canonical_name null means "not in the universal list" (C7): the name
      // as written is never used as a key.
      const name = 'canonical_name' in item ? item.canonical_name : item.name;
      return normalizeKey(valueOf(name)) || null;
    },
    entity: () => null,
    fields: [
      { name: 'proficiency_level', type: 'key' },
      {
        name: 'months_of_experience',
        type: 'months',
        newField: 'stated_duration',
        newValue: (item) => monthsOf(valueOf(item.stated_duration))
      }
    ]
  }
};

const CANDIDATE_FIELDS = [
  text('first_name'),
  text('last_name'),
  text('headline'),
  text('summary'),
  { name: 'phone', type: 'phone' },
  text('industry'),
  text('profession'),
  text('city'),
  { name: 'country_code', type: 'code' }
];

const NORMALIZERS = {
  text: normalizeText,
  key: normalizeKey,
  company: normalizeCompany,
  phone: normalizePhone,
  url: normalizeUrl,
  code: normalizeCode
};

/**
 * Compares one stored value with the new one.
 * @returns {null | { status: 'added' | 'unchanged' | 'precision_upgrade' | 'different', reason?: string }}
 *   null: the new file has no value, so the stored value stays (A4).
 */
function compareValues(type, storedValue, newValue) {
  if (isEmpty(newValue)) return null;
  if (isEmpty(storedValue)) return { status: 'added' }; // A1: the field was empty

  if (type === 'date') {
    const result = compareDates(storedValue, newValue);
    if (result === 'new_more_precise') return { status: 'precision_upgrade' }; // A3
    if (result === 'stored_more_precise') {
      return { status: 'unchanged', reason: 'less_precise' }; // A3
    }
    return result === 'same'
      ? { status: 'unchanged', reason: 'identical' }
      : { status: 'different' };
  }

  if (type === 'bool' || type === 'months') {
    return storedValue === newValue
      ? { status: 'unchanged', reason: 'identical' }
      : { status: 'different' };
  }

  const normalize = NORMALIZERS[type];
  if (normalize(storedValue) !== normalize(newValue)) {
    return { status: 'different' };
  }
  // The same after formatting is removed: A2, no change.
  return {
    status: 'unchanged',
    reason:
      String(storedValue).trim() === String(newValue).trim()
        ? 'identical'
        : 'format_only'
  };
}

// ---------- periods ----------

/** { start, end } in months, or null when the item has no dates at all. */
function periodOf(item, nowMonth) {
  const start = parseDate(valueOf(item.start_date));
  const end = parseDate(valueOf(item.end_date));
  const current = valueOf(item.is_current) === true;
  if (!start && !end && !current) return null;
  return {
    start: start ? earliestMonth(start) : -Infinity,
    // No end date, or a current job: it runs until now.
    end: end && !current ? latestMonth(end) : nowMonth
  };
}

/** Two periods overlap. A period that is not known counts as possible. */
function periodsOverlap(a, b, nowMonth) {
  const first = periodOf(a, nowMonth);
  const second = periodOf(b, nowMonth);
  if (!first || !second) return true;
  return first.start <= second.end && second.start <= first.end;
}

// ---------- item matching ----------

/**
 * Matches the new items of one section with the stored ones.
 * - matched: the same item (the strong key is the same and the periods overlap)
 * - uncertain: the same company, school... and an overlapping period, but not
 *   the same item (C3): a person decides
 * - new: nothing like it is stored (A1)
 *
 * @returns {{ newIndex: number, status: 'matched' | 'uncertain' | 'new', storedIndex?: number, candidates?: number[] }[]}
 */
function matchItems(config, storedItems, newItems, nowMonth) {
  const used = new Set();
  const results = newItems.map((_, newIndex) => ({ newIndex, status: 'new' }));
  const compatible = (stored, item) =>
    !config.period || periodsOverlap(stored, item, nowMonth);

  // First the sure matches, so an uncertain pair never takes an item that
  // another new item matches exactly.
  newItems.forEach((item, newIndex) => {
    const key = config.strong(item);
    if (!key) return;
    const storedIndex = storedItems.findIndex(
      (stored, index) =>
        !used.has(index) &&
        config.strong(stored) === key &&
        compatible(stored, item)
    );
    if (storedIndex >= 0) {
      used.add(storedIndex);
      results[newIndex] = { newIndex, status: 'matched', storedIndex };
    }
  });

  newItems.forEach((item, newIndex) => {
    if (results[newIndex].status !== 'new') return;
    const entity = config.entity(item);
    if (!entity) return;
    const candidates = storedItems
      .map((stored, index) => ({ stored, index }))
      .filter(
        ({ stored, index }) =>
          !used.has(index) &&
          config.entity(stored) === entity &&
          compatible(stored, item)
      )
      .map(({ index }) => index);
    if (candidates.length > 0) {
      results[newIndex] = { newIndex, status: 'uncertain', candidates };
    }
  });

  return results;
}

// ---------- the diff ----------

function emptyDiff() {
  return {
    added: [],
    unchanged: [],
    precisionUpgrades: [],
    uncertainMatches: [],
    differences: [],
    unknownSkills: []
  };
}

/** Compares the fields of a stored item with the same item in the new file. */
function compareFields(diff, context, fields, stored, item) {
  for (const field of fields) {
    const storedValue = valueOf(stored[field.name]);
    const newWrapper = item[field.newField || field.name];
    const newValue = field.newValue
      ? field.newValue(item)
      : valueOf(newWrapper);
    let result = compareValues(field.type, storedValue, newValue);
    if (!result) continue; // A4: the new file has nothing, the stored value stays

    // A job stored as current has no end date on purpose. A new end date is not
    // "a field that was empty" (A1): US-16 decides (B1).
    if (
      result.status === 'added' &&
      field.name === 'end_date' &&
      valueOf(stored.is_current) === true
    ) {
      result = { status: 'different' };
    }

    const base = { ...context, field: field.name };
    switch (result.status) {
      case 'added':
        diff.added.push({ ...base, scope: 'field', new: newWrapper });
        break;
      case 'unchanged':
        diff.unchanged.push({ ...base, reason: result.reason });
        break;
      case 'precision_upgrade':
        diff.precisionUpgrades.push({
          ...base,
          stored: storedValue,
          new: newWrapper
        });
        break;
      default:
        diff.differences.push({
          ...base,
          stored: storedValue,
          new: newWrapper
        });
    }
  }
}

/**
 * Compares a new extraction with the stored final data.
 *
 * - A1 new item or new field: `added`
 * - A2 same after formatting: `unchanged` (reason `format_only`)
 * - A3 another precision: `precisionUpgrades` when the new date has more
 *   detail; when the stored one has more detail it stays (`unchanged`)
 * - A4 stored data missing from the new file: not in the diff, it stays
 * - A5 a new skill: `added` when it has a canonical name, else `unknownSkills` (C7)
 * - C3 an item that may be the same one: `uncertainMatches`, with the full new item
 * - any other difference: `differences`, for US-16 to decide
 *
 * @param {object | null} stored the stored final data; null for the first file
 * @param {object} extraction the validated extraction
 * @param {{ now?: Date }} [options] now: the end of a job that has no end date
 * @returns {object | null} the diff, or null when nothing is stored (the first
 *   file is stored as it is)
 */
function compareWithStored(stored, extraction, { now = new Date() } = {}) {
  if (!stored) return null;
  const diff = emptyDiff();
  const nowMonth = now.getUTCFullYear() * 12 + (now.getUTCMonth() + 1);

  compareFields(
    diff,
    { section: 'candidate', storedIndex: null, storedId: null, newIndex: null },
    CANDIDATE_FIELDS,
    stored.candidate || {},
    extraction.candidate || {}
  );

  for (const section of SECTION_NAMES.slice(1)) {
    const config = SECTIONS[section];
    const storedItems = stored[section] || [];
    const newItems = extraction[section] || [];
    const matches = matchItems(config, storedItems, newItems, nowMonth);

    for (const match of matches) {
      const item = newItems[match.newIndex];

      if (match.status === 'matched') {
        const storedItem = storedItems[match.storedIndex];
        compareFields(
          diff,
          {
            section,
            storedIndex: match.storedIndex,
            storedId: storedItem.id ?? null,
            newIndex: match.newIndex
          },
          config.fields,
          storedItem,
          item
        );
      } else if (match.status === 'uncertain') {
        diff.uncertainMatches.push({
          section,
          reason: 'item_match_uncertain',
          newIndex: match.newIndex,
          newItem: item,
          candidates: match.candidates.map((index) => ({
            storedIndex: index,
            storedId: storedItems[index].id ?? null
          }))
        });
      } else if (section === 'skills' && !config.strong(item)) {
        diff.unknownSkills.push({
          section,
          newIndex: match.newIndex,
          newItem: item
        });
      } else {
        diff.added.push({
          section,
          scope: 'item',
          newIndex: match.newIndex,
          new: item
        });
      }
    }
  }

  return diff;
}

module.exports = { compareValues, compareWithStored, matchItems, SECTIONS };
