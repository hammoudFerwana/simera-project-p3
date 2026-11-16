/**
 * Simera file (US-22): the dev team uploads a candidate's Simera JSON, and
 * the admin sends it to processing from the candidate page.
 *
 * - Upload: the shared upload service with source_type simera_profile and no
 *   job. The candidate is the registered, verified user whose email is the
 *   JSON's top-level "email".
 * - Section: the newest Simera file of the candidate and its status.
 * - Send: exactly one job for that file (processing_jobs.file_id is unique),
 *   and never while another Simera job of the candidate is running.
 */

const { UploadError } = require('shared/src/upload/upload.service');
const { createProcessingJob } = require('shared/src/upload/processing-jobs');

const SOURCE_TYPE = 'simera_profile';

/** Why the send button is disabled: the shown message and the 409 reason. */
const DISABLED = {
  noFile: {
    reason: 'no_simera_file',
    message: 'No Simera file exists for this candidate'
  },
  processing: {
    reason: 'simera_processing',
    message: 'This Simera file is being processed'
  },
  otherProcessing: {
    reason: 'simera_processing',
    message: 'Another Simera file of this candidate is being processed'
  },
  alreadySent: {
    reason: 'simera_already_sent',
    message: 'This Simera file was already sent to processing'
  },
  failed: {
    reason: 'simera_failed',
    message: 'Processing failed. Upload a corrected Simera file'
  }
};

const DISABLED_REASONS = Object.fromEntries(
  Object.entries(DISABLED).map(([key, { message }]) => [key, message])
);

/**
 * Every internal job status mapped to the section status and the reason the
 * button is disabled. A status missing here is a bug, never "completed".
 */
const JOB_STATUSES = {
  queued: { status: 'processing', disabled: 'processing' },
  processing: { status: 'processing', disabled: 'processing' },
  completed: { status: 'completed', disabled: 'alreadySent' },
  completed_with_review: { status: 'completed', disabled: 'alreadySent' },
  failed: { status: 'failed', disabled: 'failed' }
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
 * The section state from the newest Simera file row (or none), with the key
 * of DISABLED that blocks the button (null when it can be sent).
 *
 * Statuses: not_sent (no job), processing (queued, processing), completed
 * (completed, completed_with_review), failed. Only not_sent can be sent, and
 * only while no other Simera job of the candidate is queued or processing:
 * one job per file, and a failed job is never rerun.
 */
function describeSection(candidateId, row) {
  if (!row) {
    return {
      disabledKey: 'noFile',
      section: {
        candidateId,
        file: null,
        job: null,
        status: null,
        canSend: false,
        disabledReason: DISABLED.noFile.message
      }
    };
  }

  const file = {
    id: row.file_id,
    name: row.original_filename,
    uploadedAt: row.uploaded_at,
    rawUrl: `/api/uploads/${row.file_id}/raw`
  };

  if (row.job_id == null) {
    const disabledKey = row.other_simera_running ? 'otherProcessing' : null;
    return {
      disabledKey,
      section: {
        candidateId,
        file,
        job: null,
        status: 'not_sent',
        canSend: disabledKey === null,
        disabledReason: disabledKey ? DISABLED[disabledKey].message : null
      }
    };
  }

  const mapped = JOB_STATUSES[row.job_status];
  if (!mapped) {
    throw new Error(
      `Unknown processing job status "${row.job_status}" for job ${row.job_id}`
    );
  }

  return {
    disabledKey: mapped.disabled,
    section: {
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
      status: mapped.status,
      canSend: false,
      disabledReason: DISABLED[mapped.disabled].message
    }
  };
}

/** The section object only (see describeSection). */
function buildSection(candidateId, row) {
  return describeSection(candidateId, row).section;
}

/** @returns {Promise<boolean>} whether the candidate profile exists */
async function candidateExists(db, candidateId) {
  const { rows } = await db.query(
    'SELECT 1 FROM candidate_profiles WHERE id = $1',
    [candidateId]
  );
  return rows.length > 0;
}

/**
 * The newest Simera file of the candidate with its job, if any, and whether
 * another Simera file of the candidate is still queued or processing.
 */
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
      pj.pending_review_count,
      EXISTS (
        SELECT 1
        FROM uploaded_files other
        JOIN processing_jobs other_job ON other_job.file_id = other.id
        WHERE other.candidate_id = uf.candidate_id
          AND other.source_type = uf.source_type
          AND other.id <> uf.id
          AND other_job.status IN ('queued', 'processing')
      ) AS other_simera_running
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
 * newest Simera file, then sends it to the queue once.
 *
 * The check and the insert run in one transaction that locks the candidate
 * row, so two clicks at the same time (or two admins, or a v1 and a v2 click)
 * are decided one after the other. The unique file_id is a second guard.
 * A failed send to the queue is logged and the job stays 'queued'; the
 * worker's periodic sweep sends it.
 *
 * @param {object} deps
 * @param {{ connect: Function }} deps.db pg Pool
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
  const client = await db.connect();
  // Set when ROLLBACK fails: the connection is destroyed, not reused.
  let brokenConnectionError;
  let result;

  try {
    await client.query('BEGIN');

    const candidate = await client.query(
      'SELECT id FROM candidate_profiles WHERE id = $1 FOR UPDATE',
      [candidateId]
    );
    if (candidate.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const { section, disabledKey } = describeSection(
      candidateId,
      await findLatestSimeraFile(client, candidateId)
    );
    if (disabledKey) {
      throw refusal(disabledKey);
    }

    const jobId = await createProcessingJob(client, section.file.id);
    if (jobId === null) {
      throw refusal('alreadySent');
    }

    await client.query('COMMIT');
    result = { fileId: section.file.id, jobId };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      brokenConnectionError = rollbackError;
      logger.error('Simera send rollback failed', rollbackError.stack);
    }
    throw error;
  } finally {
    client.release(brokenConnectionError);
  }

  try {
    await enqueueJob(result.jobId);
  } catch (error) {
    logger.error(
      `Sending job ${result.jobId} to the queue failed`,
      error.stack
    );
  }

  return result;
}

function refusal(disabledKey) {
  const { reason, message } = DISABLED[disabledKey];
  return new SimeraSendError({ status: 409, reason, message });
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
