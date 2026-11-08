const request = require('supertest');
const bcrypt = require('bcrypt');
const { createApp } = require('../src/app');
const { validateRegisterInput } = require('../src/auth/register.validation');

/**
 * In-memory stand-in for the pg Pool with real transaction behavior:
 * rows inserted inside BEGIN are only kept on COMMIT and discarded on ROLLBACK.
 */
function createFakeDb({
  failProfileInsert = false,
  raceOnUserInsert = false
} = {}) {
  const state = { users: [], candidate_profiles: [], admins: [] };
  const statements = [];
  let nextUserId = 1;
  let nextProfileId = 1;

  function uniqueViolation() {
    const error = new Error(
      'duplicate key value violates unique constraint "users_email_key"'
    );
    error.code = '23505';
    error.table = 'users';
    return error;
  }

  const client = {
    released: false,
    tx: null,
    async query(sql, params = []) {
      const text = sql.trim();
      statements.push(text.split(/\s+/).slice(0, 3).join(' '));

      if (text === 'BEGIN') {
        this.tx = { users: [], candidate_profiles: [] };
        return {};
      }
      if (text === 'COMMIT') {
        state.users.push(...this.tx.users);
        state.candidate_profiles.push(...this.tx.candidate_profiles);
        this.tx = null;
        return {};
      }
      if (text === 'ROLLBACK') {
        this.tx = null;
        return {};
      }
      if (text.startsWith('INSERT INTO users')) {
        const [email, passwordHash] = params;
        const taken = [...state.users, ...this.tx.users].some(
          (u) => u.email === email
        );
        if (taken || raceOnUserInsert) {
          throw uniqueViolation();
        }
        const row = {
          id: nextUserId++,
          email,
          password_hash: passwordHash,
          email_verified: /FALSE/.test(text) ? false : undefined,
          otp_attempts: /,\s*0,/.test(text) ? 0 : undefined
        };
        this.tx.users.push(row);
        return { rows: [{ id: row.id, email: row.email }], rowCount: 1 };
      }
      if (text.startsWith('INSERT INTO candidate_profiles')) {
        if (failProfileInsert) {
          throw new Error('candidate_profiles insert failed');
        }
        this.tx.candidate_profiles.push({
          id: nextProfileId++,
          user_id: params[0]
        });
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected query: ${text}`);
    },
    release() {
      this.released = true;
    }
  };

  const pool = {
    async query(sql, params = []) {
      const text = sql.trim();
      statements.push(text.split(/\s+/).slice(0, 3).join(' '));
      if (text.startsWith('SELECT id FROM users WHERE email')) {
        const rows = state.users
          .filter((u) => u.email === params[0])
          .map((u) => ({ id: u.id }));
        return { rows, rowCount: rows.length };
      }
      throw new Error(`Unexpected query: ${text}`);
    },
    async connect() {
      return client;
    }
  };

  return { pool, client, state, statements };
}

function buildApp(fakeDb, sendOtp = jest.fn().mockResolvedValue()) {
  const app = createApp({ getDb: () => fakeDb.pool, sendOtp });
  return { app, sendOtp };
}

const VALID = { email: 'jane.doe@example.com', password: 'secret-pass-1' };

describe('POST /api/auth/register', () => {
  let consoleError;

  beforeEach(() => {
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  test('creates an unverified user and a linked candidate profile, with no admins row', async () => {
    const db = createFakeDb();
    const { app, sendOtp } = buildApp(db);

    const res = await request(app).post('/api/auth/register').send(VALID);

    expect(res.status).toBe(201);
    expect(res.body.email).toBe(VALID.email);
    expect(db.state.users).toHaveLength(1);

    const [user] = db.state.users;
    expect(user.email).toBe(VALID.email);
    expect(user.email_verified).toBe(false);
    expect(user.otp_attempts).toBe(0);
    expect(db.state.candidate_profiles).toEqual([{ id: 1, user_id: user.id }]);
    expect(db.state.admins).toHaveLength(0);
    expect(db.statements).toEqual([
      'SELECT id FROM',
      'BEGIN',
      'INSERT INTO users',
      'INSERT INTO candidate_profiles',
      'COMMIT'
    ]);
    expect(db.client.released).toBe(true);
    expect(sendOtp).toHaveBeenCalledTimes(1);
    expect(sendOtp).toHaveBeenCalledWith({ id: user.id, email: VALID.email });
  });

  test('normalizes the email (trim + lowercase) before checking and saving', async () => {
    const db = createFakeDb();
    const { app } = buildApp(db);

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: '  Jane.DOE@Example.COM  ', password: VALID.password });

    expect(res.status).toBe(201);
    expect(db.state.users[0].email).toBe('jane.doe@example.com');
  });

  test('stores only a bcrypt hash of the password', async () => {
    const db = createFakeDb();
    const { app } = buildApp(db);

    const res = await request(app).post('/api/auth/register').send(VALID);

    expect(res.status).toBe(201);
    const [user] = db.state.users;
    expect(user.password_hash).not.toBe(VALID.password);
    expect(user.password_hash).not.toContain(VALID.password);
    expect(user.password_hash).toMatch(/^\$2[aby]\$12\$/);
    await expect(
      bcrypt.compare(VALID.password, user.password_hash)
    ).resolves.toBe(true);
    expect(JSON.stringify(res.body)).not.toContain(user.password_hash);
    expect(JSON.stringify(res.body)).not.toContain(VALID.password);
  });

  test('rejects an email already registered in another letter case', async () => {
    const db = createFakeDb();
    const { app, sendOtp } = buildApp(db);
    await request(app).post('/api/auth/register').send(VALID);
    sendOtp.mockClear();

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'JANE.Doe@EXAMPLE.com', password: 'another-pass-2' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      errors: { email: 'This email is already in use' }
    });
    expect(db.state.users).toHaveLength(1);
    expect(db.state.candidate_profiles).toHaveLength(1);
    expect(sendOtp).not.toHaveBeenCalled();
  });

  test('rejects a duplicate caught by the unique constraint (concurrent registration)', async () => {
    const db = createFakeDb({ raceOnUserInsert: true });
    const { app, sendOtp } = buildApp(db);

    const res = await request(app).post('/api/auth/register').send(VALID);

    expect(res.status).toBe(409);
    expect(res.body.errors.email).toBe('This email is already in use');
    expect(db.statements).toContain('ROLLBACK');
    expect(db.state.users).toHaveLength(0);
    expect(sendOtp).not.toHaveBeenCalled();
  });

  test('rolls back the user row when the candidate profile insert fails', async () => {
    const db = createFakeDb({ failProfileInsert: true });
    const { app, sendOtp } = buildApp(db);

    const res = await request(app).post('/api/auth/register').send(VALID);

    expect(res.status).toBe(500);
    expect(db.statements).toEqual([
      'SELECT id FROM',
      'BEGIN',
      'INSERT INTO users',
      'INSERT INTO candidate_profiles',
      'ROLLBACK'
    ]);
    expect(db.state.users).toHaveLength(0);
    expect(db.state.candidate_profiles).toHaveLength(0);
    expect(db.client.released).toBe(true);
    expect(sendOtp).not.toHaveBeenCalled();
  });

  test('keeps the account when sending the OTP fails, and logs no secrets', async () => {
    const db = createFakeDb();
    const sendOtp = jest.fn().mockRejectedValue(new Error('mail server down'));
    const { app } = buildApp(db, sendOtp);

    const res = await request(app).post('/api/auth/register').send(VALID);

    expect(res.status).toBe(201);
    expect(db.state.users).toHaveLength(1);
    expect(consoleError).toHaveBeenCalledTimes(1);
    const logged = consoleError.mock.calls.flat().join(' ');
    expect(logged).not.toContain(VALID.password);
    expect(logged).not.toContain(VALID.email);
  });

  describe('invalid input', () => {
    test.each([
      ['not-an-email'],
      ['jane@'],
      ['@example.com'],
      ['jane doe@example.com']
    ])('rejects the email format %p next to the email field', async (email) => {
      const db = createFakeDb();
      const { app } = buildApp(db);

      const res = await request(app)
        .post('/api/auth/register')
        .send({ email, password: VALID.password });

      expect(res.status).toBe(400);
      expect(res.body.errors.email).toBe('Enter a valid email address');
      expect(db.statements).toHaveLength(0);
    });

    test('rejects a password shorter than 8 characters', async () => {
      const db = createFakeDb();
      const { app } = buildApp(db);

      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: VALID.email, password: 'short12' });

      expect(res.status).toBe(400);
      expect(res.body.errors.password).toBe(
        'Password must be at least 8 characters'
      );
      expect(db.statements).toHaveLength(0);
    });

    test('reports both missing fields', async () => {
      const db = createFakeDb();
      const { app } = buildApp(db);

      const res = await request(app).post('/api/auth/register').send({});

      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual({
        email: 'Email is required',
        password: 'Password is required'
      });
    });

    test('rejects a malformed JSON body', async () => {
      const db = createFakeDb();
      const { app } = buildApp(db);

      const res = await request(app)
        .post('/api/auth/register')
        .set('Content-Type', 'application/json')
        .send('{"email": ');

      expect(res.status).toBe(400);
      expect(res.body.errors.body).toBe('Invalid JSON body');
      expect(db.statements).toHaveLength(0);
    });
  });
});

describe('validateRegisterInput', () => {
  test('accepts a password of exactly 8 characters', () => {
    expect(
      validateRegisterInput({ email: VALID.email, password: '12345678' })
        .success
    ).toBe(true);
  });

  test('does not trim or change the password', () => {
    const result = validateRegisterInput({
      email: VALID.email,
      password: '  Pass word  '
    });

    expect(result.data.password).toBe('  Pass word  ');
  });

  test('rejects an email longer than 255 characters', () => {
    const email = `${'a'.repeat(250)}@example.com`;
    const result = validateRegisterInput({ email, password: VALID.password });

    expect(result.success).toBe(false);
    expect(result.errors.email).toBe('Email must be at most 255 characters');
  });

  test.each([null, 'text', []])('rejects a non-object body %p', (body) => {
    const result = validateRegisterInput(body);

    expect(result.success).toBe(false);
    expect(result.errors).toEqual({
      body: 'Request body must be a JSON object'
    });
  });
});
