const bcrypt = require('bcrypt');

const BCRYPT_ROUNDS = 12;
const UNIQUE_VIOLATION = '23505';

class EmailInUseError extends Error {
  constructor() {
    super('This email is already in use');
    this.name = 'EmailInUseError';
  }
}

/**
 * Registers a candidate.
 *
 * Creates the users row (email_verified = false, otp_attempts = 0, hashed
 * password, no admins row) and the linked candidate_profiles row in one
 * transaction, then asks the OTP service to send the verification code.
 *
 * @param {object} deps
 * @param {{ query: Function, connect: Function }} deps.db pg Pool
 * @param {(user: { id: number, email: string }) => Promise<void>} deps.sendOtp
 * @param {{ error: Function }} [deps.logger]
 * @param {{ email: string, password: string }} input already validated and
 *   normalized email, raw password
 * @returns {Promise<{ user: { id: number, email: string }, otpSent: boolean }>}
 *   otpSent is false when the account was created but the code couldn't be
 *   sent (the candidate then requests a new one).
 * @throws {EmailInUseError} when the email is already registered
 */
async function registerCandidate(
  { db, sendOtp, logger = console },
  { email, password }
) {
  const existing = await db.query('SELECT id FROM users WHERE email = $1', [
    email
  ]);
  if (existing.rowCount > 0) {
    throw new EmailInUseError();
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const client = await db.connect();
  let user;
  // Set when ROLLBACK fails: the connection is in an unknown state, so it is
  // destroyed instead of going back to the pool.
  let brokenConnectionError;

  try {
    await client.query('BEGIN');

    const userResult = await client.query(
      `INSERT INTO users (
        email,
        password_hash,
        email_verified,
        otp_attempts,
        created_at
      )
      VALUES ($1, $2, FALSE, 0, CURRENT_TIMESTAMP)
      RETURNING id, email`,
      [email, passwordHash]
    );
    user = userResult.rows[0];

    await client.query(
      `INSERT INTO candidate_profiles (user_id, created_at)
      VALUES ($1, CURRENT_TIMESTAMP)`,
      [user.id]
    );

    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      brokenConnectionError = rollbackError;
      logger.error('Registration rollback failed', rollbackError.stack);
    }

    // Another request registered the same email between the check and the insert.
    if (error.code === UNIQUE_VIOLATION && error.table === 'users') {
      throw new EmailInUseError();
    }
    throw error;
  } finally {
    client.release(brokenConnectionError);
  }

  let otpSent = true;
  try {
    await sendOtp(user);
  } catch (error) {
    // The account exists; the candidate can request a new code (US-02).
    // The stack, not the whole object: mailer errors can carry the recipient
    // address in their fields, and logs must not contain the email.
    otpSent = false;
    logger.error(`OTP sending failed for user ${user.id}`, error.stack);
  }

  return { user, otpSent };
}

module.exports = {
  BCRYPT_ROUNDS,
  EmailInUseError,
  registerCandidate
};
