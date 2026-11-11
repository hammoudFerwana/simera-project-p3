const crypto = require('crypto');
const path = require('path');
const {
  TextExtractionError,
  extractText,
  normalizeText
} = require('../extraction/text-extractor');
const {
  acceptedFormatNames,
  contentMatchesMimeType,
  findFormatByFilename,
  isSupportedSourceType,
  SOURCE_FORMATS
} = require('./file-types');
const { MAX_FILE_SIZE_BYTES } = require('./upload.config');

const UNIQUE_VIOLATION = '23505';
const FILENAME_MAX_LENGTH = 500;

/**
 * An expected rejection, returned to the client in the upload response only.
 * Nothing is stored for a rejected file (requirements 3.3).
 */
class UploadError extends Error {
  constructor({ status, reason, message, details = {} }) {
    super(message);
    this.name = 'UploadError';
    this.status = status;
    this.field = 'file';
    this.reason = reason;
    this.details = details;
  }
}

const uploadErrors = {
  unsupportedFormat: (sourceType) => {
    const formats = acceptedFormatNames(sourceType);
    return new UploadError({
      status: 400,
      reason: 'unsupported_format',
      message: `This file type is not accepted. Accepted formats for ${SOURCE_FORMATS[sourceType].label}: ${formats.join(', ')}`,
      details: { acceptedFormats: formats }
    });
  },
  fileTooLarge: () =>
    new UploadError({
      status: 413,
      reason: 'file_too_large',
      message: 'The file is larger than 10 MB. Upload a file of 10 MB or less'
    }),
  corrupted: () =>
    new UploadError({
      status: 400,
      reason: 'corrupted_file',
      message: 'The file is corrupted, please upload a valid file'
    }),
  noReadableText: () =>
    new UploadError({
      status: 400,
      reason: 'no_readable_text',
      message:
        'The file has no readable text. Scanned or image-only files are not supported'
    }),
  duplicate: () =>
    new UploadError({
      status: 409,
      reason: 'duplicate_file',
      message: 'This file was already uploaded'
    })
};

/** SHA-256 of the extracted text after trimming and collapsing whitespace. */
function hashText(text) {
  return crypto
    .createHash('sha256')
    .update(normalizeText(text), 'utf8')
    .digest('hex');
}

/** Keeps the base name only and fits the varchar(500) column. */
function cleanFilename(filename) {
  return path.basename(String(filename)).slice(0, FILENAME_MAX_LENGTH);
}

/**
 * Inserts the file row and, when requested, its queued job, in one
 * transaction.
 *
 * @returns {Promise<{ fileId: number, jobId: number | null }>}
 * @throws {UploadError} duplicate when a concurrent upload saved the same hash
 */
async function insertRows(db, row, createJob, logger) {
  const client = await db.connect();
  // Set when ROLLBACK fails: the connection is in an unknown state, so it is
  // destroyed instead of going back to the pool.
  let brokenConnectionError;

  try {
    await client.query('BEGIN');

    const fileResult = await client.query(
      `INSERT INTO uploaded_files (
        candidate_id,
        source_type,
        original_filename,
        file_size,
        file_hash,
        storage_location,
        mime_type,
        uploaded_at,
        validated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id`,
      [
        row.candidateId,
        row.sourceType,
        row.originalFilename,
        row.fileSize,
        row.fileHash,
        row.storageLocation,
        row.mimeType,
        row.uploadedAt,
        row.validatedAt
      ]
    );
    const fileId = fileResult.rows[0].id;

    let jobId = null;
    if (createJob) {
      // Status keeps its default ('queued'); the worker fills the rest.
      const jobResult = await client.query(
        `INSERT INTO processing_jobs (file_id, created_at)
        VALUES ($1, CURRENT_TIMESTAMP)
        RETURNING id`,
        [fileId]
      );
      jobId = jobResult.rows[0].id;
    }

    await client.query('COMMIT');
    return { fileId, jobId };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      brokenConnectionError = rollbackError;
      logger.error('Upload rollback failed', rollbackError.stack);
    }

    // Another upload saved the same text between the check and the insert.
    if (error.code === UNIQUE_VIOLATION && error.table === 'uploaded_files') {
      throw uploadErrors.duplicate();
    }
    throw error;
  } finally {
    client.release(brokenConnectionError);
  }
}

/** Deletes a saved raw file; a failure is logged, not thrown. */
async function removeRawFile(storage, storageLocation, logger) {
  try {
    await storage.remove(storageLocation);
  } catch (removeError) {
    logger.error('Removing a raw file after a failed upload failed', {
      storageLocation,
      stack: removeError.stack
    });
  }
}

/**
 * The shared upload service (requirements 3.3), used for every source type.
 * Runs the checks in order, then saves the raw copy and the rows:
 *   1. the extension is accepted for the source type
 *   2. the real content matches the extension
 *   3. size is 10 MB or less
 *   4. the file opens and its text is not empty or nearly empty
 *   5. the text hash is not in uploaded_files (duplicate)
 *   6. the raw copy is saved unchanged
 *   7. uploaded_files (+ processing_jobs when createJob) in one transaction
 *   8. the job is sent to the queue, once
 *
 * A rejected file leaves nothing behind: no raw file, no row, no job.
 * Once the rows are committed the upload is accepted, even if sending the job
 * to the queue fails: the job stays 'queued' in processing_jobs (the durable
 * record) and the failure is logged.
 *
 * @param {object} deps
 * @param {{ query: Function, connect: Function }} deps.db pg Pool
 * @param {{ save: Function, remove: Function }} deps.storage raw file storage
 * @param {(jobId: number) => Promise<void>} deps.enqueueJob sends a job id to
 *   the queue
 * @param {{ minExtractedTextChars: number }} deps.config upload settings
 * @param {{ error: Function }} [deps.logger]
 * @param {object} input
 * @param {number} input.candidateId candidate_profiles.id
 * @param {'cv' | 'linkedin'} input.sourceType
 * @param {string} input.originalFilename
 * @param {Buffer} input.buffer the raw bytes
 * @param {Date} [input.uploadedAt] when the upload was received
 * @param {boolean} [input.createJob] false for Simera, whose job is created
 *   when the admin clicks the button (US-22)
 * @returns {Promise<{ fileId: number, jobId: number | null }>}
 * @throws {UploadError} for a rejected file
 */
async function processUpload(
  { db, storage, enqueueJob, config, logger = console },
  {
    candidateId,
    sourceType,
    originalFilename,
    buffer,
    uploadedAt = new Date(),
    createJob = true
  }
) {
  if (!isSupportedSourceType(sourceType)) {
    throw new Error(`Unsupported source type: ${sourceType}`);
  }

  const format = findFormatByFilename(sourceType, originalFilename);
  if (!format || !contentMatchesMimeType(format.mimeType, buffer)) {
    throw uploadErrors.unsupportedFormat(sourceType);
  }

  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw uploadErrors.fileTooLarge();
  }

  let text;
  try {
    text = await extractText({ mimeType: format.mimeType, buffer });
  } catch (error) {
    if (error instanceof TextExtractionError) {
      throw uploadErrors.corrupted();
    }
    throw error;
  }
  if (normalizeText(text).length < config.minExtractedTextChars) {
    throw uploadErrors.noReadableText();
  }

  const fileHash = hashText(text);
  const existing = await db.query(
    'SELECT 1 FROM uploaded_files WHERE file_hash = $1',
    [fileHash]
  );
  if (existing.rows.length > 0) {
    throw uploadErrors.duplicate();
  }
  const validatedAt = new Date();

  const storageLocation = await storage.save(buffer, format.extension);

  let ids;
  try {
    ids = await insertRows(
      db,
      {
        candidateId,
        sourceType,
        originalFilename: cleanFilename(originalFilename),
        fileSize: buffer.length,
        fileHash,
        storageLocation,
        mimeType: format.mimeType,
        uploadedAt,
        validatedAt
      },
      createJob,
      logger
    );
  } catch (error) {
    // No row was saved, so the raw copy must not stay either.
    await removeRawFile(storage, storageLocation, logger);
    throw error;
  }

  if (ids.jobId !== null) {
    try {
      await enqueueJob(ids.jobId);
    } catch (error) {
      // The file is saved and its job row stays 'queued'; it still has to be
      // sent to the queue later (see README, "Queue dependency").
      logger.error(`Sending job ${ids.jobId} to the queue failed`, error.stack);
    }
  }

  return ids;
}

module.exports = {
  UploadError,
  hashText,
  processUpload,
  uploadErrors
};
