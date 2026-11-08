const express = require('express');
const { validateRegisterInput } = require('./register.validation');
const { registerCandidate, EmailInUseError } = require('./register.service');

/**
 * @param {object} deps
 * @param {() => object} deps.getDb returns the pg Pool
 * @param {Function} deps.sendOtp OTP service (US-02)
 */
function createAuthRouter({ getDb, sendOtp }) {
  const router = express.Router();

  router.post('/register', async (req, res, next) => {
    const validation = validateRegisterInput(req.body);
    if (!validation.success) {
      return res.status(400).json({ errors: validation.errors });
    }

    try {
      const user = await registerCandidate(
        { db: getDb(), sendOtp },
        validation.data
      );

      return res.status(201).json({
        message:
          'Account created. Enter the verification code sent to your email.',
        email: user.email
      });
    } catch (error) {
      if (error instanceof EmailInUseError) {
        return res.status(409).json({ errors: { email: error.message } });
      }
      return next(error);
    }
  });

  return router;
}

module.exports = { createAuthRouter };
