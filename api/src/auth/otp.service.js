const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { MailDeliveryError } = require('../mail/mailer');

// Fixed by requirements 4.2: valid 10 minutes, single use, a new code is
// required after 5 wrong attempts.
const OTP_LENGTH = 6;
const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_BCRYPT_ROUNDS = 12;

/**
 * An expected OTP outcome that is reported to the client.
 * `field` is the request field the message belongs to, `reason` a stable
 * machine-readable code the frontend can branch on (e.g. show "Resend").
 */
class OtpError extends Error {
  constructor({ status, field, reason, message, details = {} }) {
    super(message);
    this.name = 'OtpError';
    this.status = status;
    this.field = field;
    this.reason = reason;
    this.details = details;
  }
}

const errors = {
  notFound: () =>
    new OtpError({
      status: 404,
      field: 'email',
      reason: 'not_found',
      message: 'No account uses this email'
    }),
  alreadyVerified: () =>
    new OtpError({
      status: 409,
      field: 'email',
      reason: 'already_verified',
      message: 'This email is already verified'
    }),
  noActiveCode: () =>
    new OtpError({
      status: 400,
      field: 'code',
      reason: 'no_active_code',
      message: 'There is no active code. Request a new code'
    }),
  expired: () =>
    new OtpError({
      status: 400,
      field: 'code',
      reason: 'expired',
      message: 'The code has expired'
    }),
  incorrect: (attemptsLeft) =>
    new OtpError({
      status: 400,
      field: 'code',
      reason: 'incorrect',
      message: 'The code is incorrect',
      details: { attemptsLeft }
    }),
  tooManyAttempts: () =>
    new OtpError({
      status: 400,
      field: 'code',
      reason: 'too_many_attempts',
      message: 'Too many wrong attempts. Request a new code'
    }),
  sendFailed: () =>
    new OtpError({
      status: 503,
      field: 'email',
      reason: 'send_failed',
      message: 'Could not send the code. Try again'
    })
};

/** A uniformly random numeric code, zero-padded (e.g. "004217"). */
function generateOtpCode() {
  return crypto
    .randomInt(0, 10 ** OTP_LENGTH)
    .toString()
    .padStart(OTP_LENGTH, '0');
}

/**
 * Runs `work(client)` inside BEGIN/COMMIT on one pooled connection.
 * Any error rolls back. If ROLLBACK itself fails, the connection is in an
 * unknown state, so it is destroyed instead of going back to the pool.
 */
async function withTransaction(db, logger, work) {
  const client = await db.connect();
  let brokenConnectionError;

  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      brokenConnectionError = rollbackError;
      logger.error('OTP transaction rollback failed', rollbackError.stack);
    }
    throw error;
  } finally {
    client.release(brokenConnectionError);
  }
}

/**
 * Creates a new code for an unverified user and emails it.
 *
 * Storing the new hash replaces any previous code and resets otp_attempts, so
 * the old code stops working. The expiry is computed by the database clock,
 * like every other timestamp. The plain code is never stored or logged.
 *
 * The email is sent inside the transaction, before COMMIT:
 * - If sending fails, the new code is rolled back, so the user is never left
 *   with an active code they didn't receive (after a failed resend, the
 *   previous code, which they did receive, still works).
 * - The user row stays locked (FOR UPDATE) until the email is sent, so
 *   parallel resends run one after another and the last email sent always
 *   holds the code that is stored.
 *
 * @param {object} deps
 * @param {{ connect: Function }} deps.db pg Pool
 * @param {{ sendOtpEmail: Function }} deps.mailer
 * @param {{ error: Function }} [deps.logger]
 * @param {{ id: number, email: string }} user
 * @throws {OtpError} already_verified when the user is verified meanwhile
 * @throws {MailDeliveryError} when the email can't be sent (nothing saved)
 */
async function issueOtp({ db, mailer, logger = console }, user) {
  const code = generateOtpCode();
  const otpHash = await bcrypt.hash(code, OTP_BCRYPT_ROUNDS);

  await withTransaction(db, logger, async (client) => {
    const locked = await client.query(
      `SELECT id
      FROM users
      WHERE id = $1 AND email_verified = FALSE
      FOR UPDATE`,
      [user.id]
    );
    if (locked.rowCount === 0) {
      throw errors.alreadyVerified();
    }

    await client.query(
      `UPDATE users
      SET otp_hash = $1,
        otp_expires_at = CURRENT_TIMESTAMP + make_interval(mins => $2),
        otp_attempts = 0,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3`,
      [otpHash, OTP_TTL_MINUTES, user.id]
    );

    await mailer.sendOtpEmail({
      to: user.email,
      code,
      ttlMinutes: OTP_TTL_MINUTES
    });
  });
}

/**
 * Checks a code and verifies the email when it matches.
 *
 * The user row is locked (FOR UPDATE) so parallel guesses are counted one by
 * one and can't get past the attempt limit.
 *
 * @param {object} deps
 * @param {{ connect: Function }} deps.db pg Pool
 * @param {{ error: Function }} [deps.logger]
 * @param {{ email: string, code: string }} input validated, normalized email
 * @throws {OtpError}
 */
async function verifyOtp({ db, logger = console }, { email, code }) {
  // Expected failures are returned, not thrown, so the attempt counter
  // update is committed before the error reaches the client.
  const failure = await withTransaction(db, logger, async (client) => {
    const { rows } = await client.query(
      `SELECT
        id,
        email_verified,
        otp_hash,
        otp_attempts,
        otp_expires_at,
        otp_expires_at <= CURRENT_TIMESTAMP AS expired
      FROM users
      WHERE email = $1
      FOR UPDATE`,
      [email]
    );
    const user = rows[0];

    if (!user) {
      return errors.notFound();
    }
    if (user.email_verified) {
      return errors.alreadyVerified();
    }
    if (user.otp_attempts >= OTP_MAX_ATTEMPTS) {
      return errors.tooManyAttempts();
    }
    // A code without an expiry is never accepted (NULL <= now is NULL in SQL,
    // which would otherwise read as "not expired").
    if (!user.otp_hash || !user.otp_expires_at) {
      return errors.noActiveCode();
    }
    if (user.expired) {
      // Not counted as a wrong attempt.
      return errors.expired();
    }

    if (await bcrypt.compare(code, user.otp_hash)) {
      await client.query(
        `UPDATE users
        SET email_verified = TRUE,
          otp_hash = NULL,
          otp_expires_at = NULL,
          otp_attempts = 0,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1`,
        [user.id]
      );
      return null;
    }

    const attempts = user.otp_attempts + 1;
    const exhausted = attempts >= OTP_MAX_ATTEMPTS;

    // At the last allowed attempt the code is invalidated, so even the
    // correct code is refused afterwards.
    await client.query(
      `UPDATE users
      SET otp_attempts = $1,
        otp_hash = CASE WHEN $2 THEN NULL ELSE otp_hash END,
        otp_expires_at = CASE WHEN $2 THEN NULL ELSE otp_expires_at END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3`,
      [attempts, exhausted, user.id]
    );
    return exhausted
      ? errors.tooManyAttempts()
      : errors.incorrect(OTP_MAX_ATTEMPTS - attempts);
  });

  if (failure) {
    throw failure;
  }
}

/**
 * Replaces the user's code with a new one and emails it.
 *
 * @param {object} deps
 * @param {{ query: Function, connect: Function }} deps.db pg Pool
 * @param {{ sendOtpEmail: Function }} deps.mailer
 * @param {{ error: Function }} [deps.logger]
 * @param {{ email: string }} input validated, normalized email
 * @throws {OtpError}
 */
async function resendOtp({ db, mailer, logger = console }, { email }) {
  const { rows } = await db.query(
    'SELECT id, email, email_verified FROM users WHERE email = $1',
    [email]
  );
  const user = rows[0];

  if (!user) {
    throw errors.notFound();
  }
  if (user.email_verified) {
    throw errors.alreadyVerified();
  }

  try {
    await issueOtp({ db, mailer, logger }, user);
  } catch (error) {
    if (!(error instanceof MailDeliveryError)) {
      throw error;
    }
    // Nothing was saved: the previous code, if any, still works.
    logger.error(`OTP resend failed for user ${user.id}`, error.stack);
    throw errors.sendFailed();
  }
}

module.exports = {
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
  OTP_TTL_MINUTES,
  OtpError,
  generateOtpCode,
  issueOtp,
  resendOtp,
  verifyOtp
};
