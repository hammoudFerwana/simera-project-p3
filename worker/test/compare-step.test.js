const { createCompareStep } = require('../src/steps/compare');

describe('worker compare step', () => {
  const wrap = (value) => ({ value, confidence: 0.9, evidence: 'evidence' });

  it('first file -> ctx.storedData null and ctx.diff null', async () => {
    const fakeDb = {
      query: jest.fn().mockResolvedValue({ rows: [] })
    };
    const log = jest.fn();
    const step = createCompareStep({ db: fakeDb, log });

    const ctx = {
      jobId: 101,
      candidateId: 42,
      extraction: {
        candidate: { city: wrap('Amman') },
        work_experience: []
      }
    };

    const result = await step(ctx);

    expect(result.storedData).toBeNull();
    expect(result.diff).toBeNull();
    expect(log).toHaveBeenCalledWith({
      jobId: 101,
      firstFile: true,
      added: 0,
      differences: 0,
      uncertain: 0
    });
  });

  it('stored city Amman and new Dubai -> ctx.diff.differences has the city entry (AC8 through the step)', async () => {
    const fakeDb = {
      query: jest.fn().mockImplementation(async (sql) => {
        if (sql.includes('FROM candidate_profiles')) {
          return {
            rows: [
              {
                first_name: 'John',
                last_name: 'Doe',
                headline: 'Developer',
                summary: 'Bio',
                phone: null,
                industry: null,
                profession: null,
                city: 'Amman',
                country_code: 'JO'
              }
            ]
          };
        }
        return { rows: [] };
      })
    };
    const log = jest.fn();
    const step = createCompareStep({ db: fakeDb, log });

    const ctx = {
      jobId: 202,
      candidateId: 55,
      extraction: {
        candidate: {
          city: wrap('Dubai'),
          country_code: wrap('JO')
        }
      }
    };

    const result = await step(ctx);

    expect(result.diff.differences).toContainEqual(
      expect.objectContaining({
        section: 'candidate',
        field: 'city',
        stored: 'Amman',
        new: wrap('Dubai')
      })
    );
  });

  it('the step makes no INSERT, UPDATE or DELETE (spy on db.query and check every SQL starts with SELECT)', async () => {
    const executedQueries = [];
    const fakeDb = {
      query: jest.fn().mockImplementation(async (sql) => {
        executedQueries.push(sql.trim());
        return { rows: [] };
      })
    };
    const step = createCompareStep({ db: fakeDb, log: jest.fn() });

    const ctx = {
      jobId: 303,
      candidateId: 77,
      extraction: {
        candidate: { city: wrap('Amman') }
      }
    };

    await step(ctx);

    expect(executedQueries.length).toBeGreaterThan(0);
    for (const sql of executedQueries) {
      expect(sql.toUpperCase().startsWith('SELECT')).toBe(true);
      expect(sql.toUpperCase()).not.toMatch(
        /\b(INSERT|UPDATE|DELETE|DROP|ALTER)\b/
      );
    }
  });

  it('the log line holds counts only', async () => {
    const fakeDb = {
      query: jest.fn().mockImplementation(async (sql) => {
        if (sql.includes('FROM candidate_profiles')) {
          return {
            rows: [
              {
                first_name: 'John',
                last_name: 'Doe',
                headline: null,
                summary: null,
                phone: null,
                industry: null,
                profession: null,
                city: 'Amman',
                country_code: null
              }
            ]
          };
        }
        return { rows: [] };
      })
    };
    const log = jest.fn();
    const step = createCompareStep({ db: fakeDb, log });

    const ctx = {
      jobId: 404,
      candidateId: 88,
      extraction: {
        candidate: {
          city: wrap('Dubai'),
          headline: wrap('Lead Developer')
        }
      }
    };

    await step(ctx);

    expect(log).toHaveBeenCalledTimes(1);
    const logged = log.mock.calls[0][0];
    expect(logged).toEqual({
      jobId: 404,
      firstFile: false,
      added: 1,
      differences: 1,
      uncertain: 0
    });
    expect(Object.keys(logged).sort()).toEqual(
      ['added', 'differences', 'firstFile', 'jobId', 'uncertain'].sort()
    );
  });
});
