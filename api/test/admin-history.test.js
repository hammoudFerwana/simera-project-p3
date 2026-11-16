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
const { recordHumanChange } = require('shared/src/audit/human-audit');

process.env.JWT_SECRET = 'test-secret-for-us-20';

const RUN_ID = crypto.randomBytes(4).toString('hex');
let idCounter = 0;

function nextId() {
  idCounter += 1;
  return `${RUN_ID}-${idCounter}`;
}

describe('Admin Candidate History API (US-20)', () => {
  let pool;
  let app;
  let tempStorageDir;
  let storage;

  const created = {
    auditLogIds: [],
    candidateProfileIds: [],
    adminIds: [],
    userIds: []
  };

  let adminUser;
  let candidateUser;
  let adminCookie;
  let candidateCookie;

  let candWithChanges;
  let candWithoutChanges;

  let change1;
  let change2;
  let change3;

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
      path.join(os.tmpdir(), 'simera-history-test-')
    );
    storage = createLocalStorage({ directory: tempStorageDir });

    app = createApp({
      getDb: () => pool,
      getStorage: () => storage
    });

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

    adminUser = await insertUser({
      email: `admin-history-${nextId()}@example.com`,
      role: 'admin'
    });
    adminCookie = `access_token=${signToken({
      userId: adminUser.userId,
      role: 'admin'
    })}`;

    candidateUser = await insertUser({
      email: `candidate-history-${nextId()}@example.com`,
      role: 'candidate'
    });
    candidateCookie = `access_token=${signToken({
      userId: candidateUser.userId,
      role: 'candidate'
    })}`;

    candWithChanges = await insertCandidate({
      email: `candidate-changes-${nextId()}@example.com`,
      firstName: 'Alice',
      lastName: 'Smith'
    });

    candWithoutChanges = await insertCandidate({
      email: `candidate-nochanges-${nextId()}@example.com`,
      firstName: 'Bob',
      lastName: 'Jones'
    });

    // Insert 3 changes with different timestamps
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      change1 = await recordHumanChange(client, {
        candidateId: candWithChanges.candidateId,
        itemType: 'work_experience',
        itemId: 10,
        fieldName: 'job_title',
        previousValue: 'Junior Dev',
        newValue: 'Senior Dev',
        changedBy: adminUser.adminId,
        reason: 'Promotion confirmed',
        timestamp: new Date('2026-11-15T10:00:00.000Z')
      });
      created.auditLogIds.push(change1.id);

      change2 = await recordHumanChange(client, {
        candidateId: candWithChanges.candidateId,
        itemType: 'education',
        itemId: 20,
        fieldName: 'degree_name',
        previousValue: 'BSc',
        newValue: 'MSc',
        changedBy: adminUser.adminId,
        reason: 'Diploma verified',
        timestamp: new Date('2026-11-15T11:00:00.000Z')
      });
      created.auditLogIds.push(change2.id);

      change3 = await recordHumanChange(client, {
        candidateId: candWithChanges.candidateId,
        itemType: 'candidate_skills',
        itemId: 30,
        fieldName: 'skill_id',
        previousValue: null,
        newValue: 15,
        changedBy: adminUser.adminId,
        reason: 'Added skill',
        timestamp: new Date('2026-11-15T12:00:00.000Z')
      });
      created.auditLogIds.push(change3.id);

      await client.query('COMMIT');
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    if (pool) {
      if (created.auditLogIds.length > 0) {
        await pool.query(
          'DELETE FROM human_audit_log WHERE id = ANY($1::int[])',
          [created.auditLogIds]
        );
      }
      if (created.candidateProfileIds.length > 0) {
        await pool.query(
          'DELETE FROM human_audit_log WHERE candidate_id = ANY($1::int[])',
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
      await fs
        .rm(tempStorageDir, { recursive: true, force: true })
        .catch(() => {});
    }
  });

  it('AC5: three changes with different timestamps -> items newest first, with previousValue, newValue, changedBy.adminId, changedBy.email and reason', async () => {
    const res = await request(app)
      .get(`/api/admin/candidates/${candWithChanges.candidateId}/history`)
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(3);

    // Newest first: change3 (12:00), then change2 (11:00), then change1 (10:00)
    const [item0, item1, item2] = res.body.items;

    expect(item0.id).toBe(change3.id);
    expect(item0.itemType).toBe('candidate_skills');
    expect(item0.itemId).toBe('30');
    expect(item0.fieldName).toBe('skill_id');
    expect(item0.previousValue).toBeNull();
    expect(item0.newValue).toBe(15);
    expect(item0.changedBy).toEqual({
      adminId: adminUser.adminId,
      email: adminUser.email
    });
    expect(item0.reason).toBe('Added skill');
    expect(new Date(item0.timestamp).toISOString()).toBe(
      new Date('2026-11-15T12:00:00.000Z').toISOString()
    );

    expect(item1.id).toBe(change2.id);
    expect(item1.itemType).toBe('education');
    expect(item1.itemId).toBe('20');
    expect(item1.fieldName).toBe('degree_name');
    expect(item1.previousValue).toBe('BSc');
    expect(item1.newValue).toBe('MSc');
    expect(item1.changedBy).toEqual({
      adminId: adminUser.adminId,
      email: adminUser.email
    });
    expect(item1.reason).toBe('Diploma verified');
    expect(new Date(item1.timestamp).toISOString()).toBe(
      new Date('2026-11-15T11:00:00.000Z').toISOString()
    );

    expect(item2.id).toBe(change1.id);
    expect(item2.itemType).toBe('work_experience');
    expect(item2.itemId).toBe('10');
    expect(item2.fieldName).toBe('job_title');
    expect(item2.previousValue).toBe('Junior Dev');
    expect(item2.newValue).toBe('Senior Dev');
    expect(item2.changedBy).toEqual({
      adminId: adminUser.adminId,
      email: adminUser.email
    });
    expect(item2.reason).toBe('Promotion confirmed');
    expect(new Date(item2.timestamp).toISOString()).toBe(
      new Date('2026-11-15T10:00:00.000Z').toISOString()
    );
  });

  it('a candidate with no changes -> 200 { items: [] }', async () => {
    const res = await request(app)
      .get(`/api/admin/candidates/${candWithoutChanges.candidateId}/history`)
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [] });
  });

  it('404 for an unknown id', async () => {
    const res = await request(app)
      .get('/api/admin/candidates/999999/history')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      errors: { candidateId: 'Candidate not found' }
    });
  });

  it('400 for "abc"', async () => {
    const res = await request(app)
      .get('/api/admin/candidates/abc/history')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      errors: { candidateId: 'Candidate id must be a positive integer' }
    });
  });

  it('AC6: a candidate cookie -> 403, no cookie -> 401', async () => {
    const candidateRes = await request(app)
      .get(`/api/admin/candidates/${candWithChanges.candidateId}/history`)
      .set('Cookie', candidateCookie);

    expect(candidateRes.status).toBe(403);
    expect(candidateRes.body).toEqual({
      errors: { auth: 'You do not have access to this resource' }
    });

    const anonRes = await request(app).get(
      `/api/admin/candidates/${candWithChanges.candidateId}/history`
    );

    expect(anonRes.status).toBe(401);
    expect(anonRes.body).toEqual({
      errors: { auth: 'Log in to continue' }
    });
  });
});
