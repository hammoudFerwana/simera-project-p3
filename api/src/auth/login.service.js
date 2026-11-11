const bcrypt = require('bcrypt');

/** An expected login outcome that is reported to the client. */
class LoginError extends Error {
  constructor({ status, field, reason, message, details = {} }) {
    super(message);
    this.name = 'LoginError';
    this.status = status;
    this.field = field;
    this.reason = reason;
    this.details = details;
  }
}

const errors = {
  // One message for an unknown email and a wrong password.
  invalidCredentials: () =>
    new LoginError({
      status: 401,
      field: 'credentials',
      reason: 'invalid_credentials',
      message: 'Email or password is incorrect'
    }),
  verificationRequired: (email) =>
    new LoginError({
      status: 403,
      field: 'email',
      reason: 'verification_required',
      message: 'Verify your email before logging in',
      details: { email }
    })
};

/**
 * Checks the credentials and derives the role: a user with an admins row is
 * an admin, any other user is a candidate (there is no role column).
 *
 * @param {object} deps
 * @param {{ query: Function }} deps.db pg Pool
 * @param {{ email: string, password: string }} input validated, normalized email
 * @returns {Promise<{ id: number, email: string, role: 'admin' | 'candidate' }>}
 * @throws {LoginError}
 */
async function login({ db }, { email, password }) {
  const result = await db.query(
    `SELECT u.id, u.email, u.password_hash, u.email_verified,
      (a.id IS NOT NULL) AS is_admin
    FROM users u
    LEFT JOIN admins a ON a.user_id = u.id
    WHERE u.email = $1`,
    [email]
  );
  const user = result.rows[0];

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw errors.invalidCredentials();
  }

  const role = user.is_admin ? 'admin' : 'candidate';

  // Checked only after the password, so it reveals nothing to a wrong password.
  if (role === 'candidate' && !user.email_verified) {
    throw errors.verificationRequired(user.email);
  }

  return { id: user.id, email: user.email, role };
}

module.exports = { LoginError, login };
