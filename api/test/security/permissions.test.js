const path = require('path');
const os = require('os');
const fs = require('fs/promises');
const crypto = require('crypto');
const request = require('supertest');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const { Document, Packer, Paragraph, TextRun } = require('docx');

require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const { createApp } = require('../../src/app');
const { signToken } = require('../../src/auth/token');
const { createLocalStorage } = require('shared/src/upload/storage');
const { permissionsMatrix } = require('./permissions-matrix');

process.env.JWT_SECRET = 'test-secret-for-security-permissions';

jest.setTimeout(30000);

const RUN_ID = crypto.randomBytes(4).toString('hex');
let idCounter = 0;

function nextId() {
  idCounter += 1;
  return `${RUN_ID}-${idCounter}`;
}

const PASSWORD = 'TestPassword123!';
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 10);

async function makeDocx(text) {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [new TextRun(text || 'Candidate CV')]
          })
        ]
      }
    ]
  });
  return Packer.toBuffer(doc);
}

describe('Permissions Matrix & Cross-Candidate Isolation (US-24)', () => {
  let pool;
  let app;
  let tempStorageDir;
  let storage;

  const created = {
    jobIds: [],
    fileIds: [],
    profileIds: [],
    adminIds: [],
    userIds: []
  };

  let candidateA;
  let candidateB;
  let adminUser;

  let candidateACookie;
  let candidateBCookie;
  let adminCookie;

  let fileA;
  let fileB;

  const fakeMailer = {
    sent: [],
    lastCodeFor(email) {
      return fakeMailer.sent.filter((m) => m.to === email).at(-1)?.code;
    },
    sendOtpEmail: jest.fn(async (mail) => {
      fakeMailer.sent.push(mail);
    })
  };

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
      path.join(os.tmpdir(), 'simera-perm-test-')
    );
    storage = createLocalStorage({ directory: tempStorageDir });

    app = createApp({
      getDb: () => pool,
      getMailer: () => fakeMailer,
      getStorage: () => storage,
      enqueueJob: async () => {}
    });

    // Helper to insert user
    async function insertUser({ email, role }) {
      const userRes = await pool.query(
        `INSERT INTO users (email, password_hash, email_verified, created_at)
         VALUES ($1, $2, true, NOW())
         RETURNING id`,
        [email, PASSWORD_HASH]
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

    // Helper to insert candidate profile
    async function insertCandidate({ email, firstName, lastName }) {
      const user = await insertUser({ email, role: 'candidate' });
      const profRes = await pool.query(
        `INSERT INTO candidate_profiles (
           user_id, first_name, last_name, headline, summary, created_at
         )
         VALUES ($1, $2, $3, 'Software Engineer', 'Candidate summary', NOW())
         RETURNING id`,
        [user.userId, firstName, lastName]
      );
      const profileId = profRes.rows[0].id;
      created.profileIds.push(profileId);
      return { candidateId: profileId, userId: user.userId, email };
    }

    // 1. Create Candidate A and Candidate B
    candidateA = await insertCandidate({
      email: `cand-a-${nextId()}@example.com`,
      firstName: 'Alice',
      lastName: 'Security'
    });
    candidateB = await insertCandidate({
      email: `cand-b-${nextId()}@example.com`,
      firstName: 'Bob',
      lastName: 'Security'
    });

    // 2. Create Admin
    adminUser = await insertUser({
      email: `admin-${nextId()}@example.com`,
      role: 'admin'
    });

    // Sign tokens
    candidateACookie = `access_token=${signToken({
      userId: candidateA.userId,
      role: 'candidate'
    })}`;
    candidateBCookie = `access_token=${signToken({
      userId: candidateB.userId,
      role: 'candidate'
    })}`;
    adminCookie = `access_token=${signToken({
      userId: adminUser.userId,
      role: 'admin'
    })}`;

    // 3. Create a stored file and job for Candidate A
    const fileABuf = await makeDocx('Candidate A resume content');
    const fileALocation = await storage.save(fileABuf, '.docx');
    const fileARes = await pool.query(
      `INSERT INTO uploaded_files (
         candidate_id, source_type, original_filename, file_size, file_hash,
         storage_location, mime_type, uploaded_at, validated_at
       ) VALUES ($1, 'cv', 'candA-cv.docx', $2, $3, $4,
                 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                 NOW(), NOW())
       RETURNING id`,
      [
        candidateA.candidateId,
        fileABuf.length,
        `hash-a-${RUN_ID}`,
        fileALocation
      ]
    );
    fileA = { id: fileARes.rows[0].id, filename: 'candA-cv.docx' };
    created.fileIds.push(fileA.id);

    const jobARes = await pool.query(
      `INSERT INTO processing_jobs (file_id, status, created_at)
       VALUES ($1, 'completed', NOW())
       RETURNING id`,
      [fileA.id]
    );
    created.jobIds.push(jobARes.rows[0].id);

    // 4. Create a stored file and job for Candidate B
    const fileBBuf = await makeDocx('Candidate B resume content');
    const fileBLocation = await storage.save(fileBBuf, '.docx');
    const fileBRes = await pool.query(
      `INSERT INTO uploaded_files (
         candidate_id, source_type, original_filename, file_size, file_hash,
         storage_location, mime_type, uploaded_at, validated_at
       ) VALUES ($1, 'cv', 'candB-cv.docx', $2, $3, $4,
                 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                 NOW(), NOW())
       RETURNING id`,
      [
        candidateB.candidateId,
        fileBBuf.length,
        `hash-b-${RUN_ID}`,
        fileBLocation
      ]
    );
    fileB = { id: fileBRes.rows[0].id, filename: 'candB-cv.docx' };
    created.fileIds.push(fileB.id);

    const jobBRes = await pool.query(
      `INSERT INTO processing_jobs (file_id, status, created_at)
       VALUES ($1, 'completed', NOW())
       RETURNING id`,
      [fileB.id]
    );
    created.jobIds.push(jobBRes.rows[0].id);
  });

  afterAll(async () => {
    if (pool) {
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
      if (created.userIds.length > 0) {
        await pool.query(
          `DELETE FROM processing_jobs WHERE file_id IN (
             SELECT id FROM uploaded_files WHERE candidate_id IN (
               SELECT id FROM candidate_profiles WHERE user_id = ANY($1::int[])
             )
           )`,
          [created.userIds]
        );
        await pool.query(
          `DELETE FROM uploaded_files WHERE candidate_id IN (
             SELECT id FROM candidate_profiles WHERE user_id = ANY($1::int[])
           )`,
          [created.userIds]
        );
        await pool.query(
          `DELETE FROM candidate_profiles WHERE user_id = ANY($1::int[])`,
          [created.userIds]
        );
        await pool.query(`DELETE FROM admins WHERE user_id = ANY($1::int[])`, [
          created.userIds
        ]);
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

  function resolvePath(endpoint) {
    return endpoint.path
      .replace(':fileId', fileA.id)
      .replace(':id', candidateA.candidateId);
  }

  async function executeRequest(endpoint, cookie) {
    const resolvedPath = resolvePath(endpoint);
    let req =
      endpoint.method === 'POST'
        ? request(app).post(resolvedPath)
        : request(app).get(resolvedPath);

    if (cookie) {
      req = req.set('Cookie', cookie);
    }

    if (endpoint.path === '/api/uploads/cv') {
      const docxBuf = await makeDocx(
        `Curriculum Vitae for Candidate Security Test. Experienced Software Engineer with proven skills in Node.js, PostgreSQL, and secure API architecture. ID: ${crypto.randomBytes(8).toString('hex')}`
      );
      const res = await req.attach('file', docxBuf, 'test-cv.docx');
      if (res.body?.fileId) created.fileIds.push(res.body.fileId);
      if (res.body?.jobId) created.jobIds.push(res.body.jobId);
      return res;
    }

    if (endpoint.path === '/api/uploads/linkedin') {
      const mdBuf = Buffer.from(
        `# LinkedIn Profile\n\nSoftware Engineer with experience in cloud infrastructure, secure backend systems, and database optimization.\n\nUnique ID: ${crypto.randomBytes(8).toString('hex')}`
      );
      const res = await req.attach('file', mdBuf, 'test-profile.md');
      if (res.body?.fileId) created.fileIds.push(res.body.fileId);
      if (res.body?.jobId) created.jobIds.push(res.body.jobId);
      return res;
    }

    if (endpoint.method === 'POST') {
      if (endpoint.path === '/api/auth/register') {
        const regEmail = `sec-reg-${nextId()}@example.com`;
        const res = await req.send({
          email: regEmail,
          password: 'ValidPassword123!'
        });
        const uRes = await pool.query('SELECT id FROM users WHERE email = $1', [
          regEmail
        ]);
        if (uRes.rows[0]) {
          created.userIds.push(uRes.rows[0].id);
        }
        return res;
      }
      if (endpoint.path === '/api/auth/login') {
        return req.send({ email: candidateA.email, password: PASSWORD });
      }
      if (endpoint.path === '/api/auth/verify-otp') {
        return req.send({ email: candidateA.email, code: '123456' });
      }
      if (endpoint.path === '/api/auth/resend-otp') {
        return req.send({ email: candidateA.email });
      }
      if (endpoint.body) {
        return req.send(endpoint.body);
      }
      return req.send({});
    }

    return req;
  }

  describe('Endpoint permissions matrix table tests', () => {
    permissionsMatrix.forEach((endpoint) => {
      describe(`${endpoint.method} ${endpoint.path} (${endpoint.description})`, () => {
        test('without login: returns 401 or public outcome (never 401/403 for public)', async () => {
          const res = await executeRequest(endpoint, null);
          if (endpoint.publicRoute) {
            expect([401, 403]).not.toContain(res.status);
            if (endpoint.expectedNoAuth === 201) {
              expect(res.status).toBe(201);
            } else if (endpoint.path === '/api/auth/logout') {
              expect(res.status).toBe(200);
            }
          } else {
            expect(res.status).toBe(401);
            expect(res.body.errors?.auth).toBe('Log in to continue');
          }
        });

        test('as candidate: returns expected status', async () => {
          const res = await executeRequest(endpoint, candidateACookie);
          if (endpoint.publicRoute) {
            expect([401, 403]).not.toContain(res.status);
          } else if (endpoint.expectedCandidate === 403) {
            expect(res.status).toBe(403);
            expect(res.body.errors?.auth).toBe(
              'You do not have access to this resource'
            );
          } else if (endpoint.expectedCandidate === 202) {
            expect(res.status).toBe(202);
          } else if (endpoint.expectedCandidate === 200) {
            expect(res.status).toBe(200);
          }
        });

        test('as admin: returns expected status', async () => {
          const res = await executeRequest(endpoint, adminCookie);
          if (endpoint.publicRoute) {
            expect([401, 403]).not.toContain(res.status);
          } else if (endpoint.expectedAdmin === 403) {
            expect(res.status).toBe(403);
            expect(res.body.errors?.auth).toBe(
              'You do not have access to this resource'
            );
          } else if (endpoint.expectedAdmin === 200) {
            expect(res.status).toBe(200);
          }
        });
      });
    });
  });

  describe('Upload endpoints without file attached', () => {
    test('POST /api/uploads/cv without file: candidate gets 400, admin gets 403, no-auth gets 401', async () => {
      const noAuthRes = await request(app).post('/api/uploads/cv');
      expect(noAuthRes.status).toBe(401);

      const adminRes = await request(app)
        .post('/api/uploads/cv')
        .set('Cookie', adminCookie);
      expect(adminRes.status).toBe(403);

      const candRes = await request(app)
        .post('/api/uploads/cv')
        .set('Cookie', candidateACookie);
      expect(candRes.status).toBe(400);
      expect(candRes.body.errors?.file).toBe('Choose a file to upload');
    });

    test('POST /api/uploads/linkedin without file: candidate gets 400, admin gets 403, no-auth gets 401', async () => {
      const noAuthRes = await request(app).post('/api/uploads/linkedin');
      expect(noAuthRes.status).toBe(401);

      const adminRes = await request(app)
        .post('/api/uploads/linkedin')
        .set('Cookie', adminCookie);
      expect(adminRes.status).toBe(403);

      const candRes = await request(app)
        .post('/api/uploads/linkedin')
        .set('Cookie', candidateACookie);
      expect(candRes.status).toBe(400);
      expect(candRes.body.errors?.file).toBe('Choose a file to upload');
    });
  });


});
