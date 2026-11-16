/**
 * Simera file (US-22): the dev team uploads a candidate's Simera JSON, and
 * the admin sends it to processing from the candidate page.
 *
 * - Upload: the shared upload service with source_type simera_profile and no
 *   job. The candidate is the registered, verified user whose email is the
 *   JSON's top-level "email".
 * - Section: the newest Simera file of the candidate and its status.
 * - Send: exactly one job for that file (processing_jobs.file_id is unique).
 */

const { UploadError } = require('shared/src/upload/upload.service');

const SOURCE_TYPE = 'simera_profile';

const DISABLED_REASONS = {
  noFile: 'No Simera file exists for this candidate',
  processing: 'This Simera file is being processed',
  alreadySent: 'This Simera file was already sent to processing'
};

/** Expected refusal of the send button, sent as { errors, reason }. */
class SimeraSendError extends Error {
  constructor({ status, reason, message }) {
    super(message);
    this.name = 'SimeraSendError';
    this.status = status;
    this.field = 'simera';
    this.reason = reason;
  }
}

const simeraUploadErrors = {
  emailMissing: () =>
    new UploadError({
      status: 400,
      reason: 'simera_email_missing',
      message:
        'The Simera file must be a JSON object with a top-level "email" field'
    }),
  emailNotRegistered: () =>
    new UploadError({
      status: 422,
      reason: 'simera_email_not_registered',
      message: 'No registered candidate has the email in this Simera file'
    }),
  emailNotVerified: () =>
    new UploadError({
      status: 422,
      reason: 'simera_email_not_verified',
      message:
        'The candidate with the email in this Simera file has not verified their email yet'
    })
};

/** Reads the top-level "email" of the Simera JSON, trimmed and lowercased. */
function readSimeraEmail(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return null;
  }
  const email = typeof data.email === 'string' ? data.email.trim() : '';
  return email === '' ? null : email.toLowerCase();
}

/**
 * Returns a resolveCandidateId function for processUpload: the candidate
 * whose login email is the JSON's email, registered and verified.
 *
 * @param {{ query: Function }} db
 * @returns {(text: string) => Promise<number>}
 * @throws {UploadError} when the email is missing, unknown or not verified
 */
function createSimeraCandidateResolver(db) {
  return async function resolveSimeraCandidate(text) {
    const email = readSimeraEmail(text);
    if (!email) {
      throw simeraUploadErrors.emailMissing();
    }

    // Emails are stored lowercased (US-01). Admins have no candidate profile.
    const { rows } = await db.query(
      `SELECT cp.id AS candidate_id, u.email_verified
      FROM users u
      JOIN candidate_profiles cp ON cp.user_id = u.id
      WHERE u.email = $1`,
      [email]
    );
    const row = rows[0];
    if (!row) {
      throw simeraUploadErrors.emailNotRegistered();
    }
    if (!row.email_verified) {
      throw simeraUploadErrors.emailNotVerified();
    }
    return row.candidate_id;
  };
}

/**
 * The section state from the newest Simera file row (or none).
 *
 * Statuses: not_sent (no job), processing (queued, processing), completed
 * (completed, completed_with_review), failed. Only not_sent can be sent:
 * one job per file, and a failed job is never rerun.
 */
function buildSection(candidateId, row) {
  if (!row) {
    return {
      candidateId,
      file: null,
      job: null,
      status: null,
      canSend: false,
      disabledReason: DISABLED_REASONS.noFile
    };
  }

  const file = {
    id: row.file_id,
    name: row.original_filename,
    uploadedAt: row.uploaded_at,
    rawUrl: `/api/uploads/${row.file_id}/raw`
  };

  if (row.job_id == null) {
    return {
      candidateId,
      file,
      job: null,
      status: 'not_sent',
      canSend: true,
      disabledReason: null
    };
  }

  let status;
  let disabledReason = DISABLED_REASONS.alreadySent;
  if (['queued', 'processing'].includes(row.job_status)) {
    status = 'processing';
    disabledReason = DISABLED_REASONS.processing;
  } else if (row.job_status === 'failed') {
    status = 'failed';
  } else {
    status = 'completed';
  }

  return {
    candidateId,
    file,
    job: {
      id: row.job_id,
      status: row.job_status,
      createdAt: row.job_created_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      failureReason: row.failure_reason,
      pendingReviewCount: row.pending_review_count
    },
    status,
    canSend: false,
    disabledReason
  };
}

/** @returns {Promise<boolean>} whether the candidate profile exists */
async function candidateExists(db, candidateId) {
  const { rows } = await db.query(
    'SELECT 1 FROM candidate_profiles WHERE id = $1',
    [candidateId]
  );
  return rows.length > 0;
}

/** The newest Simera file of the candidate with its job, if any. */
async function findLatestSimeraFile(db, candidateId) {
  const { rows } = await db.query(
    `SELECT
      uf.id AS file_id,
      uf.original_filename,
      uf.uploaded_at,
      pj.id AS job_id,
      pj.status AS job_status,
      pj.created_at AS job_created_at,
      pj.started_at,
      pj.completed_at,
      pj.failure_reason,
      pj.pending_review_count
    FROM uploaded_files uf
    LEFT JOIN processing_jobs pj ON pj.file_id = uf.id
    WHERE uf.candidate_id = $1
      AND uf.source_type = $2
    ORDER BY uf.uploaded_at DESC, uf.id DESC
    LIMIT 1`,
    [candidateId, SOURCE_TYPE]
  );
  return rows[0] || null;
}

/**
 * The "Simera file" section of the admin candidate page.
 *
 * @returns {Promise<object | null>} null when the candidate does not exist
 */
async function getSimeraSection(db, candidateId) {
  if (!(await candidateExists(db, candidateId))) {
    return null;
  }
  const row = await findLatestSimeraFile(db, candidateId);
  return buildSection(candidateId, row);
}

/**
 * "Send Simera file to processing": creates the one job of the candidate's
 * newest Simera file, then sends it to the queue once. A failed send is
 * logged and the job stays 'queued'; the worker sends it at startup.
 *
 * @param {object} deps
 * @param {{ query: Function }} deps.db
 * @param {(jobId: number) => Promise<void>} deps.enqueueJob
 * @param {{ error: Function }} [deps.logger]
 * @param {number} candidateId
 * @returns {Promise<{ fileId: number, jobId: number } | null>} null when the
 *   candidate does not exist
 * @throws {SimeraSendError} when the button would be disabled
 */
async function sendSimeraFile(
  { db, enqueueJob, logger = console },
  candidateId
) {
  const section = await getSimeraSection(db, candidateId);
  if (!section) {
    return null;
  }
  if (!section.canSend) {
    throw new SimeraSendError({
      status: 409,
      reason: !section.file
        ? 'no_simera_file'
        : section.status === 'processing'
          ? 'simera_processing'
          : 'simera_already_sent',
      message: section.disabledReason
    });
  }

  // A second click (or two admins at once) hits the unique file_id and
  // creates nothing.
  const { rows } = await db.query(
    `INSERT INTO processing_jobs (file_id, created_at)
    VALUES ($1, CURRENT_TIMESTAMP)
    ON CONFLICT (file_id) DO NOTHING
    RETURNING id`,
    [section.file.id]
  );
  if (rows.length === 0) {
    throw new SimeraSendError({
      status: 409,
      reason: 'simera_already_sent',
      message: DISABLED_REASONS.alreadySent
    });
  }
  const jobId = rows[0].id;

  try {
    await enqueueJob(jobId);
  } catch (error) {
    logger.error(`Sending job ${jobId} to the queue failed`, error.stack);
  }

  return { fileId: section.file.id, jobId };
}

module.exports = {
  DISABLED_REASONS,
  SOURCE_TYPE,
  SimeraSendError,
  buildSection,
  createSimeraCandidateResolver,
  getSimeraSection,
  readSimeraEmail,
  sendSimeraFile,
  simeraUploadErrors
};
