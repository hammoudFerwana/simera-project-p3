const { PermanentError } = require('../../shared/src/errors');
const { runSteps } = require('./orchestrator');
const repo = require('./jobs-repo');

const MAX_ATTEMPTS = 3;
const DELAYS_MS = [30_000, 120_000]; // increasing delay between attempts
const LOCK_NAMESPACE = 7305; // any fixed number, the same in every worker
const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Runs one job with its retries. This is the old processJob, unchanged.
async function runJob(
  db,
  jobId,
  { steps, sleep = realSleep, delaysMs = DELAYS_MS } = {}
) {
  for (;;) {
    const job = await repo.startAttempt(db, jobId, MAX_ATTEMPTS);

    if (!job) {
      const current = await repo.getJob(db, jobId);
      const waiting =
        current &&
        ['queued', 'processing'].includes(current.status) &&
        current.attempt_count < MAX_ATTEMPTS;
      if (waiting) return 'blocked';

      await repo.failIfExhausted(db, jobId, MAX_ATTEMPTS);
      return 'skipped';
    }

    try {
      const ctx = await runSteps(
        {
          jobId,
          fileId: job.file_id,
          candidateId: job.candidate_id,
          changedFieldCount: 0,
          pendingReviewCount: 0
        },
        steps
      );
      await repo.markCompleted(db, jobId, ctx);
      return 'done';
    } catch (err) {
      // classify by type, never by message text
      const permanent = err instanceof PermanentError;
      if (permanent || job.attempt_count >= MAX_ATTEMPTS) {
        await repo.markFailed(db, jobId, err.message);
        return 'done';
      }
      const delay =
        delaysMs[job.attempt_count - 1] ?? delaysMs[delaysMs.length - 1];
      await repo.scheduleRetry(db, jobId, delay);
      await sleep(delay); // the job stays active, so the candidate's next job waits
    }
  }
}

// Returns:
//   'done'    the job ran and finished (completed or failed)
//   'blocked' an older job of the same candidate is still queued or processing,
//             or this candidate is already being processed by another run
//   'skipped' the job is already finished, failed, or missing: never run again
//
// One lock per candidate is held while a job of that candidate runs. If the
// worker dies, its connection closes and the lock is released by PostgreSQL.
async function processJob(db, jobId, options = {}) {
  const candidateId = await repo.getCandidateId(db, jobId);
  if (candidateId === null) return 'skipped'; // no such job

  const client = await db.connect();
  let broken;
  try {
    const { rows } = await client.query(
      'SELECT pg_try_advisory_lock($1, $2) AS locked',
      [LOCK_NAMESPACE, candidateId]
    );
    if (!rows[0].locked) return 'blocked';

    try {
      return await runJob(db, jobId, options);
    } finally {
      try {
        await client.query('SELECT pg_advisory_unlock($1, $2)', [
          LOCK_NAMESPACE,
          candidateId
        ]);
      } catch (error) {
        broken = error; // the connection is in an unknown state: destroy it
      }
    }
  } finally {
    client.release(broken);
  }
}

module.exports = { processJob, MAX_ATTEMPTS };
