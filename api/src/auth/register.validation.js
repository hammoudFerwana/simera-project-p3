const { z } = require('zod');

const EMAIL_MAX_LENGTH = 255;
const PASSWORD_MIN_LENGTH = 8;

const messages = {
  emailRequired: 'Email is required',
  emailInvalid: 'Enter a valid email address',
  emailTooLong: `Email must be at most ${EMAIL_MAX_LENGTH} characters`,
  passwordRequired: 'Password is required',
  passwordTooShort: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`
};

const registerSchema = z.object({
  // Normalized (trimmed, lowercased) before the format check, the uniqueness
  // check and saving.
  email: z
    .string({ error: messages.emailRequired })
    .trim()
    .toLowerCase()
    .min(1, messages.emailRequired)
    .max(EMAIL_MAX_LENGTH, messages.emailTooLong)
    .pipe(z.email({ error: messages.emailInvalid })),
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
  const result = registerSchema.safeParse(body);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors = {};
  for (const issue of result.error.issues) {
    const fieldName = issue.path.length > 0 ? String(issue.path[0]) : 'body';
    if (!errors[fieldName]) {
      errors[fieldName] =
        fieldName === 'body'
          ? 'Request body must be a JSON object'
          : issue.message;
    }
  }

  return { success: false, errors };
}

module.exports = {
  EMAIL_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  validateRegisterInput
};
