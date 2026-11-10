const { z } = require('zod');

const EMAIL_MAX_LENGTH = 255;

const messages = {
  emailRequired: 'Email is required',
  emailInvalid: 'Enter a valid email address',
  emailTooLong: `Email must be at most ${EMAIL_MAX_LENGTH} characters`,
  bodyNotObject: 'Request body must be a JSON object'
};

// Normalized (trimmed, lowercased) before the format check, any lookup and
// saving, so every auth endpoint treats Jane@Example.com as jane@example.com.
const emailSchema = z
  .string({ error: messages.emailRequired })
  .trim()
  .toLowerCase()
  .min(1, messages.emailRequired)
  .max(EMAIL_MAX_LENGTH, messages.emailTooLong)
  .pipe(z.email({ error: messages.emailInvalid }));

/**
 * Parses a request body with a Zod object schema.
 * Returns { success: true, data } or
 * { success: false, errors: { <field>: <first message> } }.
 */
function parseBody(schema, body) {
  const result = schema.safeParse(body);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors = {};
  for (const issue of result.error.issues) {
    const fieldName = issue.path.length > 0 ? String(issue.path[0]) : 'body';
    if (!errors[fieldName]) {
      errors[fieldName] =
        fieldName === 'body' ? messages.bodyNotObject : issue.message;
    }
  }

  return { success: false, errors };
}

module.exports = {
  EMAIL_MAX_LENGTH,
  emailSchema,
  parseBody
};
