const { lookupPlantedCase } = require('../lib/planted');

function fakeDbFor(handlers) {
  return {
    query: jest.fn().mockImplementation((sql, params) => {
      for (const [marker, rows] of handlers) {
        if (sql.includes(marker)) {
          return Promise.resolve({
            rows: typeof rows === 'function' ? rows(params) : rows
          });
        }
      }
      return Promise.resolve({ rows: [] });
    })
  };
}

describe('planted: lookup planted test cases', () => {
  test('table A: passes when the field has no conflict row', async () => {
    const db = fakeDbFor([]);
    const res = await lookupPlantedCase(db, 42, {
      section: 'work_experience',
      field: 'start_date',
      case: 'A3',
      decision: 'A3'
    });
    expect(res.available).toBe(true);
    expect(res.matches).toBe(true);
    expect(res.actual).toBe('A3 (no conflict row)');
  });

  test('table A: fails when the field produced a conflict row', async () => {
    const db = fakeDbFor([
      [
        'FROM conflicts',
        [{ applied_rule: null, resolution_method: null, status: 'pending' }]
      ]
    ]);
    const res = await lookupPlantedCase(db, 42, {
      section: 'work_experience',
      field: 'start_date',
      case: 'A3',
      decision: 'A3'
    });
    expect(res.matches).toBe(false);
    expect(res.actual).toBe('conflict pending');
  });

  test('table B: passes when an automatic_rule row has the same code', async () => {
    const db = fakeDbFor([
      [
        'FROM conflicts',
        [
          {
            applied_rule: 'B2',
            resolution_method: 'automatic_rule',
            status: 'resolved'
          }
        ]
      ]
    ]);
    const res = await lookupPlantedCase(db, 42, {
      section: 'candidate',
      field: 'headline',
      case: 'B2',
      decision: 'B2'
    });
    expect(res.actual).toBe('B2');
    expect(res.matches).toBe(true);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("resolution_method = 'automatic_rule'");
    expect(params).toEqual([42, 'headline']);
  });

  test('table B: fails when no automatic decision was recorded', async () => {
    const db = fakeDbFor([]);
    const res = await lookupPlantedCase(db, 42, {
      section: 'work_experience',
      field: 'end_date',
      case: 'B1',
      decision: 'B1'
    });
    expect(res.matches).toBe(false);
    expect(res.actual).toBe('none');
  });

  test('table C: maps C1 to the conflict review reason on the same field', async () => {
    const db = fakeDbFor([
      [
        'FROM human_reviews',
        [{ review_reason: 'conflict', review_status: 'pending' }]
      ]
    ]);
    const res = await lookupPlantedCase(db, 42, {
      section: 'work_experience',
      field: 'is_current',
      case: 'C1',
      decision: 'C1'
    });
    expect(res.matches).toBe(true);
    expect(res.actual).toBe('conflict (pending)');
    expect(db.query.mock.calls[0][1]).toEqual([42, 'is_current']);
  });

  test('table C: C3 looks for the __item__ conflict', async () => {
    const db = fakeDbFor([
      [
        'FROM human_reviews',
        [{ review_reason: 'item_match_uncertain', review_status: 'pending' }]
      ]
    ]);
    const res = await lookupPlantedCase(db, 42, {
      section: 'work_experience',
      field: 'job_title',
      case: 'C3',
      decision: 'C3'
    });
    expect(res.matches).toBe(true);
    expect(db.query.mock.calls[0][1]).toEqual([42, '__item__']);
  });

  test('table C: fails when the review reason is different', async () => {
    const db = fakeDbFor([
      [
        'FROM human_reviews',
        [{ review_reason: 'conflict', review_status: 'pending' }]
      ]
    ]);
    const res = await lookupPlantedCase(db, 42, {
      section: 'candidate',
      field: 'headline',
      case: 'C6',
      decision: 'C6'
    });
    expect(res.matches).toBe(false);
  });

  test('table C: fails when no review was recorded', async () => {
    const db = fakeDbFor([]);
    const res = await lookupPlantedCase(db, 42, {
      section: 'education',
      field: 'start_date',
      case: 'C2',
      decision: 'C2'
    });
    expect(res.matches).toBe(false);
    expect(res.actual).toBe('none');
  });

  test('C7: passes when an unknown_skills row exists', async () => {
    const db = fakeDbFor([
      ['FROM unknown_skills', [{ skill_name: 'Zorbex', status: 'pending' }]]
    ]);
    const res = await lookupPlantedCase(db, 42, {
      section: 'skills',
      field: 'skill_name',
      case: 'C7',
      decision: 'C7'
    });
    expect(res.matches).toBe(true);
    expect(res.actual).toBe('unknown_skill (pending)');
  });

  test('C7: fails when no unknown skill was recorded', async () => {
    const db = fakeDbFor([]);
    const res = await lookupPlantedCase(db, 42, {
      section: 'skills',
      field: 'skill_name',
      case: 'C7',
      decision: 'C7'
    });
    expect(res.matches).toBe(false);
  });
});
