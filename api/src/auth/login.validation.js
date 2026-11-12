const { z } = require('zod');
const { emailSchema, parseBody } = require('./validation');

const messages = {
  passwordRequired: 'Password is required'
};

const loginSchema = z.object({
  email: emailSchema,
  // Not trimmed: it's compared with the stored hash exactly as typed.
  password: z
    .string({ error: messages.passwordRequired })
    .min(1, messages.passwordRequired)
});

/** Validates { email, password } for POST /api/auth/login. */
function validateLoginInput(body) {
  return parseBody(loginSchema, body);
}

module.exports = { validateLoginInput };
