/**
 * Traceability verification queries (US-25, Requirements 4.3).
 *
 * Every check is a read-only query. A check returns the number of offending
 * rows (its target is zero) plus a few sample rows, so a failure can be traced
 * back to the exact table, item and field.
 */

const SAMPLE_LIMIT = 10;

// Stored value columns of each provenance item type. Technical columns
// (id, candidate_id, user_id, created_at, updated_at, deduplication_key)
// carry no extracted value and are left out.
const VALUE_COLUMNS = Object.freeze({
  candidate_profile: {
    table: 'candidate_profiles',
    columns: [
      'first_name',
      'last_name',
      'headline',
      'summary',
      'phone',
      'industry',
      'profession',
      'city',
      'country_code'
    ]
  },
  work_experience: {
    table: 'work_experience',
    columns: [
      'job_title',
      'company_name',
      'start_date',
      'end_date',
      'is_current',
      'location',
      'employment_type',
      'work_mode',
      'description',
      'responsibilities',
      'achievements',
      'skills_used',
      'company_url'
    ]
  },
  education: {
    table: 'education',
    columns: [
      'institution_name',
      'degree_level',
      'degree_name',
      'field_of_study',
      'start_date',
      'end_date',
      'is_current',
      'gpa',
      'honors',
      'location',
      'description'
    ]
  },
  candidate_skills: {
    table: 'candidate_skills',
    columns: ['skill_id', 'proficiency_level', 'months_of_experience']
  },
  candidate_languages: {
    table: 'candidate_languages',
    columns: ['language', 'proficiency_level']
  },
  candidate_links: {
    table: 'candidate_links',
    columns: ['link_type', 'url', 'label']
  },
  certifications: {
    table: 'certifications',
    columns: [
      'name',
      'issuing_organization',
      'issue_date',
      'expiration_date',
      'credential_id',
      'credential_url',
      'description'
    ]
  },
  projects: {
    table: 'projects',
    columns: [
      'name',
      'description',
      'role',
      'project_url',
      'start_date',
      'end_date'
    ]
  },
  awards: {
    table: 'awards',
    columns: ['name', 'issuer', 'award_date', 'description']
  },
  publications: {
    table: 'publications',
    columns: ['title', 'publisher', 'publication_date', 'url', 'description']
  },
  volunteering: {
    table: 'volunteering',
    columns: [
      'organization',
      'role',
      'description',
      'start_date',
      'end_date',
      'is_current'
    ]
  }
});

// Item-level conflict (C3) field names used by the code and the docs.
const ITEM_LEVEL_FIELDS = ['_item', '__item__'];

function buildValuesWithoutProvenanceSql() {
  const parts = [];
  for (const [itemType, { table, columns }] of Object.entries(VALUE_COLUMNS)) {
    for (const column of columns) {
      parts.push(`
        SELECT '${itemType}' AS item_type, t.id::text AS item_id, '${column}' AS field_name
        FROM "${table}" t
        WHERE NULLIF(btrim(t."${column}"::text), '') IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM data_provenance dp
            WHERE dp.item_type = '${itemType}'
              AND dp.item_id = t.id::text
              AND dp.field_name = '${column}'
          )`);
    }
  }
  return parts.join('\n UNION ALL ');
}

const CHECKS = [
  {
    id: 'values_without_provenance',
    requirement: 'Record per value',
    description: 'Stored non-empty values with no data_provenance row',
    sql: `${buildValuesWithoutProvenanceSql()}
      ORDER BY item_type, item_id, field_name`
  },
  {
    id: 'extracted_values_without_evidence',
    requirement: 'Evidence per extracted value',
    description:
      'no_conflict / latest_value provenance rows with no data_provenance_sources row with evidence',
    sql: `
      SELECT dp.id AS provenance_id, dp.item_type, dp.item_id, dp.field_name,
             dp.resolution_method
      FROM data_provenance dp
      WHERE dp.resolution_method IN ('no_conflict', 'latest_value')
        AND NOT EXISTS (
          SELECT 1 FROM data_provenance_sources dps
          WHERE dps.provenance_id = dp.id
            AND NULLIF(btrim(dps.evidence), '') IS NOT NULL
        )
      ORDER BY dp.id`
  },
  {
    id: 'invalid_automatic_conflicts',
    requirement: 'Automatic decisions',
    description:
      'automatic_rule conflicts not resolved, without a B code, resolved value or date, or without exactly two options',
    sql: `
      SELECT c.id AS conflict_id, c.status, c.applied_rule,
             (c.resolved_value IS NOT NULL) AS has_resolved_value,
             (c.resolved_at IS NOT NULL) AS has_resolved_at,
             (SELECT COUNT(*)::int FROM conflict_options co
              WHERE co.conflict_id = c.id) AS option_count
      FROM conflicts c
      WHERE c.resolution_method = 'automatic_rule'
        AND (
          c.status <> 'resolved'
          OR c.applied_rule IS NULL
          OR c.applied_rule NOT IN ('B1', 'B2', 'B3')
          OR c.resolved_value IS NULL
          OR c.resolved_at IS NULL
          OR (SELECT COUNT(*) FROM conflict_options co
              WHERE co.conflict_id = c.id) <> 2
        )
      ORDER BY c.id`
  },
  {
    id: 'b_rule_conflicts_not_automatic',
    requirement: 'Automatic decisions',
    description:
      'Conflicts with a B code whose resolution_method is not automatic_rule',
    sql: `
      SELECT c.id AS conflict_id, c.applied_rule, c.resolution_method
      FROM conflicts c
      WHERE c.applied_rule IN ('B1', 'B2', 'B3')
        AND c.resolution_method IS DISTINCT FROM 'automatic_rule'
      ORDER BY c.id`
  },
  {
    id: 'latest_values_without_automatic_conflict',
    requirement: 'Automatic decisions',
    description:
      'latest_value provenance rows not explained by an automatic_rule conflict (is_current is covered by the B1 end_date conflict)',
    sql: `
      SELECT dp.id AS provenance_id, dp.item_type, dp.item_id, dp.field_name
      FROM data_provenance dp
      WHERE dp.resolution_method = 'latest_value'
        AND NOT EXISTS (
          SELECT 1 FROM conflicts c
          WHERE c.resolution_method = 'automatic_rule'
            AND c.candidate_id = dp.candidate_id
            AND c.item_type = dp.item_type::text
            AND c.item_id = dp.item_id
            AND (
              c.field_name = dp.field_name
              OR (dp.field_name = 'is_current'
                  AND c.applied_rule = 'B1'
                  AND c.field_name = 'end_date')
            )
        )
      ORDER BY dp.id`
  },
  {
    id: 'incomplete_human_decisions',
    requirement: 'Human decisions',
    description:
      'Completed reviews missing who, when, confidence, the new value or the previous value',
    totalSql: `
      SELECT COUNT(*)::int AS total
      FROM human_reviews WHERE review_status = 'completed'`,
    sql: `
      WITH decisions AS (
        SELECT
          hr.id AS review_id,
          hr.review_target_type,
          hr.item_id AS target_id,
          (hr.admin_id IS NOT NULL) AS has_who,
          (hr.reviewed_at IS NOT NULL) AS has_when,
          (hr.confidence IS NOT NULL
            AND hr.confidence >= 0 AND hr.confidence <= 1) AS has_confidence,
          CASE hr.review_target_type
            WHEN 'conflict' THEN COALESCE(
              c.status = 'resolved'
                AND c.resolution_method = 'human_review'
                AND c.resolved_value IS NOT NULL
                AND c.resolved_at IS NOT NULL,
              FALSE)
            ELSE COALESCE(
              us.resolved_at IS NOT NULL
                AND ((us.status = 'accepted' AND us.resolved_skill_id IS NOT NULL)
                     OR us.status = 'rejected'),
              FALSE)
          END AS has_new_value,
          CASE hr.review_target_type
            WHEN 'conflict' THEN EXISTS (
              SELECT 1 FROM conflict_options co WHERE co.conflict_id = c.id)
            ELSE us.id IS NOT NULL
          END AS has_previous_value
        FROM human_reviews hr
        LEFT JOIN conflicts c
          ON hr.review_target_type = 'conflict' AND c.id = hr.item_id
        LEFT JOIN unknown_skills us
          ON hr.review_target_type = 'unknown_skill' AND us.id = hr.item_id
        WHERE hr.review_status = 'completed'
      )
      SELECT * FROM decisions
      WHERE NOT (has_who AND has_when AND has_confidence
                 AND has_new_value AND has_previous_value)
      ORDER BY review_id`
  },
  {
    id: 'audit_rows_without_human_decision',
    requirement: 'Human decisions',
    description:
      'human_audit_log rows not matched by a completed review of the same admin',
    sql: `
      SELECT hal.id AS audit_id, hal.item_type, hal.item_id, hal.field_name,
             hal.changed_by
      FROM human_audit_log hal
      WHERE NOT EXISTS (
        SELECT 1
        FROM human_reviews hr
        LEFT JOIN conflicts c
          ON hr.review_target_type = 'conflict' AND c.id = hr.item_id
        LEFT JOIN unknown_skills us
          ON hr.review_target_type = 'unknown_skill' AND us.id = hr.item_id
        WHERE hr.review_status = 'completed'
          AND hr.admin_id = hal.changed_by
          AND hr.candidate_id = hal.candidate_id
          AND (
            (hr.review_target_type = 'conflict'
              AND c.item_type = hal.item_type::text
              AND (c.item_id = hal.item_id
                   OR c.resolved_value ->> 'newItemId' = hal.item_id)
              AND (c.field_name = hal.field_name
                   OR c.field_name IN (${ITEM_LEVEL_FIELDS.map((f) => `'${f}'`).join(', ')})))
            OR
            (hr.review_target_type = 'unknown_skill'
              AND us.status = 'accepted'
              AND hal.item_type = 'candidate_skills'
              AND hal.field_name = 'skill_id'
              AND hal.new_value = to_jsonb(us.resolved_skill_id))
          )
      )
      ORDER BY hal.id`
  },
  {
    id: 'extractions_without_versions',
    requirement: 'Versions',
    description:
      'Extractions (jobs with extracted_at) missing model name, model version or prompt version',
    totalSql: `
      SELECT COUNT(*)::int AS total
      FROM processing_jobs WHERE extracted_at IS NOT NULL`,
    sql: `
      SELECT id AS job_id, status, model_name, model_version, prompt_version
      FROM processing_jobs
      WHERE extracted_at IS NOT NULL
        AND (NULLIF(btrim(model_name), '') IS NULL
             OR NULLIF(btrim(model_version), '') IS NULL
             OR NULLIF(btrim(prompt_version), '') IS NULL)
      ORDER BY id`
  },
  {
    id: 'approved_values_without_versioned_job',
    requirement: 'Versions',
    description:
      'Provenance sources whose job has no extraction or misses a version',
    sql: `
      SELECT dps.id AS source_id, dps.provenance_id, dps.job_id
      FROM data_provenance_sources dps
      JOIN processing_jobs pj ON pj.id = dps.job_id
      WHERE pj.extracted_at IS NULL
         OR NULLIF(btrim(pj.model_name), '') IS NULL
         OR NULLIF(btrim(pj.model_version), '') IS NULL
         OR NULLIF(btrim(pj.prompt_version), '') IS NULL
      ORDER BY dps.id`
  },
  {
    id: 'files_with_multiple_jobs',
    requirement: 'No repeated processing',
    description: 'Files with more than one processing job',
    sql: `
      SELECT file_id, COUNT(*)::int AS job_count
      FROM processing_jobs
      GROUP BY file_id
      HAVING COUNT(*) > 1
      ORDER BY file_id`
  },
  {
    id: 'duplicate_file_hashes',
    requirement: 'No repeated processing',
    description: 'file_hash values shared by more than one uploaded file',
    sql: `
      SELECT file_hash, COUNT(*)::int AS file_count
      FROM uploaded_files
      GROUP BY file_hash
      HAVING COUNT(*) > 1
      ORDER BY file_hash`
  }
];

async function runCheck(db, check) {
  const result = await db.query(check.sql);
  const failures = result.rows.length;
  const outcome = {
    id: check.id,
    requirement: check.requirement,
    description: check.description,
    failures,
    passed: failures === 0,
    samples: result.rows.slice(0, SAMPLE_LIMIT)
  };

  if (check.totalSql) {
    const totalResult = await db.query(check.totalSql);
    const total = totalResult.rows[0].total;
    outcome.total = total;
    outcome.completePercent =
      total === 0
        ? 100
        : Math.round(((total - failures) / total) * 10000) / 100;
  }

  return outcome;
}

/**
 * Runs every traceability check against the given database.
 *
 * @param {{ query: Function }} db - pg Pool or Client
 * @returns {Promise<{ passed: boolean, automaticDecisions: number, checks: object[] }>}
 */
async function runTraceabilityChecks(db) {
  const checks = [];
  for (const check of CHECKS) {
    checks.push(await runCheck(db, check));
  }

  const autoResult = await db.query(
    `SELECT COUNT(*)::int AS count
     FROM conflicts WHERE resolution_method = 'automatic_rule'`
  );

  return {
    passed: checks.every((check) => check.passed),
    automaticDecisions: autoResult.rows[0].count,
    checks
  };
}

function formatTraceabilityReport(report) {
  const lines = ['Traceability verification (Requirements 4.3)', ''];

  for (const check of report.checks) {
    const status = check.passed ? 'PASS' : 'FAIL';
    let line = `[${status}] ${check.requirement}: ${check.description} = ${check.failures} (target 0)`;
    if (check.total !== undefined) {
      line += ` | complete ${check.completePercent}% of ${check.total} (target 100%)`;
    }
    lines.push(line);

    if (!check.passed) {
      for (const sample of check.samples) {
        lines.push(`    ${JSON.stringify(sample)}`);
      }
      if (check.failures > check.samples.length) {
        lines.push(`    ... and ${check.failures - check.samples.length} more`);
      }
    }
  }

  lines.push('');
  lines.push(
    `Automatic decisions (conflicts with automatic_rule): ${report.automaticDecisions}`
  );
  lines.push(`Result: ${report.passed ? 'PASS' : 'FAIL'}`);
  return lines.join('\n');
}

module.exports = {
  VALUE_COLUMNS,
  CHECKS,
  runTraceabilityChecks,
  formatTraceabilityReport
};
