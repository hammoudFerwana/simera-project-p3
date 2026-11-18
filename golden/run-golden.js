#!/usr/bin/env node
/**
 * Golden Dataset Runner and Accuracy Measurement
 * US-23: Evaluates extraction and conflict resolution accuracy against synthetic golden files.
 */

// D4: The runner sets process.env.DATABASE_URL = process.env.GOLDEN_DATABASE_URL
// before requiring any project module.
require('dotenv').config();

const path = require('path');
const fs = require('fs');
const { validateGoldenDatabaseUrl } = require('./lib/db-guard');

const goldenDbUrl = process.env.GOLDEN_DATABASE_URL;
if (require.main === module) {
  validateGoldenDatabaseUrl(goldenDbUrl);
}

process.env.DATABASE_URL = goldenDbUrl;

const pool = require('../shared/src/database');
const { createLocalStorage } = require('../shared/src/upload/storage');
const {
  processUpload,
  UploadError
} = require('../shared/src/upload/upload.service');
const { processJob } = require('../worker/src/process-job');
const realSteps = require('../worker/src/steps/index');
const { createExtractTextStep } = require('../worker/src/steps/extract-text');
const { getCandidateProfile } = require('../api/src/admin/candidates.service');
const { cleanupGoldenUsers } = require('./lib/cleanup');
const { compareStoredWithExpected } = require('./lib/compare');
const { lookupPlantedCase } = require('./lib/planted');
const { generateMarkdownReport } = require('./lib/report');

async function getOrCreateCandidate(db, email) {
  const userRes = await db.query('SELECT id FROM users WHERE email = $1', [
    email
  ]);
  let userId;
  if (userRes.rows.length > 0) {
    userId = userRes.rows[0].id;
  } else {
    const dummyHash =
      '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012';
    const insUser = await db.query(
      `INSERT INTO users (email, password_hash, email_verified, created_at)
       VALUES ($1, $2, TRUE, CURRENT_TIMESTAMP)
       RETURNING id`,
      [email, dummyHash]
    );
    userId = insUser.rows[0].id;
  }

  const candRes = await db.query(
    'SELECT id FROM candidate_profiles WHERE user_id = $1',
    [userId]
  );
  if (candRes.rows.length > 0) {
    return { userId, candidateId: candRes.rows[0].id };
  }

  const insCand = await db.query(
    `INSERT INTO candidate_profiles (user_id, created_at)
     VALUES ($1, CURRENT_TIMESTAMP)
     RETURNING id`,
    [userId]
  );
  return { userId, candidateId: insCand.rows[0].id };
}

/**
 * Returns the real worker steps with step 1 (extract text) reading from the
 * runner's storage. The other steps are unchanged.
 *
 * @param {Function[]} steps - real worker steps, step 1 first
 * @param {object} db
 * @param {object} storage - storage the runner uploads into
 * @returns {Function[]}
 */
function withGoldenStorage(steps, db, storage) {
  return [
    createExtractTextStep({ db, getStorage: () => storage }),
    ...steps.slice(1)
  ];
}

async function runGolden(options = {}) {
  const {
    manifestPath = path.resolve(__dirname, 'manifest.json'),
    storageDir = path.resolve(__dirname, '.storage'),
    reportPath = path.resolve(__dirname, 'report.md'),
    steps: stepsOverride,
    logger = console
  } = options;

  logger.log('Starting Golden Dataset measurement run...');
  const storage = createLocalStorage({ directory: storageDir });

  // The real step 1 reads raw files from UPLOAD_STORAGE_DIR by default, but
  // the runner saves uploads in storageDir. Point step 1 at the same storage.
  const steps = stepsOverride || withGoldenStorage(realSteps, pool, storage);

  // D6: Cleanup @golden.example users at the start of a run
  logger.log('Cleaning up previous @golden.example records...');
  await cleanupGoldenUsers(pool, storage);

  // Read manifest
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const entries = (manifest.entries || []).sort((a, b) => a.order - b.order);

  const entryResults = [];
  const overallAccuracy = { compared: 0, matched: 0 };
  const sectionAccuracy = {};
  const dateAccuracy = { compared: 0, matched: 0 };
  const experienceResults = [];
  const plantedResults = [];

  for (const entry of entries) {
    logger.log(
      `Processing [${entry.order}/${entries.length}] ${entry.id} (${entry.file})...`
    );
    const filePath = path.resolve(__dirname, entry.file);
    const fileBuffer = fs.readFileSync(filePath);

    const { candidateId } = await getOrCreateCandidate(pool, entry.email);

    let actualStatus = 'stored';
    let rejectReason = null;
    let jobStatus = null;
    let failureReason = null;
    let uploadResult = null;

    try {
      uploadResult = await processUpload(
        {
          db: pool,
          storage,
          enqueueJob: async () => {}, // no-op for pg-boss
          config: { minExtractedTextChars: 50 },
          logger: { error: () => {}, info: () => {}, warn: () => {} }
        },
        {
          candidateId,
          sourceType: entry.sourceType,
          originalFilename: path.basename(entry.file),
          buffer: fileBuffer,
          createJob: true
        }
      );
    } catch (err) {
      actualStatus = 'rejected';
      rejectReason =
        err.message || (err instanceof UploadError ? err.reason : String(err));
    }

    if (uploadResult && uploadResult.jobId) {
      await processJob(pool, uploadResult.jobId, {
        steps,
        sleep: async () => {}
      });

      const jobRow = await pool.query(
        'SELECT status, failure_reason FROM processing_jobs WHERE id = $1',
        [uploadResult.jobId]
      );
      if (jobRow.rows.length > 0) {
        jobStatus = jobRow.rows[0].status;
        failureReason = jobRow.rows[0].failure_reason;
        if (jobStatus === 'failed') {
          actualStatus = 'rejected';
          rejectReason = failureReason;
        }
      }
    }

    entryResults.push({
      id: entry.id,
      file: entry.file,
      sourceType: entry.sourceType,
      expectedStatus: entry.expect,
      expectedRejectReason: entry.rejectReason || null,
      actualStatus,
      rejectReason,
      jobStatus,
      failureReason
    });

    // If expected to be stored and was stored, compare fields
    if (entry.expected && actualStatus === 'stored') {
      const expectedPath = path.resolve(__dirname, entry.expected);
      const expectedData = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));

      const storedProfile = await getCandidateProfile(pool, candidateId);
      const cmp = compareStoredWithExpected(storedProfile, expectedData);

      overallAccuracy.compared += cmp.compared;
      overallAccuracy.matched += cmp.matched;
      dateAccuracy.compared += cmp.dateCompared;
      dateAccuracy.matched += cmp.dateMatched;

      for (const [sec, sStats] of Object.entries(cmp.sections)) {
        if (!sectionAccuracy[sec])
          sectionAccuracy[sec] = { compared: 0, matched: 0 };
        sectionAccuracy[sec].compared += sStats.compared;
        sectionAccuracy[sec].matched += sStats.matched;
      }

      if (cmp.experienceMonths.expected !== null) {
        experienceResults.push({
          id: entry.id,
          expected: cmp.experienceMonths.expected,
          actual: cmp.experienceMonths.actual,
          matches: cmp.experienceMonths.matches
        });
      }
    }

    // Inspect planted cases for this entry
    if (Array.isArray(entry.planted)) {
      for (const plantedItem of entry.planted) {
        const pRes = await lookupPlantedCase(pool, candidateId, plantedItem);
        plantedResults.push(pRes);
      }
    }
  }

  // Automatic vs Review count for the run
  const autoRes = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM conflicts c
     JOIN candidate_profiles cp ON cp.id = c.candidate_id
     JOIN users u ON u.id = cp.user_id
     WHERE u.email LIKE '%@golden.example'
       AND c.resolution_method = 'automatic_rule'`
  );

  const reviewRes = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM human_reviews hr
     JOIN candidate_profiles cp ON cp.id = hr.candidate_id
     JOIN users u ON u.id = cp.user_id
     WHERE u.email LIKE '%@golden.example'`
  );

  const conflictsSplit = {
    automaticCount: autoRes.rows[0]?.count ?? 0,
    reviewCount: reviewRes.rows[0]?.count ?? 0
  };

  const reportData = {
    timestamp: new Date().toISOString(),
    entryResults,
    overallAccuracy,
    sectionAccuracy,
    dateAccuracy,
    experienceResults,
    conflictsSplit,
    plantedResults
  };

  const markdownReport = generateMarkdownReport(reportData);
  fs.writeFileSync(reportPath, markdownReport, 'utf8');

  logger.log('\n' + markdownReport);
  logger.log(`\nReport saved to: ${reportPath}`);

  return reportData;
}

if (require.main === module) {
  runGolden()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error('Fatal error during golden run:', err.message);
      process.exit(1);
    });
}

module.exports = { runGolden, getOrCreateCandidate, withGoldenStorage };
