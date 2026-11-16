const express = require('express');
const multer = require('multer');
const { MAX_FILE_SIZE_BYTES } = require('shared/src/upload/upload.config');
const {
  UploadError,
  processUpload,
  uploadErrors
} = require('shared/src/upload/upload.service');
const {
  requireAuth,
  requireRole,
  requireVerifiedCandidate
} = require('../auth/guards');
const { validateFileId, validateSourceType } = require('./upload.validation');

const FILE_FIELD = 'file';

/** Sends a rejection as { errors: { file: message }, reason, ...details }. */
function sendUploadError(res, error) {
  return res.status(error.status).json({
    errors: { [error.field]: error.message },
    reason: error.reason,
    ...error.details
  });
}

function sendFileFieldError(res, message) {
  return res.status(400).json({ errors: { [FILE_FIELD]: message } });
}

// Kept in memory (at most 10 MB): the checks run before anything is written,
// so a rejected file never touches the disk.
const parseSingleFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 },
  // Browsers send the file name as UTF-8.
  defParamCharset: 'utf8'
}).single(FILE_FIELD);

/** Runs Multer and turns its errors into upload responses. */
function receiveFile(req, res, next) {
  parseSingleFile(req, res, (error) => {
    if (!error) {
      return next();
    }
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return sendUploadError(res, uploadErrors.fileTooLarge());
      }
      if (
        error.code === 'LIMIT_FILE_COUNT' ||
        error.code === 'LIMIT_UNEXPECTED_FILE'
      ) {
        return sendFileFieldError(
          res,
          `Upload exactly one file in the "${FILE_FIELD}" field`
        );
      }
    }
    // Multer only parses the request here, so any other error is a malformed
    // multipart body.
    return res
      .status(400)
      .json({ errors: { body: 'The upload request is malformed' } });
  });
}

/** Rejects an unknown slot before the file is received. */
function checkSourceType(req, res, next) {
  const validation = validateSourceType(req.params.sourceType);
  if (!validation.success) {
    return res.status(400).json({ errors: validation.errors });
  }
  req.sourceType = validation.data;
  return next();
}

/**
 * @param {object} deps
 * @param {() => object} deps.getDb returns the pg Pool
 * @param {() => object} deps.getStorage returns the raw file storage
 * @param {(jobId: number) => Promise<void>} deps.enqueueJob sends a job to the
 *   queue
 * @param {() => object} deps.getUploadConfig returns the upload settings
 */
function createUploadsRouter({
  getDb,
  getStorage,
  enqueueJob,
  getUploadConfig
}) {
  const router = express.Router();

  // Candidate upload, one slot per request: cv (PDF, DOCX) or linkedin (md).
  router.post(
    '/:sourceType',
    requireAuth,
    requireRole('candidate'),
    checkSourceType,
    requireVerifiedCandidate(getDb),
    receiveFile,
    async (req, res, next) => {
      if (!req.file) {
        return sendFileFieldError(res, 'Choose a file to upload');
      }

      try {
        const { fileId, jobId } = await processUpload(
          {
            db: getDb(),
            storage: getStorage(),
            enqueueJob,
            config: getUploadConfig()
          },
          {
            candidateId: req.candidate.id,
            sourceType: req.sourceType,
            originalFilename: req.file.originalname,
            buffer: req.file.buffer
          }
        );

        return res.status(202).json({
          message: 'File received, processing has started',
          fileId,
          jobId
        });
      } catch (error) {
        if (error instanceof UploadError) {
          return sendUploadError(res, error);
        }
        return next(error);
      }
    }
  );

  // Raw original file, admin only (requirements 4.2: private storage).
  router.get(
    '/:fileId/raw',
    requireAuth,
    requireRole('admin'),
    async (req, res, next) => {
      const validation = validateFileId(req.params.fileId);
      if (!validation.success) {
        return res.status(400).json({ errors: validation.errors });
      }

      try {
        const result = await getDb().query(
          `SELECT original_filename, storage_location, mime_type
          FROM uploaded_files
          WHERE id = $1`,
          [validation.data]
        );
        const file = result.rows[0];
        if (!file) {
          return res.status(404).json({ errors: { fileId: 'File not found' } });
        }

        // Always a download, never rendered by the browser (md is not HTML).
        return res.download(
          getStorage().resolvePath(file.storage_location),
          file.original_filename,
          {
            headers: {
              'Content-Type': file.mime_type || 'application/octet-stream',
              'X-Content-Type-Options': 'nosniff',
              'Content-Security-Policy': "default-src 'none'; sandbox"
            }
          },
          (error) => {
            if (error && !res.headersSent) {
              next(error);
            }
          }
        );
      } catch (error) {
        return next(error);
      }
    }
  );

  return router;
}

module.exports = {
  createUploadsRouter,
  receiveFile,
  sendFileFieldError,
  sendUploadError
};
