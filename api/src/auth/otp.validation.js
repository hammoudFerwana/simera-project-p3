const { z } = require('zod');
const { emailSchema, parseBody } = require('./validation');
const { OTP_LENGTH } = require('./otp.service');

const messages = {
  codeRequired: 'Code is required',
  codeInvalid: `The code must be ${OTP_LENGTH} digits`
};

const verifyOtpSchema = z.object({
  email: emailSchema,
  code: z
    .string({ error: messages.codeRequired })
    .trim()
    .min(1, messages.codeRequired)
    .regex(new RegExp(`^\\d{${OTP_LENGTH}}$`), messages.codeInvalid)
});

const resendOtpSchema = z.object({
  email: emailSchema
});

/** Validates { email, code } for POST /api/auth/verify-otp. */
function validateVerifyOtpInput(body) {
  return parseBody(verifyOtpSchema, body);
}

/** Validates { email } for POST /api/auth/resend-otp. */
function validateResendOtpInput(body) {
  return parseBody(resendOtpSchema, body);
}

module.exports = {
  validateResendOtpInput,
  validateVerifyOtpInput
};
