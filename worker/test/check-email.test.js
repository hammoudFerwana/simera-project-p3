const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');
const crypto = require('crypto');
const { PermanentError } = require('shared/src/errors');
const { processJob } = require('../src/process-job');
const {
  findEmails,
  decideEmail,
  createCheckEmailStep
} = require('../src/steps/check-email');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

describe('check-email pure functions', () => {
  describe('findEmails', () => {
    it('extracts emails from text case-insensitively and lowercases them', () => {
      const text = 'Contact: Candidate.Name@Example.COM';
      const result = findEmails(text, []);
      expect(result).toEqual(['candidate.name@example.com']);
    });

    it('extracts emails from mailto links, removing prefix and query params', () => {
      const links = [
        { url: 'mailto:applicant%2Btag@domain.com?subject=Application' }
      ];
      const result = findEmails('', links);
      expect(result).toEqual(['applicant+tag@domain.com']);
    });

    it('deduplicates emails found in text and mailto links', () => {
      const text = 'Email: user@domain.com and USER@domain.com';
      const links = [{ url: 'mailto:user@domain.com' }];
      const result = findEmails(text, links);
      expect(result).toEqual(['user@domain.com']);
    });

    it('returns an empty array when no emails are present', () => {
      const text = 'No email address in this resume';
      const links = [{ url: 'https://example.com/portfolio' }];
      const result = findEmails(text, links);
      expect(result).toEqual([]);
    });

    it('handles null and undefined text or links gracefully', () => {
      expect(findEmails(null, null)).toEqual([]);
      expect(findEmails(undefined, undefined)).toEqual([]);
    });
  });

  describe('decideEmail', () => {
    it('continues when fileEmails contains loginEmail with different case (AC 1)', () => {
      const fileEmails = ['Applicant@Example.com'];
      const decision = decideEmail(fileEmails, 'applicant@example.com');
      expect(decision).toEqual({ ok: true });
    });

    it('reports mismatch when fileEmails contains only another email (AC 2)', () => {
      const fileEmails = ['other@example.com'];
      const decision = decideEmail(fileEmails, 'applicant@example.com');
      expect(decision).toEqual({ ok: false });
    });

    it('continues when fileEmails is empty (AC 3)', () => {
      const fileEmails = [];
      const decision = decideEmail(fileEmails, 'applicant@example.com');
      expect(decision).toEqual({ ok: true });
    });

    it('continues when fileEmails contains loginEmail and another email (AC 4)', () => {
      const fileEmails = ['other@example.com', 'applicant@example.com'];
      const decision = decideEmail(fileEmails, 'applicant@example.com');
      expect(decision).toEqual({ ok: true });
    });

    it('detects email when it appears only inside a mailto link (AC 5)', () => {
      const fileEmails = findEmails('No email in text', [
        { url: 'mailto:applicant@example.com' }
      ]);
      const decision = decideEmail(fileEmails, 'applicant@example.com');
      expect(decision).toEqual({ ok: true });
    });
  });
});

describe('createCheckEmailStep unit tests', () => {
  it('throws PermanentError with exact message on email mismatch', async () => {
    const fakeDb = {
      query: jest.fn().mockResolvedValue({
        rows: [{ email: 'account@example.com' }]
      })
    };
    const step = createCheckEmailStep({ db: fakeDb });
    const ctx = {
      candidateId: 1,
      text: 'Resume email: mismatch@example.com',
      links: []
    };

    await expect(step(ctx)).rejects.toThrow(
      new PermanentError(
        'The file contains an email that does not match your account email'
      )
    );
  });

  it('throws PermanentError if candidate account is not found', async () => {
    const fakeDb = {
      query: jest.fn().mockResolvedValue({ rows: [] })
    };
    const step = createCheckEmailStep({ db: fakeDb });
    const ctx = { candidateId: 999, text: '', links: [] };

    await expect(step(ctx)).rejects.toThrow(
      new PermanentError('Candidate account not found')
    );
  });

  it('sets ctx.loginEmail to lowercase account email when email matches', async () => {
    const fakeDb = {
      query: jest.fn().mockResolvedValue({
        rows: [{ email: 'Account@Example.COM' }]
      })
    };
    const step = createCheckEmailStep({ db: fakeDb });
    const ctx = {
      candidateId: 1,
      text: 'Resume contact: account@example.com',
      links: []
    };

    const nextCtx = await step(ctx);
    expect(nextCtx.loginEmail).toBe('account@example.com');
  });

  it('sets ctx.loginEmail to lowercase account email when file has no email', async () => {
    const fakeDb = {
      query: jest.fn().mockResolvedValue({
        rows: [{ email: 'Account@Example.COM' }]
      })
    };
    const step = createCheckEmailStep({ db: fakeDb });
    const ctx = {
      candidateId: 1,
      text: 'Resume with no email anywhere',
      links: []
    };

    const nextCtx = await step(ctx);
    expect(nextCtx.loginEmail).toBe('account@example.com');
  });
});

describe('createCheckEmailStep integration test', () => {
  let pool;
  let createdEmails = [];

  beforeAll(async () => {
    const testDatabaseUrl = process.env.TEST_DATABASE_URL;
    if (!testDatabaseUrl) {
      throw new Error('TEST_DATABASE_URL must be set in .env');
    }
    pool = new Pool({ connectionString: testDatabaseUrl });

    const result = await pool.query('SELECT current_database() AS name');
    if (!result.rows[0].name.startsWith('simera_test')) {
      await pool.end();
      throw new Error(
        `Database tests must run on simera_test, not ${result.rows[0].name}`
      );
    }
  });

  afterEach(async () => {
    if (createdEmails.length > 0) {
      const candidates = `SELECT cp.id FROM candidate_profiles cp
        JOIN users u ON u.id = cp.user_id WHERE u.email = ANY($1::varchar[])`;
      await pool.query(
        `DELETE FROM processing_jobs WHERE file_id IN
           (SELECT id FROM uploaded_files WHERE candidate_id IN (${candidates}))`,
        [createdEmails]
      );
      await pool.query(
        `DELETE FROM uploaded_files WHERE candidate_id IN (${candidates})`,
        [createdEmails]
      );
      await pool.query(
        `DELETE FROM candidate_profiles WHERE user_id IN
           (SELECT id FROM users WHERE email = ANY($1::varchar[]))`,
        [createdEmails]
      );
      await pool.query('DELETE FROM users WHERE email = ANY($1::varchar[])', [
        createdEmails
      ]);
      createdEmails = [];
    }
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  async function seedCandidate() {
    const email = `test-job-${crypto.randomUUID()}@example.com`;
    createdEmails.push(email);

    const u = await pool.query(
      `INSERT INTO users (email, password_hash, created_at)
       VALUES ($1, 'test-password-hash', CURRENT_TIMESTAMP) RETURNING id`,
      [email]
    );
    const c = await pool.query(
      `INSERT INTO candidate_profiles (user_id, created_at)
       VALUES ($1, CURRENT_TIMESTAMP) RETURNING id`,
      [u.rows[0].id]
    );
    return c.rows[0].id;
  }

  async function seedJobFor(candidateId) {
    const f = await pool.query(
      `INSERT INTO uploaded_files (candidate_id, source_type, original_filename,
         file_size, file_hash, storage_location, uploaded_at, validated_at)
       VALUES ($1, 'cv', 'a.pdf', 1, $2, 'test-location',
         CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id`,
      [candidateId, crypto.randomUUID()]
    );
    const j = await pool.query(
      `INSERT INTO processing_jobs (file_id, created_at)
       VALUES ($1, CURRENT_TIMESTAMP) RETURNING id`,
      [f.rows[0].id]
    );
    return j.rows[0].id;
  }

  it('fails job and skips LLM when file holds only another email', async () => {
    const candidateId = await seedCandidate();
    const jobId = await seedJobFor(candidateId);

    const fakeStep1 = async (ctx) => ({
      ...ctx,
      text: 'Resume contact: mismatch@example.com',
      links: []
    });

    let llmCalls = 0;
    const llmSpy = async (ctx) => {
      llmCalls += 1;
      return ctx;
    };

    const result = await processJob(pool, jobId, {
      steps: [fakeStep1, createCheckEmailStep({ db: pool }), llmSpy],
      sleep: async () => {}
    });

    expect(result).toBe('done');

    const { rows } = await pool.query(
      'SELECT status, attempt_count, failure_reason FROM processing_jobs WHERE id = $1',
      [jobId]
    );

    expect(rows[0].status).toBe('failed');
    expect(rows[0].attempt_count).toBe(1);
    expect(rows[0].failure_reason).toBe(
      'The file contains an email that does not match your account email'
    );
    expect(llmCalls).toBe(0);
  });
});
