const { z } = require('zod');

// Slots a candidate uploads to. simera_profile is uploaded by the team (US-22).
const CANDIDATE_SOURCE_TYPES = ['cv', 'linkedin'];

const sourceTypeSchema = z.enum(CANDIDATE_SOURCE_TYPES, {
  error: `Upload type must be one of: ${CANDIDATE_SOURCE_TYPES.join(', ')}`
});

const fileIdSchema = z.coerce
  .number({ error: 'File id must be a positive integer' })
  .int('File id must be a positive integer')
  .positive('File id must be a positive integer');

/**
 * @returns {{ success: true, data: string } | { success: false, errors: object }}
 */
function validateSourceType(value) {
  const result = sourceTypeSchema.safeParse(value);
  return result.success
    ? { success: true, data: result.data }
    : {
        success: false,
        errors: { sourceType: result.error.issues[0].message }
      };
}

/**
 * @returns {{ success: true, data: number } | { success: false, errors: object }}
 */
function validateFileId(value) {
  const result = fileIdSchema.safeParse(value);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, errors: { fileId: result.error.issues[0].message } };
}

module.exports = {
  CANDIDATE_SOURCE_TYPES,
  validateFileId,
  validateSourceType
};
