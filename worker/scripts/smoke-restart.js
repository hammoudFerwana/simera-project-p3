// Manual check: a worker killed in the middle of a job, then a new worker
// finishes the job. Runs on the main database.
// Run: node worker/scripts/smoke-restart.js
const { spawn } = require('child_process');
const crypto = require('crypto');
const pool = require('../../shared/src/database');
const { loadConfig } = require('../../shared/src/config');
const {
  startBoss,
  startWorker,
  enqueueUnfinishedJobs
} = require('../../shared/src/queue');
const { processJob } = require('../src/process-job');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Child mode: a worker with a slow step.
async function runWorker() {
  const boss = await startBoss(loadConfig().DATABASE_URL);
  const slow = async (ctx) => {
    await sleep(8000);
    return ctx;
  };
  await startWorker(boss, pool, (db, id) =>
    processJob(db, id, { steps: [slow] })
  );
  await enqueueUnfinishedJobs(boss, pool);
  console.log('child worker ready');
}

const spawnWorker = () =>
  spawn(process.execPath, [__filename, 'worker'], { stdio: 'inherit' });

async function waitForStatus(jobId, status) {
  for (let i = 0; i < 60; i += 1) {
    const r = await pool.query(
      'SELECT status FROM processing_jobs WHERE id = $1',
      [jobId]
    );
    if (r.rows[0].status === status) return true;
    await sleep(1000);
  }
  return false;
}

async function main() {
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
  const f = await pool.query(
    `INSERT INTO uploaded_files (candidate_id, source_type, original_filename,
       file_size, file_hash, storage_location, uploaded_at, validated_at)
     VALUES ($1, 'cv', 'smoke.pdf', 1, $2, 'smoke',
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id`,
    [c.rows[0].id, crypto.randomUUID()]
  );
  const j = await pool.query(
    `INSERT INTO processing_jobs (file_id, created_at)
     VALUES ($1, CURRENT_TIMESTAMP) RETURNING id`,
    [f.rows[0].id]
  );
  const jobId = j.rows[0].id;

  const first = spawnWorker();
  const started = await waitForStatus(jobId, 'processing');
  console.log('job is processing:', started);

  first.kill('SIGKILL'); // the worker dies in the middle of the job
  console.log('worker killed');
  await sleep(2000);

  const second = spawnWorker(); // a new worker takes the unfinished job
  const completed = await waitForStatus(jobId, 'completed');
  console.log('job completed after restart:', completed);

  second.kill('SIGTERM');
  await pool.query('DELETE FROM processing_jobs WHERE id = $1', [jobId]);
  await pool.query('DELETE FROM uploaded_files WHERE id = $1', [f.rows[0].id]);
  await pool.query('DELETE FROM candidate_profiles WHERE id = $1', [
    c.rows[0].id
  ]);
  await pool.query('DELETE FROM users WHERE id = $1', [u.rows[0].id]);
  await pool.end();
}

const entry = process.argv[2] === 'worker' ? runWorker : main;
entry().catch((err) => {
  console.error(err);
  process.exit(1);
});
