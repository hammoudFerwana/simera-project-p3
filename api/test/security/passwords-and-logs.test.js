const path = require('path');
const os = require('os');
const fs = require('fs/promises');
const crypto = require('crypto');
const request = require('supertest');
const { Pool } = require('pg');
const { Document, Packer, Paragraph, TextRun } = require('docx');

require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const { createApp } = require('../../src/app');
const { createLocalStorage } = require('shared/src/upload/storage');
const { processJob } = require('worker/src/process-job');

process.env.JWT_SECRET = 'test-secret-for-passwords-and-logs';

jest.setTimeout(30000);

const RUN_ID = crypto.randomBytes(4).toString('hex');
let idCounter = 0;

function nextId() {
  idCounter += 1;
  return `${RUN_ID}-${idCounter}`;
}

describe('Passwords & Logs Security Verification (US-24 / D6)', () => {
  let pool;
  let app;
  let tempStorageDir;
  let storage;

  const created = {
    jobIds: [],
    fileIds: [],
    userIds: []
  };

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
      path.join(os.tmpdir(), 'simera-pwd-log-test-')
    );
    storage = createLocalStorage({ directory: tempStorageDir });

    app = createApp({
      getDb: () => pool,
      getMailer: () => fakeMailer,
      getStorage: () => storage,
      enqueueJob: async () => {}
    });
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

  describe('Password storage security', () => {
    test('password is saved as a bcrypt hash and plain password is never stored or matched in database', async () => {
      const plainPassword = `SuperSecret_PlainP@ssword_${nextId()}`;
      const email = `sec-pwd-${nextId()}@example.com`;

      const regRes = await request(app)
        .post('/api/auth/register')
        .send({ email, password: plainPassword });

      expect(regRes.status).toBe(201);

      const { rows } = await pool.query(
        'SELECT id, password_hash FROM users WHERE email = $1',
        [email]
      );
      expect(rows.length).toBe(1);

      const { id, password_hash: passwordHash } = rows[0];
      created.userIds.push(id);

      // Must be a bcrypt hash (standard bcrypt formats: $2b$, $2a$, or $2y$)
      const isBcrypt =
        passwordHash.startsWith('$2b$') ||
        passwordHash.startsWith('$2a$') ||
        passwordHash.startsWith('$2y$');
      expect(isBcrypt).toBe(true);

      // Must never equal the plain password
      expect(passwordHash).not.toBe(plainPassword);

      // Must not contain the plain password as a substring
      expect(passwordHash.includes(plainPassword)).toBe(false);
    });
  });

  describe('Console log sanitization', () => {
    test('console logs during register, login, verify-otp, upload, and job processing never leak passwords, OTP codes, or CV text', async () => {
      const capturedLogs = [];
      const spyMethods = ['log', 'info', 'warn', 'error', 'debug'];
      const spies = spyMethods.map((method) =>
        jest.spyOn(console, method).mockImplementation((...args) => {
          capturedLogs.push(
            args
              .map((a) =>
                typeof a === 'object' ? JSON.stringify(a) : String(a)
              )
              .join(' ')
          );
        })
      );

      const secretPassword = `SensitivePassword_${nextId()}`;
      const distinctiveCvSentence = `UniqueConfidentialMarkerSentence_${nextId()}_SecretCVContent`;
      const candidateEmail = `sec-logs-${nextId()}@example.com`;

      try {
        // 1. Candidate registration with plain password
        const regRes = await request(app)
          .post('/api/auth/register')
          .send({ email: candidateEmail, password: secretPassword });

        expect(regRes.status).toBe(201);

        const userRowRes = await pool.query(
          'SELECT id FROM users WHERE email = $1',
          [candidateEmail]
        );
        expect(userRowRes.rows.length).toBe(1);
        created.userIds.push(userRowRes.rows[0].id);

        const otpCode = fakeMailer.lastCodeFor(candidateEmail);
        expect(otpCode).toBeDefined();
        expect(typeof otpCode).toBe('string');
        expect(otpCode.length).toBe(6);

        // 2. Login with that password before email verification (403 expected)
        const preLoginRes = await request(app)
          .post('/api/auth/login')
          .send({ email: candidateEmail, password: secretPassword });

        expect(preLoginRes.status).toBe(403);
        expect(preLoginRes.body.reason).toBe('verification_required');

        // 3. Verify OTP with the code from fake mailer
        const verifyRes = await request(app)
          .post('/api/auth/verify-otp')
          .send({ email: candidateEmail, code: otpCode });

        expect(verifyRes.status).toBe(200);

        // Login after verification to obtain session cookie
        const postLoginRes = await request(app)
          .post('/api/auth/login')
          .send({ email: candidateEmail, password: secretPassword });

        expect(postLoginRes.status).toBe(200);
        const cookie = postLoginRes.headers['set-cookie'];
        expect(cookie).toBeDefined();

        // 4. Upload CV file containing the distinctive sentence
        const doc = new Document({
          sections: [
            {
              children: [
                new Paragraph({
                  children: [
                    new TextRun(
                      'Curriculum Vitae for Candidate Security Logging Verification. Professional Software Engineer with cloud and cybersecurity expertise.'
                    ),
                    new TextRun(` Email: ${candidateEmail}`),
                    new TextRun(` Confidential Token: ${distinctiveCvSentence}`)
                  ]
                })
              ]
            }
          ]
        });
        const cvBuffer = await Packer.toBuffer(doc);

        const uploadRes = await request(app)
          .post('/api/uploads/cv')
          .set('Cookie', cookie)
          .attach('file', cvBuffer, 'candidate-cv.docx');

        expect(uploadRes.status).toBe(202);
        const { fileId, jobId } = uploadRes.body;
        expect(fileId).toBeDefined();
        expect(jobId).toBeDefined();
        created.fileIds.push(fileId);
        created.jobIds.push(jobId);

        // 5. Run processJob(pool, jobId, { steps: [fakeStep] })
        const fakeStep = jest.fn(async (ctx) => ctx);
        const jobResult = await processJob(pool, jobId, { steps: [fakeStep] });
        expect(jobResult).toBe('done');
        expect(fakeStep).toHaveBeenCalledTimes(1);
      } finally {
        spies.forEach((spy) => spy.mockRestore());
      }

      // Assert that across all captured log messages, no secrets appear
      const fullLogText = capturedLogs.join('\n');

      const leaksPassword = fullLogText.includes(secretPassword);
      expect(leaksPassword).toBe(false);

      const otpCode = fakeMailer.lastCodeFor(candidateEmail);
      const leaksOtp = fullLogText.includes(otpCode);
      expect(leaksOtp).toBe(false);

      const leaksCvSentence = fullLogText.includes(distinctiveCvSentence);
      expect(leaksCvSentence).toBe(false);
    });
  });
});
