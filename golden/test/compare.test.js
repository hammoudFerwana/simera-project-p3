const {
  compareValues,
  compareDates,
  compareStoredWithExpected,
  calculateRate,
  normalizeString
} = require('../lib/compare');

describe('compare: helpers for field and date comparison', () => {
  describe('normalizeString', () => {
    test('trims and collapses whitespace', () => {
      expect(normalizeString('  Backend   Developer  ')).toBe(
        'Backend Developer'
      );
    });

    test('handles null and undefined safely', () => {
      expect(normalizeString(null)).toBe('');
      expect(normalizeString(undefined)).toBe('');
    });
  });

  describe('compareDates', () => {
    test('matches identical date strings', () => {
      expect(compareDates('2021-03', '2021-03')).toBe(true);
      expect(compareDates('2018-01-15', '2018-01-15')).toBe(true);
    });

    test('matches date when actual has higher precision (month to day)', () => {
      expect(compareDates('2021-03', '2021-03-01')).toBe(true);
    });

    test('matches date when expected has year precision only', () => {
      expect(compareDates('2018', '2018-01')).toBe(true);
    });

    test('returns false when year differs', () => {
      expect(compareDates('2018', '2019')).toBe(false);
    });

    test('returns false when month differs', () => {
      expect(compareDates('2021-03', '2021-04')).toBe(false);
    });

    test('handles nulls correctly', () => {
      expect(compareDates(null, null)).toBe(true);
      expect(compareDates('2021-03', null)).toBe(false);
      expect(compareDates(null, '2021-03')).toBe(false);
    });
  });

  describe('compareValues', () => {
    test('compares strings case-insensitively with normalized spacing', () => {
      expect(
        compareValues('Senior Developer', 'senior   developer', 'job_title')
      ).toBe(true);
      expect(compareValues('Backend', 'Frontend', 'headline')).toBe(false);
    });

    test('compares booleans accurately', () => {
      expect(compareValues(true, true, 'is_current')).toBe(true);
      expect(compareValues(false, false, 'is_current')).toBe(true);
      expect(compareValues(true, false, 'is_current')).toBe(false);
    });

    test('delegates date fields to compareDates', () => {
      expect(compareValues('2021-03', '2021-03-01', 'start_date')).toBe(true);
      expect(compareValues('2024-03', '2024-04', 'end_date')).toBe(false);
    });

    test('handles null vs non-null', () => {
      expect(compareValues(null, null, 'end_date')).toBe(true);
      expect(compareValues(null, '2024-03', 'end_date')).toBe(false);
      expect(compareValues('2024-03', null, 'end_date')).toBe(false);
    });
  });

  describe('calculateRate', () => {
    test('returns 100 for all matched', () => {
      expect(calculateRate(10, 10)).toBe(100);
    });

    test('returns 50 for half matched', () => {
      expect(calculateRate(5, 10)).toBe(50);
    });

    test('returns 0 when total is 0', () => {
      expect(calculateRate(0, 0)).toBe(0);
    });

    test('rounds to 2 decimal places', () => {
      expect(calculateRate(1, 3)).toBe(33.33);
    });
  });

  describe('compareStoredWithExpected', () => {
    test('correctly compares profile and sections with FieldView objects', () => {
      const storedProfile = {
        profile: {
          first_name: { value: 'Lina' },
          last_name: { value: 'Haddad' },
          headline: { value: 'Backend Developer' },
          city: { value: 'Amman' }
        },
        sections: {
          work_experience: [
            {
              fields: {
                company_name: { value: 'Nova Labs' },
                job_title: { value: 'Backend Developer' },
                start_date: { value: '2021-03' },
                end_date: { value: null },
                is_current: { value: true }
              }
            }
          ],
          education: [
            {
              fields: {
                institution_name: { value: 'University of Jordan' },
                degree_level: { value: 'Bachelor' },
                start_date: { value: '2014-09' },
                end_date: { value: '2018-06' }
              }
            }
          ],
          skills: [{ skillName: 'Node.js' }, { skillName: 'PostgreSQL' }],
          languages: [{ fields: { language: { value: 'English' } } }],
          projects: []
        }
      };

      const expected = {
        candidate: {
          first_name: 'Lina',
          headline: 'Backend Developer',
          city: 'Amman'
        },
        work_experience: [
          {
            company_name: 'Nova Labs',
            job_title: 'Backend Developer',
            start_date: '2021-03',
            is_current: true
          }
        ],
        education: [
          {
            institution_name: 'University of Jordan',
            degree_level: 'Bachelor',
            start_date: '2014-09'
          }
        ],
        skills: ['Node.js', 'PostgreSQL'],
        languages: [{ language: 'English' }]
      };

      const res = compareStoredWithExpected(storedProfile, expected);

      expect(res.compared).toBe(13); // 3 candidate + 4 work + 3 edu + 2 skills + 1 lang
      expect(res.matched).toBe(13);
      expect(res.dateCompared).toBe(2); // start_date in work, start_date in edu
      expect(res.dateMatched).toBe(2);
      expect(res.sections.candidate.matched).toBe(3);
      expect(res.sections.work_experience.matched).toBe(4);
      expect(res.sections.education.matched).toBe(3);
      expect(res.sections.skills.matched).toBe(2);
      expect(res.sections.languages.matched).toBe(1);
    });

    test('computes experienceMonths exact match when expected experienceMonths is provided', () => {
      const storedProfile = {
        profile: {},
        sections: {
          work_experience: [
            {
              fields: {
                company_name: { value: 'Company A' },
                start_date: { value: '2021-01' },
                end_date: { value: '2021-12' },
                is_current: { value: false }
              }
            }
          ]
        }
      };

      const expected = {
        work_experience: [
          {
            company_name: 'Company A',
            start_date: '2021-01',
            end_date: '2021-12'
          }
        ],
        experienceMonths: 12
      };

      const res = compareStoredWithExpected(storedProfile, expected);
      expect(res.experienceMonths.expected).toBe(12);
      expect(res.experienceMonths.actual).toBe(12);
      expect(res.experienceMonths.matches).toBe(true);
    });
  });
});
