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
const { processUpload } = require('shared/src/upload/upload.service');

describe('Returning candidate merge (US-21)', () => {
  const runId = crypto.randomUUID().slice(0, 8);
  const createdEmails = [];
  const createdCandidateIds = [];
  let seededSkillId;

  beforeAll(async () => {
    const res = await pool.query('SELECT current_database() AS name');
    const dbName = res.rows[0].name;
    if (!dbName.startsWith('simera_test')) {
      throw new Error(
        `Tests must run on a test database starting with simera_test, not ${dbName}`
      );
    }

    // Seed a skill for the skill tests
    const skillRes = await pool.query(
      `INSERT INTO skills (canonical_name, created_at)
       VALUES ($1, NOW())
       ON CONFLICT (canonical_name) DO UPDATE SET canonical_name = EXCLUDED.canonical_name
       RETURNING id`,
      [`TypeScript-${runId}`]
    );
    seededSkillId = skillRes.rows[0].id;
  });

  afterAll(async () => {
    if (createdCandidateIds.length > 0) {
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
        `DELETE FROM data_provenance_sources
         WHERE provenance_id IN (SELECT id FROM data_provenance WHERE candidate_id = ANY($1::int[]))`,
        [createdCandidateIds]
      );
      await pool.query(
        'DELETE FROM data_provenance WHERE candidate_id = ANY($1::int[])',
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
    if (createdEmails.length > 0) {
      await pool.query('DELETE FROM users WHERE email = ANY($1::varchar[])', [
        createdEmails
      ]);
    }
    if (seededSkillId) {
      await pool.query('DELETE FROM skills WHERE id = $1', [seededSkillId]);
    }
    await pool.end();
  });

  async function createCandidate(
    headline = 'Backend Developer',
    city = 'Amman',
    firstName = 'John',
    lastName = 'Doe'
  ) {
    const email = `test-rc-${crypto.randomUUID().slice(0, 8)}-${runId}@example.com`;
    createdEmails.push(email);

    const userRes = await pool.query(
      `INSERT INTO users (email, password_hash, created_at)
       VALUES ($1, 'hash', NOW())
       RETURNING id`,
      [email]
    );
    const userId = userRes.rows[0].id;

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
    return jobRes.rows[0].id;
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
      first_name: makeField(fields.first_name ?? 'John'),
      last_name: makeField(fields.last_name ?? 'Doe'),
      headline: makeField(fields.headline ?? 'Backend Developer'),
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

  it('AC1: given a stored CV, when a LinkedIn file adds a new job, then the job is added and nothing stored is lost', async () => {
    const { candidateId } = await createCandidate();

    // 1. First file: stored CV with Acme Corp job
    const job1Id = await createJobForCandidate(candidateId, 'first_cv.pdf');
    const extraction1 = makeExtraction({
      work_experience: [
        makeJobData({
          company_name: 'Acme Corp',
          job_title: 'Backend Developer',
          start_date: '2020-01'
        })
      ]
    });
    await processJob(pool, job1Id, {
      steps: buildTestSteps(extraction1),
      sleep: async () => {}
    });

    // 2. Second file: LinkedIn extraction with same Acme Corp job and a new Beta Corp job
    const job2Id = await createJobForCandidate(candidateId, 'linkedin.pdf');
    const extraction2 = makeExtraction({
      work_experience: [
        makeJobData({
          company_name: 'Acme Corp',
          job_title: 'Backend Developer',
          start_date: '2020-01'
        }),
        makeJobData({
          company_name: 'Beta LLC',
          job_title: 'Staff Engineer',
          start_date: '2022-01'
        })
      ]
    });
    await processJob(pool, job2Id, {
      steps: buildTestSteps(extraction2),
      sleep: async () => {}
    });

    // Verify exactly 2 jobs exist and the first is unchanged
    const jobsRes = await pool.query(
      'SELECT company_name, job_title FROM work_experience WHERE candidate_id = $1 ORDER BY id ASC',
      [candidateId]
    );
    expect(jobsRes.rows).toEqual([
      { company_name: 'Acme Corp', job_title: 'Backend Developer' },
      { company_name: 'Beta LLC', job_title: 'Staff Engineer' }
    ]);
  });

  it('AC2: given a stored headline "Backend Developer", when a newer CV says "Senior Backend Developer", then it is applied with latest_value', async () => {
    const { candidateId } = await createCandidate('Backend Developer');

    // First file seeds the headline into data_provenance
    const job1Id = await createJobForCandidate(candidateId);
    const extraction1 = makeExtraction({
      candidate: { headline: 'Backend Developer' }
    });
    await processJob(pool, job1Id, {
      steps: buildTestSteps(extraction1),
      sleep: async () => {}
    });

    // Second file updates headline to Senior Backend Developer
    const job2Id = await createJobForCandidate(candidateId);
    const extraction2 = makeExtraction({
      candidate: { headline: 'Senior Backend Developer' }
    });
    await processJob(pool, job2Id, {
      steps: buildTestSteps(extraction2),
      sleep: async () => {}
    });

    const profileRes = await pool.query(
      'SELECT headline FROM candidate_profiles WHERE id = $1',
      [candidateId]
    );
    expect(profileRes.rows[0].headline).toBe('Senior Backend Developer');

    const provRes = await pool.query(
      `SELECT resolution_method FROM data_provenance
       WHERE candidate_id = $1 AND item_type = 'candidate_profile' AND field_name = 'headline'`,
      [candidateId]
    );
    expect(provRes.rows[0].resolution_method).toBe('latest_value');

    const conflictRes = await pool.query(
      `SELECT status, applied_rule FROM conflicts
       WHERE candidate_id = $1 AND field_name = 'headline'`,
      [candidateId]
    );
    expect(conflictRes.rows).toHaveLength(1);
    expect(conflictRes.rows[0].status).toBe('resolved');
    expect(conflictRes.rows[0].applied_rule).toBe('B2');
  });

  it('AC3: given a stored job that ended, when a newer file says it is current, then the case goes to review and the stored value stays', async () => {
    const { candidateId } = await createCandidate();

    const job1Id = await createJobForCandidate(candidateId);
    const extraction1 = makeExtraction({
      work_experience: [
        makeJobData({
          company_name: 'Delta Corp',
          start_date: '2019-01',
          end_date: '2021-01',
          is_current: false
        })
      ]
    });
    await processJob(pool, job1Id, {
      steps: buildTestSteps(extraction1),
      sleep: async () => {}
    });

    let capturedReviewItems = [];
    const job2Id = await createJobForCandidate(candidateId);
    const extraction2 = makeExtraction({
      work_experience: [
        makeJobData({
          company_name: 'Delta Corp',
          start_date: '2019-01',
          end_date: null,
          is_current: true
        })
      ]
    });

    await processJob(pool, job2Id, {
      steps: buildTestSteps(
        extraction2,
        [],
        async (client, { reviewItems }) => {
          capturedReviewItems = reviewItems;
          return reviewItems.length;
        }
      ),
      sleep: async () => {}
    });

    // Stored value stays ended
    const workRes = await pool.query(
      'SELECT is_current, end_date FROM work_experience WHERE candidate_id = $1',
      [candidateId]
    );
    expect(workRes.rows[0].is_current).toBe(false);
    expect(workRes.rows[0].end_date).toBe('2021-01');

    // Case goes to review with rule C1
    expect(capturedReviewItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: 'C1',
          field: 'is_current'
        })
      ])
    );

    // No conflicts row is created for C1
    const conflictRes = await pool.query(
      'SELECT COUNT(*) FROM conflicts WHERE candidate_id = $1',
      [candidateId]
    );
    expect(Number(conflictRes.rows[0].count)).toBe(0);
  });

  it('AC4: when the candidate uploads exactly the same file again, then it is rejected at upload as a duplicate and no job runs', async () => {
    const { candidateId } = await createCandidate();
    const buffer = Buffer.from(
      '# John Doe CV\nSoftware Engineer with more than 50 chars of valid text to pass min length validation.'
    );

    const uploadOptions = {
      db: pool,
      storage: {
        save: async () => '/storage/test.md',
        delete: async () => {}
      },
      enqueueJob: async () => {},
      config: { minExtractedTextChars: 10 }
    };

    // First upload succeeds
    const firstUpload = await processUpload(uploadOptions, {
      candidateId,
      sourceType: 'linkedin',
      originalFilename: 'profile.md',
      buffer
    });
    expect(firstUpload.jobId).toBeDefined();

    // Second upload with exactly the same buffer is rejected
    await expect(
      processUpload(uploadOptions, {
        candidateId,
        sourceType: 'linkedin',
        originalFilename: 'profile.md',
        buffer
      })
    ).rejects.toMatchObject({
      reason: 'duplicate_file',
      message: 'This file was already uploaded'
    });

    // Exactly one processing_jobs row exists
    const jobsCount = await pool.query(
      `SELECT COUNT(*) FROM processing_jobs
       WHERE file_id IN (SELECT id FROM uploaded_files WHERE candidate_id = $1)`,
      [candidateId]
    );
    expect(Number(jobsCount.rows[0].count)).toBe(1);
  });

  it('AC5: after a merge, then changed_field_count and pending_review_count match what happened', async () => {
    const { candidateId } = await createCandidate('Developer');

    // Job 1: initial data with Developer headline, start_date 2018, no location
    const job1Id = await createJobForCandidate(candidateId);
    const extraction1 = makeExtraction({
      candidate: { headline: 'Developer' },
      work_experience: [
        makeJobData({
          company_name: 'Epsilon Tech',
          job_title: 'Developer',
          start_date: '2018',
          location: null
        })
      ]
    });
    await processJob(pool, job1Id, {
      steps: buildTestSteps(extraction1),
      sleep: async () => {}
    });

    // Job 2:
    // - A1 field fill: location 'Amman' on matched job (+1)
    // - A3 precision upgrade: start_date '2018' -> '2018-01' (+1)
    // - B2 automatic decision: headline 'Developer' -> 'Lead Developer' (+1)
    // Total changedFieldCount = 3, pendingReviewCount = 0
    const job2Id = await createJobForCandidate(candidateId);
    const extraction2 = makeExtraction({
      candidate: { headline: 'Lead Developer' },
      work_experience: [
        makeJobData({
          company_name: 'Epsilon Tech',
          job_title: 'Developer',
          start_date: '2018-01',
          location: 'Amman'
        })
      ]
    });
    await processJob(pool, job2Id, {
      steps: buildTestSteps(extraction2),
      sleep: async () => {}
    });

    const job2Res = await pool.query(
      'SELECT status, changed_field_count, pending_review_count FROM processing_jobs WHERE id = $1',
      [job2Id]
    );
    expect(job2Res.rows[0].status).toBe('completed');
    expect(job2Res.rows[0].changed_field_count).toBe(3);
    expect(job2Res.rows[0].pending_review_count).toBe(0);
  });

  it('AC6: given a human-reviewed city, when a newer file has another city, then B2 applies and the "human reviewed" label goes away', async () => {
    const { candidateId } = await createCandidate('Engineer', 'Amman');

    // First job stores city Amman
    const job1Id = await createJobForCandidate(candidateId);
    const extraction1 = makeExtraction({ candidate: { city: 'Amman' } });
    await processJob(pool, job1Id, {
      steps: buildTestSteps(extraction1),
      sleep: async () => {}
    });

    // Simulate human review on city: label resolution_method as 'human_reviewed'
    await pool.query(
      `UPDATE data_provenance
       SET resolution_method = 'human_reviewed'
       WHERE candidate_id = $1 AND item_type = 'candidate_profile' AND field_name = 'city'`,
      [candidateId]
    );

    // Second file provides city Dubai
    const job2Id = await createJobForCandidate(candidateId);
    const extraction2 = makeExtraction({ candidate: { city: 'Dubai' } });
    await processJob(pool, job2Id, {
      steps: buildTestSteps(extraction2),
      sleep: async () => {}
    });

    const profileRes = await pool.query(
      'SELECT city FROM candidate_profiles WHERE id = $1',
      [candidateId]
    );
    expect(profileRes.rows[0].city).toBe('Dubai');

    const provRes = await pool.query(
      `SELECT resolution_method FROM data_provenance
       WHERE candidate_id = $1 AND item_type = 'candidate_profile' AND field_name = 'city'`,
      [candidateId]
    );
    expect(provRes.rows[0].resolution_method).toBe('latest_value');
  });

  it('AC7: given two files uploaded back to back, then they run in order and the second is compared with the result of the first', async () => {
    const { candidateId } = await createCandidate();

    const job1Id = await createJobForCandidate(candidateId, 'f1.pdf');
    const job2Id = await createJobForCandidate(candidateId, 'f2.pdf');

    const extraction1 = makeExtraction({
      work_experience: [
        makeJobData({
          company_name: 'Zeta Corp',
          job_title: 'Engineer',
          start_date: '2021-01'
        })
      ]
    });
    const extraction2 = makeExtraction({
      work_experience: [
        makeJobData({
          company_name: 'Zeta Corp',
          job_title: 'Engineer',
          start_date: '2021-01',
          location: 'Remote'
        })
      ]
    });

    // 1. Running job 2 first returns 'blocked' because older job 1 is queued
    const blockedResult = await processJob(pool, job2Id, {
      steps: buildTestSteps(extraction2),
      sleep: async () => {}
    });
    expect(blockedResult).toBe('blocked');

    // 2. Run job 1
    const job1Result = await processJob(pool, job1Id, {
      steps: buildTestSteps(extraction1),
      sleep: async () => {}
    });
    expect(job1Result).toBe('done');

    // 3. Run job 2: now unblocked, compares with job 1's stored data
    let capturedDiff = null;
    const captureStep = async (ctx) => {
      capturedDiff = ctx.diff;
      return ctx;
    };
    const stepsWithCapture = [
      buildTestSteps(extraction2)[0],
      createValidateWithCodeStep(),
      createCompareStep({ db: pool }),
      captureStep,
      createStoreStep({ db: pool })
    ];

    const job2Result = await processJob(pool, job2Id, {
      steps: stepsWithCapture,
      sleep: async () => {}
    });
    expect(job2Result).toBe('done');

    // Verify diff matched Zeta Corp as a matched job (in diff.added with scope 'field' for location, not scope 'item')
    expect(capturedDiff.added).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          section: 'work_experience',
          scope: 'field',
          field: 'location'
        })
      ])
    );
  });

  it('A changed start date (C2) does not insert a duplicate job', async () => {
    const { candidateId } = await createCandidate();

    const job1Id = await createJobForCandidate(candidateId);
    const extraction1 = makeExtraction({
      work_experience: [
        makeJobData({
          company_name: 'Theta Inc',
          job_title: 'Dev',
          start_date: '2020-01'
        })
      ]
    });
    await processJob(pool, job1Id, {
      steps: buildTestSteps(extraction1),
      sleep: async () => {}
    });

    // Job 2 has start_date 2021-01 (C2 conflict)
    const job2Id = await createJobForCandidate(candidateId);
    const extraction2 = makeExtraction({
      work_experience: [
        makeJobData({
          company_name: 'Theta Inc',
          job_title: 'Dev',
          start_date: '2021-01'
        })
      ]
    });
    await processJob(pool, job2Id, {
      steps: buildTestSteps(extraction2),
      sleep: async () => {}
    });

    // Verify exactly 1 job exists and start_date did not change
    const jobsRes = await pool.query(
      'SELECT start_date FROM work_experience WHERE candidate_id = $1',
      [candidateId]
    );
    expect(jobsRes.rows).toHaveLength(1);
    expect(jobsRes.rows[0].start_date).toBe('2020-01');
  });

  it('A precision upgrade on start_date updates deduplication_key, so a third file with 2018-01 matches the same row', async () => {
    const { candidateId } = await createCandidate();

    // File 1: start_date 2018
    const job1Id = await createJobForCandidate(candidateId);
    const extraction1 = makeExtraction({
      work_experience: [
        makeJobData({
          company_name: 'Kappa Systems',
          job_title: 'Architect',
          start_date: '2018'
        })
      ]
    });
    await processJob(pool, job1Id, {
      steps: buildTestSteps(extraction1),
      sleep: async () => {}
    });

    // File 2: precision upgrade to 2018-01
    const job2Id = await createJobForCandidate(candidateId);
    const extraction2 = makeExtraction({
      work_experience: [
        makeJobData({
          company_name: 'Kappa Systems',
          job_title: 'Architect',
          start_date: '2018-01'
        })
      ]
    });
    await processJob(pool, job2Id, {
      steps: buildTestSteps(extraction2),
      sleep: async () => {}
    });

    // File 3: start_date 2018-01 again
    const job3Id = await createJobForCandidate(candidateId);
    const extraction3 = makeExtraction({
      work_experience: [
        makeJobData({
          company_name: 'Kappa Systems',
          job_title: 'Architect',
          start_date: '2018-01'
        })
      ]
    });
    await processJob(pool, job3Id, {
      steps: buildTestSteps(extraction3),
      sleep: async () => {}
    });

    // Verify still exactly 1 job row
    const jobsRes = await pool.query(
      'SELECT start_date FROM work_experience WHERE candidate_id = $1',
      [candidateId]
    );
    expect(jobsRes.rows).toHaveLength(1);
    expect(jobsRes.rows[0].start_date).toBe('2018-01');
  });

  it('A skill duration difference (B3) stores months as an integer', async () => {
    const { candidateId } = await createCandidate();

    // File 1: 1 year of TypeScript
    const job1Id = await createJobForCandidate(candidateId);
    const extraction1 = makeExtraction({
      skills: [
        {
          name: makeField(`TypeScript-${runId}`, 0.9, `TypeScript-${runId}`),
          proficiency_level: makeField(
            'intermediate',
            0.9,
            'intermediate in TypeScript'
          ),
          stated_duration: {
            value: { amount: 1, unit: 'years' },
            confidence: 0.9,
            evidence: '1 year of TypeScript experience'
          }
        }
      ]
    });
    const resolutions = [
      {
        index: 0,
        status: 'matched',
        skillId: seededSkillId,
        canonicalName: `TypeScript-${runId}`
      }
    ];
    await processJob(pool, job1Id, {
      steps: buildTestSteps(extraction1, resolutions),
      sleep: async () => {}
    });

    // File 2: 3 years of TypeScript (progression -> B3)
    const job2Id = await createJobForCandidate(candidateId);
    const extraction2 = makeExtraction({
      skills: [
        {
          name: makeField(`TypeScript-${runId}`, 0.9, `TypeScript-${runId}`),
          proficiency_level: makeField(
            'advanced',
            0.9,
            'advanced in TypeScript'
          ),
          stated_duration: {
            value: { amount: 3, unit: 'years' },
            confidence: 0.9,
            evidence: '3 years of TypeScript experience'
          }
        }
      ]
    });
    await processJob(pool, job2Id, {
      steps: buildTestSteps(extraction2, resolutions),
      sleep: async () => {}
    });

    const skillRow = await pool.query(
      'SELECT months_of_experience FROM candidate_skills WHERE candidate_id = $1 AND skill_id = $2',
      [candidateId, seededSkillId]
    );
    expect(skillRow.rows[0].months_of_experience).toBe(36);
  });

  it('A first file still stores exactly as before', async () => {
    const { candidateId } = await createCandidate(null, null, null, null);

    const job1Id = await createJobForCandidate(candidateId);
    const extraction1 = makeExtraction({
      candidate: { headline: 'Fresh Candidate' },
      education: [
        {
          institution_name: makeField(
            'University of Jordan',
            0.9,
            'University of Jordan'
          ),
          degree_level: makeField('Bachelor', 0.9, 'Bachelor'),
          degree_name: makeField('BSc', 0.9, 'BSc'),
          field_of_study: makeField(
            'Computer Science',
            0.9,
            'Computer Science'
          ),
          start_date: makeField('2016', 0.9, '2016'),
          end_date: makeField('2020', 0.9, '2020'),
          is_current: makeField(false, 0.9, 'Graduated'),
          gpa: makeField(null),
          honors: makeField(null),
          location: makeField('Amman', 0.9, 'Amman'),
          description: makeField(null)
        }
      ]
    });

    await processJob(pool, job1Id, {
      steps: buildTestSteps(extraction1),
      sleep: async () => {}
    });

    const eduRes = await pool.query(
      'SELECT institution_name, degree_level FROM education WHERE candidate_id = $1',
      [candidateId]
    );
    expect(eduRes.rows).toHaveLength(1);
    expect(eduRes.rows[0].institution_name).toBe('University of Jordan');

    const jobRes = await pool.query(
      'SELECT status, changed_field_count, pending_review_count FROM processing_jobs WHERE id = $1',
      [job1Id]
    );
    expect(jobRes.rows[0].status).toBe('completed');
    expect(jobRes.rows[0].changed_field_count).toBe(0);
    expect(jobRes.rows[0].pending_review_count).toBe(0);
  });
});
