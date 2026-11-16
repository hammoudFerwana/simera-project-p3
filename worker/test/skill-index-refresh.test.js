const path = require('path');
const dotenv = require('dotenv');

dotenv.config({
  path: path.resolve(__dirname, '../../.env')
});

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must be set in .env');
}

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const pool = require('shared/src/database');
const { getFreshSkillIndex } = require('../src/skills/skill-index');
const { createNormalizeSkillsStep } = require('../src/steps/normalize-skills');

describe('worker skill index refresh (AC4)', () => {
  const RUN_ID = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const insertedSkills = [];

  beforeAll(async () => {
    const dbCheck = await pool.query('SELECT current_database() AS name');
    const currentDb = dbCheck.rows[0].name;

    if (!currentDb.startsWith('simera_test')) {
      throw new Error(
        `Safety check failed: database ${currentDb} does not start with simera_test`
      );
    }
  });

  afterAll(async () => {
    try {
      if (insertedSkills.length > 0) {
        await pool.query('DELETE FROM skills WHERE canonical_name = ANY($1)', [
          insertedSkills
        ]);
      }
    } finally {
      await pool.end();
    }
  });

  it('reloads skill index when skills table changed and caches when unchanged', async () => {
    // 1. Call getFreshSkillIndex(pool)
    const initialIndex = await getFreshSkillIndex(pool);
    expect(initialIndex).toBeDefined();

    // 2. Spy on pool.query
    const querySpy = jest.spyOn(pool, 'query');

    // 3. Call getFreshSkillIndex(pool) a second time when nothing changed in skills table
    const secondIndex = await getFreshSkillIndex(pool);
    expect(secondIndex).toBe(initialIndex);

    // 4. Verify it did not reload (only the COUNT/MAX query ran, SELECT id, canonical_name FROM skills was not called)
    expect(querySpy).toHaveBeenCalledTimes(1);
    expect(querySpy.mock.calls[0][0]).toMatch(/COUNT\(\*\)/i);
    const selectCalls = querySpy.mock.calls.filter(
      (call) =>
        typeof call[0] === 'string' &&
        call[0].includes('SELECT id, canonical_name FROM skills')
    );
    expect(selectCalls).toHaveLength(0);

    // 5. Insert a new unique skill (e.g. Bun-${RUN_ID}) into skills table
    const newSkill = `Bun-${RUN_ID}`;
    insertedSkills.push(newSkill);
    await pool.query(
      'INSERT INTO skills (canonical_name, created_at) VALUES ($1, CURRENT_TIMESTAMP)',
      [newSkill]
    );

    querySpy.mockClear();

    // 6. Call getFreshSkillIndex(pool)
    const reloadedIndex = await getFreshSkillIndex(pool);

    // 7. Verify that the index reloaded and index.findExact finds the newly inserted skill
    const reloadedSelectCalls = querySpy.mock.calls.filter(
      (call) =>
        typeof call[0] === 'string' &&
        call[0].includes('SELECT id, canonical_name FROM skills')
    );
    expect(reloadedSelectCalls).toHaveLength(1);

    const exactMatch = reloadedIndex.findExact(newSkill);
    expect(exactMatch).not.toBeNull();
    expect(exactMatch.canonical_name).toBe(newSkill);

    querySpy.mockRestore();
  });

  it('normalizeSkills step uses getFreshSkillIndex and matches newly inserted skill', async () => {
    const stepSkill = `Deno-${RUN_ID}`;
    insertedSkills.push(stepSkill);
    await pool.query(
      'INSERT INTO skills (canonical_name, created_at) VALUES ($1, CURRENT_TIMESTAMP)',
      [stepSkill]
    );

    const normalizeSkills = createNormalizeSkillsStep({
      db: pool,
      log: () => {}
    });
    const ctx = {
      jobId: 99999,
      extraction: {
        skills: [{ name: { value: stepSkill } }]
      }
    };

    await normalizeSkills(ctx);

    expect(ctx.skillResolutions).toHaveLength(1);
    expect(ctx.skillResolutions[0].status).toBe('matched');
    expect(ctx.skillResolutions[0].canonicalName).toBe(stepSkill);
    expect(ctx.skillResolutions[0].method).toBe('exact');
  });
});
