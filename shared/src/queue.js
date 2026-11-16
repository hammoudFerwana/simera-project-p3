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

// pg-boss keeps its jobs in this schema (its default).
const BOSS_SCHEMA = 'pgboss';

// Jobs whose send to the queue was lost: 'queued' in processing_jobs, older
// than the grace period (so a send the API is still making is not doubled),
// and with no live pg-boss job (created, retry or active) for that id.
const LOST_JOBS_SQL = `SELECT pj.id
  FROM processing_jobs pj
  WHERE pj.status = 'queued'
    AND pj.created_at < CURRENT_TIMESTAMP - make_interval(secs => $2)
    AND NOT EXISTS (
      SELECT 1
      FROM ${BOSS_SCHEMA}.job b
      WHERE b.name = $1
        AND b.state IN ('created', 'retry', 'active')
        AND b.data->>'jobId' = pj.id::text
    )
  ORDER BY pj.id`;

// Sends the lost jobs (see LOST_JOBS_SQL) to the queue; returns how many.
async function enqueueLostJobs(boss, db, { graceSeconds = 60 } = {}) {
  const { rows } = await db.query(LOST_JOBS_SQL, [QUEUE, graceSeconds]);
  for (const { id } of rows) {
    await enqueueJob(boss, id);
  }
  return rows.length;
}

// Runs enqueueLostJobs every intervalSeconds, so a job whose send failed in
// the API is processed without a worker restart. A run that fails is logged
// and the next one tries again. Returns a function that stops the sweep.
function startQueueSweep(
  boss,
  db,
  { intervalSeconds = 60, graceSeconds = 60, logger = console } = {}
) {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return; // the previous run is still going
    running = true;
    try {
      const sent = await enqueueLostJobs(boss, db, { graceSeconds });
      if (sent > 0) {
        logger.log(`queue sweep: ${sent} lost job(s) sent to the queue`);
      }
    } catch (error) {
      logger.error('queue sweep failed:', error.message);
    } finally {
      running = false;
    }
  }, intervalSeconds * 1000);
  timer.unref();
  return () => clearInterval(timer);
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
  enqueueLostJobs,
  startQueueSweep,
  startWorker,
  QUEUE
};
