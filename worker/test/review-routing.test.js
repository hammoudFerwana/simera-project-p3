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
const { REVIEW_REASONS } = require('shared/src/review-items');

describe('US-17 Review Routing and Pending Field Behavior', () => {
  const runId = crypto.randomUUID().slice(0, 8);
  const createdCandidateIds = [];
  const createdEmails = [];
  const initialThreshold = process.env.REVIEW_CONFIDENCE_THRESHOLD;

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
    if (initialThreshold !== undefined) {
      process.env.REVIEW_CONFIDENCE_THRESHOLD = initialThreshold;
    } else {
      delete process.env.REVIEW_CONFIDENCE_THRESHOLD;
    }

    if (createdCandidateIds.length > 0) {
      // Child tables first
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
        'DELETE FROM unknown_skills WHERE candidate_id = ANY($1::int[])',
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
        'DELETE FROM work_experience WHERE candidate_id = ANY($1::int[])',
        [createdCandidateIds]
      );
      await pool.query(
        'DELETE FROM education WHERE candidate_id = ANY($1::int[])',
        [createdCandidateIds]
      );
      await pool.query(
        'DELETE FROM candidate_skills WHERE candidate_id = ANY($1::int[])',
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

    if (createdEmails.length > 0) {
      await pool.query('DELETE FROM users WHERE email = ANY($1::varchar[])', [
        createdEmails
      ]);
    }

    await pool.end();
  });

  async function createCandidate(fields = {}) {
    const email = `test-review-${crypto.randomUUID().slice(0, 8)}-${runId}@example.com`;
    createdEmails.push(email);

    const userRes = await pool.query(
      `INSERT INTO users (email, password_hash, created_at)
       VALUES ($1, 'hash', NOW())
       RETURNING id`,
      [email]
    );
    const userId = userRes.rows[0].id;

    const candRes = await pool.query(
      `INSERT INTO candidate_profiles (
         user_id, first_name, last_name, headline, phone, city, country_code, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING id`,
      [
        userId,
        fields.first_name ?? null,
        fields.last_name ?? null,
        fields.headline ?? null,
        fields.phone ?? null,
        fields.city ?? null,
        fields.country_code ?? null
      ]
    );
    const candidateId = candRes.rows[0].id;
    createdCandidateIds.push(candidateId);
    return { userId, candidateId };
  }

  async function createJobForCandidate(candidateId, filename = 'cv.pdf') {
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
       VALUES ($1, 'queued', NOW())
       RETURNING id`,
      [fileId]
    );
    return { fileId, jobId: jobRes.rows[0].id };
  }

  function makeField(value, confidence = 0.9, evidence = null) {
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
      first_name: makeField(fields.first_name ?? 'Jane'),
      last_name: makeField(fields.last_name ?? 'Doe'),
      headline: makeField(fields.headline ?? 'Software Engineer'),
      summary: makeField(fields.summary ?? null),
      phone: makeField(fields.phone ?? null),
      industry: makeField(fields.industry ?? null),
      profession: makeField(fields.profession ?? null),
      city: makeField(fields.city ?? 'Amman'),
      country_code: makeField(fields.country_code ?? 'JO')
    };
  }

  function makeJobData(fields = {}) {
    return {
      job_title: makeField(fields.job_title ?? 'Backend Developer'),
      company_name: makeField(fields.company_name ?? 'Acme Corp'),
      start_date: makeField(fields.start_date ?? '2020-01'),
      end_date: makeField(fields.end_date ?? null),
      is_current: makeField(fields.is_current ?? true),
      location: makeField(fields.location ?? null),
      employment_type: makeField(fields.employment_type ?? null),
      work_mode: makeField(fields.work_mode ?? null),
      description: makeField(fields.description ?? null),
      responsibilities: makeField(fields.responsibilities ?? null),
      achievements: makeField(fields.achievements ?? null),
      skills_used: makeField(fields.skills_used ?? null),
      company_url: makeField(fields.company_url ?? null)
    };
  }

  function makeEducationData(fields = {}) {
    return {
      institution_name: makeField(fields.institution_name ?? 'MIT'),
      degree_level: makeField(fields.degree_level ?? 'bachelor'),
      field_of_study: makeField(fields.field_of_study ?? 'Computer Science'),
      start_date: makeField(fields.start_date ?? '2016-09'),
      end_date: makeField(fields.end_date ?? '2020-05'),
      is_current: makeField(fields.is_current ?? false),
      grade: makeField(fields.grade ?? null),
      activities: makeField(fields.activities ?? null)
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

  function buildTestSteps(extraction, { skillResolutions = [] } = {}) {
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
      createStoreStep({ db: pool })
    ];
  }

  it('AC1: Given a first file listing two duplicate education items with different values, an intra_source_conflict review is created with both options and evidence', async () => {
    const { candidateId } = await createCandidate();
    const { fileId, jobId } = await createJobForCandidate(
      candidateId,
      'first_cv.pdf'
    );

    const extraction = makeExtraction({
      education: [
        makeEducationData({
          institution_name: 'MIT',
          degree_level: 'bachelor',
          field_of_study: 'Computer Science',
          end_date: '2020-05',
          grade: '3.8'
        }),
        makeEducationData({
          institution_name: 'MIT',
          degree_level: 'bachelor',
          field_of_study: 'Computer Science',
          end_date: '2021-05',
          grade: '3.9'
        })
      ]
    });

    const result = await processJob(pool, jobId, {
      steps: buildTestSteps(extraction),
      sleep: async () => {}
    });
    expect(result).toBe('done');

    // Job ended as completed_with_review with pending_review_count = 2 (conflicts on end_date and grade)
    const jobRes = await pool.query(
      'SELECT status, pending_review_count FROM processing_jobs WHERE id = $1',
      [jobId]
    );
    expect(jobRes.rows[0].status).toBe('completed_with_review');
    expect(jobRes.rows[0].pending_review_count).toBeGreaterThanOrEqual(1);

    // Verify intra_source_conflict row created in conflicts
    const conflictRes = await pool.query(
      `SELECT id, candidate_id, item_type, field_name, status
       FROM conflicts
       WHERE candidate_id = $1 AND field_name = 'end_date'`,
      [candidateId]
    );
    expect(conflictRes.rows).toHaveLength(1);
    expect(conflictRes.rows[0].status).toBe('pending');
    expect(conflictRes.rows[0].item_type).toBe('education');

    const conflictId = conflictRes.rows[0].id;

    // Verify 2 options with evidence on both
    const optRes = await pool.query(
      `SELECT value, source_file_id, confidence, evidence
       FROM conflict_options
       WHERE conflict_id = $1
       ORDER BY id ASC`,
      [conflictId]
    );
    expect(optRes.rows).toHaveLength(2);
    expect(optRes.rows[0].value).toBe('2020-05');
    expect(optRes.rows[0].source_file_id).toBe(fileId);
    expect(optRes.rows[0].evidence).toBe('2020-05');
    expect(optRes.rows[1].value).toBe('2021-05');
    expect(optRes.rows[1].source_file_id).toBe(fileId);
    expect(optRes.rows[1].evidence).toBe('2021-05');

    // Verify human_reviews row
    const reviewRes = await pool.query(
      `SELECT review_target_type, review_reason, review_status, item_id
       FROM human_reviews
       WHERE candidate_id = $1 AND item_id = $2`,
      [candidateId, conflictId]
    );
    expect(reviewRes.rows).toHaveLength(1);
    expect(reviewRes.rows[0].review_target_type).toBe('conflict');
    expect(reviewRes.rows[0].review_reason).toBe('intra_source_conflict');
    expect(reviewRes.rows[0].review_status).toBe('pending');
  });

  it('AC2: Given a job title with confidence 0.3, then only that field goes to review (low_confidence) and the rest is saved', async () => {
    const { candidateId } = await createCandidate();
    const { jobId } = await createJobForCandidate(candidateId);

    // D3: job_title is a deduplication key field -> stored and goes to review
    // location is non-key -> below threshold, not stored (null), goes to review
    const extraction = makeExtraction({
      work_experience: [
        makeJobData({
          job_title: 'Junior Developer',
          company_name: 'Tech Labs',
          start_date: '2021-01',
          location: 'Amman City'
        })
      ]
    });
    // Set confidences: 0.3 for job_title and location, 0.9 for others
    extraction.work_experience[0].job_title.confidence = 0.3;
    extraction.work_experience[0].location.confidence = 0.3;
    extraction.work_experience[0].company_name.confidence = 0.9;
    extraction.work_experience[0].start_date.confidence = 0.9;

    const result = await processJob(pool, jobId, {
      steps: buildTestSteps(extraction),
      sleep: async () => {}
    });
    expect(result).toBe('done');

    // Verify in DB: job_title is stored, location is null
    const workRes = await pool.query(
      'SELECT id, job_title, location, company_name FROM work_experience WHERE candidate_id = $1',
      [candidateId]
    );
    expect(workRes.rows).toHaveLength(1);
    expect(workRes.rows[0].job_title).toBe('Junior Developer');
    expect(workRes.rows[0].location).toBeNull();
    expect(workRes.rows[0].company_name).toBe('Tech Labs');

    const workId = workRes.rows[0].id;

    // Verify data_provenance: job_title has provenance, location does NOT
    const provRes = await pool.query(
      'SELECT field_name FROM data_provenance WHERE candidate_id = $1 AND item_id = $2',
      [candidateId, String(workId)]
    );
    const provFields = provRes.rows.map((r) => r.field_name);
    expect(provFields).toContain('job_title');
    expect(provFields).not.toContain('location');

    // Verify both fields went to low_confidence review
    const conflictsRes = await pool.query(
      `SELECT c.id, c.field_name, c.status, hr.review_reason
       FROM conflicts c
       JOIN human_reviews hr ON hr.item_id = c.id AND hr.review_target_type = 'conflict'
       WHERE c.candidate_id = $1 AND c.item_id = $2
       ORDER BY c.field_name ASC`,
      [candidateId, String(workId)]
    );
    expect(conflictsRes.rows).toHaveLength(2);
    expect(conflictsRes.rows[0].field_name).toBe('job_title');
    expect(conflictsRes.rows[0].review_reason).toBe('low_confidence');
    expect(conflictsRes.rows[1].field_name).toBe('location');
    expect(conflictsRes.rows[1].review_reason).toBe('low_confidence');
  });

  it('AC3: When the threshold changes in settings, then the next file uses it without a code change', async () => {
    // 1. Threshold 0.5: confidence 0.7 is saved and NOT sent to review
    const thresholdBefore = process.env.REVIEW_CONFIDENCE_THRESHOLD;
    process.env.REVIEW_CONFIDENCE_THRESHOLD = '0.5';
    try {
      const { candidateId: cand1 } = await createCandidate();
      const { jobId: job1 } = await createJobForCandidate(cand1);

      const ext1 = makeExtraction({
        candidate: {
          headline: 'Cloud Engineer'
        }
      });
      ext1.candidate.headline.confidence = 0.7;

      await processJob(pool, job1, {
        steps: buildTestSteps(ext1),
        sleep: async () => {}
      });

      const prof1 = await pool.query(
        'SELECT headline FROM candidate_profiles WHERE id = $1',
        [cand1]
      );
      expect(prof1.rows[0].headline).toBe('Cloud Engineer');

      const conflicts1 = await pool.query(
        'SELECT * FROM conflicts WHERE candidate_id = $1',
        [cand1]
      );
      expect(conflicts1.rows).toHaveLength(0);

      const job1Res = await pool.query(
        'SELECT status, pending_review_count FROM processing_jobs WHERE id = $1',
        [job1]
      );
      expect(job1Res.rows[0].status).toBe('completed');
      expect(job1Res.rows[0].pending_review_count).toBe(0);

      // 2. Threshold changed to 0.95 without restart: confidence 0.9 is routed to review
      process.env.REVIEW_CONFIDENCE_THRESHOLD = '0.95';

      const { candidateId: cand2 } = await createCandidate();
      const { jobId: job2 } = await createJobForCandidate(cand2);

      const ext2 = makeExtraction({
        candidate: {
          headline: 'Site Reliability Engineer'
        }
      });
      // Every other field is above 0.95, so only headline (0.9) goes to review.
      for (const wrapper of Object.values(ext2.candidate)) {
        if (wrapper && typeof wrapper === 'object' && 'confidence' in wrapper) {
          wrapper.confidence = 0.99;
        }
      }
      ext2.candidate.headline.confidence = 0.9;

      await processJob(pool, job2, {
        steps: buildTestSteps(ext2),
        sleep: async () => {}
      });

      const prof2 = await pool.query(
        'SELECT headline FROM candidate_profiles WHERE id = $1',
        [cand2]
      );
      expect(prof2.rows[0].headline).toBeNull(); // removed from profile because low confidence

      const conflicts2 = await pool.query(
        `SELECT c.field_name, hr.review_reason
       FROM conflicts c
       JOIN human_reviews hr ON hr.item_id = c.id
       WHERE c.candidate_id = $1`,
        [cand2]
      );
      expect(conflicts2.rows).toHaveLength(1);
      expect(conflicts2.rows[0].field_name).toBe('headline');
      expect(conflicts2.rows[0].review_reason).toBe('low_confidence');

      const job2Res = await pool.query(
        'SELECT status, pending_review_count FROM processing_jobs WHERE id = $1',
        [job2]
      );
      expect(job2Res.rows[0].status).toBe('completed_with_review');
      expect(job2Res.rows[0].pending_review_count).toBe(1);
    } finally {
      if (thresholdBefore === undefined) {
        delete process.env.REVIEW_CONFIDENCE_THRESHOLD;
      } else {
        process.env.REVIEW_CONFIDENCE_THRESHOLD = thresholdBefore;
      }
    }
  });

  it('AC4: Given an invalid date no rule can fix, then a validation_failure review is created on item and profile fields', async () => {
    const { candidateId } = await createCandidate();
    const { fileId, jobId } = await createJobForCandidate(candidateId);

    const ext = makeExtraction({
      candidate: {
        phone: 'invalid-non-numeric-phone'
      },
      work_experience: [
        makeJobData({
          company_name: 'Omega Ltd',
          job_title: 'Database Admin',
          start_date: '2023-13' // Invalid month 13
        })
      ]
    });

    const result = await processJob(pool, jobId, {
      steps: buildTestSteps(ext),
      sleep: async () => {}
    });
    expect(result).toBe('done');

    const workRes = await pool.query(
      'SELECT id, start_date FROM work_experience WHERE candidate_id = $1',
      [candidateId]
    );
    expect(workRes.rows).toHaveLength(1);
    // deduplication_key is computed and item is stored
    const workId = workRes.rows[0].id;

    // Verify 2 validation_failure reviews: one on work_experience.start_date, one on candidate_profile.phone
    const conflictRes = await pool.query(
      `SELECT c.id, c.item_type, c.item_id, c.field_name, hr.review_reason
       FROM conflicts c
       JOIN human_reviews hr ON hr.item_id = c.id AND hr.review_target_type = 'conflict'
       WHERE c.candidate_id = $1
       ORDER BY c.item_type ASC`,
      [candidateId]
    );
    expect(conflictRes.rows).toHaveLength(2);

    const profileConflict = conflictRes.rows.find(
      (c) => c.item_type === 'candidate_profile'
    );
    expect(profileConflict).toBeDefined();
    expect(profileConflict.field_name).toBe('phone');
    expect(profileConflict.review_reason).toBe('validation_failure');

    const workConflict = conflictRes.rows.find(
      (c) => c.item_type === 'work_experience'
    );
    expect(workConflict).toBeDefined();
    expect(workConflict.field_name).toBe('start_date');
    expect(workConflict.item_id).toBe(String(workId));
    expect(workConflict.review_reason).toBe('validation_failure');

    // Verify raw option values and file id
    const workOptRes = await pool.query(
      'SELECT value, source_file_id, evidence FROM conflict_options WHERE conflict_id = $1',
      [workConflict.id]
    );
    expect(workOptRes.rows[0].value).toBe('2023-13');
    expect(workOptRes.rows[0].source_file_id).toBe(fileId);
  });

  it('AC5: Given a disputed field whose stored value is "2019-05", then "2019-05" stays visible and the field shows pending', async () => {
    const { candidateId } = await createCandidate();

    // 1. File 1: stores Acme Corp with start_date 2019-05
    const { fileId: file1Id, jobId: job1Id } = await createJobForCandidate(
      candidateId,
      'file1.pdf'
    );
    const ext1 = makeExtraction({
      work_experience: [
        makeJobData({
          company_name: 'Acme Corp',
          job_title: 'Developer',
          start_date: '2019-05'
        })
      ]
    });
    await processJob(pool, job1Id, {
      steps: buildTestSteps(ext1),
      sleep: async () => {}
    });

    const workRes1 = await pool.query(
      'SELECT id, start_date FROM work_experience WHERE candidate_id = $1',
      [candidateId]
    );
    expect(workRes1.rows[0].start_date).toBe('2019-05');
    const workId = workRes1.rows[0].id;

    // 2. File 2: sends same job with start_date 2019-08 (C2 conflict)
    const { fileId: file2Id, jobId: job2Id } = await createJobForCandidate(
      candidateId,
      'file2.pdf'
    );
    const ext2 = makeExtraction({
      work_experience: [
        makeJobData({
          company_name: 'Acme Corp',
          job_title: 'Developer',
          start_date: '2019-08'
        })
      ]
    });
    await processJob(pool, job2Id, {
      steps: buildTestSteps(ext2),
      sleep: async () => {}
    });

    // Stored value stays "2019-05" in DB
    const workRes2 = await pool.query(
      'SELECT start_date FROM work_experience WHERE id = $1',
      [workId]
    );
    expect(workRes2.rows[0].start_date).toBe('2019-05');

    // Conflict created with 2 options
    const conflictRes = await pool.query(
      `SELECT c.id, c.field_name, c.status, hr.review_reason
       FROM conflicts c
       JOIN human_reviews hr ON hr.item_id = c.id
       WHERE c.candidate_id = $1 AND c.item_id = $2 AND c.field_name = 'start_date'`,
      [candidateId, String(workId)]
    );
    expect(conflictRes.rows).toHaveLength(1);
    expect(conflictRes.rows[0].status).toBe('pending');
    expect(conflictRes.rows[0].review_reason).toBe('conflict');

    const conflictId = conflictRes.rows[0].id;
    const optRes = await pool.query(
      `SELECT value, source_file_id, confidence, evidence
       FROM conflict_options
       WHERE conflict_id = $1
       ORDER BY id ASC`,
      [conflictId]
    );
    expect(optRes.rows).toHaveLength(2);
    // Option 1: stored value "2019-05" with File 1 id
    expect(optRes.rows[0].value).toBe('2019-05');
    expect(optRes.rows[0].source_file_id).toBe(file1Id);
    expect(optRes.rows[0].evidence).toBe('2019-05');

    // Option 2: new value "2019-08" with File 2 id
    expect(optRes.rows[1].value).toBe('2019-08');
    expect(optRes.rows[1].source_file_id).toBe(file2Id);
    expect(optRes.rows[1].evidence).toBe('2019-08');

    // 3. File 3 on same candidate: sends same field "2019-11" -> adds Option 3 to existing conflict
    const { fileId: file3Id, jobId: job3Id } = await createJobForCandidate(
      candidateId,
      'file3.pdf'
    );
    const ext3 = makeExtraction({
      work_experience: [
        makeJobData({
          company_name: 'Acme Corp',
          job_title: 'Developer',
          start_date: '2019-11'
        })
      ]
    });
    await processJob(pool, job3Id, {
      steps: buildTestSteps(ext3),
      sleep: async () => {}
    });

    // No new conflict created
    const allConflicts = await pool.query(
      'SELECT id FROM conflicts WHERE candidate_id = $1 AND item_id = $2',
      [candidateId, String(workId)]
    );
    expect(allConflicts.rows).toHaveLength(1);

    // Option 3 added to existing conflict
    const opt3Res = await pool.query(
      `SELECT value, source_file_id
       FROM conflict_options
       WHERE conflict_id = $1
       ORDER BY id ASC`,
      [conflictId]
    );
    expect(opt3Res.rows).toHaveLength(3);
    expect(opt3Res.rows[2].value).toBe('2019-11');
    expect(opt3Res.rows[2].source_file_id).toBe(file3Id);

    // Job 3 pending_review_count = 0 (an option added to an existing conflict does not count)
    const job3Res = await pool.query(
      'SELECT status, pending_review_count FROM processing_jobs WHERE id = $1',
      [job3Id]
    );
    expect(job3Res.rows[0].pending_review_count).toBe(0);
    expect(job3Res.rows[0].status).toBe('completed');
  });

  it('AC6: Given a disputed field with no stored value, then it stays empty and shows pending', async () => {
    const { candidateId } = await createCandidate();

    // 1. File 1 stores job with null description
    const { jobId: job1Id } = await createJobForCandidate(candidateId);
    const ext1 = makeExtraction({
      work_experience: [
        makeJobData({
          company_name: 'Nova Soft',
          job_title: 'Security Analyst',
          description: null
        })
      ]
    });
    await processJob(pool, job1Id, {
      steps: buildTestSteps(ext1),
      sleep: async () => {}
    });

    const workRes = await pool.query(
      'SELECT id, description FROM work_experience WHERE candidate_id = $1',
      [candidateId]
    );
    expect(workRes.rows[0].description).toBeNull();
    const workId = workRes.rows[0].id;

    // 2. File 2 sends description with low confidence 0.3 (< 0.6)
    const { jobId: job2Id } = await createJobForCandidate(candidateId);
    const ext2 = makeExtraction({
      work_experience: [
        makeJobData({
          company_name: 'Nova Soft',
          job_title: 'Security Analyst',
          description: 'Penetration testing and threat modeling'
        })
      ]
    });
    ext2.work_experience[0].description.confidence = 0.3;

    await processJob(pool, job2Id, {
      steps: buildTestSteps(ext2),
      sleep: async () => {}
    });

    // In DB, description stays null
    const workRes2 = await pool.query(
      'SELECT description FROM work_experience WHERE id = $1',
      [workId]
    );
    expect(workRes2.rows[0].description).toBeNull();

    // Low confidence conflict created
    const conflictRes = await pool.query(
      `SELECT c.id, c.field_name, c.status, hr.review_reason
       FROM conflicts c
       JOIN human_reviews hr ON hr.item_id = c.id
       WHERE c.candidate_id = $1 AND c.item_id = $2 AND c.field_name = 'description'`,
      [candidateId, String(workId)]
    );
    expect(conflictRes.rows).toHaveLength(1);
    expect(conflictRes.rows[0].status).toBe('pending');
    expect(conflictRes.rows[0].review_reason).toBe('low_confidence');
  });

  it('AC7: Given a file with 2 review items, then pending_review_count = 2 and the job is completed_with_review', async () => {
    const { candidateId } = await createCandidate();
    const { jobId } = await createJobForCandidate(candidateId);

    // Provide 2 low-confidence candidate profile fields
    const ext = makeExtraction({
      candidate: {
        headline: 'Frontend Engineer',
        summary: 'Expert in React'
      }
    });
    ext.candidate.headline.confidence = 0.3;
    ext.candidate.summary.confidence = 0.3;

    await processJob(pool, jobId, {
      steps: buildTestSteps(ext),
      sleep: async () => {}
    });

    const jobRes = await pool.query(
      'SELECT status, pending_review_count FROM processing_jobs WHERE id = $1',
      [jobId]
    );
    expect(jobRes.rows[0].status).toBe('completed_with_review');
    expect(jobRes.rows[0].pending_review_count).toBe(2);
  });

  it('AC9: Given an unknown skill, then its review points to the unknown_skills row that holds its evidence', async () => {
    const { candidateId } = await createCandidate();
    const { fileId, jobId } = await createJobForCandidate(candidateId);

    const ext = makeExtraction({
      skills: [
        {
          name: makeField(
            'CustomNicheFramework-2026',
            0.85,
            'Experienced in CustomNicheFramework-2026'
          ),
          proficiency_level: makeField(null),
          stated_duration: makeField(null)
        }
      ]
    });

    const skillResolutions = [
      {
        index: 0,
        status: 'unknown'
      }
    ];

    await processJob(pool, jobId, {
      steps: buildTestSteps(ext, { skillResolutions }),
      sleep: async () => {}
    });

    // Check unknown_skills row
    const unkRes = await pool.query(
      'SELECT id, candidate_id, skill_name, status, evidence, confidence, source_file_id FROM unknown_skills WHERE candidate_id = $1',
      [candidateId]
    );
    expect(unkRes.rows).toHaveLength(1);
    expect(unkRes.rows[0].skill_name).toBe('CustomNicheFramework-2026');
    expect(unkRes.rows[0].status).toBe('pending');
    expect(unkRes.rows[0].source_file_id).toBe(fileId);
    expect(unkRes.rows[0].evidence).toBe(
      'Experienced in CustomNicheFramework-2026'
    );

    const unkId = unkRes.rows[0].id;

    // Check human_reviews row
    const reviewRes = await pool.query(
      `SELECT review_target_type, review_reason, review_status, item_id
       FROM human_reviews
       WHERE candidate_id = $1 AND review_target_type = 'unknown_skill'`,
      [candidateId]
    );
    expect(reviewRes.rows).toHaveLength(1);
    expect(reviewRes.rows[0].review_target_type).toBe('unknown_skill');
    expect(reviewRes.rows[0].review_reason).toBe('unknown_skill');
    expect(reviewRes.rows[0].review_status).toBe('pending');
    expect(reviewRes.rows[0].item_id).toBe(unkId);
  });

  it('C3 uncertain match: a later file with an ambiguous match creates an __item__ conflict and does not insert a duplicate item', async () => {
    const { candidateId } = await createCandidate();

    // 1. File 1: Software Engineer at Zeta Tech
    const { jobId: job1Id } = await createJobForCandidate(candidateId);
    const ext1 = makeExtraction({
      work_experience: [
        makeJobData({
          company_name: 'Zeta Tech',
          job_title: 'Software Engineer',
          start_date: '2020-01',
          end_date: '2022-01',
          is_current: false
        })
      ]
    });
    await processJob(pool, job1Id, {
      steps: buildTestSteps(ext1),
      sleep: async () => {}
    });

    const workRes1 = await pool.query(
      'SELECT id FROM work_experience WHERE candidate_id = $1',
      [candidateId]
    );
    expect(workRes1.rows).toHaveLength(1);
    const storedWorkId = workRes1.rows[0].id;

    // 2. File 2: Same company Zeta Tech, overlapping period, different title -> C3 uncertain match
    const { fileId: file2Id, jobId: job2Id } = await createJobForCandidate(
      candidateId,
      'second.pdf'
    );
    const ext2 = makeExtraction({
      work_experience: [
        makeJobData({
          company_name: 'Zeta Tech',
          job_title: 'Staff Architect',
          start_date: '2020-06',
          end_date: '2022-06',
          is_current: false
        })
      ]
    });
    await processJob(pool, job2Id, {
      steps: buildTestSteps(ext2),
      sleep: async () => {}
    });

    // Verify exactly 1 work_experience row remains in DB (the uncertain match was NOT inserted)
    const workRes2 = await pool.query(
      'SELECT id, job_title FROM work_experience WHERE candidate_id = $1',
      [candidateId]
    );
    expect(workRes2.rows).toHaveLength(1);
    expect(workRes2.rows[0].job_title).toBe('Software Engineer');

    // Conflict created with field_name '__item__', item_id pointing to storedWorkId
    const conflictRes = await pool.query(
      `SELECT c.id, c.item_type, c.item_id, c.field_name, hr.review_reason
       FROM conflicts c
       JOIN human_reviews hr ON hr.item_id = c.id
       WHERE c.candidate_id = $1 AND c.field_name = '__item__'`,
      [candidateId]
    );
    expect(conflictRes.rows).toHaveLength(1);
    expect(conflictRes.rows[0].item_id).toBe(String(storedWorkId));
    expect(conflictRes.rows[0].review_reason).toBe('item_match_uncertain');

    const optRes = await pool.query(
      'SELECT value, source_file_id FROM conflict_options WHERE conflict_id = $1',
      [conflictRes.rows[0].id]
    );
    expect(optRes.rows).toHaveLength(1);
    expect(optRes.rows[0].source_file_id).toBe(file2Id);
    expect(optRes.rows[0].value).toEqual(
      expect.objectContaining({
        item: expect.objectContaining({
          company_name: 'Zeta Tech',
          job_title: 'Staff Architect'
        }),
        candidateStoredIds: [storedWorkId]
      })
    );
  });

  it('AC8: Given any human_reviews row created across the tests, review_reason is one of the six allowed values', async () => {
    const res = await pool.query(
      'SELECT DISTINCT review_reason FROM human_reviews WHERE candidate_id = ANY($1::int[])',
      [createdCandidateIds]
    );
    expect(res.rows.length).toBeGreaterThan(0);

    for (const row of res.rows) {
      expect(REVIEW_REASONS).toContain(row.review_reason);
    }
  });
});
