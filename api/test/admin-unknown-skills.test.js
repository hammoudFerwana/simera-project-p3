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

process.env.JWT_SECRET = 'test-secret-for-us-19';

const RUN_ID = crypto.randomBytes(4).toString('hex');
let idCounter = 0;

function nextId() {
  idCounter += 1;
  return `${RUN_ID}-${idCounter}`;
}

describe('Admin Unknown Skills API (US-19)', () => {
  let pool;
  let app;
  let tempStorageDir;
  let storage;

  const created = {
    auditLogIds: [],
    humanReviewIds: [],
    provenanceIds: [],
    candidateSkillIds: [],
    unknownSkillIds: [],
    skillIds: [],
    fileIds: [],
    candidateProfileIds: [],
    adminIds: [],
    userIds: []
  };

  let adminUser;
  let candidateUser;
  let adminCookie;
  let candidateCookie;

  let cand1;
  let cand2;
  let file1;
  let file2;
  let nodeSkill;

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
    return { candidateId, userId: user.userId, email };
  }

  async function insertUploadedFile({ candidateId, originalFilename }) {
    const fileBytes = Buffer.from('dummy file content');
    const hash =
      crypto.createHash('sha256').update(fileBytes).digest('hex').slice(0, 32) +
      `-${nextId()}`;

    const fileRes = await pool.query(
      `INSERT INTO uploaded_files (
         candidate_id, source_type, original_filename, file_size, file_hash,
         storage_location, mime_type, uploaded_at, validated_at
       )
       VALUES ($1, 'cv', $2, $3, $4, '/tmp/dummy', 'application/pdf', NOW(), NOW())
       RETURNING id, uploaded_at`,
      [candidateId, originalFilename, fileBytes.length, hash]
    );
    const fileId = fileRes.rows[0].id;
    created.fileIds.push(fileId);
    return {
      id: fileId,
      originalFilename,
      uploadedAt: fileRes.rows[0].uploaded_at
    };
  }

  async function insertSkill(canonicalName) {
    const res = await pool.query(
      `INSERT INTO skills (canonical_name, created_at)
       VALUES ($1, NOW())
       RETURNING id, canonical_name`,
      [canonicalName]
    );
    const id = res.rows[0].id;
    created.skillIds.push(id);
    return { id, canonicalName: res.rows[0].canonical_name };
  }

  async function insertUnknownSkill({
    candidateId,
    skillName,
    sourceFileId,
    confidence = 0.8,
    evidence = 'Evidence snippet',
    status = 'pending',
    resolvedSkillId = null,
    createdAt = new Date()
  }) {
    const res = await pool.query(
      `INSERT INTO unknown_skills (
         candidate_id, skill_name, source_file_id, confidence, evidence,
         status, resolved_skill_id, created_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, candidate_id, skill_name, status, created_at`,
      [
        candidateId,
        skillName,
        sourceFileId,
        confidence,
        evidence,
        status,
        resolvedSkillId,
        createdAt
      ]
    );
    const id = res.rows[0].id;
    created.unknownSkillIds.push(id);
    return {
      id,
      candidateId,
      skillName,
      status,
      createdAt: res.rows[0].created_at
    };
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
      path.join(os.tmpdir(), 'simera-unknown-skills-test-')
    );
    storage = createLocalStorage({ directory: tempStorageDir });

    app = createApp({
      getDb: () => pool,
      getStorage: () => storage
    });

    adminUser = await insertUser({
      email: `admin-us19-${nextId()}@example.com`,
      role: 'admin'
    });
    adminCookie = `access_token=${signToken({
      userId: adminUser.userId,
      role: 'admin'
    })}`;

    candidateUser = await insertUser({
      email: `candidate-us19-${nextId()}@example.com`,
      role: 'candidate'
    });
    candidateCookie = `access_token=${signToken({
      userId: candidateUser.userId,
      role: 'candidate'
    })}`;

    cand1 = await insertCandidate({
      email: `cand1-us19-${nextId()}@example.com`,
      firstName: 'Alice',
      lastName: 'Smith'
    });

    cand2 = await insertCandidate({
      email: `cand2-us19-${nextId()}@example.com`,
      firstName: 'Bob',
      lastName: 'Jones'
    });

    file1 = await insertUploadedFile({
      candidateId: cand1.candidateId,
      originalFilename: 'alice_cv.pdf'
    });

    file2 = await insertUploadedFile({
      candidateId: cand2.candidateId,
      originalFilename: 'bob_cv.pdf'
    });

    // Temporarily rename seeded Node.js so Node.js <run id> is top match for 'nodejs'
    await pool.query(
      "UPDATE skills SET canonical_name = 'SeededSkill-' || id WHERE canonical_name ILIKE 'Node.js' OR canonical_name LIKE 'Node.js-seeded-%'"
    );

    nodeSkill = await insertSkill(`Node.js ${RUN_ID}`);
  });

  afterAll(async () => {
    if (pool) {
      await pool.query(
        "UPDATE skills SET canonical_name = 'Node.js' WHERE canonical_name LIKE 'SeededSkill-%' OR canonical_name LIKE 'Node.js-seeded-%'"
      );
      if (created.candidateProfileIds.length > 0) {
        await pool.query(
          'DELETE FROM human_audit_log WHERE candidate_id = ANY($1::int[])',
          [created.candidateProfileIds]
        );
        await pool.query(
          'DELETE FROM human_reviews WHERE candidate_id = ANY($1::int[])',
          [created.candidateProfileIds]
        );
        await pool.query(
          'DELETE FROM data_provenance WHERE candidate_id = ANY($1::int[])',
          [created.candidateProfileIds]
        );
        await pool.query(
          'DELETE FROM candidate_skills WHERE candidate_id = ANY($1::int[])',
          [created.candidateProfileIds]
        );
        await pool.query(
          'DELETE FROM unknown_skills WHERE candidate_id = ANY($1::int[])',
          [created.candidateProfileIds]
        );
      }
      if (created.unknownSkillIds.length > 0) {
        await pool.query(
          'DELETE FROM human_reviews WHERE item_id = ANY($1::int[]) AND review_target_type = $2',
          [created.unknownSkillIds, 'unknown_skill']
        );
        await pool.query(
          'DELETE FROM unknown_skills WHERE id = ANY($1::int[])',
          [created.unknownSkillIds]
        );
      }
      if (created.skillIds.length > 0) {
        await pool.query('DELETE FROM skills WHERE id = ANY($1::int[])', [
          created.skillIds
        ]);
      }
      if (created.fileIds.length > 0) {
        await pool.query(
          'DELETE FROM uploaded_files WHERE id = ANY($1::int[])',
          [created.fileIds]
        );
      }
      if (created.candidateProfileIds.length > 0) {
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
  });

  describe('POST /api/admin/unknown-skills/:id/resolve', () => {
    it('AC1: link "Nodejs v18" to "Node.js <run id>" with confidence 0.9 -> candidate_skills row, data_provenance human_reviewed with no source row, unknown_skills accepted with resolved_skill_id and resolved_at, human_reviews completed with confidence 0.9, one human_audit_log row', async () => {
      const unknownSkill = await insertUnknownSkill({
        candidateId: cand1.candidateId,
        skillName: 'Nodejs v18',
        sourceFileId: file1.id,
        confidence: 0.85,
        evidence: 'Worked with Nodejs v18 for 3 years'
      });

      const res = await request(app)
        .post(`/api/admin/unknown-skills/${unknownSkill.id}/resolve`)
        .set('Cookie', adminCookie)
        .send({
          action: 'link',
          skillId: nodeSkill.id,
          confidence: 0.9,
          reason: 'Nodejs v18 maps to Node.js'
        });

      expect(res.status).toBe(200);
      expect(res.body.created).toBe(true);
      expect(typeof res.body.candidateSkillId).toBe('number');
      created.candidateSkillIds.push(res.body.candidateSkillId);

      // Verify item shape in response
      expect(res.body.unknownSkill).toMatchObject({
        id: unknownSkill.id,
        skillName: 'Nodejs v18',
        status: 'accepted',
        confidence: 0.85,
        evidence: 'Worked with Nodejs v18 for 3 years',
        resolvedSkill: {
          id: nodeSkill.id,
          canonicalName: nodeSkill.canonicalName
        },
        candidate: {
          id: cand1.candidateId,
          firstName: 'Alice',
          lastName: 'Smith',
          email: cand1.email
        },
        sourceFile: {
          id: file1.id,
          sourceType: 'cv',
          originalFilename: 'alice_cv.pdf'
        }
      });
      expect(res.body.unknownSkill.resolvedAt).toBeTruthy();

      // DB: candidate_skills row
      const csRes = await pool.query(
        'SELECT * FROM candidate_skills WHERE id = $1',
        [res.body.candidateSkillId]
      );
      expect(csRes.rows).toHaveLength(1);
      expect(csRes.rows[0].candidate_id).toBe(cand1.candidateId);
      expect(csRes.rows[0].skill_id).toBe(nodeSkill.id);

      // DB: data_provenance row human_reviewed
      const provRes = await pool.query(
        `SELECT * FROM data_provenance
         WHERE candidate_id = $1 AND item_type = 'candidate_skills' AND item_id = $2 AND field_name = 'skill_id'`,
        [cand1.candidateId, String(res.body.candidateSkillId)]
      );
      expect(provRes.rows).toHaveLength(1);
      expect(provRes.rows[0].resolution_method).toBe('human_reviewed');
      expect(provRes.rows[0].approved_at).toBeTruthy();
      created.provenanceIds.push(provRes.rows[0].id);

      // DB: data_provenance_sources has NO rows
      const provSourcesRes = await pool.query(
        'SELECT * FROM data_provenance_sources WHERE provenance_id = $1',
        [provRes.rows[0].id]
      );
      expect(provSourcesRes.rows).toHaveLength(0);

      // DB: unknown_skills accepted with resolved_skill_id and resolved_at
      const usRes = await pool.query(
        'SELECT * FROM unknown_skills WHERE id = $1',
        [unknownSkill.id]
      );
      expect(usRes.rows[0].status).toBe('accepted');
      expect(usRes.rows[0].resolved_skill_id).toBe(nodeSkill.id);
      expect(usRes.rows[0].resolved_at).toBeTruthy();

      // DB: human_reviews completed with confidence 0.9
      const hrRes = await pool.query(
        `SELECT * FROM human_reviews
         WHERE review_target_type = 'unknown_skill' AND item_id = $1`,
        [unknownSkill.id]
      );
      expect(hrRes.rows).toHaveLength(1);
      expect(hrRes.rows[0].review_status).toBe('completed');
      expect(hrRes.rows[0].confidence).toBe(0.9);
      expect(hrRes.rows[0].admin_id).toBe(adminUser.adminId);
      expect(hrRes.rows[0].review_result).toBe(`linked:${nodeSkill.id}`);
      created.humanReviewIds.push(hrRes.rows[0].id);

      // DB: human_audit_log row
      const auditRes = await pool.query(
        `SELECT * FROM human_audit_log
         WHERE candidate_id = $1 AND item_type = 'candidate_skills' AND item_id = $2`,
        [cand1.candidateId, String(res.body.candidateSkillId)]
      );
      expect(auditRes.rows).toHaveLength(1);
      expect(auditRes.rows[0].field_name).toBe('skill_id');
      expect(auditRes.rows[0].previous_value).toBeNull();
      expect(auditRes.rows[0].new_value).toEqual(nodeSkill.id);
      expect(auditRes.rows[0].changed_by).toBe(adminUser.adminId);
      expect(auditRes.rows[0].reason).toBe('Nodejs v18 maps to Node.js');
      created.auditLogIds.push(auditRes.rows[0].id);
    });

    it('AC2: add "Bun <run id>" -> new skills row and candidate_skills row', async () => {
      const unknownSkill = await insertUnknownSkill({
        candidateId: cand1.candidateId,
        skillName: 'Bun runtime',
        sourceFileId: file1.id,
        confidence: 0.9
      });

      const bunSkillName = `Bun ${RUN_ID}`;

      const res = await request(app)
        .post(`/api/admin/unknown-skills/${unknownSkill.id}/resolve`)
        .set('Cookie', adminCookie)
        .send({
          action: 'add',
          canonicalName: bunSkillName,
          confidence: 0.95,
          reason: 'Brand new runtime'
        });

      expect(res.status).toBe(200);
      expect(res.body.created).toBe(true);
      expect(res.body.unknownSkill.status).toBe('accepted');
      expect(res.body.unknownSkill.resolvedSkill.canonicalName).toBe(
        bunSkillName
      );
      const newSkillId = res.body.unknownSkill.resolvedSkill.id;
      created.skillIds.push(newSkillId);
      created.candidateSkillIds.push(res.body.candidateSkillId);

      // Verify skill in skills table
      const skillRes = await pool.query('SELECT * FROM skills WHERE id = $1', [
        newSkillId
      ]);
      expect(skillRes.rows).toHaveLength(1);
      expect(skillRes.rows[0].canonical_name).toBe(bunSkillName);

      // Verify candidate_skills row
      const csRes = await pool.query(
        'SELECT * FROM candidate_skills WHERE id = $1',
        [res.body.candidateSkillId]
      );
      expect(csRes.rows).toHaveLength(1);
      expect(csRes.rows[0].candidate_id).toBe(cand1.candidateId);
      expect(csRes.rows[0].skill_id).toBe(newSkillId);

      // Verify human_reviews
      const hrRes = await pool.query(
        `SELECT * FROM human_reviews
         WHERE review_target_type = 'unknown_skill' AND item_id = $1`,
        [unknownSkill.id]
      );
      expect(hrRes.rows[0].review_result).toBe(`added:${newSkillId}`);
      created.humanReviewIds.push(hrRes.rows[0].id);
    });

    it('AC3: candidate already has skill -> created false, still 1 candidate_skills row, no audit row', async () => {
      const pythonSkill = await insertSkill(`Python ${RUN_ID}`);

      // Candidate already has pythonSkill
      const initialCsRes = await pool.query(
        `INSERT INTO candidate_skills (candidate_id, skill_id, created_at)
         VALUES ($1, $2, NOW())
         RETURNING id`,
        [cand1.candidateId, pythonSkill.id]
      );
      const initialCsId = initialCsRes.rows[0].id;
      created.candidateSkillIds.push(initialCsId);

      const unknownSkill = await insertUnknownSkill({
        candidateId: cand1.candidateId,
        skillName: 'Python 3.11',
        sourceFileId: file1.id
      });

      const auditCountBefore = await pool.query(
        `SELECT COUNT(*)::int AS count FROM human_audit_log
         WHERE candidate_id = $1 AND item_type = 'candidate_skills' AND item_id = $2`,
        [cand1.candidateId, String(initialCsId)]
      );
      expect(auditCountBefore.rows[0].count).toBe(0);

      const res = await request(app)
        .post(`/api/admin/unknown-skills/${unknownSkill.id}/resolve`)
        .set('Cookie', adminCookie)
        .send({
          action: 'link',
          skillId: pythonSkill.id,
          confidence: 0.88,
          reason: 'Already has Python'
        });

      expect(res.status).toBe(200);
      expect(res.body.created).toBe(false);
      expect(res.body.candidateSkillId).toBe(initialCsId);
      expect(res.body.unknownSkill.status).toBe('accepted');
      expect(res.body.unknownSkill.resolvedSkill.id).toBe(pythonSkill.id);

      // Still only 1 candidate_skills row
      const countRes = await pool.query(
        `SELECT COUNT(*)::int AS count FROM candidate_skills
         WHERE candidate_id = $1 AND skill_id = $2`,
        [cand1.candidateId, pythonSkill.id]
      );
      expect(countRes.rows[0].count).toBe(1);

      // No audit row added
      const auditCountAfter = await pool.query(
        `SELECT COUNT(*)::int AS count FROM human_audit_log
         WHERE candidate_id = $1 AND item_type = 'candidate_skills' AND item_id = $2`,
        [cand1.candidateId, String(initialCsId)]
      );
      expect(auditCountAfter.rows[0].count).toBe(0);
    });

    it('AC6: reject "Swimming" -> status rejected, resolved_at set, no candidate_skills row, human_reviews completed', async () => {
      const unknownSkill = await insertUnknownSkill({
        candidateId: cand1.candidateId,
        skillName: 'Swimming',
        sourceFileId: file1.id
      });

      const csCountBefore = await pool.query(
        'SELECT COUNT(*)::int AS count FROM candidate_skills WHERE candidate_id = $1',
        [cand1.candidateId]
      );

      const res = await request(app)
        .post(`/api/admin/unknown-skills/${unknownSkill.id}/resolve`)
        .set('Cookie', adminCookie)
        .send({
          action: 'reject',
          confidence: 0.99,
          reason: 'Not a technical skill'
        });

      expect(res.status).toBe(200);
      expect(res.body.created).toBe(false);
      expect(res.body.candidateSkillId).toBeNull();
      expect(res.body.unknownSkill.status).toBe('rejected');
      expect(res.body.unknownSkill.resolvedSkill).toBeNull();
      expect(res.body.unknownSkill.resolvedAt).toBeTruthy();

      // DB: unknown_skills row
      const usRes = await pool.query(
        'SELECT * FROM unknown_skills WHERE id = $1',
        [unknownSkill.id]
      );
      expect(usRes.rows[0].status).toBe('rejected');
      expect(usRes.rows[0].resolved_skill_id).toBeNull();
      expect(usRes.rows[0].resolved_at).toBeTruthy();

      // DB: no candidate_skills row added
      const csCountAfter = await pool.query(
        'SELECT COUNT(*)::int AS count FROM candidate_skills WHERE candidate_id = $1',
        [cand1.candidateId]
      );
      expect(csCountAfter.rows[0].count).toBe(csCountBefore.rows[0].count);

      // DB: human_reviews completed
      const hrRes = await pool.query(
        `SELECT * FROM human_reviews
         WHERE review_target_type = 'unknown_skill' AND item_id = $1`,
        [unknownSkill.id]
      );
      expect(hrRes.rows).toHaveLength(1);
      expect(hrRes.rows[0].review_status).toBe('completed');
      expect(hrRes.rows[0].review_result).toBe('rejected');
      expect(hrRes.rows[0].confidence).toBe(0.99);
      created.humanReviewIds.push(hrRes.rows[0].id);
    });

    it('AC7: no confidence -> 400 with { errors: { confidence: "Confidence is required" } } and nothing changed', async () => {
      const unknownSkill = await insertUnknownSkill({
        candidateId: cand1.candidateId,
        skillName: 'Test AC7 Skill',
        sourceFileId: file1.id
      });

      const res = await request(app)
        .post(`/api/admin/unknown-skills/${unknownSkill.id}/resolve`)
        .set('Cookie', adminCookie)
        .send({
          action: 'reject'
        });

      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual({
        confidence: 'Confidence is required'
      });

      // Verify nothing changed in DB
      const usRes = await pool.query(
        'SELECT * FROM unknown_skills WHERE id = $1',
        [unknownSkill.id]
      );
      expect(usRes.rows[0].status).toBe('pending');
      expect(usRes.rows[0].resolved_at).toBeNull();

      // Verify confidence outside 0..1
      const resBadConf = await request(app)
        .post(`/api/admin/unknown-skills/${unknownSkill.id}/resolve`)
        .set('Cookie', adminCookie)
        .send({
          action: 'reject',
          confidence: 1.5
        });

      expect(resBadConf.status).toBe(400);
      expect(resBadConf.body.errors).toEqual({
        confidence: 'Confidence must be between 0 and 1'
      });
    });

    it('existing pending human_reviews row is completed (not a second row)', async () => {
      const unknownSkill = await insertUnknownSkill({
        candidateId: cand1.candidateId,
        skillName: 'Skill with pending review',
        sourceFileId: file1.id
      });

      const initialHrRes = await pool.query(
        `INSERT INTO human_reviews (
           candidate_id, review_target_type, item_id, review_reason,
           review_status, created_at
         )
         VALUES ($1, 'unknown_skill', $2, 'unknown_skill', 'pending', NOW())
         RETURNING id`,
        [cand1.candidateId, unknownSkill.id]
      );
      const initialHrId = initialHrRes.rows[0].id;
      created.humanReviewIds.push(initialHrId);

      const res = await request(app)
        .post(`/api/admin/unknown-skills/${unknownSkill.id}/resolve`)
        .set('Cookie', adminCookie)
        .send({
          action: 'reject',
          confidence: 0.8
        });

      expect(res.status).toBe(200);

      const allHr = await pool.query(
        `SELECT * FROM human_reviews
         WHERE review_target_type = 'unknown_skill' AND item_id = $1`,
        [unknownSkill.id]
      );
      expect(allHr.rows).toHaveLength(1);
      expect(allHr.rows[0].id).toBe(initialHrId);
      expect(allHr.rows[0].review_status).toBe('completed');
      expect(allHr.rows[0].review_result).toBe('rejected');
    });

    it('add with name existing in another case -> 409 with existingSkillId', async () => {
      const unknownSkill = await insertUnknownSkill({
        candidateId: cand1.candidateId,
        skillName: 'node.js',
        sourceFileId: file1.id
      });

      const res = await request(app)
        .post(`/api/admin/unknown-skills/${unknownSkill.id}/resolve`)
        .set('Cookie', adminCookie)
        .send({
          action: 'add',
          canonicalName: nodeSkill.canonicalName.toLowerCase(),
          confidence: 0.9
        });

      expect(res.status).toBe(409);
      expect(res.body.errors).toEqual({
        canonicalName: 'Skill already exists, link it instead'
      });
      expect(res.body.existingSkillId).toBe(nodeSkill.id);
    });

    it('resolve twice -> second call 409', async () => {
      const unknownSkill = await insertUnknownSkill({
        candidateId: cand1.candidateId,
        skillName: 'Resolve Twice Skill',
        sourceFileId: file1.id
      });

      const res1 = await request(app)
        .post(`/api/admin/unknown-skills/${unknownSkill.id}/resolve`)
        .set('Cookie', adminCookie)
        .send({
          action: 'reject',
          confidence: 0.75
        });
      expect(res1.status).toBe(200);

      const res2 = await request(app)
        .post(`/api/admin/unknown-skills/${unknownSkill.id}/resolve`)
        .set('Cookie', adminCookie)
        .send({
          action: 'reject',
          confidence: 0.75
        });
      expect(res2.status).toBe(409);
      expect(res2.body.errors).toEqual({
        unknownSkillId: 'Unknown skill already resolved'
      });
    });

    it('link to unknown skillId -> 400', async () => {
      const unknownSkill = await insertUnknownSkill({
        candidateId: cand1.candidateId,
        skillName: 'NonExistentSkill',
        sourceFileId: file1.id
      });

      const res = await request(app)
        .post(`/api/admin/unknown-skills/${unknownSkill.id}/resolve`)
        .set('Cookie', adminCookie)
        .send({
          action: 'link',
          skillId: 99999999,
          confidence: 0.8
        });

      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual({
        skillId: 'Skill not found'
      });
    });
  });

  describe('GET /api/admin/unknown-skills', () => {
    it('list: default pending only, newest first, filter by candidateId, total and paging', async () => {
      const olderDate = new Date(Date.now() - 60000);
      const newerDate = new Date(Date.now());

      const usOlder = await insertUnknownSkill({
        candidateId: cand1.candidateId,
        skillName: `Older Pending ${RUN_ID}`,
        sourceFileId: file1.id,
        status: 'pending',
        createdAt: olderDate
      });

      const usNewer = await insertUnknownSkill({
        candidateId: cand1.candidateId,
        skillName: `Newer Pending ${RUN_ID}`,
        sourceFileId: file1.id,
        status: 'pending',
        createdAt: newerDate
      });

      const usCand2 = await insertUnknownSkill({
        candidateId: cand2.candidateId,
        skillName: `Cand2 Pending ${RUN_ID}`,
        sourceFileId: file2.id,
        status: 'pending',
        createdAt: newerDate
      });

      const usAccepted = await insertUnknownSkill({
        candidateId: cand1.candidateId,
        skillName: `Accepted Skill ${RUN_ID}`,
        sourceFileId: file1.id,
        status: 'accepted',
        resolvedSkillId: nodeSkill.id,
        createdAt: newerDate
      });

      // 1. Default: pending only
      const resPending = await request(app)
        .get('/api/admin/unknown-skills')
        .set('Cookie', adminCookie);

      expect(resPending.status).toBe(200);
      expect(resPending.body).toHaveProperty('items');
      expect(resPending.body).toHaveProperty('page', 1);
      expect(resPending.body).toHaveProperty('pageSize', 20);
      expect(resPending.body).toHaveProperty('total');

      const returnedPendingIds = resPending.body.items.map((i) => i.id);
      expect(returnedPendingIds).toContain(usOlder.id);
      expect(returnedPendingIds).toContain(usNewer.id);
      expect(returnedPendingIds).toContain(usCand2.id);
      expect(returnedPendingIds).not.toContain(usAccepted.id);

      // Verify newest first ordering between usNewer and usOlder
      const newerIdx = returnedPendingIds.indexOf(usNewer.id);
      const olderIdx = returnedPendingIds.indexOf(usOlder.id);
      expect(newerIdx).toBeLessThan(olderIdx);

      // 2. Filter by candidateId
      const resCandFilter = await request(app)
        .get(`/api/admin/unknown-skills?candidateId=${cand2.candidateId}`)
        .set('Cookie', adminCookie);

      expect(resCandFilter.status).toBe(200);
      const cand2Ids = resCandFilter.body.items.map((i) => i.id);
      expect(cand2Ids).toContain(usCand2.id);
      expect(cand2Ids).not.toContain(usOlder.id);
      expect(cand2Ids).not.toContain(usNewer.id);

      // 3. Paging
      const resPaging = await request(app)
        .get('/api/admin/unknown-skills?pageSize=1&page=1')
        .set('Cookie', adminCookie);

      expect(resPaging.status).toBe(200);
      expect(resPaging.body.items).toHaveLength(1);
      expect(resPaging.body.pageSize).toBe(1);
      expect(resPaging.body.page).toBe(1);
      expect(resPaging.body.total).toBeGreaterThanOrEqual(3);
    });
  });

  describe('GET /api/admin/unknown-skills/:id and GET /api/admin/skills/search', () => {
    it('detail 404, search returns "Node.js <run id>" first for "nodejs", search without q -> 400', async () => {
      // Detail 404
      const res404 = await request(app)
        .get('/api/admin/unknown-skills/99999999')
        .set('Cookie', adminCookie);
      expect(res404.status).toBe(404);
      expect(res404.body.errors).toEqual({
        unknownSkillId: 'Unknown skill not found'
      });

      // Detail 400 on invalid id
      const res400 = await request(app)
        .get('/api/admin/unknown-skills/abc')
        .set('Cookie', adminCookie);
      expect(res400.status).toBe(400);

      // Detail 200 for existing unknown skill
      const existingUs = await insertUnknownSkill({
        candidateId: cand1.candidateId,
        skillName: `Detail Test Skill ${RUN_ID}`,
        sourceFileId: file1.id
      });
      const res200 = await request(app)
        .get(`/api/admin/unknown-skills/${existingUs.id}`)
        .set('Cookie', adminCookie);
      expect(res200.status).toBe(200);
      expect(res200.body.id).toBe(existingUs.id);
      expect(res200.body.skillName).toBe(`Detail Test Skill ${RUN_ID}`);
      expect(res200.body.candidate.id).toBe(cand1.candidateId);
      expect(res200.body.sourceFile.id).toBe(file1.id);

      // Search returns "Node.js <run id>" first for "nodejs"
      const resSearch = await request(app)
        .get('/api/admin/skills/search?q=nodejs')
        .set('Cookie', adminCookie);

      expect(resSearch.status).toBe(200);
      expect(resSearch.body).toHaveProperty('items');
      expect(Array.isArray(resSearch.body.items)).toBe(true);
      expect(resSearch.body.items.length).toBeGreaterThan(0);
      expect(resSearch.body.items[0].canonicalName).toBe(
        nodeSkill.canonicalName
      );
      expect(resSearch.body.items[0].id).toBe(nodeSkill.id);
      expect(typeof resSearch.body.items[0].similarity).toBe('number');
      expect(resSearch.body.items[0].similarity).toBeGreaterThanOrEqual(0.5);

      // Search without q -> 400
      const resNoQ = await request(app)
        .get('/api/admin/skills/search')
        .set('Cookie', adminCookie);
      expect(resNoQ.status).toBe(400);
      expect(resNoQ.body.errors).toHaveProperty('q');

      // Search with empty q -> 400
      const resEmptyQ = await request(app)
        .get('/api/admin/skills/search?q=   ')
        .set('Cookie', adminCookie);
      expect(resEmptyQ.status).toBe(400);
      expect(resEmptyQ.body.errors).toHaveProperty('q');
    });
  });

  describe('Auth guards', () => {
    it('candidate cookie -> 403, no cookie -> 401, on one GET and on POST', async () => {
      // GET without cookie -> 401
      const getNoAuth = await request(app).get('/api/admin/unknown-skills');
      expect(getNoAuth.status).toBe(401);

      // GET with candidate cookie -> 403
      const getForbidden = await request(app)
        .get('/api/admin/unknown-skills')
        .set('Cookie', candidateCookie);
      expect(getForbidden.status).toBe(403);

      // POST without cookie -> 401
      const postNoAuth = await request(app)
        .post('/api/admin/unknown-skills/1/resolve')
        .send({ action: 'reject', confidence: 0.9 });
      expect(postNoAuth.status).toBe(401);

      // POST with candidate cookie -> 403
      const postForbidden = await request(app)
        .post('/api/admin/unknown-skills/1/resolve')
        .set('Cookie', candidateCookie)
        .send({ action: 'reject', confidence: 0.9 });
      expect(postForbidden.status).toBe(403);
    });
  });
});
