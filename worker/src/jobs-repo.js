// Claim one attempt. Returns null if the job must not run
// (already finished, failed, or out of attempts).
async function startAttempt(db, jobId, maxAttempts) {
  const { rows } = await db.query(
    `UPDATE processing_jobs j
        SET status = 'processing',
            started_at = COALESCE(j.started_at, NOW()),
            attempt_count = j.attempt_count + 1,
            next_retry_at = NULL
       FROM uploaded_files f
      WHERE j.id = $1
        AND f.id = j.file_id
        AND j.status IN ('queued', 'processing')
        AND j.attempt_count < $2
        AND NOT EXISTS (
          SELECT 1
            FROM processing_jobs j2
            JOIN uploaded_files f2 ON f2.id = j2.file_id
           WHERE f2.candidate_id = f.candidate_id
             AND j2.id < j.id
             AND j2.status IN ('queued', 'processing')
        )
      RETURNING j.*, f.candidate_id`,
    [jobId, maxAttempts]
  );
  return rows[0] || null;
}

async function getJob(db, jobId) {
  const { rows } = await db.query(
    'SELECT * FROM processing_jobs WHERE id = $1',
    [jobId]
  );
  return rows[0] || null;
}

// A job that crashed on its last attempt is closed as failed.
async function failIfExhausted(db, jobId, maxAttempts) {
  await db.query(
    `UPDATE processing_jobs
        SET status = 'failed', completed_at = NOW(),
            failure_reason = 'Maximum attempts reached'
      WHERE id = $1 AND status = 'processing' AND attempt_count >= $2`,
    [jobId, maxAttempts]
  );
}

async function scheduleRetry(db, jobId, delayMs) {
  await db.query(
    `UPDATE processing_jobs
        SET next_retry_at = NOW() + ($2 * INTERVAL '1 millisecond')
      WHERE id = $1 AND status = 'processing'`,
    [jobId, delayMs]
  );
}

async function markFailed(db, jobId, reason) {
  await db.query(
    `UPDATE processing_jobs
        SET status = 'failed', completed_at = NOW(),
            next_retry_at = NULL, failure_reason = $2
      WHERE id = $1 AND status = 'processing'`,
    [jobId, reason]
  );
}

async function markCompleted(
  db,
  jobId,
  { changedFieldCount, pendingReviewCount }
) {
  await db.query(
    `UPDATE processing_jobs
        SET status = CASE WHEN $3 > 0 THEN 'completed_with_review'
                          ELSE 'completed' END::processing_status,
            completed_at = NOW(), next_retry_at = NULL,
            changed_field_count = $2, pending_review_count = $3
      WHERE id = $1 AND status = 'processing'`,
    [jobId, changedFieldCount, pendingReviewCount]
  );
}

module.exports = {
  startAttempt,
  failIfExhausted,
  scheduleRetry,
  markFailed,
  markCompleted,
  getJob
};
