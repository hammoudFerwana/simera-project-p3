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
 * Creates a new code for an unverified user and emails it.
 *
 * Storing the new hash replaces any previous code and resets otp_attempts, so
 * the old code stops working. The expiry is computed by the database clock,
 * like every other timestamp. The plain code is never stored or logged.
 *
 * @param {object} deps
 * @param {{ query: Function }} deps.db pg Pool
 * @param {{ sendOtpEmail: Function }} deps.mailer
 * @param {{ id: number, email: string }} user
 * @throws {OtpError} already_verified when the user is verified meanwhile
 */
async function issueOtp({ db, mailer }, user) {
  const code = generateOtpCode();
  const otpHash = await bcrypt.hash(code, OTP_BCRYPT_ROUNDS);

  const result = await db.query(
    `UPDATE users
    SET otp_hash = $1,
      otp_expires_at = CURRENT_TIMESTAMP + make_interval(mins => $2),
      otp_attempts = 0,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $3 AND email_verified = FALSE`,
    [otpHash, OTP_TTL_MINUTES, user.id]
  );
  if (result.rowCount === 0) {
    throw errors.alreadyVerified();
  }

  await mailer.sendOtpEmail({
    to: user.email,
    code,
    ttlMinutes: OTP_TTL_MINUTES
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
  const client = await db.connect();
  // Set when ROLLBACK fails: the connection is destroyed, not reused.
  let brokenConnectionError;
  let failure;

  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT
        id,
        email_verified,
        otp_hash,
        otp_attempts,
        otp_expires_at <= CURRENT_TIMESTAMP AS expired
      FROM users
      WHERE email = $1
      FOR UPDATE`,
      [email]
    );
    const user = rows[0];

    if (!user) {
      failure = errors.notFound();
    } else if (user.email_verified) {
      failure = errors.alreadyVerified();
    } else if (user.otp_attempts >= OTP_MAX_ATTEMPTS) {
      failure = errors.tooManyAttempts();
    } else if (!user.otp_hash) {
      failure = errors.noActiveCode();
    } else if (user.expired) {
      // Not counted as a wrong attempt.
      failure = errors.expired();
    } else if (await bcrypt.compare(code, user.otp_hash)) {
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
    } else {
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
      failure = exhausted
        ? errors.tooManyAttempts()
        : errors.incorrect(OTP_MAX_ATTEMPTS - attempts);
    }

    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      brokenConnectionError = rollbackError;
      logger.error('OTP verification rollback failed', rollbackError.stack);
    }
    throw error;
  } finally {
    client.release(brokenConnectionError);
  }

  if (failure) {
    throw failure;
  }
}

/**
 * Replaces the user's code with a new one and emails it.
 *
 * @param {object} deps
 * @param {{ query: Function }} deps.db pg Pool
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
    await issueOtp({ db, mailer }, user);
  } catch (error) {
    if (!(error instanceof MailDeliveryError)) {
      throw error;
    }
    // The new code is stored, so the old one no longer works either way.
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
