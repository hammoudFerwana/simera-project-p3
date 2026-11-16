const { lookupPlantedCase } = require('../lib/planted');

describe('planted: lookup planted test cases', () => {
  test('returns available decision when conflict row exists', async () => {
    const fakeDb = {
      query: jest.fn().mockImplementation((sql, _params) => {
        if (sql.includes('FROM conflicts')) {
          return Promise.resolve({
            rows: [
              {
                applied_rule: 'B2',
                resolution_method: 'automatic_rule',
                status: 'resolved'
              }
            ]
          });
        }
        return Promise.resolve({ rows: [] });
      })
    };

    const plantedCase = {
      section: 'candidate',
      field: 'headline',
      case: 'B2',
      decision: 'B2'
    };

    const res = await lookupPlantedCase(fakeDb, 42, plantedCase);
    expect(res.available).toBe(true);
    expect(res.actual).toBe('B2');
    expect(res.expected).toBe('B2');
    expect(res.matches).toBe(true);
    expect(res.status).toBe('available');
  });

  test('returns available decision when human_reviews row exists', async () => {
    const fakeDb = {
      query: jest.fn().mockImplementation((sql, _params) => {
        if (sql.includes('FROM conflicts')) {
          return Promise.resolve({ rows: [] });
        }
        if (sql.includes('FROM human_reviews')) {
          return Promise.resolve({
            rows: [
              { review_reason: 'low_confidence', review_status: 'pending' }
            ]
          });
        }
        return Promise.resolve({ rows: [] });
      })
    };

    const plantedCase = {
      section: 'candidate',
      field: 'headline',
      case: 'C6',
      decision: 'C6'
    };

    const res = await lookupPlantedCase(fakeDb, 42, plantedCase);
    expect(res.available).toBe(true);
    expect(res.actual).toBe('low_confidence');
    expect(res.status).toBe('available');
  });

  test('returns C7 decision when unknown_skills row exists', async () => {
    const fakeDb = {
      query: jest.fn().mockImplementation((sql, _params) => {
        if (sql.includes('FROM unknown_skills')) {
          return Promise.resolve({
            rows: [{ skill_name: 'Zorbex', status: 'pending' }]
          });
        }
        return Promise.resolve({ rows: [] });
      })
    };

    const plantedCase = {
      section: 'skills',
      field: 'skill_name',
      case: 'C7',
      decision: 'C7'
    };

    const res = await lookupPlantedCase(fakeDb, 42, plantedCase);
    expect(res.available).toBe(true);
    expect(res.actual).toBe('C7');
    expect(res.matches).toBe(true);
  });

  test('returns not available yet when no conflict or review row exists (Decision D7)', async () => {
    const fakeDb = {
      query: jest.fn().mockResolvedValue({ rows: [] })
    };

    const plantedCase = {
      section: 'work_experience',
      field: 'end_date',
      case: 'B1',
      decision: 'B1'
    };

    const res = await lookupPlantedCase(fakeDb, 42, plantedCase);
    expect(res.available).toBe(false);
    expect(res.actual).toBeNull();
    expect(res.expected).toBe('B1');
    expect(res.status).toMatch(/not available yet/);
  });
});
