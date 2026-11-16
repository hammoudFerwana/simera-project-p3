const express = require('express');
const {
  UploadError,
  processUpload
} = require('shared/src/upload/upload.service');
const {
  requireAuth,
  requireRole,
  requireVerifiedCandidate
} = require('../auth/guards');
const { validateFileId, validateSourceType } = require('./upload.validation');
const {
  receiveFile,
  sendFileFieldError,
  sendUploadError
} = require('./upload.middleware');

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

module.exports = { createUploadsRouter };
