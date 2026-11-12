const nodemailer = require('nodemailer');

const MAIL_ENV_VARS = [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'MAIL_FROM'
];

/**
 * Sending an email failed. The message is generic on purpose: SMTP errors
 * can quote the recipient address, and logs must not contain emails or codes.
 * The original error stays in `cause` for debugging, but isn't logged.
 */
class MailDeliveryError extends Error {
  constructor(cause) {
    const code = [cause?.code, cause?.responseCode].filter(Boolean).join(', ');
    super(`Email delivery failed${code ? ` (${code})` : ''}`, { cause });
    this.name = 'MailDeliveryError';
  }
}

/**
 * Reads the SMTP settings from the environment.
 * @throws {Error} listing the missing variables
 */
function readMailConfig(env = process.env) {
  const missing = MAIL_ENV_VARS.filter(
    (name) => !env[name] || String(env[name]).trim() === ''
  );
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}`
    );
  }

  const port = parseInt(env.SMTP_PORT, 10);
  return {
    host: env.SMTP_HOST,
    port,
    // Port 465 uses TLS from the start; other ports (such as 587) upgrade with
    // STARTTLS.
    secure: port === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    from: env.MAIL_FROM
  };
}

/**
 * @param {object} deps
 * @param {{ sendMail: Function }} deps.transport a Nodemailer transport
 * @param {string} deps.from sender address
 */
function createMailer({ transport, from }) {
  return {
    async sendOtpEmail({ to, code, ttlMinutes }) {
      try {
        await transport.sendMail({
          from,
          to,
          subject: 'Your verification code',
          text: [
            `Your verification code is ${code}.`,
            '',
            `It expires in ${ttlMinutes} minutes and can be used once.`,
            'If you did not create an account, ignore this email.'
          ].join('\n')
        });
      } catch (error) {
        throw new MailDeliveryError(error);
      }
    }
  };
}

/** A mailer that sends through the SMTP server configured in .env. */
function createSmtpMailer(env = process.env) {
  const { from, ...smtp } = readMailConfig(env);
  return createMailer({ transport: nodemailer.createTransport(smtp), from });
}

module.exports = {
  MailDeliveryError,
  createMailer,
  createSmtpMailer,
  readMailConfig
};
