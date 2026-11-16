const express = require('express');
const cookieParser = require('cookie-parser');
const { readUploadConfig } = require('shared/src/upload/upload.config');
const { createLocalStorage } = require('shared/src/upload/storage');
const { createAuthRouter } = require('./auth/auth.routes');
const { createUploadsRouter } = require('./upload/upload.routes');
const { createCandidateRouter } = require('./candidate/candidate.routes');
const { createAdminRouter } = require('./admin/admin.routes');
// Loaded on first use so the app (and /health) starts without a database,
// an SMTP server or the queue.
const defaultGetDb = () => require('shared/src/database');
let smtpMailer;
const defaultGetMailer = () => {
  if (!smtpMailer) {
    smtpMailer = require('./mail/mailer').createSmtpMailer();
  }
  return smtpMailer;
};
let rawFileStorage;
const defaultGetStorage = () => {
  if (!rawFileStorage) {
    rawFileStorage = createLocalStorage({
      directory: readUploadConfig().storageDir
    });
  }
  return rawFileStorage;
};

// The API only sends jobs to pg-boss; the worker processes them (US-05).
let bossPromise;
async function defaultEnqueueJob(jobId) {
  const { startBoss, enqueueJob } = require('shared/src/queue');
  if (!bossPromise) {
    const { DATABASE_URL } = require('shared/src/config').loadConfig();
    bossPromise = Promise.resolve(startBoss(DATABASE_URL)).catch((error) => {
      // Try again on the next upload instead of keeping the failure.
      bossPromise = undefined;
      throw error;
    });
  }
  return enqueueJob(await bossPromise, jobId);
}

/**
 * Builds the Express app. Dependencies can be replaced in tests.
 *
 * @param {object} [deps]
 * @param {() => object} [deps.getDb] returns the pg Pool
 * @param {() => { sendOtpEmail: Function }} [deps.getMailer] returns the mailer
 * @param {() => object} [deps.getStorage] returns the raw file storage
 * @param {(jobId: number) => Promise<void>} [deps.enqueueJob] sends a job id
 *   to the queue
 * @param {() => object} [deps.getUploadConfig] returns the upload settings
 */
function createApp({
  getDb = defaultGetDb,
  getMailer = defaultGetMailer,
  getStorage = defaultGetStorage,
  enqueueJob = defaultEnqueueJob,
  getUploadConfig = readUploadConfig
} = {}) {
  const app = express();

  app.use(express.json());
  app.use(cookieParser());

  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/api/auth', createAuthRouter({ getDb, getMailer }));
  app.use(
    '/api/uploads',
    createUploadsRouter({ getDb, getStorage, enqueueJob, getUploadConfig })
  );
  app.use('/api/candidate', createCandidateRouter({ getDb }));
  app.use(
    '/api/admin',
    createAdminRouter({ getDb, getStorage, enqueueJob, getUploadConfig })
  );

  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => {
    if (error.type === 'entity.parse.failed') {
      return res.status(400).json({ errors: { body: 'Invalid JSON body' } });
    }

    // The stack includes the message. Not the whole object: pg errors carry a
    // `detail` field that can contain row values such as the email.
    console.error(error.stack || error);
    return res.status(500).json({ errors: { server: 'Something went wrong' } });
  });

  return app;
}

module.exports = { createApp };
