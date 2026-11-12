const crypto = require('crypto');
const pool = require('../../shared/src/database');
const { loadConfig } = require('../../shared/src/config');
const {
  startBoss,
  startWorker,
  enqueueJob
} = require('../../shared/src/queue');
const { processJob } = require('../src/process-job');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function createJob(candidateId) {
  const f = await pool.query(
    `INSERT INTO uploaded_files (candidate_id, source_type, original_filename,
       file_size, file_hash, storage_location, uploaded_at, validated_at)
     VALUES ($1, 'cv', 'smoke.pdf', 1, $2, 'smoke',
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

async function main() {
  const config = loadConfig();
  const boss = await startBoss(config.DATABASE_URL);

  const slow = async (ctx) => {
    console.log('START job', ctx.jobId);
    await sleep(3000);
    console.log('END   job', ctx.jobId);
    return ctx;
  };
  await startWorker(boss, pool, (db, id) =>
    processJob(db, id, { steps: [slow] })
  );

  const email = `smoke-${crypto.randomUUID()}@example.com`;
  const u = await pool.query(
    `INSERT INTO users (email, password_hash, created_at)
     VALUES ($1, 'smoke', CURRENT_TIMESTAMP) RETURNING id`,
    [email]
  );
  const c = await pool.query(
    `INSERT INTO candidate_profiles (user_id, created_at)
     VALUES ($1, CURRENT_TIMESTAMP) RETURNING id`,
    [u.rows[0].id]
  );
  const candidateId = c.rows[0].id;

  const first = await createJob(candidateId);
  const second = await createJob(candidateId);
  console.log('first job:', first, 'second job:', second);

  // the second job is sent first on purpose: it must wait for the first one
  await enqueueJob(boss, second);
  await enqueueJob(boss, first);

  const ids = [first, second];
  for (let i = 0; i < 60; i += 1) {
    const r = await pool.query(
      'SELECT id, status FROM processing_jobs WHERE id = ANY($1::int[])',
      [ids]
    );
    if (r.rows.every((row) => row.status === 'completed')) break;
    await sleep(2000);
  }
  const final = await pool.query(
    'SELECT id, status, started_at, completed_at FROM processing_jobs WHERE id = ANY($1::int[]) ORDER BY id',
    [ids]
  );
  console.table(final.rows);

  await pool.query('DELETE FROM processing_jobs WHERE id = ANY($1::int[])', [
    ids
  ]);
  await pool.query('DELETE FROM uploaded_files WHERE candidate_id = $1', [
    candidateId
  ]);
  await pool.query('DELETE FROM candidate_profiles WHERE id = $1', [
    candidateId
  ]);
  await pool.query('DELETE FROM users WHERE id = $1', [u.rows[0].id]);

  await boss.stop();
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
