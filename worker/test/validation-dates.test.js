const { checkDates } = require('../src/validation/dates');

const fixedNow = new Date('2026-11-15T10:00:00Z');

const v = (value) => ({
  value,
  confidence: value !== null ? 0.9 : null,
  evidence: value !== null ? String(value) : null
});

function createBaseExtraction() {
  return {
    meta: { document_language: 'en', extraction_warnings: [] },
    candidate: {},
    work_experience: [],
    education: [],
    skills: [],
    languages: [],
    links: [],
    certifications: [],
    projects: [],
    awards: [],
    publications: [],
    volunteering: []
  };
}

describe('worker/src/validation/dates.js - checkDates', () => {
  test('month 13 in work_experience[0].start_date -> invalid_date (card AC1)', () => {
    const extraction = createBaseExtraction();
    extraction.work_experience = [
      {
        start_date: v('2021-13'),
        end_date: v('2022-05'),
        is_current: v(false)
      }
    ];

    const failures = checkDates(extraction, { now: fixedNow });
    expect(failures).toEqual([
      {
        section: 'work_experience',
        index: 0,
        field: 'start_date',
        reason: 'invalid_date'
      }
    ]);
  });

  test('start after end -> start_after_end on end_date (card AC2)', () => {
    const extraction = createBaseExtraction();
    extraction.work_experience = [
      {
        start_date: v('2022-05'),
        end_date: v('2021-03'),
        is_current: v(false)
      }
    ];

    const failures = checkDates(extraction, { now: fixedNow });
    expect(failures).toEqual([
      {
        section: 'work_experience',
        index: 0,
        field: 'end_date',
        reason: 'start_after_end'
      }
    ]);
  });

  test('is_current true with an end date -> current_with_end_date on end_date (card AC3)', () => {
    const extraction = createBaseExtraction();
    extraction.work_experience = [
      {
        start_date: v('2021-01'),
        end_date: v('2023-01'),
        is_current: v(true)
      }
    ];

    const failures = checkDates(extraction, { now: fixedNow });
    expect(failures).toEqual([
      {
        section: 'work_experience',
        index: 0,
        field: 'end_date',
        reason: 'current_with_end_date'
      }
    ]);
  });

  test('start "2026-12" -> future_date, start "2026" -> no entry, education end_date "2027" -> no entry (A3, A4)', () => {
    const extraction = createBaseExtraction();
    extraction.work_experience = [
      {
        start_date: v('2026-12'),
        end_date: null,
        is_current: v(true)
      },
      {
        start_date: v('2026'),
        end_date: null,
        is_current: v(true)
      }
    ];
    extraction.education = [
      {
        start_date: v('2023-09'),
        end_date: v('2027'),
        is_current: v(false)
      }
    ];

    const failures = checkDates(extraction, { now: fixedNow });
    expect(failures).toEqual([
      {
        section: 'work_experience',
        index: 0,
        field: 'start_date',
        reason: 'future_date'
      }
    ]);
  });

  test('certifications issue "2024-05", expiration "2023-01" -> start_after_end on expiration_date, expiration "2028" -> no entry', () => {
    const extraction = createBaseExtraction();
    extraction.certifications = [
      {
        issue_date: v('2024-05'),
        expiration_date: v('2023-01')
      },
      {
        issue_date: v('2024-05'),
        expiration_date: v('2028')
      }
    ];

    const failures = checkDates(extraction, { now: fixedNow });
    expect(failures).toEqual([
      {
        section: 'certifications',
        index: 0,
        field: 'expiration_date',
        reason: 'start_after_end'
      }
    ]);
  });

  test('awards.award_date "2030" -> future_date, publications.publication_date "1900" -> year_out_of_range', () => {
    const extraction = createBaseExtraction();
    extraction.awards = [
      {
        award_date: v('2030')
      }
    ];
    extraction.publications = [
      {
        publication_date: v('1900')
      }
    ];

    const failures = checkDates(extraction, { now: fixedNow });
    expect(failures).toEqual([
      {
        section: 'awards',
        index: 0,
        field: 'award_date',
        reason: 'future_date'
      },
      {
        section: 'publications',
        index: 0,
        field: 'publication_date',
        reason: 'year_out_of_range'
      }
    ]);
  });

  test('null dates -> no entry', () => {
    const extraction = createBaseExtraction();
    extraction.work_experience = [
      {
        start_date: v(null),
        end_date: v(null),
        is_current: v(false)
      }
    ];
    extraction.education = [
      {
        start_date: v(null),
        end_date: v(null),
        is_current: v(false)
      }
    ];
    extraction.certifications = [
      {
        issue_date: v(null),
        expiration_date: v(null)
      }
    ];
    extraction.awards = [{ award_date: v(null) }];
    extraction.publications = [{ publication_date: v(null) }];
    extraction.projects = [
      {
        start_date: v(null),
        end_date: v(null)
      }
    ];
    extraction.volunteering = [
      {
        start_date: v(null),
        end_date: v(null),
        is_current: v(false)
      }
    ];

    const failures = checkDates(extraction, { now: fixedNow });
    expect(failures).toEqual([]);
  });
});
