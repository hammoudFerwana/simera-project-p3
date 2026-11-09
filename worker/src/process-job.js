const { PermanentError } = require('.../../shared/src/errors');
const { runSteps } = require('./orchestrator');
const repo = require('./jobs-repo');

const MAX_ATTEMPTS = 3;
const DELAYS_MS = [30_000, 120_000]; // increasing delay between attempts
const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function processJob(db, jobId, { steps, sleep = realSleep, delaysMs = DELAYS_MS } = {}) {
  for (;;) {
    const job = await repo.startAttempt(db, jobId, MAX_ATTEMPTS);
    if (!job) {
      await repo.failIfExhausted(db, jobId, MAX_ATTEMPTS);
      return; // finished, failed, or missing: never run again
    }

    try {
      const ctx = await runSteps(
        { jobId, fileId: job.file_id, candidateId: job.candidate_id,
          changedFieldCount: 0, pendingReviewCount: 0 },
        steps
      );
      await repo.markCompleted(db, jobId, ctx);
      return;
    } catch (err) {
      // classify by type, never by message text
      const permanent = err instanceof PermanentError;
      if (permanent || job.attempt_count >= MAX_ATTEMPTS) {
        await repo.markFailed(db, jobId, err.message);
        return;
      }
      const delay = delaysMs[job.attempt_count - 1] ?? delaysMs[delaysMs.length - 1];
      await repo.scheduleRetry(db, jobId, delay);
      await sleep(delay); // the job stays active, so the candidate's next job waits
    }
  }
}

module.exports = { processJob, MAX_ATTEMPTS };