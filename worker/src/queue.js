const PgBoss = require('pg-boss');

const QUEUE = 'process-file';

async function startBoss(connectionString) {
  const boss = new PgBoss(connectionString);
  boss.on('error', (err) => console.error('pg-boss error:', err.message));
  await boss.start();
  await boss.createQueue(QUEUE);
  return boss;
}

// US-04 and US-22 call this right after inserting the processing_jobs row.
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

async function startWorker(boss, db, process) {
  await boss.work(
    QUEUE,
    { batchSize: 1, pollingIntervalSeconds: 2 },
    async (jobs) => {
      for (const job of jobs) {
        const result = await process(db, job.data.jobId);
        // an older job of the same candidate is not finished yet:
        // throwing makes pg-boss try this one again after retryDelay
        if (result === 'blocked') {
          throw new Error('Waiting for the previous job of this candidate');
        }
      }
    }
  );
}

module.exports = { startBoss, enqueueJob, startWorker, QUEUE };
