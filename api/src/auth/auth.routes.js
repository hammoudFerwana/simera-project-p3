const express = require('express');
const { validateRegisterInput } = require('./register.validation');
const { registerCandidate, EmailInUseError } = require('./register.service');
const {
  validateResendOtpInput,
  validateVerifyOtpInput
} = require('./otp.validation');
const { OtpError, issueOtp, resendOtp, verifyOtp } = require('./otp.service');
const { validateLoginInput } = require('./login.validation');
const { LoginError, login } = require('./login.service');
const { clearTokenCookie, setTokenCookie, signToken } = require('./token');
const { requireAuth } = require('./guards');

/**
 * Sends an expected OTP or login outcome as
 * { errors: { <field>: message }, reason, ...details }.
 */
function sendExpectedError(res, error) {
  return res.status(error.status).json({
    errors: { [error.field]: error.message },
    reason: error.reason,
    ...error.details
  });
}

/**
 * @param {object} deps
 * @param {() => object} deps.getDb returns the pg Pool
 * @param {() => { sendOtpEmail: Function }} deps.getMailer returns the mailer
 */
function createAuthRouter({ getDb, getMailer }) {
  const router = express.Router();

  router.post('/register', async (req, res, next) => {
    const validation = validateRegisterInput(req.body);
    if (!validation.success) {
      return res.status(400).json({ errors: validation.errors });
    }

    try {
      const db = getDb();
      const sendOtp = (user) => issueOtp({ db, mailer: getMailer() }, user);
      const { user, otpSent } = await registerCandidate(
        { db, sendOtp },
        validation.data
      );

      return res.status(201).json({
        message: otpSent
          ? 'Account created. Enter the verification code sent to your email.'
          : 'Account created, but the verification code could not be sent. Request a new code.',
        email: user.email,
        otpSent
      });
    } catch (error) {
      if (error instanceof EmailInUseError) {
        return res.status(409).json({ errors: { email: error.message } });
      }
      return next(error);
    }
  });

  router.post('/verify-otp', async (req, res, next) => {
    const validation = validateVerifyOtpInput(req.body);
    if (!validation.success) {
      return res.status(400).json({ errors: validation.errors });
    }

    try {
      await verifyOtp({ db: getDb() }, validation.data);
      return res.status(200).json({
        message: 'Email verified. You can now log in.'
      });
    } catch (error) {
      if (error instanceof OtpError) {
        return sendExpectedError(res, error);
      }
      return next(error);
    }
  });

  router.post('/resend-otp', async (req, res, next) => {
    const validation = validateResendOtpInput(req.body);
    if (!validation.success) {
      return res.status(400).json({ errors: validation.errors });
    }

    try {
      await resendOtp({ db: getDb(), mailer: getMailer() }, validation.data);
      return res.status(200).json({
        message: 'A new verification code was sent to your email.'
      });
    } catch (error) {
      if (error instanceof OtpError) {
        return sendExpectedError(res, error);
      }
      return next(error);
    }
  });

  router.post('/login', async (req, res, next) => {
    const validation = validateLoginInput(req.body);
    if (!validation.success) {
      return res.status(400).json({ errors: validation.errors });
    }

    try {
      const user = await login({ db: getDb() }, validation.data);
      setTokenCookie(res, signToken({ userId: user.id, role: user.role }));
      return res.status(200).json({ message: 'Logged in', user });
    } catch (error) {
      if (error instanceof LoginError) {
        return sendExpectedError(res, error);
      }
      return next(error);
    }
  });

  // Stateless: clearing the cookie is the whole logout. Works without a token.
  router.post('/logout', (req, res) => {
    clearTokenCookie(res);
    return res.status(200).json({ message: 'Logged out' });
  });

  // Lets the frontend restore the user after a page reload, since the
  // HttpOnly cookie can't be read from JavaScript.
  router.get('/me', requireAuth, (req, res) => {
    return res.status(200).json({
      user: { id: req.user.userId, role: req.user.role }
    });
  });

  return router;
}

module.exports = { createAuthRouter };
