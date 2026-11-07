const { z } = require('zod');

/**
 * Extraction data contract.
 *
 * The single shape shared by the LLM call, the validation layer and the
 * persistence layer. Field names follow the database columns (see
 * shared/README.md for the field-to-column mapping).
 *
 * Rules enforced here:
 * - Every field is present. Missing information is null, an empty list is [].
 * - Fields that are not defined here are stripped from the result.
 * - Every candidate data field uses the value wrapper { value, confidence, evidence }.
 * - Protected personal fields (date of birth, nationality, gender, religion,
 *   marital status, photo) are not part of the schema.
 *
 * Content checks belong to the validation layer, because a failed content
 * check sends that item alone to human review instead of failing the whole
 * file: date ranges (month 1-12, start before end), is_current consistent
 * with a missing end_date, ISO country codes, phone format, evidence found in
 * the source text, and the code's own calculation of duration_months.
 */

const SCHEMA_VERSION = '1.1.0';

const DATE_PATTERN = /^\d{4}(-\d{2}(-\d{2})?)?$/;

const LANGUAGE_PROFICIENCY_LEVELS = [
  'basic',
  'intermediate',
  'advanced',
  'native'
];
const LINK_TYPES = ['linkedin', 'github', 'portfolio', 'other'];
const DURATION_UNITS = ['years', 'months'];

/**
 * Date as written in the source, keeping its precision:
 * "YYYY" (year only), "YYYY-MM" (month and year) or "YYYY-MM-DD".
 */
const dateString = z
  .string()
  .regex(DATE_PATTERN, 'Date must be YYYY, YYYY-MM or YYYY-MM-DD');

/**
 * Value wrapper for a single extracted field.
 * A null value carries null evidence; a non-null value requires a confidence
 * between 0 and 1 and a non-empty evidence snippet.
 */
function field(valueSchema) {
  return z
    .object({
      value: valueSchema.nullable(),
      confidence: z.number().min(0).max(1).nullable(),
      evidence: z.string().nullable()
    })
    .superRefine((wrapper, ctx) => {
      if (wrapper.value === null) {
        if (wrapper.evidence !== null) {
          ctx.addIssue({
            code: 'custom',
            path: ['evidence'],
            message: 'Evidence must be null when value is null'
          });
        }
        return;
      }

      if (wrapper.confidence === null) {
        ctx.addIssue({
          code: 'custom',
          path: ['confidence'],
          message: 'Confidence is required when value is not null'
        });
      }

      if (wrapper.evidence === null || wrapper.evidence.trim() === '') {
        ctx.addIssue({
          code: 'custom',
          path: ['evidence'],
          message: 'Evidence is required when value is not null'
        });
      }
    });
}

const text = () => field(z.string());
const date = () => field(dateString);
const flag = () => field(z.boolean());
const wholeMonths = () => field(z.number().int().min(0));

const metaSchema = z.object({
  document_language: z.string().nullable(),
  extraction_warnings: z.array(z.string())
});

const candidateSchema = z.object({
  first_name: text(),
  last_name: text(),
  headline: text(),
  summary: text(),
  phone: text(),
  industry: text(),
  profession: text(),
  city: text(),
  country: text()
});

/**
 * Ongoing items (work_experience, education, volunteering) are written as
 * is_current = true with end_date = null.
 *
 * duration_months: the job duration in whole months, calculated by the LLM
 * from start_date and end_date (or the processing date when is_current).
 * Its evidence is the date range as written. The code recalculates it and its
 * own result wins; it is never stored.
 */
const workExperienceSchema = z.object({
  job_title: text(),
  company_name: text(),
  start_date: date(),
  end_date: date(),
  is_current: flag(),
  duration_months: wholeMonths(),
  location: text(),
  employment_type: text(),
  work_mode: text(),
  description: text(),
  responsibilities: text(),
  achievements: text(),
  skills_used: text(),
  company_url: text()
});

const educationSchema = z.object({
  institution_name: text(),
  degree_level: text(),
  degree_name: text(),
  field_of_study: text(),
  start_date: date(),
  end_date: date(),
  is_current: flag(),
  gpa: text(),
  honors: text(),
  location: text(),
  description: text()
});

const statedDurationSchema = z.object({
  amount: z.number().positive(),
  unit: z.enum(DURATION_UNITS)
});

const skillSchema = z.object({
  name: text(),
  proficiency_level: text(),
  stated_duration: field(statedDurationSchema)
});

const languageSchema = z.object({
  language: text(),
  proficiency_level: field(z.enum(LANGUAGE_PROFICIENCY_LEVELS))
});

const linkSchema = z.object({
  link_type: field(z.enum(LINK_TYPES)),
  url: text(),
  label: text()
});

const certificationSchema = z.object({
  name: text(),
  issuing_organization: text(),
  issue_date: date(),
  expiration_date: date(),
  credential_id: text(),
  credential_url: text(),
  description: text()
});

const projectSchema = z.object({
  name: text(),
  description: text(),
  role: text(),
  project_url: text(),
  start_date: date(),
  end_date: date()
});

const awardSchema = z.object({
  name: text(),
  issuer: text(),
  award_date: date(),
  description: text()
});

const publicationSchema = z.object({
  title: text(),
  publisher: text(),
  publication_date: date(),
  url: text(),
  description: text()
});

const volunteeringSchema = z.object({
  organization: text(),
  role: text(),
  description: text(),
  start_date: date(),
  end_date: date(),
  is_current: flag()
});

const extractionSchema = z.object({
  meta: metaSchema,
  candidate: candidateSchema,
  work_experience: z.array(workExperienceSchema),
  education: z.array(educationSchema),
  skills: z.array(skillSchema),
  languages: z.array(languageSchema),
  links: z.array(linkSchema),
  certifications: z.array(certificationSchema),
  projects: z.array(projectSchema),
  awards: z.array(awardSchema),
  publications: z.array(publicationSchema),
  volunteering: z.array(volunteeringSchema)
});

function formatPath(path) {
  if (path.length === 0) {
    return '(root)';
  }

  return path
    .map((segment) =>
      typeof segment === 'number' ? `[${segment}]` : `.${segment}`
    )
    .join('')
    .replace(/^\./, '');
}

/**
 * Checks data against the extraction schema.
 * On success, returns the data with undefined fields stripped.
 * On failure, returns one error per problem, each naming the field path.
 */
function validateExtraction(input) {
  const result = extractionSchema.safeParse(input);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors = result.error.issues.map((issue) => ({
    path: formatPath(issue.path),
    message: issue.message
  }));

  return { success: false, errors };
}

/**
 * JSON Schema description of the contract, to be sent to the LLM.
 */
function getExtractionJsonSchema() {
  return z.toJSONSchema(extractionSchema);
}

module.exports = {
  SCHEMA_VERSION,
  LANGUAGE_PROFICIENCY_LEVELS,
  LINK_TYPES,
  DURATION_UNITS,
  extractionSchema,
  validateExtraction,
  getExtractionJsonSchema
};
