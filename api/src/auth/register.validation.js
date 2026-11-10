const { z } = require('zod');
const { emailSchema, parseBody } = require('./validation');

const PASSWORD_MIN_LENGTH = 8;

const messages = {
  passwordRequired: 'Password is required',
  passwordTooShort: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`
};

const registerSchema = z.object({
  email: emailSchema,
  password: z
    .string({ error: messages.passwordRequired })
    .min(1, messages.passwordRequired)
    .min(PASSWORD_MIN_LENGTH, messages.passwordTooShort)
});

/**
 * Validates and normalizes the register request body.
 * Returns { success: true, data: { email, password } } or
 * { success: false, errors: { <field>: <first message> } }.
 */
function validateRegisterInput(body) {
  return parseBody(registerSchema, body);
}

module.exports = {
  PASSWORD_MIN_LENGTH,
  validateRegisterInput
};
