/**
 * Creates the one processing job of an uploaded file. Used by the upload
 * service (CV, LinkedIn) and by the Simera send button (US-22).
 *
 * processing_jobs.file_id is unique, so a second call for the same file
 * creates nothing, even when two calls run at the same time. The status keeps
 * its default ('queued'); the worker fills the rest.
 *
 * @param {{ query: Function }} db a pg Pool or a client inside a transaction
 * @param {number} fileId
 * @returns {Promise<number | null>} the new job id, or null when the file
 *   already has a job
 */
async function createProcessingJob(db, fileId) {
  const { rows } = await db.query(
    `INSERT INTO processing_jobs (file_id, created_at)
    VALUES ($1, CURRENT_TIMESTAMP)
    ON CONFLICT (file_id) DO NOTHING
    RETURNING id`,
    [fileId]
  );
  return rows.length > 0 ? rows[0].id : null;
}

module.exports = { createProcessingJob };
