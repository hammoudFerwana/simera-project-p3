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
const { getCandidateProfile } = require('../src/admin/candidates.service');
const { buildDeduplicationKey } = require('shared/src/deduplication');

process.env.JWT_SECRET = 'test-secret-for-us-18';

const RUN_ID = crypto.randomBytes(4).toString('hex');
let idCounter = 0;

function nextId() {
  idCounter += 1;
  return `${RUN_ID}-${idCounter}`;
}

describe('Admin Reviews API (US-18)', () => {
  let pool;
  let app;
  let tempStorageDir;
  let storage;

  const created = {
    auditLogIds: [],
    humanReviewIds: [],
    conflictOptionIds: [],
    conflictIds: [],
    provenanceIds: [],
    workExperienceIds: [],
    fileIds: [],
    candidateProfileIds: [],
    adminIds: [],
    userIds: []
  };

  let adminUser;
  let candidateUser;
  let adminCookie;
  let candidateCookie;

  async function insertUser({ email, role }) {
    const userRes = await pool.query(
      `INSERT INTO users (email, password_hash, email_verified, created_at)
       VALUES ($1, 'hash', true, NOW())
       RETURNING id`,
      [email]
    );
    const userId = userRes.rows[0].id;
    created.userIds.push(userId);

    let adminId = null;
    if (role === 'admin') {
      const adminRes = await pool.query(
        `INSERT INTO admins (user_id) VALUES ($1) RETURNING id`,
        [userId]
      );
      adminId = adminRes.rows[0].id;
      created.adminIds.push(adminId);
    }

    return { userId, adminId, role, email };
  }

  async function insertCandidate({ email, firstName, lastName }) {
    const user = await insertUser({ email, role: 'candidate' });
    const profRes = await pool.query(
      `INSERT INTO candidate_profiles (
         user_id, first_name, last_name, headline, summary, created_at
       )
       VALUES ($1, $2, $3, 'Engineer', 'Summary', NOW())
       RETURNING id`,
      [user.userId, firstName, lastName]
    );
    const candidateId = profRes.rows[0].id;
    created.candidateProfileIds.push(candidateId);
    return { candidateId, userId: user.userId, email, firstName, lastName };
  }

  async function insertUploadedFile({ candidateId, originalFilename }) {
    const fileBytes = Buffer.from('dummy file content for US-18 testing');
    const hash =
      crypto.createHash('sha256').update(fileBytes).digest('hex').slice(0, 32) +
      `-${nextId()}`;

    const storageLocation = await storage.save(fileBytes, '.pdf');

    const fileRes = await pool.query(
      `INSERT INTO uploaded_files (
         candidate_id, source_type, original_filename, file_size, file_hash,
         storage_location, mime_type, uploaded_at, validated_at
       )
       VALUES ($1, 'cv', $2, $3, $4, $5, 'application/pdf', NOW(), NOW())
       RETURNING id, source_type, original_filename, uploaded_at`,
      [candidateId, originalFilename, fileBytes.length, hash, storageLocation]
    );
    const file = fileRes.rows[0];
    created.fileIds.push(file.id);
    return file;
  }

  async function insertWorkExperience({
    candidateId,
    jobTitle,
    companyName,
    startDate,
    endDate = null,
    location = null,
    description = null
  }) {
    const fieldsObj = {
      company_name: { value: companyName },
      job_title: { value: jobTitle },
      start_date: { value: startDate }
    };
    const dedupKey = buildDeduplicationKey('work_experience', fieldsObj);

    const res = await pool.query(
      `INSERT INTO work_experience (
         candidate_id, job_title, company_name, start_date, end_date,
         location, description, deduplication_key
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, candidate_id, job_title, company_name, start_date, end_date, location, description, deduplication_key`,
      [
        candidateId,
        jobTitle,
        companyName,
        startDate,
        endDate,
        location,
        description,
        dedupKey
      ]
    );
    const row = res.rows[0];
    created.workExperienceIds.push(row.id);
    return row;
  }

  async function insertConflict({
    candidateId,
    itemType,
    itemId,
    fieldName,
    status = 'pending'
  }) {
    const res = await pool.query(
      `INSERT INTO conflicts (
         candidate_id, item_type, item_id, field_name, status
       )
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, candidate_id, item_type, item_id, field_name, status`,
      [candidateId, itemType, String(itemId), fieldName, status]
    );
    const row = res.rows[0];
    created.conflictIds.push(row.id);
    return row;
  }

  async function insertConflictOption({
    conflictId,
    value,
    sourceFileId = null,
    confidence = null,
    evidence = null
  }) {
    const res = await pool.query(
      `INSERT INTO conflict_options (
         conflict_id, value, source_file_id, confidence, evidence
       )
       VALUES ($1, $2::jsonb, $3, $4, $5)
       RETURNING id, conflict_id, value, source_file_id, confidence, evidence`,
      [conflictId, JSON.stringify(value), sourceFileId, confidence, evidence]
    );
    const row = res.rows[0];
    created.conflictOptionIds.push(row.id);
    return row;
  }

  async function insertHumanReview({
    candidateId,
    reviewTargetType = 'conflict',
    itemId,
    reviewReason = 'conflict',
    reviewStatus = 'pending',
    adminId = null,
    reviewedAt = null,
    reviewResult = null,
    confidence = null,
    createdAt = new Date()
  }) {
    const res = await pool.query(
      `INSERT INTO human_reviews (
         candidate_id, review_target_type, item_id, review_reason,
         review_status, admin_id, reviewed_at, review_result, confidence, created_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, candidate_id, review_target_type, item_id, review_reason, review_status, created_at`,
      [
        candidateId,
        reviewTargetType,
        itemId,
        reviewReason,
        reviewStatus,
        adminId,
        reviewedAt,
        reviewResult,
        confidence,
        createdAt
      ]
    );
    const row = res.rows[0];
    created.humanReviewIds.push(row.id);
    return row;
  }

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
      path.join(os.tmpdir(), 'simera-admin-reviews-test-')
    );
    storage = createLocalStorage({ directory: tempStorageDir });

    app = createApp({
      getDb: () => pool,
      getStorage: () => storage
    });

    adminUser = await insertUser({
      email: `admin-us18-${nextId()}@example.com`,
      role: 'admin'
    });
    adminCookie = `access_token=${signToken({
      userId: adminUser.userId,
      role: 'admin'
    })}`;

    candidateUser = await insertUser({
      email: `candidate-us18-${nextId()}@example.com`,
      role: 'candidate'
    });
    candidateCookie = `access_token=${signToken({
      userId: candidateUser.userId,
      role: 'candidate'
    })}`;
  });

  afterAll(async () => {
    if (pool) {
      if (created.candidateProfileIds.length > 0) {
        await pool.query(
          'DELETE FROM human_audit_log WHERE candidate_id = ANY($1::int[])',
          [created.candidateProfileIds]
        );
        await pool.query(
          `DELETE FROM data_provenance_sources
           WHERE provenance_id IN (SELECT id FROM data_provenance WHERE candidate_id = ANY($1::int[]))`,
          [created.candidateProfileIds]
        );
        await pool.query(
          'DELETE FROM data_provenance WHERE candidate_id = ANY($1::int[])',
          [created.candidateProfileIds]
        );
        await pool.query(
          'DELETE FROM human_reviews WHERE candidate_id = ANY($1::int[])',
          [created.candidateProfileIds]
        );
        await pool.query(
          `DELETE FROM conflict_options
           WHERE conflict_id IN (SELECT id FROM conflicts WHERE candidate_id = ANY($1::int[]))`,
          [created.candidateProfileIds]
        );
        await pool.query(
          'DELETE FROM conflicts WHERE candidate_id = ANY($1::int[])',
          [created.candidateProfileIds]
        );
        await pool.query(
          'DELETE FROM unknown_skills WHERE candidate_id = ANY($1::int[])',
          [created.candidateProfileIds]
        );
        await pool.query(
          'DELETE FROM work_experience WHERE candidate_id = ANY($1::int[])',
          [created.candidateProfileIds]
        );
        await pool.query(
          'DELETE FROM uploaded_files WHERE candidate_id = ANY($1::int[])',
          [created.candidateProfileIds]
        );
        await pool.query(
          'DELETE FROM candidate_profiles WHERE id = ANY($1::int[])',
          [created.candidateProfileIds]
        );
      }
      if (created.adminIds.length > 0) {
        await pool.query('DELETE FROM admins WHERE id = ANY($1::int[])', [
          created.adminIds
        ]);
      }
      if (created.userIds.length > 0) {
        await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [
          created.userIds
        ]);
      }
      await pool.end();
    }
    if (tempStorageDir) {
      try {
        await fs.rm(tempStorageDir, { recursive: true, force: true });
      } catch {
        /* ignore cleanup error */
      }
    }
  });

  describe('GET /api/admin/reviews (AC1 Queue Listing)', () => {
    it('AC1: three pending reviews of different reasons appear with candidate, createdAt and reason, and filters/paging work', async () => {
      const cand = await insertCandidate({
        email: `cand-ac1-${nextId()}@example.com`,
        firstName: 'Tariq',
        lastName: 'Mansour'
      });

      const we = await insertWorkExperience({
        candidateId: cand.candidateId,
        jobTitle: 'Backend Engineer',
        companyName: 'TechCorp',
        startDate: '2020-01'
      });

      const c1 = await insertConflict({
        candidateId: cand.candidateId,
        itemType: 'work_experience',
        itemId: we.id,
        fieldName: 'start_date'
      });
      const c2 = await insertConflict({
        candidateId: cand.candidateId,
        itemType: 'work_experience',
        itemId: we.id,
        fieldName: 'location'
      });
      const c3 = await insertConflict({
        candidateId: cand.candidateId,
        itemType: 'work_experience',
        itemId: we.id,
        fieldName: '__item__'
      });

      const r1 = await insertHumanReview({
        candidateId: cand.candidateId,
        reviewTargetType: 'conflict',
        itemId: c1.id,
        reviewReason: 'conflict',
        reviewStatus: 'pending',
        createdAt: new Date(Date.now() - 3000)
      });
      const r2 = await insertHumanReview({
        candidateId: cand.candidateId,
        reviewTargetType: 'conflict',
        itemId: c2.id,
        reviewReason: 'low_confidence',
        reviewStatus: 'pending',
        createdAt: new Date(Date.now() - 2000)
      });
      const r3 = await insertHumanReview({
        candidateId: cand.candidateId,
        reviewTargetType: 'conflict',
        itemId: c3.id,
        reviewReason: 'item_match_uncertain',
        reviewStatus: 'pending',
        createdAt: new Date(Date.now() - 1000)
      });

      // 1. List all pending reviews for candidate
      const resAll = await request(app)
        .get(
          `/api/admin/reviews?candidateId=${cand.candidateId}&status=pending`
        )
        .set('Cookie', adminCookie);

      expect(resAll.status).toBe(200);
      expect(resAll.body.total).toBe(3);
      expect(resAll.body.items).toHaveLength(3);
      // Newest first
      expect(resAll.body.items[0].id).toBe(r3.id);
      expect(resAll.body.items[0].reason).toBe('item_match_uncertain');
      expect(resAll.body.items[0].candidate.id).toBe(cand.candidateId);
      expect(resAll.body.items[0].candidate.firstName).toBe('Tariq');
      expect(resAll.body.items[1].id).toBe(r2.id);
      expect(resAll.body.items[1].reason).toBe('low_confidence');
      expect(resAll.body.items[2].id).toBe(r1.id);
      expect(resAll.body.items[2].reason).toBe('conflict');

      // 2. Filter by reason
      const resFilterReason = await request(app)
        .get(
          `/api/admin/reviews?candidateId=${cand.candidateId}&reason=low_confidence`
        )
        .set('Cookie', adminCookie);

      expect(resFilterReason.status).toBe(200);
      expect(resFilterReason.body.total).toBe(1);
      expect(resFilterReason.body.items[0].id).toBe(r2.id);
      expect(resFilterReason.body.items[0].reason).toBe('low_confidence');

      // 3. Pagination
      const resPage = await request(app)
        .get(
          `/api/admin/reviews?candidateId=${cand.candidateId}&page=2&pageSize=2`
        )
        .set('Cookie', adminCookie);

      expect(resPage.status).toBe(200);
      expect(resPage.body.page).toBe(2);
      expect(resPage.body.pageSize).toBe(2);
      expect(resPage.body.total).toBe(3);
      expect(resPage.body.items).toHaveLength(1);
      expect(resPage.body.items[0].id).toBe(r1.id);

      // 4. Invalid query
      const resBad = await request(app)
        .get('/api/admin/reviews?page=bad')
        .set('Cookie', adminCookie);
      expect(resBad.status).toBe(400);
      expect(resBad.body.errors).toHaveProperty('page');
    });
  });

  describe('GET /api/admin/reviews/:id (AC2 Detail & AC3 Raw File)', () => {
    it('AC2 & AC3: start_date conflict returns both options with file metadata and opens raw file', async () => {
      const cand = await insertCandidate({
        email: `cand-ac2-${nextId()}@example.com`,
        firstName: 'Layla',
        lastName: 'Khoury'
      });

      const file1 = await insertUploadedFile({
        candidateId: cand.candidateId,
        originalFilename: 'resume_2019.pdf'
      });
      const file2 = await insertUploadedFile({
        candidateId: cand.candidateId,
        originalFilename: 'updated_profile.pdf'
      });

      const we = await insertWorkExperience({
        candidateId: cand.candidateId,
        jobTitle: 'Senior Developer',
        companyName: 'Apex',
        startDate: '2019-05'
      });

      const conflict = await insertConflict({
        candidateId: cand.candidateId,
        itemType: 'work_experience',
        itemId: we.id,
        fieldName: 'start_date'
      });

      const opt1 = await insertConflictOption({
        conflictId: conflict.id,
        value: '2019-05',
        sourceFileId: file1.id,
        confidence: 0.88,
        evidence: 'May 2019 start in experience'
      });

      const opt2 = await insertConflictOption({
        conflictId: conflict.id,
        value: '2019-08',
        sourceFileId: file2.id,
        confidence: 0.94,
        evidence: 'August 2019 updated header'
      });

      const review = await insertHumanReview({
        candidateId: cand.candidateId,
        reviewTargetType: 'conflict',
        itemId: conflict.id,
        reviewReason: 'conflict',
        reviewStatus: 'pending'
      });

      // GET detail
      const res = await request(app)
        .get(`/api/admin/reviews/${review.id}`)
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(review.id);
      expect(res.body.targetType).toBe('conflict');
      expect(res.body.storedValue).toBe('2019-05');
      expect(res.body.candidate.id).toBe(cand.candidateId);
      expect(res.body.candidate.firstName).toBe('Layla');
      expect(res.body.conflict.id).toBe(conflict.id);
      expect(res.body.conflict.fieldName).toBe('start_date');

      expect(res.body.options).toHaveLength(2);
      expect(res.body.options[0].id).toBe(opt1.id);
      expect(res.body.options[0].value).toBe('2019-05');
      expect(res.body.options[0].confidence).toBe(0.88);
      expect(res.body.options[0].evidence).toBe('May 2019 start in experience');
      expect(res.body.options[0].sourceFile.id).toBe(file1.id);
      expect(res.body.options[0].sourceFile.originalFilename).toBe(
        'resume_2019.pdf'
      );
      expect(res.body.options[0].sourceFile.rawUrl).toBe(
        `/api/uploads/${file1.id}/raw`
      );

      expect(res.body.options[1].id).toBe(opt2.id);
      expect(res.body.options[1].value).toBe('2019-08');
      expect(res.body.options[1].sourceFile.id).toBe(file2.id);

      // AC3: open original file via rawUrl
      const rawRes = await request(app)
        .get(res.body.options[0].sourceFile.rawUrl)
        .set('Cookie', adminCookie);

      expect(rawRes.status).toBe(200);
    });
  });

  describe('POST /api/admin/reviews/:id/resolve (AC4 choose & AC8 human_audit_log)', () => {
    it('AC4 & AC8: choose option 2019-08 updates column, recomputes dedup key, completes review, provenance human_reviewed with 0 sources, and audit row created', async () => {
      const cand = await insertCandidate({
        email: `cand-ac4-${nextId()}@example.com`,
        firstName: 'Sami',
        lastName: 'Haddad'
      });

      const file = await insertUploadedFile({
        candidateId: cand.candidateId,
        originalFilename: 'sami_cv.pdf'
      });

      const we = await insertWorkExperience({
        candidateId: cand.candidateId,
        jobTitle: 'Lead Architect',
        companyName: 'CloudNet',
        startDate: '2019-05'
      });

      const conflict = await insertConflict({
        candidateId: cand.candidateId,
        itemType: 'work_experience',
        itemId: we.id,
        fieldName: 'start_date'
      });

      await insertConflictOption({
        conflictId: conflict.id,
        value: '2019-05',
        sourceFileId: file.id,
        confidence: 0.8
      });

      const opt2 = await insertConflictOption({
        conflictId: conflict.id,
        value: '2019-08',
        sourceFileId: file.id,
        confidence: 0.9
      });

      const review = await insertHumanReview({
        candidateId: cand.candidateId,
        reviewTargetType: 'conflict',
        itemId: conflict.id,
        reviewReason: 'conflict',
        reviewStatus: 'pending'
      });

      const res = await request(app)
        .post(`/api/admin/reviews/${review.id}/resolve`)
        .set('Cookie', adminCookie)
        .send({
          action: 'choose',
          optionId: opt2.id,
          confidence: 0.9,
          reason: 'Verified from revised certification timeline'
        });

      expect(res.status).toBe(200);
      expect(res.body.review.status).toBe('completed');
      expect(res.body.review.storedValue).toBe('2019-08');
      expect(res.body.applied.previousValue).toBe('2019-05');
      expect(res.body.applied.newValue).toBe('2019-08');

      // Verify DB row start_date updated
      const weRow = await pool.query(
        'SELECT start_date, deduplication_key FROM work_experience WHERE id = $1',
        [we.id]
      );
      expect(weRow.rows[0].start_date).toBe('2019-08');

      // Verify deduplication_key recomputed with new start_date
      const expectedDedupKey = buildDeduplicationKey('work_experience', {
        company_name: { value: 'CloudNet' },
        job_title: { value: 'Lead Architect' },
        start_date: { value: '2019-08' }
      });
      expect(weRow.rows[0].deduplication_key).toBe(expectedDedupKey);

      // Verify conflict resolved
      const conflictCheck = await pool.query(
        'SELECT status, resolution_method, resolved_value FROM conflicts WHERE id = $1',
        [conflict.id]
      );
      expect(conflictCheck.rows[0].status).toBe('resolved');
      expect(conflictCheck.rows[0].resolution_method).toBe('human_review');
      expect(conflictCheck.rows[0].resolved_value).toBe('2019-08');

      // Verify human_reviews completed with confidence 0.9 and adminId
      const reviewCheck = await pool.query(
        'SELECT review_status, confidence, admin_id, review_result FROM human_reviews WHERE id = $1',
        [review.id]
      );
      expect(reviewCheck.rows[0].review_status).toBe('completed');
      expect(reviewCheck.rows[0].confidence).toBe(0.9);
      expect(reviewCheck.rows[0].admin_id).toBe(adminUser.adminId);
      expect(reviewCheck.rows[0].review_result).toBe('choose');

      // Verify provenance has resolution_method human_reviewed and 0 sources
      const provCheck = await pool.query(
        `SELECT dp.id, dp.resolution_method, COUNT(dps.id)::int AS source_count
         FROM data_provenance dp
         LEFT JOIN data_provenance_sources dps ON dps.provenance_id = dp.id
         WHERE dp.candidate_id = $1 AND dp.item_type = 'work_experience' AND dp.item_id = $2 AND dp.field_name = 'start_date'
         GROUP BY dp.id, dp.resolution_method`,
        [cand.candidateId, String(we.id)]
      );
      expect(provCheck.rows[0].resolution_method).toBe('human_reviewed');
      expect(provCheck.rows[0].source_count).toBe(0);

      // Verify US-12 profile shows humanReviewed: true
      const profileData = await getCandidateProfile(pool, cand.candidateId);
      const experienceField =
        profileData.sections.work_experience[0].fields.start_date;
      expect(experienceField.humanReviewed).toBe(true);

      // AC8: one human_audit_log row with admin id, timestamp, previous and new value
      const auditRes = await pool.query(
        `SELECT * FROM human_audit_log
         WHERE candidate_id = $1 AND item_type = 'work_experience' AND item_id = $2 AND field_name = 'start_date'`,
        [cand.candidateId, String(we.id)]
      );
      expect(auditRes.rows).toHaveLength(1);
      expect(auditRes.rows[0].changed_by).toBe(adminUser.adminId);
      expect(auditRes.rows[0].previous_value).toBe('2019-05');
      expect(auditRes.rows[0].new_value).toBe('2019-08');
      expect(auditRes.rows[0].reason).toBe(
        'Verified from revised certification timeline'
      );
    });
  });

  describe('POST /api/admin/reviews/:id/resolve (AC5 manual value)', () => {
    it('AC5: manual value on non-key field stored, provenance human_reviewed with 0 sources, and US-12 profile shows manualValue: true', async () => {
      const cand = await insertCandidate({
        email: `cand-ac5-${nextId()}@example.com`,
        firstName: 'Mona',
        lastName: 'Zaid'
      });

      const we = await insertWorkExperience({
        candidateId: cand.candidateId,
        jobTitle: 'Frontend Engineer',
        companyName: 'WebFlow',
        startDate: '2021-01',
        description: 'Old description'
      });

      const conflict = await insertConflict({
        candidateId: cand.candidateId,
        itemType: 'work_experience',
        itemId: we.id,
        fieldName: 'description'
      });

      const review = await insertHumanReview({
        candidateId: cand.candidateId,
        reviewTargetType: 'conflict',
        itemId: conflict.id,
        reviewReason: 'conflict',
        reviewStatus: 'pending'
      });

      const res = await request(app)
        .post(`/api/admin/reviews/${review.id}/resolve`)
        .set('Cookie', adminCookie)
        .send({
          action: 'manual',
          value: 'Modernized frontend infrastructure using React and Vite',
          confidence: 0.95,
          reason: 'Clarified responsibilities during phone screen'
        });

      expect(res.status).toBe(200);
      expect(res.body.review.status).toBe('completed');
      expect(res.body.applied.newValue).toBe(
        'Modernized frontend infrastructure using React and Vite'
      );

      // Verify DB column updated
      const weCheck = await pool.query(
        'SELECT description FROM work_experience WHERE id = $1',
        [we.id]
      );
      expect(weCheck.rows[0].description).toBe(
        'Modernized frontend infrastructure using React and Vite'
      );

      // Verify provenance is human_reviewed with 0 sources
      const provCheck = await pool.query(
        `SELECT dp.id, dp.resolution_method, COUNT(dps.id)::int AS source_count
         FROM data_provenance dp
         LEFT JOIN data_provenance_sources dps ON dps.provenance_id = dp.id
         WHERE dp.candidate_id = $1 AND dp.item_type = 'work_experience' AND dp.item_id = $2 AND dp.field_name = 'description'
         GROUP BY dp.id, dp.resolution_method`,
        [cand.candidateId, String(we.id)]
      );
      expect(provCheck.rows[0].resolution_method).toBe('human_reviewed');
      expect(provCheck.rows[0].source_count).toBe(0);

      // Verify US-12 profile shows manualValue: true
      const profileData = await getCandidateProfile(pool, cand.candidateId);
      const descField =
        profileData.sections.work_experience[0].fields.description;
      expect(descField.manualValue).toBe(true);
      expect(descField.humanReviewed).toBe(true);
    });
  });

  describe('POST /api/admin/reviews/:id/resolve (AC6 C3 merge & add)', () => {
    it('AC6 merge: fills empty location on stored row without changing job_title or adding a new row', async () => {
      const cand = await insertCandidate({
        email: `cand-ac6m-${nextId()}@example.com`,
        firstName: 'Omar',
        lastName: 'Farouk'
      });

      const we = await insertWorkExperience({
        candidateId: cand.candidateId,
        jobTitle: 'DevOps Engineer',
        companyName: 'InfraCo',
        startDate: '2022-03',
        location: null
      });

      const conflict = await insertConflict({
        candidateId: cand.candidateId,
        itemType: 'work_experience',
        itemId: we.id,
        fieldName: '__item__'
      });

      await insertConflictOption({
        conflictId: conflict.id,
        value: {
          item: {
            job_title: 'DevOps Engineer',
            company_name: 'InfraCo',
            start_date: '2022-03',
            location: 'Amman, Jordan'
          },
          candidateStoredIds: [we.id]
        }
      });

      const review = await insertHumanReview({
        candidateId: cand.candidateId,
        reviewTargetType: 'conflict',
        itemId: conflict.id,
        reviewReason: 'item_match_uncertain',
        reviewStatus: 'pending'
      });

      const countBefore = await pool.query(
        'SELECT COUNT(*)::int AS count FROM work_experience WHERE candidate_id = $1',
        [cand.candidateId]
      );
      expect(countBefore.rows[0].count).toBe(1);

      const res = await request(app)
        .post(`/api/admin/reviews/${review.id}/resolve`)
        .set('Cookie', adminCookie)
        .send({
          action: 'merge',
          confidence: 0.9,
          reason: 'Same role confirmed, filled location'
        });

      expect(res.status).toBe(200);
      expect(res.body.applied.filledFields).toEqual(['location']);

      // After merge: location filled, job_title unchanged, still exactly 1 row
      const countAfter = await pool.query(
        'SELECT COUNT(*)::int AS count FROM work_experience WHERE candidate_id = $1',
        [cand.candidateId]
      );
      expect(countAfter.rows[0].count).toBe(1);

      const weCheck = await pool.query(
        'SELECT job_title, location FROM work_experience WHERE id = $1',
        [we.id]
      );
      expect(weCheck.rows[0].job_title).toBe('DevOps Engineer');
      expect(weCheck.rows[0].location).toBe('Amman, Jordan');
    });

    it('AC6 add: inserts new work_experience row with correct values and deduplication_key', async () => {
      const cand = await insertCandidate({
        email: `cand-ac6a-${nextId()}@example.com`,
        firstName: 'Nour',
        lastName: 'Salem'
      });

      const weStored = await insertWorkExperience({
        candidateId: cand.candidateId,
        jobTitle: 'Junior QA',
        companyName: 'TestLab',
        startDate: '2021-01'
      });

      const conflict = await insertConflict({
        candidateId: cand.candidateId,
        itemType: 'work_experience',
        itemId: weStored.id,
        fieldName: '__item__'
      });

      await insertConflictOption({
        conflictId: conflict.id,
        value: {
          item: {
            job_title: 'QA Lead',
            company_name: 'TestLab',
            start_date: '2023-01',
            location: 'Dubai'
          },
          candidateStoredIds: [weStored.id]
        }
      });

      const review = await insertHumanReview({
        candidateId: cand.candidateId,
        reviewTargetType: 'conflict',
        itemId: conflict.id,
        reviewReason: 'item_match_uncertain',
        reviewStatus: 'pending'
      });

      const res = await request(app)
        .post(`/api/admin/reviews/${review.id}/resolve`)
        .set('Cookie', adminCookie)
        .send({
          action: 'add',
          confidence: 0.95,
          reason: 'Promotion is a separate role'
        });

      expect(res.status).toBe(200);
      expect(res.body.applied).toHaveProperty('newItemId');
      const newId = res.body.applied.newItemId;
      created.workExperienceIds.push(newId);

      const weNew = await pool.query(
        'SELECT * FROM work_experience WHERE id = $1',
        [newId]
      );
      expect(weNew.rows[0].job_title).toBe('QA Lead');
      expect(weNew.rows[0].company_name).toBe('TestLab');
      expect(weNew.rows[0].start_date).toBe('2023-01');

      const expectedKey = buildDeduplicationKey('work_experience', {
        company_name: { value: 'TestLab' },
        job_title: { value: 'QA Lead' },
        start_date: { value: '2023-01' }
      });
      expect(weNew.rows[0].deduplication_key).toBe(expectedKey);
    });
  });

  describe('Validation & Error Cases (AC7, AC10, 409s, 400s)', () => {
    it('AC7: no confidence gives 400 and changes nothing; confidence 1.5 gives 400', async () => {
      const cand = await insertCandidate({
        email: `cand-ac7-${nextId()}@example.com`,
        firstName: 'Zaid',
        lastName: 'K'
      });
      const we = await insertWorkExperience({
        candidateId: cand.candidateId,
        jobTitle: 'Engineer',
        companyName: 'Acme',
        startDate: '2020-01'
      });
      const conflict = await insertConflict({
        candidateId: cand.candidateId,
        itemType: 'work_experience',
        itemId: we.id,
        fieldName: 'start_date'
      });
      const opt = await insertConflictOption({
        conflictId: conflict.id,
        value: '2020-05'
      });
      const review = await insertHumanReview({
        candidateId: cand.candidateId,
        reviewTargetType: 'conflict',
        itemId: conflict.id,
        reviewReason: 'conflict',
        reviewStatus: 'pending'
      });

      // No confidence
      const resNoConf = await request(app)
        .post(`/api/admin/reviews/${review.id}/resolve`)
        .set('Cookie', adminCookie)
        .send({ action: 'choose', optionId: opt.id });

      expect(resNoConf.status).toBe(400);
      expect(resNoConf.body.errors.confidence).toBe('Confidence is required');

      // Verify unchanged in DB
      const weCheck = await pool.query(
        'SELECT start_date FROM work_experience WHERE id = $1',
        [we.id]
      );
      expect(weCheck.rows[0].start_date).toBe('2020-01');

      // Confidence > 1
      const resOverConf = await request(app)
        .post(`/api/admin/reviews/${review.id}/resolve`)
        .set('Cookie', adminCookie)
        .send({ action: 'choose', optionId: opt.id, confidence: 1.5 });

      expect(resOverConf.status).toBe(400);
      expect(resOverConf.body.errors.confidence).toBe(
        'Confidence must be between 0 and 1'
      );
    });

    it('AC10: candidate cookie gets 403 on all three endpoints; no cookie gets 401', async () => {
      // 1. Candidate cookie -> 403
      const resListCand = await request(app)
        .get('/api/admin/reviews')
        .set('Cookie', candidateCookie);
      expect(resListCand.status).toBe(403);

      const resDetailCand = await request(app)
        .get('/api/admin/reviews/1')
        .set('Cookie', candidateCookie);
      expect(resDetailCand.status).toBe(403);

      const resResolveCand = await request(app)
        .post('/api/admin/reviews/1/resolve')
        .set('Cookie', candidateCookie)
        .send({ action: 'choose', optionId: 1, confidence: 0.9 });
      expect(resResolveCand.status).toBe(403);

      // 2. No cookie -> 401
      const resListNoAuth = await request(app).get('/api/admin/reviews');
      expect(resListNoAuth.status).toBe(401);

      const resDetailNoAuth = await request(app).get('/api/admin/reviews/1');
      expect(resDetailNoAuth.status).toBe(401);

      const resResolveNoAuth = await request(app)
        .post('/api/admin/reviews/1/resolve')
        .send({ action: 'choose', optionId: 1, confidence: 0.9 });
      expect(resResolveNoAuth.status).toBe(401);
    });

    it('409 on second resolve', async () => {
      const cand = await insertCandidate({
        email: `cand-dup-${nextId()}@example.com`,
        firstName: 'Fadi',
        lastName: 'N'
      });
      const we = await insertWorkExperience({
        candidateId: cand.candidateId,
        jobTitle: 'Developer',
        companyName: 'Acme',
        startDate: '2019-01'
      });
      const conflict = await insertConflict({
        candidateId: cand.candidateId,
        itemType: 'work_experience',
        itemId: we.id,
        fieldName: 'start_date'
      });
      const opt = await insertConflictOption({
        conflictId: conflict.id,
        value: '2019-03'
      });
      const review = await insertHumanReview({
        candidateId: cand.candidateId,
        reviewTargetType: 'conflict',
        itemId: conflict.id,
        reviewReason: 'conflict',
        reviewStatus: 'pending'
      });

      // First resolve: 200
      const res1 = await request(app)
        .post(`/api/admin/reviews/${review.id}/resolve`)
        .set('Cookie', adminCookie)
        .send({ action: 'choose', optionId: opt.id, confidence: 0.9 });
      expect(res1.status).toBe(200);

      // Second resolve: 409
      const res2 = await request(app)
        .post(`/api/admin/reviews/${review.id}/resolve`)
        .set('Cookie', adminCookie)
        .send({ action: 'choose', optionId: opt.id, confidence: 0.9 });
      expect(res2.status).toBe(409);
      expect(res2.body.errors.review).toBe('Review already completed');
    });

    it('409 on unknown_skill review resolve via reviews endpoint (D8)', async () => {
      const cand = await insertCandidate({
        email: `cand-us-${nextId()}@example.com`,
        firstName: 'Kareem',
        lastName: 'S'
      });

      const file = await insertUploadedFile({
        candidateId: cand.candidateId,
        originalFilename: 'kareem_cv.pdf'
      });

      // Insert dummy unknown skill
      const usRes = await pool.query(
        `INSERT INTO unknown_skills (candidate_id, skill_name, source_file_id, evidence, status, created_at)
         VALUES ($1, 'Rust', $2, 'Rust mentioned in skills', 'pending', NOW())
         RETURNING id`,
        [cand.candidateId, file.id]
      );
      const unknownSkillId = usRes.rows[0].id;

      const review = await insertHumanReview({
        candidateId: cand.candidateId,
        reviewTargetType: 'unknown_skill',
        itemId: unknownSkillId,
        reviewReason: 'unknown_skill',
        reviewStatus: 'pending'
      });

      const res = await request(app)
        .post(`/api/admin/reviews/${review.id}/resolve`)
        .set('Cookie', adminCookie)
        .send({ action: 'manual', value: 'Rust', confidence: 0.9 });

      expect(res.status).toBe(409);
      expect(res.body.errors.review).toContain(
        'Unknown skill reviews must be resolved through /api/admin/unknown-skills/:id/resolve'
      );
    });

    it('409 on key collision when updating start_date to match another item', async () => {
      const cand = await insertCandidate({
        email: `cand-col-${nextId()}@example.com`,
        firstName: 'Hala',
        lastName: 'M'
      });

      // Existing item 1: Acme, Engineer, 2020-01
      await insertWorkExperience({
        candidateId: cand.candidateId,
        jobTitle: 'Engineer',
        companyName: 'Acme',
        startDate: '2020-01'
      });

      // Existing item 2: Acme, Engineer, 2019-01
      const we2 = await insertWorkExperience({
        candidateId: cand.candidateId,
        jobTitle: 'Engineer',
        companyName: 'Acme',
        startDate: '2019-01'
      });

      // Conflict on item 2 proposing 2020-01 (which would collide with item 1)
      const conflict = await insertConflict({
        candidateId: cand.candidateId,
        itemType: 'work_experience',
        itemId: we2.id,
        fieldName: 'start_date'
      });
      const opt = await insertConflictOption({
        conflictId: conflict.id,
        value: '2020-01'
      });
      const review = await insertHumanReview({
        candidateId: cand.candidateId,
        reviewTargetType: 'conflict',
        itemId: conflict.id,
        reviewReason: 'conflict',
        reviewStatus: 'pending'
      });

      const res = await request(app)
        .post(`/api/admin/reviews/${review.id}/resolve`)
        .set('Cookie', adminCookie)
        .send({ action: 'choose', optionId: opt.id, confidence: 0.9 });

      expect(res.status).toBe(409);
      expect(res.body.errors.value).toBe('Duplicate item exists for candidate');

      // Verify item 2 start_date unchanged
      const weCheck = await pool.query(
        'SELECT start_date FROM work_experience WHERE id = $1',
        [we2.id]
      );
      expect(weCheck.rows[0].start_date).toBe('2019-01');
    });

    it('400 for choose with optionId of another conflict', async () => {
      const cand = await insertCandidate({
        email: `cand-opt-${nextId()}@example.com`,
        firstName: 'Dina',
        lastName: 'R'
      });
      const we = await insertWorkExperience({
        candidateId: cand.candidateId,
        jobTitle: 'Engineer',
        companyName: 'Acme',
        startDate: '2020-01'
      });
      const c1 = await insertConflict({
        candidateId: cand.candidateId,
        itemType: 'work_experience',
        itemId: we.id,
        fieldName: 'start_date'
      });
      const c2 = await insertConflict({
        candidateId: cand.candidateId,
        itemType: 'work_experience',
        itemId: we.id,
        fieldName: 'location'
      });

      const optBelongsToC2 = await insertConflictOption({
        conflictId: c2.id,
        value: 'London'
      });

      const r1 = await insertHumanReview({
        candidateId: cand.candidateId,
        reviewTargetType: 'conflict',
        itemId: c1.id,
        reviewReason: 'conflict',
        reviewStatus: 'pending'
      });

      const res = await request(app)
        .post(`/api/admin/reviews/${r1.id}/resolve`)
        .set('Cookie', adminCookie)
        .send({
          action: 'choose',
          optionId: optBelongsToC2.id,
          confidence: 0.9
        });

      expect(res.status).toBe(400);
      expect(res.body.errors.optionId).toBe(
        'Option does not belong to this conflict'
      );
    });

    it('400 for merge on a non-C3 review', async () => {
      const cand = await insertCandidate({
        email: `cand-nonc3-${nextId()}@example.com`,
        firstName: 'Sam',
        lastName: 'B'
      });
      const we = await insertWorkExperience({
        candidateId: cand.candidateId,
        jobTitle: 'Engineer',
        companyName: 'Acme',
        startDate: '2020-01'
      });
      const conflict = await insertConflict({
        candidateId: cand.candidateId,
        itemType: 'work_experience',
        itemId: we.id,
        fieldName: 'start_date'
      });
      const review = await insertHumanReview({
        candidateId: cand.candidateId,
        reviewTargetType: 'conflict',
        itemId: conflict.id,
        reviewReason: 'conflict',
        reviewStatus: 'pending'
      });

      const res = await request(app)
        .post(`/api/admin/reviews/${review.id}/resolve`)
        .set('Cookie', adminCookie)
        .send({ action: 'merge', confidence: 0.9 });

      expect(res.status).toBe(400);
      expect(res.body.errors.action).toBe(
        'Merge or add action is only allowed for item_match_uncertain reviews'
      );
    });
  });
});
