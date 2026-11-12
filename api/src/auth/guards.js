const { TOKEN_COOKIE_NAME, verifyToken } = require('./token');

// Reusable access guards. Every protected route uses these instead of its own
// checks, in this order:
//   router.get(path, requireAuth, requireRole('candidate'),
//     requireOwnership(getOwnerUserId), handler)

const messages = {
  notLoggedIn: 'Log in to continue',
  forbidden: 'You do not have access to this resource',
  verificationRequired: 'Verify your email to continue'
};

function sendForbidden(res) {
  return res.status(403).json({ errors: { auth: messages.forbidden } });
}

/**
 * Requires a valid token cookie (401 otherwise).
 * Sets req.user = { userId, role } for the next handlers.
 */
function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies[TOKEN_COOKIE_NAME];
  const user = token ? verifyToken(token) : null;

  if (!user) {
    return res.status(401).json({ errors: { auth: messages.notLoggedIn } });
  }

  req.user = user;
  return next();
}

/**
 * Requires the role carried in the token (403 otherwise). Use after
 * requireAuth.
 *
 * @param {'admin' | 'candidate'} role
 */
function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return sendForbidden(res);
    }
    return next();
  };
}

/**
 * Lets a candidate reach only their own data (403 otherwise). An admin always
 * passes. Use after requireAuth.
 *
 * @param {(req) => number | null | Promise<number | null>} getOwnerUserId
 *   returns the users.id that owns the requested resource (for example by
 *   looking up the file's candidate)
 */
function requireOwnership(getOwnerUserId) {
  return async (req, res, next) => {
    if (!req.user) {
      return sendForbidden(res);
    }
    if (req.user.role === 'admin') {
      return next();
    }

    try {
      const ownerUserId = await getOwnerUserId(req);
      if (ownerUserId == null || Number(ownerUserId) !== req.user.userId) {
        return sendForbidden(res);
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

/**
 * Requires a candidate whose email is verified (403 otherwise), checked in
 * the database. Use after requireAuth and requireRole('candidate').
 * Sets req.candidate = { id } (candidate_profiles.id).
 *
 * @param {() => { query: Function }} getDb returns the pg Pool
 */
function requireVerifiedCandidate(getDb) {
  return async (req, res, next) => {
    try {
      const result = await getDb().query(
        `SELECT cp.id AS candidate_id, u.email_verified
        FROM users u
        JOIN candidate_profiles cp ON cp.user_id = u.id
        WHERE u.id = $1`,
        [req.user.userId]
      );
      const row = result.rows[0];

      if (!row) {
        return sendForbidden(res);
      }
      if (!row.email_verified) {
        return res.status(403).json({
          errors: { auth: messages.verificationRequired },
          reason: 'verification_required'
        });
      }

      req.candidate = { id: row.candidate_id };
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = {
  requireAuth,
  requireOwnership,
  requireRole,
  requireVerifiedCandidate
};
