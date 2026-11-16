const path = require('path');
const os = require('os');
const fs = require('fs/promises');
const crypto = require('crypto');
const request = require('supertest');
const { Pool } = require('pg');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { createApp } = require('../src/app');
const { signToken } = require('../src/auth/token');
const { createLocalStorage } = require('shared/src/upload/storage');

process.env.JWT_SECRET = 'test-secret-for-us-12';

const RUN_ID = crypto.randomBytes(4).toString('hex');
let idCounter = 0;

function nextId() {
  idCounter += 1;
  return `${RUN_ID}-${idCounter}`;
}

describe('Admin Candidates API (US-12)', () => {
  let pool;
  let app;
  let tempStorageDir;
  let storage;

  // Track created entities for clean teardown (children first)
  const created = {
    provenanceSourceIds: [],
    provenanceIds: [],
    humanReviewIds: [],
    conflictIds: [],
    candidateSkillIds: [],
    skillIds: [],
    jobIds: [],
    fileIds: [],
    workExperienceIds: [],
    profileIds: [],
    adminIds: [],
    userIds: []
  };

  let adminUser;
  let candidateUser;
  let adminCookie;
  let candidateCookie;

  let cand1;
  let cand2;
  let cand3;

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      throw new Error('TEST_DATABASE_URL must be set in .env');
    }

    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });

    const { rows } = await pool.query('SELECT current_database() AS name');
    if (!rows[0].name.startsWith('simera_test')) {
      await pool.end();
      throw new Error(
        `Database tests must run on a database starting with simera_test, not ${rows[0].name}`
      );
    }

    tempStorageDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'simera-admin-test-')
    );
    storage = createLocalStorage({ directory: tempStorageDir });

    app = createApp({
      getDb: () => pool,
      getStorage: () => storage
    });

    // Helper to insert user
    async function insertUser({ email, role }) {
      const userRes = await pool.query(
        `INSERT INTO users (email, password_hash, email_verified, created_at)
         VALUES ($1, 'hash', true, NOW())
         RETURNING id`,
        [email]
      );
      const userId = userRes.rows[0].id;
      created.userIds.push(userId);

      if (role === 'admin') {
        const adminRes = await pool.query(
          `INSERT INTO admins (user_id) VALUES ($1) RETURNING id`,
          [userId]
        );
        created.adminIds.push(adminRes.rows[0].id);
      }

      return { userId, role, email };
    }

    async function insertCandidate({
      email,
      firstName,
      lastName,
      city = 'Ramallah'
    }) {
      const user = await insertUser({ email, role: 'candidate' });
      const profRes = await pool.query(
        `INSERT INTO candidate_profiles (
           user_id, first_name, last_name, headline, summary, phone,
           industry, profession, city, country_code, created_at
         )
         VALUES ($1, $2, $3, 'Engineer', 'Summary text', '+970599000000',
                 'Tech', 'Software Developer', $4, 'PS', NOW())
         RETURNING id`,
        [user.userId, firstName, lastName, city]
      );
      const profileId = profRes.rows[0].id;
      created.profileIds.push(profileId);
      return { candidateId: profileId, userId: user.userId, email };
    }

    // Create admin user and candidate user for authorization checks
    adminUser = await insertUser({
      email: `admin-${nextId()}@example.com`,
      role: 'admin'
    });
    adminCookie = `access_token=${signToken({
      userId: adminUser.userId,
      role: 'admin'
    })}`;

    candidateUser = await insertUser({
      email: `candidate-${nextId()}@example.com`,
      role: 'candidate'
    });
    candidateCookie = `access_token=${signToken({
      userId: candidateUser.userId,
      role: 'candidate'
    })}`;

    // Create 3 baseline candidates (for AC1, AC2, pagination)
    cand1 = await insertCandidate({
      email: `cand1-${nextId()}@example.com`,
      firstName: 'Alice',
      lastName: 'Smith',
      city: 'Ramallah'
    });
    cand2 = await insertCandidate({
      email: `cand2-${nextId()}@example.com`,
      firstName: 'Bob',
      lastName: 'Jones',
      city: 'Nablus'
    });
    cand3 = await insertCandidate({
      email: `cand3-${nextId()}@example.com`,
      firstName: 'Charlie',
      lastName: 'Brown',
      city: 'Jerusalem'
    });
  });

  afterAll(async () => {
    if (pool) {
      if (created.provenanceSourceIds.length > 0) {
        await pool.query(
          `DELETE FROM data_provenance_sources WHERE id = ANY($1::int[])`,
          [created.provenanceSourceIds]
        );
      }
      if (created.provenanceIds.length > 0) {
        await pool.query(
          `DELETE FROM data_provenance WHERE id = ANY($1::int[])`,
          [created.provenanceIds]
        );
      }
      if (created.humanReviewIds.length > 0) {
        await pool.query(
          `DELETE FROM human_reviews WHERE id = ANY($1::int[])`,
          [created.humanReviewIds]
        );
      }
      if (created.conflictIds.length > 0) {
        await pool.query(`DELETE FROM conflicts WHERE id = ANY($1::int[])`, [
          created.conflictIds
        ]);
      }
      if (created.candidateSkillIds.length > 0) {
        await pool.query(
          `DELETE FROM candidate_skills WHERE id = ANY($1::int[])`,
          [created.candidateSkillIds]
        );
      }
      if (created.skillIds.length > 0) {
        await pool.query(`DELETE FROM skills WHERE id = ANY($1::int[])`, [
          created.skillIds
        ]);
      }
      if (created.workExperienceIds.length > 0) {
        await pool.query(
          `DELETE FROM work_experience WHERE id = ANY($1::int[])`,
          [created.workExperienceIds]
        );
      }
      if (created.jobIds.length > 0) {
        await pool.query(
          `DELETE FROM processing_jobs WHERE id = ANY($1::int[])`,
          [created.jobIds]
        );
      }
      if (created.fileIds.length > 0) {
        await pool.query(
          `DELETE FROM uploaded_files WHERE id = ANY($1::int[])`,
          [created.fileIds]
        );
      }
      if (created.profileIds.length > 0) {
        await pool.query(
          `DELETE FROM candidate_profiles WHERE id = ANY($1::int[])`,
          [created.profileIds]
        );
      }
      if (created.adminIds.length > 0) {
        await pool.query(`DELETE FROM admins WHERE id = ANY($1::int[])`, [
          created.adminIds
        ]);
      }
      if (created.userIds.length > 0) {
        await pool.query(`DELETE FROM users WHERE id = ANY($1::int[])`, [
          created.userIds
        ]);
      }

      await pool.end();
    }

    if (tempStorageDir) {
      await fs.rm(tempStorageDir, { recursive: true, force: true });
    }
  });

  // Helper to create uploaded file and job
  async function createUploadedFileAndJob({
    candidateId,
    sourceType = 'cv',
    filename = 'test.pdf',
    status = 'completed',
    failureReason = null,
    pendingReviewCount = 0
  }) {
    const fileBytes = Buffer.from('simulated-pdf-content');
    const storageLocation = await storage.save(fileBytes, '.pdf');
    const hash =
      crypto.createHash('sha256').update(fileBytes).digest('hex') +
      `-${nextId()}`;

    const fileRes = await pool.query(
      `INSERT INTO uploaded_files (
         candidate_id, source_type, original_filename, file_size, file_hash,
         storage_location, mime_type, uploaded_at, validated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'application/pdf', NOW(), NOW())
       RETURNING id, uploaded_at`,
      [
        candidateId,
        sourceType,
        filename,
        fileBytes.length,
        hash,
        storageLocation
      ]
    );
    const fileId = fileRes.rows[0].id;
    created.fileIds.push(fileId);

    const jobRes = await pool.query(
      `INSERT INTO processing_jobs (
         file_id, status, created_at, started_at, completed_at, failure_reason, pending_review_count
       )
       VALUES ($1, $2, NOW(), NOW(), NOW(), $3, $4)
       RETURNING id`,
      [fileId, status, failureReason, pendingReviewCount]
    );
    const jobId = jobRes.rows[0].id;
    created.jobIds.push(jobId);

    return {
      fileId,
      jobId,
      storageLocation,
      uploadedAt: fileRes.rows[0].uploaded_at
    };
  }

  // AC1: 3 candidates, then the list total is 3 and holds all three ids.
  it('AC1: returns all candidates with correct total and candidate IDs', async () => {
    const res = await request(app)
      .get(`/api/admin/candidates?search=${RUN_ID}`)
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    const ids = res.body.items.map((item) => item.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        cand1.candidateId,
        cand2.candidateId,
        cand3.candidateId
      ])
    );
  });

  // AC2: search by one email (different letter case), then only that candidate.
  it('AC2: search by one email case-insensitively returns only that candidate', async () => {
    const upperEmail = cand1.email.toUpperCase();
    const res = await request(app)
      .get(`/api/admin/candidates?search=${encodeURIComponent(upperEmail)}`)
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].id).toBe(cand1.candidateId);
  });

  // AC3: hasPendingReview=true with one pending and one completed human_reviews row on two candidates, then only the pending one.
  it('AC3: hasPendingReview=true returns only candidates with pending human reviews', async () => {
    // cand1 gets a pending human review
    const hrPending = await pool.query(
      `INSERT INTO human_reviews (
         candidate_id, review_target_type, item_id, review_reason, review_status, created_at
       )
       VALUES ($1, 'conflict', 1, 'conflict', 'pending', NOW())
       RETURNING id`,
      [cand1.candidateId]
    );
    created.humanReviewIds.push(hrPending.rows[0].id);

    // cand2 gets a completed human review
    const hrCompleted = await pool.query(
      `INSERT INTO human_reviews (
         candidate_id, review_target_type, item_id, review_reason, review_status, created_at
       )
       VALUES ($1, 'conflict', 2, 'conflict', 'completed', NOW())
       RETURNING id`,
      [cand2.candidateId]
    );
    created.humanReviewIds.push(hrCompleted.rows[0].id);

    const res = await request(app)
      .get(`/api/admin/candidates?hasPendingReview=true&search=${RUN_ID}`)
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].id).toBe(cand1.candidateId);
  });

  // hasPendingReview=false with one pending and one completed human_reviews row, then only the candidate with no pending review.
  it('hasPendingReview=false returns only the candidate with no pending review', async () => {
    // cand3 gets a pending review so only cand2 has no pending reviews among the seeded candidates
    const hrPending3 = await pool.query(
      `INSERT INTO human_reviews (
         candidate_id, review_target_type, item_id, review_reason, review_status, created_at
       )
       VALUES ($1, 'conflict', 3, 'conflict', 'pending', NOW())
       RETURNING id`,
      [cand3.candidateId]
    );
    created.humanReviewIds.push(hrPending3.rows[0].id);

    const res = await request(app)
      .get(`/api/admin/candidates?hasPendingReview=false&search=${RUN_ID}`)
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].id).toBe(cand2.candidateId);
  });

  // status filter: latest job failed vs completed, then status=failed returns only the first. status=unknown -> 400.
  it('status filter: returns candidate matching latest job status, rejects unknown status with 400', async () => {
    // cand1 gets a completed job
    await createUploadedFileAndJob({
      candidateId: cand1.candidateId,
      status: 'completed'
    });

    // cand2 gets a failed job
    await createUploadedFileAndJob({
      candidateId: cand2.candidateId,
      status: 'failed',
      failureReason: 'Parsing error'
    });

    const resSuccess = await request(app)
      .get(`/api/admin/candidates?status=failed&search=${RUN_ID}`)
      .set('Cookie', adminCookie);

    expect(resSuccess.status).toBe(200);
    expect(resSuccess.body.total).toBe(1);
    expect(resSuccess.body.items[0].id).toBe(cand2.candidateId);

    const resInvalid = await request(app)
      .get('/api/admin/candidates?status=unknown')
      .set('Cookie', adminCookie);

    expect(resInvalid.status).toBe(400);
    expect(resInvalid.body.errors.status).toBeDefined();
  });

  // pagination: pageSize=2 on 3 candidates -> 2 items, total 3, and page=2 -> 1 item. pageSize=101 -> 400.
  it('pagination: paginates correctly with page and pageSize, rejects pageSize > 100 with 400', async () => {
    const page1 = await request(app)
      .get(`/api/admin/candidates?pageSize=2&page=1&search=${RUN_ID}`)
      .set('Cookie', adminCookie);

    expect(page1.status).toBe(200);
    expect(page1.body.pageSize).toBe(2);
    expect(page1.body.page).toBe(1);
    expect(page1.body.total).toBe(3);
    expect(page1.body.items).toHaveLength(2);

    const page2 = await request(app)
      .get(`/api/admin/candidates?pageSize=2&page=2&search=${RUN_ID}`)
      .set('Cookie', adminCookie);

    expect(page2.status).toBe(200);
    expect(page2.body.page).toBe(2);
    expect(page2.body.items).toHaveLength(1);
    expect(page2.body.total).toBe(3);

    const resOverflow = await request(app)
      .get('/api/admin/candidates?pageSize=101')
      .set('Cookie', adminCookie);

    expect(resOverflow.status).toBe(400);
    expect(resOverflow.body.errors.pageSize).toBeDefined();
  });

  // AC4: a profile field with two sources (two jobs, two files), then value, both sources with fileType, fileName, uploadedAt, confidence, evidence, and resolutionMethod.
  it('AC4: shows field value, resolutionMethod, and both sources with full metadata', async () => {
    const fileJob1 = await createUploadedFileAndJob({
      candidateId: cand1.candidateId,
      sourceType: 'cv',
      filename: 'cv_v1.pdf'
    });
    const fileJob2 = await createUploadedFileAndJob({
      candidateId: cand1.candidateId,
      sourceType: 'linkedin',
      filename: 'linkedin_export.pdf'
    });

    const provRes = await pool.query(
      `INSERT INTO data_provenance (
         candidate_id, item_type, item_id, field_name, resolution_method, approved_at
       )
       VALUES ($1, 'candidate_profile', $2, 'first_name', 'latest_value', NOW())
       RETURNING id`,
      [cand1.candidateId, String(cand1.candidateId)]
    );
    const provId = provRes.rows[0].id;
    created.provenanceIds.push(provId);

    const s1Res = await pool.query(
      `INSERT INTO data_provenance_sources (
         provenance_id, job_id, source_value, confidence, evidence
       )
       VALUES ($1, $2, '"Alice"'::jsonb, 0.85, 'First name: Alice')
       RETURNING id`,
      [provId, fileJob1.jobId]
    );
    created.provenanceSourceIds.push(s1Res.rows[0].id);

    const s2Res = await pool.query(
      `INSERT INTO data_provenance_sources (
         provenance_id, job_id, source_value, confidence, evidence
       )
       VALUES ($1, $2, '"Alice"'::jsonb, 0.98, 'Name Alice Smith')
       RETURNING id`,
      [provId, fileJob2.jobId]
    );
    created.provenanceSourceIds.push(s2Res.rows[0].id);

    const res = await request(app)
      .get(`/api/admin/candidates/${cand1.candidateId}`)
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    const field = res.body.profile.first_name;
    expect(field.value).toBe('Alice');
    expect(field.resolutionMethod).toBe('latest_value');
    expect(field.sources).toHaveLength(2);

    expect(field.sources[0]).toMatchObject({
      jobId: fileJob1.jobId,
      fileId: fileJob1.fileId,
      fileType: 'cv',
      fileName: 'cv_v1.pdf',
      value: 'Alice',
      confidence: 0.85,
      evidence: 'First name: Alice'
    });
    expect(field.sources[0].uploadedAt).toBeDefined();

    expect(field.sources[1]).toMatchObject({
      jobId: fileJob2.jobId,
      fileId: fileJob2.fileId,
      fileType: 'linkedin',
      fileName: 'linkedin_export.pdf',
      value: 'Alice',
      confidence: 0.98,
      evidence: 'Name Alice Smith'
    });
    expect(field.sources[1].uploadedAt).toBeDefined();
  });

  // AC5: a human_reviewed field with a source -> humanReviewed true, manualValue false. A human_reviewed field with no source and a resolved conflict plus a completed review -> manualValue true and reviewId equal to that review id.
  it('AC5: human_reviewed field with source has humanReviewed true and manualValue false; field with no source and resolved conflict has manualValue true and reviewId', async () => {
    // 1. headline: human_reviewed with source
    const provHeadlineRes = await pool.query(
      `INSERT INTO data_provenance (
         candidate_id, item_type, item_id, field_name, resolution_method, approved_at
       )
       VALUES ($1, 'candidate_profile', $2, 'headline', 'human_reviewed', NOW())
       RETURNING id`,
      [cand1.candidateId, String(cand1.candidateId)]
    );
    const provHeadlineId = provHeadlineRes.rows[0].id;
    created.provenanceIds.push(provHeadlineId);

    const fileJob = await createUploadedFileAndJob({
      candidateId: cand1.candidateId,
      sourceType: 'cv',
      filename: 'resume_headline.pdf'
    });

    const sHeadlineRes = await pool.query(
      `INSERT INTO data_provenance_sources (
         provenance_id, job_id, source_value, confidence, evidence
       )
       VALUES ($1, $2, '"Software Engineer"'::jsonb, 1.0, 'Headline text')
       RETURNING id`,
      [provHeadlineId, fileJob.jobId]
    );
    created.provenanceSourceIds.push(sHeadlineRes.rows[0].id);

    // 2. summary: human_reviewed with NO source, resolved conflict and completed review
    const provSummaryRes = await pool.query(
      `INSERT INTO data_provenance (
         candidate_id, item_type, item_id, field_name, resolution_method, approved_at
       )
       VALUES ($1, 'candidate_profile', $2, 'summary', 'human_reviewed', NOW())
       RETURNING id`,
      [cand1.candidateId, String(cand1.candidateId)]
    );
    const provSummaryId = provSummaryRes.rows[0].id;
    created.provenanceIds.push(provSummaryId);

    const conflictRes = await pool.query(
      `INSERT INTO conflicts (
         candidate_id, item_type, item_id, field_name, status, resolution_method, resolved_at
       )
       VALUES ($1, 'candidate_profile', $2, 'summary', 'resolved', 'human_review', NOW())
       RETURNING id`,
      [cand1.candidateId, String(cand1.candidateId)]
    );
    const conflictId = conflictRes.rows[0].id;
    created.conflictIds.push(conflictId);

    const hrRes = await pool.query(
      `INSERT INTO human_reviews (
         candidate_id, review_target_type, item_id, review_reason, review_status, created_at
       )
       VALUES ($1, 'conflict', $2, 'conflict', 'completed', NOW())
       RETURNING id`,
      [cand1.candidateId, conflictId]
    );
    const reviewId = hrRes.rows[0].id;
    created.humanReviewIds.push(reviewId);

    const res = await request(app)
      .get(`/api/admin/candidates/${cand1.candidateId}`)
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);

    const headline = res.body.profile.headline;
    expect(headline.humanReviewed).toBe(true);
    expect(headline.manualValue).toBe(false);
    expect(headline.reviewId).toBeNull();

    const summary = res.body.profile.summary;
    expect(summary.humanReviewed).toBe(true);
    expect(summary.manualValue).toBe(true);
    expect(summary.reviewId).toBe(reviewId);
  });

  // AC6: a pending conflicts row on city -> the stored city value and pendingReview true. Another field -> pendingReview false.
  it('AC6: pending conflict on city marks pendingReview true while keeping stored value, other fields have pendingReview false', async () => {
    const conflictRes = await pool.query(
      `INSERT INTO conflicts (
         candidate_id, item_type, item_id, field_name, status
       )
       VALUES ($1, 'candidate_profile', $2, 'city', 'pending')
       RETURNING id`,
      [cand1.candidateId, String(cand1.candidateId)]
    );
    created.conflictIds.push(conflictRes.rows[0].id);

    const res = await request(app)
      .get(`/api/admin/candidates/${cand1.candidateId}`)
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.profile.city.value).toBe('Ramallah');
    expect(res.body.profile.city.pendingReview).toBe(true);
    expect(res.body.profile.country_code.pendingReview).toBe(false);
  });

  // AC7: rawUrl of a file, called by the admin -> 200 with Content-Disposition attachment. Called by a candidate -> 403.
  it('AC7: admin downloads raw file with Content-Disposition attachment, candidate gets 403', async () => {
    const fileJob = await createUploadedFileAndJob({
      candidateId: cand1.candidateId,
      sourceType: 'cv',
      filename: 'my_original_resume.pdf'
    });

    const resProfile = await request(app)
      .get(`/api/admin/candidates/${cand1.candidateId}`)
      .set('Cookie', adminCookie);

    expect(resProfile.status).toBe(200);
    const targetFile = resProfile.body.files.find(
      (f) => f.id === fileJob.fileId
    );
    expect(targetFile).toBeDefined();
    expect(targetFile.rawUrl).toBe(`/api/uploads/${fileJob.fileId}/raw`);

    const adminDownload = await request(app)
      .get(targetFile.rawUrl)
      .set('Cookie', adminCookie);

    expect(adminDownload.status).toBe(200);
    expect(adminDownload.headers['content-disposition']).toMatch(/attachment/);

    const candidateDownload = await request(app)
      .get(targetFile.rawUrl)
      .set('Cookie', candidateCookie);

    expect(candidateDownload.status).toBe(403);
    expect(candidateDownload.body.errors.auth).toBe(
      'You do not have access to this resource'
    );
  });

  // AC8: a candidate cookie on GET /api/admin/candidates and on GET /api/admin/candidates/:id -> 403. No cookie -> 401.
  it('AC8: candidate role gets 403 on admin routes, unauthenticated request gets 401', async () => {
    const candList = await request(app)
      .get('/api/admin/candidates')
      .set('Cookie', candidateCookie);
    expect(candList.status).toBe(403);
    expect(candList.body.errors.auth).toBe(
      'You do not have access to this resource'
    );

    const candDetail = await request(app)
      .get(`/api/admin/candidates/${cand1.candidateId}`)
      .set('Cookie', candidateCookie);
    expect(candDetail.status).toBe(403);
    expect(candDetail.body.errors.auth).toBe(
      'You do not have access to this resource'
    );

    const noAuthList = await request(app).get('/api/admin/candidates');
    expect(noAuthList.status).toBe(401);
    expect(noAuthList.body.errors.auth).toBe('Log in to continue');

    const noAuthDetail = await request(app).get(
      `/api/admin/candidates/${cand1.candidateId}`
    );
    expect(noAuthDetail.status).toBe(401);
    expect(noAuthDetail.body.errors.auth).toBe('Log in to continue');
  });

  // 404 for an unknown candidate id, 400 for id "abc".
  it('returns 404 for unknown candidate id and 400 for non-numeric candidate id', async () => {
    const resNotFound = await request(app)
      .get('/api/admin/candidates/99999999')
      .set('Cookie', adminCookie);

    expect(resNotFound.status).toBe(404);
    expect(resNotFound.body.errors.candidateId).toBe('Candidate not found');

    const resInvalid = await request(app)
      .get('/api/admin/candidates/abc')
      .set('Cookie', adminCookie);

    expect(resInvalid.status).toBe(400);
    expect(resInvalid.body.errors.candidateId).toBe(
      'Candidate id must be a positive integer'
    );
  });

  // skills: a candidate_skills row with a provenance row on skill_id -> skillName and skill_id FieldView.
  it('skills: candidate_skills join skills displays skillName and skill_id FieldView', async () => {
    const skillRes = await pool.query(
      `INSERT INTO skills (canonical_name, created_at)
       VALUES ($1, NOW())
       RETURNING id`,
      [`PostgreSQL-${nextId()}`]
    );
    const skillId = skillRes.rows[0].id;
    created.skillIds.push(skillId);

    const csRes = await pool.query(
      `INSERT INTO candidate_skills (
         candidate_id, skill_id, proficiency_level, months_of_experience, created_at
       )
       VALUES ($1, $2, 'advanced', 36, NOW())
       RETURNING id`,
      [cand1.candidateId, skillId]
    );
    const csId = csRes.rows[0].id;
    created.candidateSkillIds.push(csId);

    const provRes = await pool.query(
      `INSERT INTO data_provenance (
         candidate_id, item_type, item_id, field_name, resolution_method, approved_at
       )
       VALUES ($1, 'candidate_skills', $2, 'skill_id', 'no_conflict', NOW())
       RETURNING id`,
      [cand1.candidateId, String(csId)]
    );
    created.provenanceIds.push(provRes.rows[0].id);

    const res = await request(app)
      .get(`/api/admin/candidates/${cand1.candidateId}`)
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    const skillItem = res.body.sections.skills.find((s) => s.id === csId);
    expect(skillItem).toBeDefined();
    expect(skillItem.skillName).toMatch(/^PostgreSQL-/);
    expect(skillItem.fields.skill_id.value).toBe(skillId);
    expect(skillItem.fields.skill_id.resolutionMethod).toBe('no_conflict');
    expect(skillItem.fields.proficiency_level.value).toBe('advanced');
    expect(skillItem.fields.months_of_experience.value).toBe(36);
  });

  it('experience months: calculated on read from work experience, never stored', async () => {
    const jobs = [
      ['Backend Developer', 'Acme', '2020-01', '2021-12'],
      ['Backend Developer', 'Beta', '2021-01', '2022-12']
    ];
    const jobIds = [];
    for (const [title, company, start, end] of jobs) {
      const weRes = await pool.query(
        `INSERT INTO work_experience (
           candidate_id, job_title, company_name, start_date, end_date,
           is_current, deduplication_key
         )
         VALUES ($1, $2, $3, $4, $5, false, $6)
         RETURNING id`,
        [cand3.candidateId, title, company, start, end, `exp-${nextId()}`]
      );
      jobIds.push(weRes.rows[0].id);
      created.workExperienceIds.push(weRes.rows[0].id);
    }
    const countBefore = await pool.query(
      'SELECT count(*)::int AS n FROM work_experience WHERE candidate_id = $1',
      [cand3.candidateId]
    );

    const res = await request(app)
      .get(`/api/admin/candidates/${cand3.candidateId}`)
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.experience).toEqual({ totalMonths: 36 });
    expect(
      res.body.sections.work_experience.map((item) => [item.id, item.months])
    ).toEqual([
      [jobIds[0], 24],
      [jobIds[1], 24]
    ]);
    const countAfter = await pool.query(
      'SELECT count(*)::int AS n FROM work_experience WHERE candidate_id = $1',
      [cand3.candidateId]
    );
    expect(countAfter.rows[0].n).toBe(countBefore.rows[0].n);
  });

  it('experience months: a candidate with no work experience has totalMonths 0', async () => {
    const res = await request(app)
      .get(`/api/admin/candidates/${cand2.candidateId}`)
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.experience).toEqual({ totalMonths: 0 });
  });
});
