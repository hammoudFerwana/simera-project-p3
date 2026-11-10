/**
 * US-02 integration tests: they run the real SQL against the simera_test
 * database (TEST_DATABASE_URL), with a fake mailer that records the codes.
 */
const crypto = require('crypto');
const { Pool } = require('pg');
const request = require('supertest');
const { loadConfig } = require('shared/src/config');
const { createApp } = require('../src/app');
const {
  OTP_MAX_ATTEMPTS,
  generateOtpCode
} = require('../src/auth/otp.service');
const {
  MailDeliveryError,
  createMailer,
  readMailConfig
} = require('../src/mail/mailer');

// Loads the root .env into process.env (TEST_DATABASE_URL).
loadConfig({ requiredVars: [] });

jest.setTimeout(30000);

const PASSWORD = 'secret-pass-1';
const RUN_ID = crypto.randomBytes(4).toString('hex');
let emailCounter = 0;

let pool;
let logSpies;

function uniqueEmail() {
  emailCounter += 1;
  return `us02-${RUN_ID}-${emailCounter}@example.com`;
}

/**
 * Records every delivered email. `delayMs` makes each delivery take a random
 * time up to that value, so parallel requests finish in a shuffled order.
 */
function createFakeMailer({ delayMs = 0 } = {}) {
  const sent = [];
  return {
    sent,
    lastCodeFor(email) {
      return sent.filter((mail) => mail.to === email).at(-1)?.code;
    },
    sendOtpEmail: jest.fn(async (mail) => {
      if (delayMs > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.random() * delayMs)
        );
      }
      sent.push(mail);
    })
  };
}

function failingDelivery() {
  return new MailDeliveryError(new Error('connect ECONNREFUSED'));
}

function buildApp(mailer = createFakeMailer()) {
  const app = createApp({ getDb: () => pool, getMailer: () => mailer });
  return { app, mailer };
}

async function register(app, email) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password: PASSWORD });
  expect(res.status).toBe(201);
  return res;
}

function verify(app, email, code) {
  return request(app).post('/api/auth/verify-otp').send({ email, code });
}

function resend(app, email) {
  return request(app).post('/api/auth/resend-otp').send({ email });
}

async function getUser(email) {
  const { rows } = await pool.query(
    `SELECT
      email_verified,
      otp_hash,
      otp_expires_at,
      otp_attempts,
      EXTRACT(EPOCH FROM otp_expires_at - CURRENT_TIMESTAMP::timestamp)
        AS seconds_left
    FROM users
    WHERE email = $1`,
    [email]
  );
  return rows[0];
}

/** Any code of the right shape that differs from `code`. */
function wrongCodeFor(code) {
  return code === '000000' ? '111111' : '000000';
}

/** Everything written to the console during the test, as one string. */
function loggedText() {
  return logSpies
    .flatMap((spy) => spy.mock.calls.flat())
    .map(String)
    .join('\n');
}

beforeAll(async () => {
  if (!process.env.TEST_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL must be set in .env');
  }
  pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });

  // Safety check: never run database tests on the main database.
  const { rows } = await pool.query('SELECT current_database() AS name');
  if (rows[0].name !== 'simera_test') {
    await pool.end();
    pool = undefined;
    throw new Error(
      `Database tests must run on simera_test, not ${rows[0].name}`
    );
  }
});

beforeEach(() => {
  logSpies = ['log', 'info', 'warn', 'error', 'debug'].map((method) =>
    jest.spyOn(console, method).mockImplementation(() => {})
  );
});

afterEach(() => {
  logSpies.forEach((spy) => spy.mockRestore());
});

afterAll(async () => {
  if (!pool) return;
  const pattern = `us02-${RUN_ID}-%`;
  await pool.query(
    `DELETE FROM candidate_profiles
    WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`,
    [pattern]
  );
  await pool.query('DELETE FROM users WHERE email LIKE $1', [pattern]);
  await pool.end();
});

describe('code sent after registration', () => {
  test('emails a 6-digit code and stores only its hash, expiring in 10 minutes', async () => {
    const { app, mailer } = buildApp();
    const email = uniqueEmail();

    const res = await register(app, email);

    expect(res.body).toEqual({
      message:
        'Account created. Enter the verification code sent to your email.',
      email,
      otpSent: true
    });
    const code = mailer.lastCodeFor(email);
    expect(code).toMatch(/^\d{6}$/);
    expect(mailer.sendOtpEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: email, ttlMinutes: 10 })
    );

    const user = await getUser(email);
    expect(user.email_verified).toBe(false);
    expect(user.otp_attempts).toBe(0);
    expect(user.otp_hash).toMatch(/^\$2b\$12\$/);
    expect(user.otp_hash).not.toContain(code);
    expect(Number(user.seconds_left)).toBeGreaterThan(9 * 60 + 50);
    expect(Number(user.seconds_left)).toBeLessThanOrEqual(10 * 60);
  });

  test('keeps the account but stores no code and says so when the email cannot be sent', async () => {
    const mailer = createFakeMailer();
    mailer.sendOtpEmail.mockRejectedValue(failingDelivery());
    const { app } = buildApp(mailer);
    const email = uniqueEmail();

    const res = await register(app, email);

    expect(res.body).toEqual({
      message:
        'Account created, but the verification code could not be sent. Request a new code.',
      email,
      otpSent: false
    });
    const user = await getUser(email);
    expect(user).toBeDefined();
    expect(user.otp_hash).toBeNull();
    expect(user.otp_expires_at).toBeNull();
    expect(loggedText()).not.toContain(email);
  });
});

describe('POST /api/auth/verify-otp', () => {
  test('verifies the email with the correct code and clears the code', async () => {
    const { app, mailer } = buildApp();
    const email = uniqueEmail();
    await register(app, email);

    const res = await verify(app, email, mailer.lastCodeFor(email));

    expect(res.status).toBe(200);
    const user = await getUser(email);
    expect(user.email_verified).toBe(true);
    expect(user.otp_hash).toBeNull();
    expect(user.otp_expires_at).toBeNull();
    expect(user.otp_attempts).toBe(0);
  });

  test('normalizes the email and trims the code', async () => {
    const { app, mailer } = buildApp();
    const email = uniqueEmail();
    await register(app, email);

    const res = await verify(
      app,
      `  ${email.toUpperCase()} `,
      ` ${mailer.lastCodeFor(email)} `
    );

    expect(res.status).toBe(200);
  });

  test('refuses to use a code twice', async () => {
    const { app, mailer } = buildApp();
    const email = uniqueEmail();
    await register(app, email);
    const code = mailer.lastCodeFor(email);
    await verify(app, email, code);

    const res = await verify(app, email, code);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      errors: { email: 'This email is already verified' },
      reason: 'already_verified'
    });
  });

  test('rejects an expired code without counting an attempt', async () => {
    const { app, mailer } = buildApp();
    const email = uniqueEmail();
    await register(app, email);
    await pool.query(
      `UPDATE users
      SET otp_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'
      WHERE email = $1`,
      [email]
    );

    const res = await verify(app, email, mailer.lastCodeFor(email));

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      errors: { code: 'The code has expired' },
      reason: 'expired'
    });
    const user = await getUser(email);
    expect(user.email_verified).toBe(false);
    expect(user.otp_attempts).toBe(0);
  });

  test('rejects a code with no expiry, even the correct one', async () => {
    const { app, mailer } = buildApp();
    const email = uniqueEmail();
    await register(app, email);
    await pool.query(
      'UPDATE users SET otp_expires_at = NULL WHERE email = $1',
      [email]
    );

    const res = await verify(app, email, mailer.lastCodeFor(email));

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      errors: { code: 'There is no active code. Request a new code' },
      reason: 'no_active_code'
    });
    const user = await getUser(email);
    expect(user.email_verified).toBe(false);
    expect(user.otp_attempts).toBe(0);
  });

  test('counts wrong codes and invalidates the code at the 5th, even for the correct code', async () => {
    const { app, mailer } = buildApp();
    const email = uniqueEmail();
    await register(app, email);
    const code = mailer.lastCodeFor(email);
    const wrong = wrongCodeFor(code);

    for (let attempt = 1; attempt < OTP_MAX_ATTEMPTS; attempt += 1) {
      const res = await verify(app, email, wrong);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        errors: { code: 'The code is incorrect' },
        reason: 'incorrect',
        attemptsLeft: OTP_MAX_ATTEMPTS - attempt
      });
      expect((await getUser(email)).otp_attempts).toBe(attempt);
    }

    const fifth = await verify(app, email, wrong);
    expect(fifth.status).toBe(400);
    expect(fifth.body.reason).toBe('too_many_attempts');

    let user = await getUser(email);
    expect(user.otp_attempts).toBe(5);
    expect(user.otp_hash).toBeNull();

    const withCorrectCode = await verify(app, email, code);
    expect(withCorrectCode.status).toBe(400);
    expect(withCorrectCode.body).toEqual({
      errors: { code: 'Too many wrong attempts. Request a new code' },
      reason: 'too_many_attempts'
    });
    user = await getUser(email);
    expect(user.email_verified).toBe(false);
    expect(user.otp_attempts).toBe(5);
  });

  test('counts parallel wrong guesses one by one, never past the limit', async () => {
    const { app, mailer } = buildApp();
    const email = uniqueEmail();
    await register(app, email);
    const wrong = wrongCodeFor(mailer.lastCodeFor(email));

    const responses = await Promise.all(
      Array.from({ length: 8 }, () => verify(app, email, wrong))
    );

    const reasons = responses.map((res) => res.body.reason);
    expect(reasons.filter((r) => r === 'incorrect')).toHaveLength(4);
    expect(reasons.filter((r) => r === 'too_many_attempts')).toHaveLength(4);
    expect((await getUser(email)).otp_attempts).toBe(5);
  });

  test('returns 404 for an unregistered email', async () => {
    const { app } = buildApp();

    const res = await verify(app, uniqueEmail(), '123456');

    expect(res.status).toBe(404);
    expect(res.body.reason).toBe('not_found');
  });

  test.each([
    ['12345', 'The code must be 6 digits'],
    ['1234567', 'The code must be 6 digits'],
    ['12a456', 'The code must be 6 digits'],
    ['', 'Code is required'],
    [undefined, 'Code is required']
  ])('rejects the code %p next to the code field', async (code, message) => {
    const { app } = buildApp();

    const res = await verify(app, uniqueEmail(), code);

    expect(res.status).toBe(400);
    expect(res.body.errors.code).toBe(message);
  });

  test('rejects an invalid email next to the email field', async () => {
    const { app } = buildApp();

    const res = await verify(app, 'not-an-email', '123456');

    expect(res.status).toBe(400);
    expect(res.body.errors.email).toBe('Enter a valid email address');
  });
});

describe('POST /api/auth/resend-otp', () => {
  test('sends a new code, invalidates the old one and resets the attempts', async () => {
    const { app, mailer } = buildApp();
    const email = uniqueEmail();
    await register(app, email);
    const oldCode = mailer.lastCodeFor(email);
    for (let attempt = 0; attempt < OTP_MAX_ATTEMPTS; attempt += 1) {
      await verify(app, email, wrongCodeFor(oldCode));
    }

    const res = await resend(app, email);

    expect(res.status).toBe(200);
    const newCode = mailer.lastCodeFor(email);
    expect(mailer.sent.filter((mail) => mail.to === email)).toHaveLength(2);
    const user = await getUser(email);
    expect(user.otp_attempts).toBe(0);
    expect(user.otp_hash).not.toBeNull();

    if (oldCode !== newCode) {
      const withOldCode = await verify(app, email, oldCode);
      expect(withOldCode.status).toBe(400);
      expect(withOldCode.body.reason).toBe('incorrect');
    }

    const withNewCode = await verify(app, email, newCode);
    expect(withNewCode.status).toBe(200);
  });

  test('parallel resends: the last email delivered holds the only valid code', async () => {
    const mailer = createFakeMailer({ delayMs: 50 });
    const { app } = buildApp(mailer);
    const email = uniqueEmail();
    await register(app, email);

    const responses = await Promise.all(
      Array.from({ length: 4 }, () => resend(app, email))
    );

    expect(responses.map((res) => res.status)).toEqual([200, 200, 200, 200]);
    const codes = mailer.sent
      .filter((mail) => mail.to === email)
      .map((mail) => mail.code);
    expect(codes).toHaveLength(5);

    const lastCode = codes.at(-1);
    for (const olderCode of new Set(codes.slice(0, -1))) {
      if (olderCode === lastCode) continue;
      const res = await verify(app, email, olderCode);
      expect(res.body.reason).toBe('incorrect');
    }
    const res = await verify(app, email, lastCode);
    expect(res.status).toBe(200);
  });

  test('keeps the previous code working when the new email cannot be sent', async () => {
    const { app, mailer } = buildApp();
    const email = uniqueEmail();
    await register(app, email);
    const firstCode = mailer.lastCodeFor(email);
    await verify(app, email, wrongCodeFor(firstCode));
    mailer.sendOtpEmail.mockRejectedValueOnce(failingDelivery());

    const res = await resend(app, email);

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      errors: { email: 'Could not send the code. Try again' },
      reason: 'send_failed'
    });
    // Nothing changed: same code, same attempt count.
    expect((await getUser(email)).otp_attempts).toBe(1);
    const withFirstCode = await verify(app, email, firstCode);
    expect(withFirstCode.status).toBe(200);
  });

  test('refuses an already verified email', async () => {
    const { app, mailer } = buildApp();
    const email = uniqueEmail();
    await register(app, email);
    await verify(app, email, mailer.lastCodeFor(email));

    const res = await resend(app, email);

    expect(res.status).toBe(409);
    expect(res.body.reason).toBe('already_verified');
    expect(mailer.sent).toHaveLength(1);
  });

  test('returns 404 for an unregistered email', async () => {
    const { app, mailer } = buildApp();

    const res = await resend(app, uniqueEmail());

    expect(res.status).toBe(404);
    expect(mailer.sent).toHaveLength(0);
  });

  test('logs a failed delivery without the email or the code', async () => {
    const { app, mailer } = buildApp();
    const email = uniqueEmail();
    await register(app, email);
    let attemptedCode;
    mailer.sendOtpEmail.mockImplementationOnce(async ({ code }) => {
      attemptedCode = code;
      throw new MailDeliveryError(new Error(`550 rejected <${email}>`));
    });

    const res = await resend(app, email);

    expect(res.status).toBe(503);
    const logged = loggedText();
    expect(logged).toContain('OTP resend failed');
    expect(logged).not.toContain(email);
    expect(logged).not.toContain(attemptedCode);
  });
});

describe('the code never appears in the logs', () => {
  test('across register, wrong attempts, resend and verify', async () => {
    const { app, mailer } = buildApp();
    const email = uniqueEmail();

    await register(app, email);
    await verify(app, email, wrongCodeFor(mailer.lastCodeFor(email)));
    await resend(app, email);
    await verify(app, email, mailer.lastCodeFor(email));

    const logged = loggedText();
    for (const { code } of mailer.sent) {
      expect(logged).not.toContain(code);
    }
  });
});

describe('generateOtpCode', () => {
  test('always returns exactly 6 digits', () => {
    for (let i = 0; i < 1000; i += 1) {
      expect(generateOtpCode()).toMatch(/^\d{6}$/);
    }
  });
});

describe('mailer', () => {
  test('sends the code with its validity in the email body', async () => {
    const transport = { sendMail: jest.fn().mockResolvedValue({}) };
    const mailer = createMailer({ transport, from: 'no-reply@example.com' });

    await mailer.sendOtpEmail({
      to: 'jane@example.com',
      code: '042137',
      ttlMinutes: 10
    });

    const message = transport.sendMail.mock.calls[0][0];
    expect(message.from).toBe('no-reply@example.com');
    expect(message.to).toBe('jane@example.com');
    expect(message.text).toContain('042137');
    expect(message.text).toContain('10 minutes');
  });

  test('wraps SMTP failures without the recipient in the message', async () => {
    const smtpError = Object.assign(
      new Error(
        "Can't send mail - all recipients were rejected: <jane@example.com>"
      ),
      { code: 'EENVELOPE', responseCode: 550 }
    );
    const transport = { sendMail: jest.fn().mockRejectedValue(smtpError) };
    const mailer = createMailer({ transport, from: 'no-reply@example.com' });

    const error = await mailer
      .sendOtpEmail({ to: 'jane@example.com', code: '042137', ttlMinutes: 10 })
      .catch((e) => e);

    expect(error).toBeInstanceOf(MailDeliveryError);
    expect(error.message).toBe('Email delivery failed (EENVELOPE, 550)');
    expect(error.stack).not.toContain('jane@example.com');
    expect(error.cause).toBe(smtpError);
  });

  test('reports every missing SMTP variable', () => {
    expect(() => readMailConfig({ SMTP_HOST: 'smtp.example.com' })).toThrow(
      'Missing required environment variable(s): SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM'
    );
  });

  test('uses TLS from the start only on port 465', () => {
    const env = {
      SMTP_HOST: 'smtp.example.com',
      SMTP_USER: 'user',
      SMTP_PASS: 'pass',
      MAIL_FROM: 'no-reply@example.com'
    };

    expect(readMailConfig({ ...env, SMTP_PORT: '465' }).secure).toBe(true);
    expect(readMailConfig({ ...env, SMTP_PORT: '587' }).secure).toBe(false);
  });
});
