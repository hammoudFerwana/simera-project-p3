const express = require('express');
const { requireAuth, requireRole } = require('../auth/guards');
const {
  validateListQuery,
  validateCandidateId
} = require('./admin.validation');
const { listCandidates, getCandidateProfile } = require('./candidates.service');
const { getCandidateHistory } = require('./history.service');
const {
  UploadError,
  processUpload
} = require('shared/src/upload/upload.service');
const {
  receiveFile,
  sendFileFieldError,
  sendUploadError
} = require('../upload/upload.middleware');
const {
  SOURCE_TYPE: SIMERA_SOURCE_TYPE,
  SimeraSendError,
  createSimeraCandidateResolver,
  getSimeraSection,
  sendSimeraFile
} = require('./simera.service');

const candidateNotFound = (res) =>
  res.status(404).json({ errors: { candidateId: 'Candidate not found' } });

/**
 * Creates the admin router mounted at /api/admin.
 *
 * @param {object} deps
 * @param {() => object} deps.getDb - returns the pg Pool
 * @param {() => object} deps.getStorage - returns the raw file storage
 * @param {(jobId: number) => Promise<void>} deps.enqueueJob - sends a job id
 *   to the queue
 * @param {() => object} deps.getUploadConfig - returns the upload settings
 * @returns {express.Router}
 */
function createAdminRouter({ getDb, getStorage, enqueueJob, getUploadConfig }) {
  const router = express.Router();

  router.use(requireAuth, requireRole('admin'));

  // Simera file upload by the dev team (US-22). The candidate is the
  // registered, verified user named by the JSON's top-level "email". The
  // file is saved without a job; the admin sends it from the candidate page.
  router.post('/simera-files', receiveFile, async (req, res, next) => {
    if (!req.file) {
      return sendFileFieldError(res, 'Choose a file to upload');
    }

    try {
      const db = getDb();
      const { fileId, candidateId } = await processUpload(
        {
          db,
          storage: getStorage(),
          enqueueJob,
          config: getUploadConfig()
        },
        {
          resolveCandidateId: createSimeraCandidateResolver(db),
          sourceType: SIMERA_SOURCE_TYPE,
          originalFilename: req.file.originalname,
          buffer: req.file.buffer,
          createJob: false
        }
      );

      return res.status(201).json({
        message:
          'Simera file saved. Send it to processing from the candidate page',
        fileId,
        candidateId
      });
    } catch (error) {
      if (error instanceof UploadError) {
        return sendUploadError(res, error);
      }
      return next(error);
    }
  });

  router.get('/candidates', async (req, res, next) => {
    const validation = validateListQuery(req.query);
    if (!validation.success) {
      return res.status(400).json({ errors: validation.errors });
    }

    try {
      const result = await listCandidates(getDb(), validation.data);
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.get('/candidates/:id', async (req, res, next) => {
    const validation = validateCandidateId(req.params.id);
    if (!validation.success) {
      return res.status(400).json({ errors: validation.errors });
    }

    try {
      const result = await getCandidateProfile(getDb(), validation.data);
      if (!result) {
        return candidateNotFound(res);
      }
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.get('/candidates/:id/history', async (req, res, next) => {
    const validation = validateCandidateId(req.params.id);
    if (!validation.success) {
      return res.status(400).json({ errors: validation.errors });
    }

    try {
      const result = await getCandidateHistory(getDb(), validation.data);
      if (!result) {
        return candidateNotFound(res);
      }
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  });

  // The "Simera file" section of the candidate page (US-22).
  router.get('/candidates/:id/simera', async (req, res, next) => {
    const validation = validateCandidateId(req.params.id);
    if (!validation.success) {
      return res.status(400).json({ errors: validation.errors });
    }

    try {
      const section = await getSimeraSection(getDb(), validation.data);
      if (!section) {
        return candidateNotFound(res);
      }
      return res.status(200).json(section);
    } catch (error) {
      return next(error);
    }
  });

  // "Send Simera file to processing" (US-22): one job for the newest file.
  router.post('/candidates/:id/simera/send', async (req, res, next) => {
    const validation = validateCandidateId(req.params.id);
    if (!validation.success) {
      return res.status(400).json({ errors: validation.errors });
    }

    try {
      const result = await sendSimeraFile(
        { db: getDb(), enqueueJob },
        validation.data
      );
      if (!result) {
        return candidateNotFound(res);
      }
      return res.status(202).json({
        message: 'Simera file sent to processing',
        fileId: result.fileId,
        jobId: result.jobId
      });
    } catch (error) {
      if (error instanceof SimeraSendError) {
        return res.status(error.status).json({
          errors: { [error.field]: error.message },
          reason: error.reason
        });
      }
      return next(error);
    }
  });

  return router;
}

module.exports = { createAdminRouter };
