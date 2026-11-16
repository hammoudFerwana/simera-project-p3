const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const pool = require('shared/src/database');
const { processJob } = require('../src/process-job');
const {
  createValidateWithCodeStep
} = require('../src/steps/validate-with-code');
const { createCompareStep } = require('../src/steps/compare');
const { createStoreStep } = require('../src/steps/store');
const { resolveReview } = require('../../api/src/admin/reviews.service');

describe('Review Resolution B2 Override (US-18 AC9)', () => {
  const runId = crypto.randomUUID().slice(0, 8);
  const createdEmails = [];
  const createdCandidateIds = [];
  const createdAdminIds = [];
  const createdUserIds = [];

  beforeAll(async () => {
    const res = await pool.query('SELECT current_database() AS name');
    const dbName = res.rows[0].name;
    if (!dbName.startsWith('simera_test')) {
      throw new Error(
        `Tests must run on a test database starting with simera_test, not ${dbName}`
      );
    }
  });

  afterAll(async () => {
    if (createdCandidateIds.length > 0) {
      await pool.query(
        'DELETE FROM human_audit_log WHERE candidate_id = ANY($1::int[])',
        [createdCandidateIds]
      );
      await pool.query(
        `DELETE FROM data_provenance_sources
         WHERE provenance_id IN (SELECT id FROM data_provenance WHERE candidate_id = ANY($1::int[]))`,
        [createdCandidateIds]
      );
      await pool.query(
        'DELETE FROM data_provenance WHERE candidate_id = ANY($1::int[])',
        [createdCandidateIds]
      );
      await pool.query(
        'DELETE FROM human_reviews WHERE candidate_id = ANY($1::int[])',
        [createdCandidateIds]
      );
      await pool.query(
        `DELETE FROM conflict_options
         WHERE conflict_id IN (SELECT id FROM conflicts WHERE candidate_id = ANY($1::int[]))`,
        [createdCandidateIds]
      );
      await pool.query(
        'DELETE FROM conflicts WHERE candidate_id = ANY($1::int[])',
        [createdCandidateIds]
      );
      await pool.query(
        'DELETE FROM candidate_skills WHERE candidate_id = ANY($1::int[])',
        [createdCandidateIds]
      );
      await pool.query(
        'DELETE FROM work_experience WHERE candidate_id = ANY($1::int[])',
        [createdCandidateIds]
      );
      await pool.query(
        'DELETE FROM education WHERE candidate_id = ANY($1::int[])',
        [createdCandidateIds]
      );
      await pool.query(
        'DELETE FROM processing_jobs WHERE file_id IN (SELECT id FROM uploaded_files WHERE candidate_id = ANY($1::int[]))',
        [createdCandidateIds]
      );
      await pool.query(
        'DELETE FROM uploaded_files WHERE candidate_id = ANY($1::int[])',
        [createdCandidateIds]
      );
      await pool.query(
        'DELETE FROM candidate_profiles WHERE id = ANY($1::int[])',
        [createdCandidateIds]
      );
    }
    if (createdAdminIds.length > 0) {
      await pool.query('DELETE FROM admins WHERE id = ANY($1::int[])', [
        createdAdminIds
      ]);
    }
    if (createdUserIds.length > 0) {
      await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [
        createdUserIds
      ]);
    }
    if (createdEmails.length > 0) {
      await pool.query('DELETE FROM users WHERE email = ANY($1::varchar[])', [
        createdEmails
      ]);
    }
    await pool.end();
  });

  async function createAdminUser() {
    const email = `admin-b2-${crypto.randomUUID().slice(0, 8)}-${runId}@example.com`;
    createdEmails.push(email);

    const userRes = await pool.query(
      `INSERT INTO users (email, password_hash, email_verified, created_at)
       VALUES ($1, 'hash', true, NOW())
       RETURNING id`,
      [email]
    );
    const userId = userRes.rows[0].id;
    createdUserIds.push(userId);

    const adminRes = await pool.query(
      `INSERT INTO admins (user_id) VALUES ($1) RETURNING id`,
      [userId]
    );
    const adminId = adminRes.rows[0].id;
    createdAdminIds.push(adminId);

    return { userId, adminId, email };
  }

  async function createCandidate(
    headline = 'Junior Developer',
    city = 'Amman',
    firstName = 'John',
    lastName = 'Doe'
  ) {
    const email = `test-b2-${crypto.randomUUID().slice(0, 8)}-${runId}@example.com`;
    createdEmails.push(email);

    const userRes = await pool.query(
      `INSERT INTO users (email, password_hash, email_verified, created_at)
       VALUES ($1, 'hash', true, NOW())
       RETURNING id`,
      [email]
    );
    const userId = userRes.rows[0].id;
    createdUserIds.push(userId);

    const candRes = await pool.query(
      `INSERT INTO candidate_profiles (user_id, first_name, last_name, headline, city, country_code, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING id`,
      [userId, firstName, lastName, headline, city, firstName ? 'JO' : null]
    );
    const candidateId = candRes.rows[0].id;
    createdCandidateIds.push(candidateId);
    return { userId, candidateId };
  }

  async function createJobForCandidate(
    candidateId,
    filename = 'cv.pdf',
    status = 'queued'
  ) {
    const fileRes = await pool.query(
      `INSERT INTO uploaded_files (
         candidate_id, source_type, original_filename, file_size,
         file_hash, storage_location, mime_type, uploaded_at, validated_at
       ) VALUES ($1, 'cv', $2, 1024, $3, '/tmp/test.pdf', 'application/pdf', NOW(), NOW())
       RETURNING id`,
      [candidateId, filename, `hash-${crypto.randomUUID()}`]
    );
    const fileId = fileRes.rows[0].id;

    const jobRes = await pool.query(
      `INSERT INTO processing_jobs (file_id, status, created_at)
       VALUES ($1, $2, NOW())
       RETURNING id`,
      [fileId, status]
    );
    return { fileId, jobId: jobRes.rows[0].id };
  }

  function makeField(value, confidence = 0.9, evidence = null) {
    if (value && typeof value === 'object' && 'value' in value) {
      return value;
    }
    if (value === null || value === undefined) {
      return { value: null, confidence: null, evidence: null };
    }
    return {
      value,
      confidence,
      evidence: evidence || String(value)
    };
  }

  function makeCandidateData(fields = {}) {
    return {
      first_name: makeField(fields.first_name ?? 'John'),
      last_name: makeField(fields.last_name ?? 'Doe'),
      headline: makeField(fields.headline ?? 'Junior Developer'),
      summary: makeField(fields.summary ?? null),
      phone: makeField(fields.phone ?? null),
      industry: makeField(fields.industry ?? null),
      profession: makeField(fields.profession ?? null),
      city: makeField(fields.city ?? 'Amman'),
      country_code: makeField(fields.country_code ?? 'JO')
    };
  }

  function makeExtraction({
    candidate = {},
    work_experience = [],
    education = [],
    skills = []
  } = {}) {
    return {
      meta: {
        document_language: 'en',
        extraction_warnings: []
      },
      candidate: makeCandidateData(candidate),
      work_experience,
      education,
      skills,
      languages: [],
      links: [],
      certifications: [],
      projects: [],
      awards: [],
      publications: [],
      volunteering: []
    };
  }

  function buildTestSteps(extraction, skillResolutions = [], createReviews) {
    const fakeStep = async (ctx) => {
      ctx.extraction = extraction;
      ctx.skillResolutions = skillResolutions;
      ctx.failedChecks = [];
      const evidences = [];
      const collectEvidences = (obj) => {
        if (!obj || typeof obj !== 'object') return;
        if (typeof obj.evidence === 'string') {
          evidences.push(obj.evidence);
        }
        for (const val of Object.values(obj)) {
          collectEvidences(val);
        }
      };
      collectEvidences(extraction);
      ctx.text = evidences.join(' \n ');
      return ctx;
    };

    return [
      fakeStep,
      createValidateWithCodeStep(),
      createCompareStep({ db: pool }),
      createStoreStep({ db: pool, createReviews })
    ];
  }

  it('AC9: resolve a headline review with choose, then a later file with a new headline applies B2 and provenance is no longer human_reviewed', async () => {
    const admin = await createAdminUser();
    const { candidateId } = await createCandidate('Junior Developer', 'Amman');

    // 1. Initial file and conflict setup on candidate headline
    const { fileId: file1Id } = await createJobForCandidate(
      candidateId,
      'first_cv.pdf',
      'completed'
    );

    const conflictRes = await pool.query(
      `INSERT INTO conflicts (
         candidate_id, field_name, item_type, item_id, status
       ) VALUES ($1, 'headline', 'candidate_profile', $2, 'pending')
       RETURNING id`,
      [candidateId, String(candidateId)]
    );
    const conflictId = conflictRes.rows[0].id;

    await pool.query(
      `INSERT INTO conflict_options (
         conflict_id, value, source_file_id, confidence, evidence
       ) VALUES ($1, $2::jsonb, $3, 0.8, 'Junior Developer at Company')`,
      [conflictId, JSON.stringify('Junior Developer'), file1Id]
    );

    const opt2Res = await pool.query(
      `INSERT INTO conflict_options (
         conflict_id, value, source_file_id, confidence, evidence
       ) VALUES ($1, $2::jsonb, $3, 0.9, 'Full Stack Developer title')
       RETURNING id`,
      [conflictId, JSON.stringify('Full Stack Developer'), file1Id]
    );
    const opt2Id = opt2Res.rows[0].id;

    const reviewRes = await pool.query(
      `INSERT INTO human_reviews (
         candidate_id, review_target_type, item_id, review_reason, review_status, created_at
       ) VALUES ($1, 'conflict', $2, 'conflict', 'pending', NOW())
       RETURNING id`,
      [candidateId, conflictId]
    );
    const reviewId = reviewRes.rows[0].id;

    // 2. Resolve the headline review with choose through resolveReview
    const resolveResult = await resolveReview(
      pool,
      reviewId,
      {
        action: 'choose',
        optionId: opt2Id,
        confidence: 0.95,
        reason: 'Selected verified Full Stack Developer title'
      },
      admin.userId
    );

    expect(resolveResult.review.status).toBe('completed');

    // Verify stored headline was updated to 'Full Stack Developer' and provenance is human_reviewed
    const candCheck = await pool.query(
      'SELECT headline FROM candidate_profiles WHERE id = $1',
      [candidateId]
    );
    expect(candCheck.rows[0].headline).toBe('Full Stack Developer');

    const provCheck = await pool.query(
      `SELECT resolution_method FROM data_provenance
       WHERE candidate_id = $1 AND item_type = 'candidate_profile' AND field_name = 'headline'`,
      [candidateId]
    );
    expect(provCheck.rows[0].resolution_method).toBe('human_reviewed');

    // 3. Run a later file through processJob with a fake LLM that brings a new headline (B2 rule)
    const { jobId: job2Id } = await createJobForCandidate(
      candidateId,
      'later_file.pdf'
    );

    const extraction2 = makeExtraction({
      candidate: {
        headline: makeField(
          'Staff Engineer',
          0.92,
          'Staff Engineer at Acme Corp'
        )
      }
    });

    await processJob(pool, job2Id, {
      steps: buildTestSteps(extraction2),
      sleep: async () => {}
    });

    // 4. Verify: the new value applies and provenance resolution_method is no longer human_reviewed (becomes latest_value)
    const updatedProfile = await pool.query(
      'SELECT headline FROM candidate_profiles WHERE id = $1',
      [candidateId]
    );
    expect(updatedProfile.rows[0].headline).toBe('Staff Engineer');

    const updatedProv = await pool.query(
      `SELECT resolution_method FROM data_provenance
       WHERE candidate_id = $1 AND item_type = 'candidate_profile' AND field_name = 'headline'`,
      [candidateId]
    );
    expect(updatedProv.rows[0].resolution_method).toBe('latest_value');
  });
});
