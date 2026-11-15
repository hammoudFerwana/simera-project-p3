const {
  parseDate,
  isRealDate,
  toMonthIndex,
  jobMonths,
  calculateExperienceMonths
} = require('../src/experience');

const fixedNow = new Date('2026-11-15T10:00:00Z');

describe('shared/src/experience.js', () => {
  describe('parseDate', () => {
    const cases = [
      { input: '2021', expected: { year: 2021, month: null, day: null } },
      { input: '2021-05', expected: { year: 2021, month: 5, day: null } },
      { input: '2021-05-17', expected: { year: 2021, month: 5, day: 17 } },
      { input: 'May 2021', expected: null },
      { input: null, expected: null }
    ];

    test.each(cases)('parses $input correctly', ({ input, expected }) => {
      expect(parseDate(input)).toEqual(expected);
    });
  });

  describe('isRealDate', () => {
    const cases = [
      {
        input: '2021-13',
        maxYear: 2036,
        expected: { ok: false, reason: 'invalid_date' }
      },
      {
        input: '2021-00',
        maxYear: 2036,
        expected: { ok: false, reason: 'invalid_date' }
      },
      {
        input: '2023-02-30',
        maxYear: 2036,
        expected: { ok: false, reason: 'invalid_date' }
      },
      { input: '2024-02-29', maxYear: 2036, expected: { ok: true } },
      {
        input: '1949',
        maxYear: 2036,
        expected: { ok: false, reason: 'year_out_of_range' }
      },
      {
        input: '2037',
        maxYear: 2036,
        expected: { ok: false, reason: 'year_out_of_range' }
      }
    ];

    test.each(cases)('validates $input', ({ input, maxYear, expected }) => {
      expect(isRealDate(input, { maxYear })).toEqual(expected);
    });

    test('throws TypeError when maxYear is omitted', () => {
      expect(() => isRealDate('2020')).toThrow(TypeError);
    });
  });

  describe('toMonthIndex', () => {
    test('returns correct index for start and end', () => {
      expect(toMonthIndex('2021', 'start')).toBe(2021 * 12 + 0);
      expect(toMonthIndex('2021', 'end')).toBe(2021 * 12 + 11);
      expect(toMonthIndex('2021-05', 'start')).toBe(2021 * 12 + 4);
      expect(toMonthIndex('2021-05', 'end')).toBe(2021 * 12 + 4);
      expect(toMonthIndex(null, 'start')).toBeNull();
      expect(toMonthIndex('invalid', 'start')).toBeNull();
      expect(toMonthIndex('2021', 'invalid_side')).toBeNull();
    });
  });

  describe('jobMonths', () => {
    const cases = [
      {
        name: '2020-01 to 2021-12 -> 24',
        job: { start_date: '2020-01', end_date: '2021-12', is_current: false },
        expected: 24
      },
      {
        name: '"2021" to "2023" -> 36 (D1)',
        job: { start_date: '2021', end_date: '2023', is_current: false },
        expected: 36
      },
      {
        name: '"2021-06" to "2021" -> 7',
        job: { start_date: '2021-06', end_date: '2021', is_current: false },
        expected: 7
      },
      {
        name: 'ongoing from 2025-01 -> 23',
        job: { start_date: '2025-01', end_date: null, is_current: true },
        expected: 23
      },
      {
        name: 'end before start -> null',
        job: { start_date: '2022-01', end_date: '2021-12', is_current: false },
        expected: null
      },
      {
        name: 'no end and not current -> null',
        job: { start_date: '2020-01', end_date: null, is_current: false },
        expected: null
      },
      {
        name: 'no start -> null',
        job: { start_date: null, end_date: '2021-12', is_current: false },
        expected: null
      },
      {
        name: '"2022-03-10" to "2022-03-25" -> 1',
        job: {
          start_date: '2022-03-10',
          end_date: '2022-03-25',
          is_current: false
        },
        expected: 1
      }
    ];

    test.each(cases)('$name', ({ job, expected }) => {
      expect(jobMonths(job, { now: fixedNow })).toBe(expected);
    });
  });

  describe('calculateExperienceMonths', () => {
    test('Jan 2020 to Dec 2021 plus Jan 2021 to Dec 2022 -> totalMonths 36 and perJob [24, 24] (card AC4)', () => {
      const jobs = [
        { start_date: '2020-01', end_date: '2021-12', is_current: false },
        { start_date: '2021-01', end_date: '2022-12', is_current: false }
      ];
      const result = calculateExperienceMonths(jobs, { now: fixedNow });
      expect(result).toEqual({
        totalMonths: 36,
        perJob: [24, 24]
      });
    });

    test('two separate jobs -> the sum', () => {
      const jobs = [
        { start_date: '2018-01', end_date: '2019-12', is_current: false },
        { start_date: '2021-01', end_date: '2022-12', is_current: false }
      ];
      const result = calculateExperienceMonths(jobs, { now: fixedNow });
      expect(result).toEqual({
        totalMonths: 48,
        perJob: [24, 24]
      });
    });

    test('one job inside another -> the outer length', () => {
      const jobs = [
        { start_date: '2019-01', end_date: '2022-12', is_current: false },
        { start_date: '2020-01', end_date: '2021-12', is_current: false }
      ];
      const result = calculateExperienceMonths(jobs, { now: fixedNow });
      expect(result).toEqual({
        totalMonths: 48,
        perJob: [48, 24]
      });
    });

    test('a job with null months is left out of the total', () => {
      const jobs = [
        { start_date: '2020-01', end_date: '2021-12', is_current: false },
        { start_date: '2022-01', end_date: '2020-12', is_current: false }
      ];
      const result = calculateExperienceMonths(jobs, { now: fixedNow });
      expect(result).toEqual({
        totalMonths: 24,
        perJob: [24, null]
      });
    });

    test('[] -> 0', () => {
      const result = calculateExperienceMonths([], { now: fixedNow });
      expect(result).toEqual({
        totalMonths: 0,
        perJob: []
      });
    });

    test('the input array is not mutated', () => {
      const jobs = [
        { start_date: '2020-01', end_date: '2021-12', is_current: false }
      ];
      const snapshot = JSON.stringify(jobs);
      calculateExperienceMonths(jobs, { now: fixedNow });
      expect(JSON.stringify(jobs)).toBe(snapshot);
    });
  });
});
