const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');
const crypto = require('crypto');
const { TemporaryError, PermanentError } = require('../../shared/src/errors');
const { processJob } = require('../src/process-job');
const { enqueueUnfinishedJobs } = require('../../shared/src/queue');
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

async function seedCandidate() {
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
  return c.rows[0].id;
}

// Creates a file and a queued job for an existing candidate.
// Jobs created later get a bigger id, so they are "newer".
async function seedJobFor(candidateId) {
  const f = await pool.query(
    `INSERT INTO uploaded_files (candidate_id, source_type, original_filename,
       file_size, file_hash, storage_location, uploaded_at, validated_at)
     VALUES ($1, 'cv', 'a.pdf', 1, $2, 'test-location',
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id`,
    [candidateId, crypto.randomUUID()]
  );
  const j = await pool.query(
    `INSERT INTO processing_jobs (file_id, created_at)
     VALUES ($1, CURRENT_TIMESTAMP) RETURNING id`,
    [f.rows[0].id]
  );
  return j.rows[0].id;
}

async function seedJob() {
  return seedJobFor(await seedCandidate());
}

async function getJob(id) {
  const r = await pool.query('SELECT * FROM processing_jobs WHERE id = $1', [
    id
  ]);
  return r.rows[0];
}

describe('processJob', () => {
  it('moves a job from queued to completed', async () => {
    const id = await seedJob();
    const result = await processJob(pool, id, { steps: [ok], sleep: noSleep });
    const job = await getJob(id);
    expect(result).toBe('done');
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
    const result = await processJob(pool, id, { steps: [spy], sleep: noSleep });

    expect(result).toBe('skipped');
    expect(ran).toBe(false);
    expect((await getJob(id)).status).toBe('failed');
  });

  it('does not run the same job twice', async () => {
    const id = await seedJob();
    await processJob(pool, id, { steps: [ok], sleep: noSleep });

    let ran = false;
    const spy = async (ctx) => {
      ran = true;
      return ctx;
    };
    const result = await processJob(pool, id, { steps: [spy], sleep: noSleep });

    const job = await getJob(id);
    expect(result).toBe('skipped');
    expect(ran).toBe(false);
    expect(job.status).toBe('completed');
    expect(job.attempt_count).toBe(1);
  });
});

describe('per-candidate ordering', () => {
  it('does not start the second job until the first one ends', async () => {
    const candidateId = await seedCandidate();
    const first = await seedJobFor(candidateId);
    const second = await seedJobFor(candidateId);

    let ran = false;
    const spy = async (ctx) => {
      ran = true;
      return ctx;
    };

    // the first job is still queued, so the second must wait
    const blocked = await processJob(pool, second, {
      steps: [spy],
      sleep: noSleep
    });
    const waiting = await getJob(second);
    expect(blocked).toBe('blocked');
    expect(ran).toBe(false);
    expect(waiting.status).toBe('queued');
    expect(waiting.attempt_count).toBe(0);

    // the first job runs and ends
    await processJob(pool, first, { steps: [ok], sleep: noSleep });
    expect((await getJob(first)).status).toBe('completed');

    // now the second job can run
    const result = await processJob(pool, second, {
      steps: [spy],
      sleep: noSleep
    });
    expect(result).toBe('done');
    expect(ran).toBe(true);
    expect((await getJob(second)).status).toBe('completed');
  });

  it('lets the next job run after the previous one failed', async () => {
    const candidateId = await seedCandidate();
    const first = await seedJobFor(candidateId);
    const second = await seedJobFor(candidateId);

    const fail = async () => {
      throw new PermanentError('bad file');
    };
    await processJob(pool, first, { steps: [fail], sleep: noSleep });
    expect((await getJob(first)).status).toBe('failed');

    const result = await processJob(pool, second, {
      steps: [ok],
      sleep: noSleep
    });
    expect(result).toBe('done');
    expect((await getJob(second)).status).toBe('completed');
  });

  it('runs jobs of different candidates independently', async () => {
    const a = await seedJob();
    const b = await seedJob();
    const resultB = await processJob(pool, b, { steps: [ok], sleep: noSleep });
    const resultA = await processJob(pool, a, { steps: [ok], sleep: noSleep });
    expect(resultA).toBe('done');
    expect(resultB).toBe('done');
  });
});
describe('restart recovery', () => {
  it('finishes a job left in processing by a crashed worker', async () => {
    const id = await seedJob();
    await pool.query(
      `UPDATE processing_jobs
          SET status = 'processing', attempt_count = 1,
              started_at = CURRENT_TIMESTAMP
        WHERE id = $1`,
      [id]
    );
    const result = await processJob(pool, id, { steps: [ok], sleep: noSleep });
    const job = await getJob(id);
    expect(result).toBe('done');
    expect(job.status).toBe('completed');
    expect(job.attempt_count).toBe(2);
  });

  it('fails a job whose last attempt crashed', async () => {
    const id = await seedJob();
    await pool.query(
      `UPDATE processing_jobs
          SET status = 'processing', attempt_count = 3
        WHERE id = $1`,
      [id]
    );
    const result = await processJob(pool, id, { steps: [ok], sleep: noSleep });
    const job = await getJob(id);
    expect(result).toBe('skipped');
    expect(job.status).toBe('failed');
    expect(job.failure_reason).toBe('Maximum attempts reached');
  });
});

async function waitFor(condition) {
  for (let i = 0; i < 100; i += 1) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('timeout');
}

describe('locking', () => {
  it('does not run the same job twice at the same time', async () => {
    const id = await seedJob();
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    let runs = 0;
    const slow = async (ctx) => {
      runs += 1;
      await gate;
      return ctx;
    };

    const first = processJob(pool, id, { steps: [slow], sleep: noSleep });
    await waitFor(() => runs === 1);

    const second = await processJob(pool, id, {
      steps: [slow],
      sleep: noSleep
    });
    release();
    await first;

    expect(second).toBe('blocked');
    expect(runs).toBe(1);
    expect((await getJob(id)).status).toBe('completed');
  });
});

describe('enqueueUnfinishedJobs', () => {
  it('sends queued and processing jobs, not finished ones', async () => {
    const queued = await seedJob();
    const processing = await seedJob();
    const done = await seedJob();
    await pool.query(
      `UPDATE processing_jobs SET status = 'processing' WHERE id = $1`,
      [processing]
    );
    await pool.query(
      `UPDATE processing_jobs SET status = 'completed' WHERE id = $1`,
      [done]
    );

    const sent = [];
    const fakeBoss = { send: async (name, data) => sent.push(data.jobId) };
    await enqueueUnfinishedJobs(fakeBoss, pool);

    expect(sent).toContain(queued);
    expect(sent).toContain(processing);
    expect(sent).not.toContain(done);
  });
});
