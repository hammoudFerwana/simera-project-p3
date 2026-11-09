const express = require('express');
const { createAuthRouter } = require('./auth/auth.routes');
const { sendOtp: defaultSendOtp } = require('./auth/send-otp');

// Loaded on first use so the app (and /health) starts without a database.
const defaultGetDb = () => require('shared/src/database');

/**
 * Builds the Express app. Dependencies can be replaced in tests.
 *
 * @param {object} [deps]
 * @param {() => object} [deps.getDb] returns the pg Pool
 * @param {Function} [deps.sendOtp] OTP service (US-02)
 */
function createApp({ getDb = defaultGetDb, sendOtp = defaultSendOtp } = {}) {
  const app = express();

  app.use(express.json());

  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/api/auth', createAuthRouter({ getDb, sendOtp }));

  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => {
    if (error.type === 'entity.parse.failed') {
      return res.status(400).json({ errors: { body: 'Invalid JSON body' } });
    }

    // The stack includes the message. Not the whole object: pg errors carry a
    // `detail` field that can contain row values such as the email.
    console.error(error.stack || error);
    return res.status(500).json({ errors: { server: 'Something went wrong' } });
  });

  return app;
}

module.exports = { createApp };
