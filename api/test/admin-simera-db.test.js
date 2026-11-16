/**
 * US-22 integration tests on the real simera_test database: the send button
 * against real PostgreSQL (row lock, unique file_id, ON CONFLICT), which the
 * fake DB in admin-simera.test.js can only imitate.
 *
 * Needs TEST_DATABASE_URL in .env (a database whose name starts with
 * simera_test, with shared/sql/schema.sql applied). No pg-boss: the queue is
 * a fake.
 */
const path = require('path');
const crypto = require('crypto');
const request = require('supertest');
const { Pool } = require('pg');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { createApp } = require('../src/app');
const { signToken } = require('../src/auth/token');
const { createProcessingJob } = require('shared/src/upload/processing-jobs');

process.env.JWT_SECRET = 'test-secret-for-us-22-db';

const RUN_ID = crypto.randomBytes(4).toString('hex');
let counter = 0;
const nextId = () => `${RUN_ID}-${(counter += 1)}`;

let pool;
let app;
let enqueueJob;
const created = { userIds: [], candidateIds: [], fileIds: [] };

beforeAll(async () => {
  if (!process.env.TEST_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL must be set in .env');
  }
  pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });

  const { rows } = await pool.query('SELECT current_database() AS name');
  if (!rows[0].name.startsWith('simera_test')) {
    await pool.end();
    throw new Error(
      `Database tests must run on a database starting with simera_test, not ${rows[0].name}`
    );
  }
});

beforeEach(() => {
  enqueueJob = jest.fn(async () => {});
  app = createApp({ getDb: () => pool, enqueueJob });
});

afterAll(async () => {
  if (!pool) return;
  await pool.query('DELETE FROM processing_jobs WHERE file_id = ANY($1)', [
    created.fileIds
  ]);
  await pool.query('DELETE FROM uploaded_files WHERE id = ANY($1)', [
    created.fileIds
  ]);
  await pool.query('DELETE FROM candidate_profiles WHERE id = ANY($1)', [
    created.candidateIds
  ]);
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [created.userIds]);
  await pool.end();
});

/** A verified candidate with a profile; returns candidate_profiles.id. */
async function insertCandidate() {
  const user = await pool.query(
    `INSERT INTO users (email, password_hash, email_verified, created_at)
    VALUES ($1, 'hash', true, CURRENT_TIMESTAMP)
    RETURNING id`,
    [`us22-${nextId()}@example.com`]
  );
  created.userIds.push(user.rows[0].id);

  const profile = await pool.query(
    `INSERT INTO candidate_profiles (user_id, created_at)
    VALUES ($1, CURRENT_TIMESTAMP)
    RETURNING id`,
    [user.rows[0].id]
  );
  created.candidateIds.push(profile.rows[0].id);
  return profile.rows[0].id;
}

/** A Simera file row (the raw file itself is not needed to send). */
async function insertSimeraFile(candidateId, name) {
  const { rows } = await pool.query(
    `INSERT INTO uploaded_files (
      candidate_id, source_type, original_filename, file_size, file_hash,
      storage_location, mime_type, uploaded_at, validated_at
    )
    VALUES ($1, 'simera_profile', $2, 100, $3, $4, 'application/json',
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING id`,
    [
      candidateId,
      name,
      crypto.createHash('sha256').update(nextId()).digest('hex'),
      `${nextId()}.json`
    ]
  );
  created.fileIds.push(rows[0].id);
  return rows[0].id;
}

const jobsOf = async (fileId) =>
  (
    await pool.query(
      'SELECT id, status, created_at FROM processing_jobs WHERE file_id = $1',
      [fileId]
    )
  ).rows;

const adminCookie = () =>
  `access_token=${signToken({ userId: 1, role: 'admin' })}`;

const send = (candidateId) =>
  request(app)
    .post(`/api/admin/candidates/${candidateId}/simera/send`)
    .set('Cookie', adminCookie());

const getSection = (candidateId) =>
  request(app)
    .get(`/api/admin/candidates/${candidateId}/simera`)
    .set('Cookie', adminCookie());

describe('Simera send button on PostgreSQL (US-22)', () => {
  test('a click creates one queued job and sends it once', async () => {
    const candidateId = await insertCandidate();
    const fileId = await insertSimeraFile(candidateId, 'v1.json');

    const response = await send(candidateId);

    expect(response.status).toBe(202);
    const jobs = await jobsOf(fileId);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe('queued');
    expect(jobs[0].created_at).toBeInstanceOf(Date);
    expect(response.body).toEqual({
      message: 'Simera file sent to processing',
      fileId,
      jobId: jobs[0].id
    });
    expect(enqueueJob).toHaveBeenCalledTimes(1);
    expect(enqueueJob).toHaveBeenCalledWith(jobs[0].id);
  });

  test('clicks at the same time create exactly one job', async () => {
    const candidateId = await insertCandidate();
    const fileId = await insertSimeraFile(candidateId, 'v1.json');

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => send(candidateId))
    );

    const statuses = responses.map((r) => r.status).sort();
    expect(statuses).toEqual([202, 409, 409, 409, 409]);
    for (const refused of responses.filter((r) => r.status === 409)) {
      expect(refused.body.reason).toBe('simera_processing');
    }
    expect(await jobsOf(fileId)).toHaveLength(1);
    expect(enqueueJob).toHaveBeenCalledTimes(1);
  });

  test('ON CONFLICT: a second job for the same file is never inserted', async () => {
    const candidateId = await insertCandidate();
    const fileId = await insertSimeraFile(candidateId, 'v1.json');

    const results = await Promise.all([
      createProcessingJob(pool, fileId),
      createProcessingJob(pool, fileId)
    ]);

    expect(results.filter((id) => id === null)).toHaveLength(1);
    expect(await jobsOf(fileId)).toHaveLength(1);
  });

  test('v2 cannot be sent while v1 runs, and can once v1 has finished', async () => {
    const candidateId = await insertCandidate();
    const v1 = await insertSimeraFile(candidateId, 'v1.json');
    expect((await send(candidateId)).status).toBe(202);
    const v2 = await insertSimeraFile(candidateId, 'v2.json');

    const section = await getSection(candidateId);
    expect(section.body).toMatchObject({
      file: { id: v2 },
      status: 'not_sent',
      canSend: false,
      disabledReason: 'Another Simera file of this candidate is being processed'
    });
    const refused = await send(candidateId);
    expect(refused.status).toBe(409);
    expect(refused.body.reason).toBe('simera_processing');
    expect(await jobsOf(v2)).toHaveLength(0);

    await pool.query(
      `UPDATE processing_jobs SET status = 'completed' WHERE file_id = $1`,
      [v1]
    );
    const response = await send(candidateId);
    expect(response.status).toBe(202);
    expect(await jobsOf(v2)).toHaveLength(1);
  });

  test('a failed job is shown as failed and never rerun', async () => {
    const candidateId = await insertCandidate();
    const fileId = await insertSimeraFile(candidateId, 'v1.json');
    expect((await send(candidateId)).status).toBe(202);
    await pool.query(
      `UPDATE processing_jobs
      SET status = 'failed', failure_reason = 'Maximum attempts reached'
      WHERE file_id = $1`,
      [fileId]
    );

    const section = await getSection(candidateId);
    expect(section.body).toMatchObject({
      status: 'failed',
      job: { failureReason: 'Maximum attempts reached' },
      canSend: false,
      disabledReason: 'Processing failed. Upload a corrected Simera file'
    });
    const refused = await send(candidateId);
    expect(refused.status).toBe(409);
    expect(refused.body.reason).toBe('simera_failed');
    expect(await jobsOf(fileId)).toHaveLength(1);
  });

  test('an unknown candidate is a 404 and nothing is created', async () => {
    const response = await send(2147483000);

    expect(response.status).toBe(404);
    expect(enqueueJob).not.toHaveBeenCalled();
  });
});
