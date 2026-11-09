const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');
const crypto = require('crypto');
const { TemporaryError, PermanentError } =require('.../../shared/src/errors');
const { processJob } = require('../src/process-job');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

let pool;
let createdEmails = [];
const noSleep = async () => {};
const ok = async (ctx) => ctx;

beforeAll(async () => {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!testDatabaseUrl) {
    throw new Error('TEST_DATABASE_URL must be set in .env');
  }
  pool = new Pool({ connectionString: testDatabaseUrl });

  const result = await pool.query('SELECT current_database() AS name');
  if (result.rows[0].name !== 'simera_test') {
    await pool.end();
    throw new Error(
      `Database tests must run on simera_test, not ${result.rows[0].name}`
    );
  }
});

afterEach(async () => {
  if (createdEmails.length > 0) {
    const candidates = `SELECT cp.id FROM candidate_profiles cp
      JOIN users u ON u.id = cp.user_id WHERE u.email = ANY($1::varchar[])`;
    await pool.query(
      `DELETE FROM processing_jobs WHERE file_id IN
         (SELECT id FROM uploaded_files WHERE candidate_id IN (${candidates}))`,
      [createdEmails]
    );
    await pool.query(
      `DELETE FROM uploaded_files WHERE candidate_id IN (${candidates})`,
      [createdEmails]
    );
    await pool.query(
      `DELETE FROM candidate_profiles WHERE user_id IN
         (SELECT id FROM users WHERE email = ANY($1::varchar[]))`,
      [createdEmails]
    );
    await pool.query('DELETE FROM users WHERE email = ANY($1::varchar[])', [
      createdEmails
    ]);
    createdEmails = [];
  }
});

afterAll(async () => {
  if (pool) await pool.end();
});

async function seedJob() {
  const email = `test-job-${crypto.randomUUID()}@example.com`;
  createdEmails.push(email);

  const u = await pool.query(
    `INSERT INTO users (email, password_hash, created_at)
     VALUES ($1, 'test-password-hash', CURRENT_TIMESTAMP) RETURNING id`,
    [email]
  );
  const c = await pool.query(
    `INSERT INTO candidate_profiles (user_id, created_at)
     VALUES ($1, CURRENT_TIMESTAMP) RETURNING id`,
    [u.rows[0].id]
  );
  const f = await pool.query(
    `INSERT INTO uploaded_files (candidate_id, source_type, original_filename,
       file_size, file_hash, storage_location, uploaded_at, validated_at)
     VALUES ($1, 'cv', 'a.pdf', 1, $2, 'test-location',
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id`,
    [c.rows[0].id, crypto.randomUUID()]
  );
  const j = await pool.query(
    `INSERT INTO processing_jobs (file_id, created_at)
     VALUES ($1, CURRENT_TIMESTAMP) RETURNING id`,
    [f.rows[0].id]
  );
  return j.rows[0].id;
}

async function getJob(id) {
  const r = await pool.query('SELECT * FROM processing_jobs WHERE id = $1', [id]);
  return r.rows[0];
}

describe('processJob', () => {
  it('moves a job from queued to completed', async () => {
    const id = await seedJob();
    await processJob(pool, id, { steps: [ok], sleep: noSleep });
    const job = await getJob(id);
    expect(job.status).toBe('completed');
    expect(job.completed_at).not.toBeNull();
    expect(job.started_at).not.toBeNull();
  });

  it('ends as completed_with_review when review items exist', async () => {
    const id = await seedJob();
    const step = async (ctx) => ({ ...ctx, pendingReviewCount: 2 });
    await processJob(pool, id, { steps: [step], sleep: noSleep });
    const job = await getJob(id);
    expect(job.status).toBe('completed_with_review');
    expect(job.pending_review_count).toBe(2);
  });

  it('fails at once on a PermanentError with no retry', async () => {
    const id = await seedJob();
    const step = async () => {
      throw new PermanentError('corrupted file');
    };
    await processJob(pool, id, { steps: [step], sleep: noSleep });
    const job = await getJob(id);
    expect(job.status).toBe('failed');
    expect(job.attempt_count).toBe(1);
    expect(job.failure_reason).toBe('corrupted file');
    expect(job.completed_at).not.toBeNull();
  });

  it('fails after 3 attempts on repeated TemporaryError', async () => {
    const id = await seedJob();
    const step = async () => {
      throw new TemporaryError('LLM connection lost');
    };
    await processJob(pool, id, { steps: [step], sleep: noSleep });
    const job = await getJob(id);
    expect(job.status).toBe('failed');
    expect(job.attempt_count).toBe(3);
    expect(job.failure_reason).toBe('LLM connection lost');
  });

  it('waits with an increasing delay between attempts', async () => {
    const id = await seedJob();
    const delays = [];
    const step = async () => {
      throw new TemporaryError('blip');
    };
    await processJob(pool, id, {
      steps: [step],
      sleep: async (ms) => delays.push(ms),
      delaysMs: [10, 20]
    });
    expect(delays).toEqual([10, 20]);
  });

  it('completes when a TemporaryError is followed by success', async () => {
    const id = await seedJob();
    let calls = 0;
    const step = async (ctx) => {
      calls += 1;
      if (calls < 2) throw new TemporaryError('blip');
      return ctx;
    };
    await processJob(pool, id, { steps: [step], sleep: noSleep });
    const job = await getJob(id);
    expect(job.status).toBe('completed');
    expect(job.attempt_count).toBe(2);
  });

  it('never runs a failed job again', async () => {
    const id = await seedJob();
    const fail = async () => {
      throw new PermanentError('bad file');
    };
    await processJob(pool, id, { steps: [fail], sleep: noSleep });

    let ran = false;
    const spy = async (ctx) => {
      ran = true;
      return ctx;
    };
    await processJob(pool, id, { steps: [spy], sleep: noSleep });

    expect(ran).toBe(false);
    expect((await getJob(id)).status).toBe('failed');
  });
});