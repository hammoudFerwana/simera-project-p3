const express = require('express');
const { validateRegisterInput } = require('./register.validation');
const { registerCandidate, EmailInUseError } = require('./register.service');
const {
  validateResendOtpInput,
  validateVerifyOtpInput
} = require('./otp.validation');
const { OtpError, issueOtp, resendOtp, verifyOtp } = require('./otp.service');

/**
 * Sends an expected OTP outcome as
 * { errors: { <field>: message }, reason, ...details }.
 */
function sendOtpError(res, error) {
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
      const user = await registerCandidate({ db, sendOtp }, validation.data);

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
        return sendOtpError(res, error);
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
        return sendOtpError(res, error);
      }
      return next(error);
    }
  });

  return router;
}

module.exports = { createAuthRouter };
