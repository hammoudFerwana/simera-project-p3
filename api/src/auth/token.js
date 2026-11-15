const jwt = require('jsonwebtoken');

const TOKEN_COOKIE_NAME = 'access_token';
const DEFAULT_EXPIRES_IN_HOURS = 24;

/**
 * Reads the JWT settings from the environment.
 * JWT_SECRET is required; JWT_EXPIRES_IN_HOURS is optional (default 24).
 *
 * @throws {Error} when JWT_SECRET is missing or the expiry isn't a positive number
 */
function readAuthConfig(env = process.env) {
  if (!env.JWT_SECRET || String(env.JWT_SECRET).trim() === '') {
    throw new Error('Missing required environment variable(s): JWT_SECRET');
  }

  const rawHours = env.JWT_EXPIRES_IN_HOURS;
  const expiresInHours =
    rawHours === undefined || String(rawHours).trim() === ''
      ? DEFAULT_EXPIRES_IN_HOURS
      : Number(rawHours);
  if (!Number.isFinite(expiresInHours) || expiresInHours <= 0) {
    throw new Error('JWT_EXPIRES_IN_HOURS must be a positive number');
  }

  return {
    secret: env.JWT_SECRET,
    expiresInSeconds: Math.round(expiresInHours * 60 * 60)
  };
}

/**
 * Signs a token carrying the user id and the role derived at login.
 *
 * @param {{ userId: number, role: 'admin' | 'candidate' }} payload
 * @returns {string}
 */
function signToken({ userId, role }) {
  const { secret, expiresInSeconds } = readAuthConfig();
  return jwt.sign({ userId, role }, secret, { expiresIn: expiresInSeconds });
}

/**
 * Verifies the signature and expiry of a token.
 *
 * @returns {{ userId: number, role: 'admin' | 'candidate' } | null} null when
 *   the token is invalid or expired
 */
function verifyToken(token) {
  const { secret } = readAuthConfig();
  try {
    const { userId, role } = jwt.verify(token, secret);
    return { userId, role };
  } catch {
    return null;
  }
}

/** Cookie options shared by login (set) and logout (clear). */
function tokenCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  };
}

/** Sets the token cookie with the same lifetime as the token. */
function setTokenCookie(res, token) {
  const { expiresInSeconds } = readAuthConfig();
  res.cookie(TOKEN_COOKIE_NAME, token, {
    ...tokenCookieOptions(),
    maxAge: expiresInSeconds * 1000
  });
}

function clearTokenCookie(res) {
  res.clearCookie(TOKEN_COOKIE_NAME, tokenCookieOptions());
}

module.exports = {
  TOKEN_COOKIE_NAME,
  clearTokenCookie,
  readAuthConfig,
  setTokenCookie,
  signToken,
  verifyToken
};
