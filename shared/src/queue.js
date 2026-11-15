const PgBoss = require('pg-boss');

const QUEUE = 'process-file';

async function startBoss(connectionString) {
  const boss = new PgBoss(connectionString);
  boss.on('error', (err) => console.error('pg-boss error:', err.message));
  await boss.start();
  await boss.createQueue(QUEUE);
  return boss;
}

// The API calls this right after committing the processing_jobs row.
function enqueueJob(boss, jobId) {
  return boss.send(
    QUEUE,
    { jobId },
    {
      retryLimit: 10000, // a blocked job keeps coming back until its turn
      retryDelay: 15, // seconds
      expireInSeconds: 30 * 60 // a job whose worker died comes back after this
    }
  );
}

// Sends every unfinished job to the queue:
// - 'queued': the send may have failed in the API
// - 'processing': the worker that had it stopped, and pg-boss would give it
//   back only after expireInSeconds
// A job that is already in pg-boss may be sent twice. That is safe: the
// candidate lock and the job state make the second run do nothing.
async function enqueueUnfinishedJobs(boss, db) {
  const { rows } = await db.query(
    `SELECT id FROM processing_jobs
      WHERE status IN ('queued', 'processing')
      ORDER BY id`
  );
  for (const { id } of rows) {
    await enqueueJob(boss, id);
  }
  return rows.length;
}

async function startWorker(boss, db, handle) {
  await boss.work(
    QUEUE,
    { batchSize: 1, pollingIntervalSeconds: 2 },
    async (jobs) => {
      for (const job of jobs) {
        const result = await handle(db, job.data.jobId);
        // an older job of the same candidate is not finished yet:
        // throwing makes pg-boss try this one again after retryDelay
        if (result === 'blocked') {
          throw new Error('Waiting for the previous job of this candidate');
        }
      }
    }
  );
}

module.exports = {
  startBoss,
  enqueueJob,
  enqueueUnfinishedJobs,
  startWorker,
  QUEUE
};
