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
 * @returns {Promise<{ id: number, email: string }>}
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
    await client.query('ROLLBACK').catch(() => {});

    // Another request registered the same email between the check and the insert.
    if (error.code === UNIQUE_VIOLATION && error.table === 'users') {
      throw new EmailInUseError();
    }
    throw error;
  } finally {
    client.release();
  }

  try {
    await sendOtp(user);
  } catch (error) {
    // The account exists; the candidate can request a new code (US-02).
    logger.error(`OTP sending failed for user ${user.id}: ${error.message}`);
  }

  return user;
}

module.exports = {
  BCRYPT_ROUNDS,
  EmailInUseError,
  registerCandidate
};
