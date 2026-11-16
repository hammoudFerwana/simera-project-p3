const PROVENANCE_TABLES = Object.freeze({
  candidate_profile: 'candidate_profiles',
  education: 'education',
  work_experience: 'work_experience',
  certifications: 'certifications',
  projects: 'projects',
  awards: 'awards',
  publications: 'publications',
  volunteering: 'volunteering',
  candidate_languages: 'candidate_languages',
  candidate_links: 'candidate_links',
  candidate_skills: 'candidate_skills'
});

const ALLOWED_COLUMNS_BY_TABLE = Object.freeze({
  candidate_profiles: new Set([
    'first_name',
    'last_name',
    'headline',
    'summary',
    'phone',
    'industry',
    'profession',
    'city',
    'country_code',
    'updated_at'
  ]),
  work_experience: new Set([
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
  ]),
  education: new Set([
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
  ]),
  candidate_languages: new Set(['proficiency_level']),
  candidate_links: new Set(['url', 'link_type', 'label']),
  candidate_skills: new Set(['proficiency_level', 'months_of_experience']),
  certifications: new Set([
    'name',
    'issuing_organization',
    'issue_date',
    'expiration_date',
    'credential_id',
    'credential_url',
    'description'
  ]),
  projects: new Set([
    'name',
    'description',
    'role',
    'project_url',
    'start_date',
    'end_date'
  ]),
  awards: new Set(['name', 'issuer', 'award_date', 'description']),
  publications: new Set([
    'title',
    'publisher',
    'publication_date',
    'url',
    'description'
  ]),
  volunteering: new Set([
    'organization',
    'role',
    'description',
    'start_date',
    'end_date',
    'is_current'
  ])
});

/**
 * Loads pending conflicts for a given candidate.
 * Returns only rows with status = 'pending'.
 *
 * @param {object} client pg client or pool
 * @param {number|string} candidateId
 * @returns {Promise<Array<{ conflictId: number, itemType: string, itemId: string, fieldName: string }>>}
 */
async function loadPendingConflicts(client, candidateId) {
  const query = `
    SELECT
      id AS "conflictId",
      item_type AS "itemType",
      item_id AS "itemId",
      field_name AS "fieldName"
    FROM conflicts
    WHERE candidate_id = $1 AND status = 'pending'
    ORDER BY id ASC
  `;
  const res = await client.query(query, [candidateId]);
  return res.rows;
}

/**
 * Applies automatic decisions (Table B) and records new options for pending
 * conflicts inside the caller's transaction.
 *
 * Never issues BEGIN, COMMIT, or ROLLBACK.
 *
 * @param {object} client pg Client (inside active transaction)
 * @param {object} params
 * @param {number} params.candidateId
 * @param {number} params.jobId
 * @param {number} params.fileId
 * @param {Array} [params.automatic=[]]
 * @param {Array} [params.addOptions=[]]
 * @param {Date} [params.now=new Date()]
 * @returns {Promise<{ conflictIds: number[], optionIds: number[] }>}
 */
async function applyAutomaticDecisions(
  client,
  {
    candidateId,
    jobId,
    fileId,
    automatic = [],
    addOptions = [],
    now = new Date()
  }
) {
  const conflictIds = [];
  const optionIds = [];

  for (const decision of automatic) {
    const { rule, itemType, itemId, field, previous, next, extraUpdates } =
      decision;

    const tableName = PROVENANCE_TABLES[itemType];
    if (!tableName) {
      throw new Error(`Unsupported provenance item type: "${itemType}"`);
    }

    const allowedColumns = ALLOWED_COLUMNS_BY_TABLE[tableName];
    if (!allowedColumns) {
      throw new Error(`No column whitelist defined for table "${tableName}"`);
    }

    if (!allowedColumns.has(field)) {
      throw new Error(
        `Field "${field}" is not allowed to be updated on table "${tableName}"`
      );
    }

    // 1. Read previous value's latest source
    const prevSourceQuery = `
      SELECT
        pj.file_id AS source_file_id,
        dps.confidence,
        dps.evidence
      FROM data_provenance dp
      JOIN data_provenance_sources dps ON dps.provenance_id = dp.id
      JOIN processing_jobs pj ON pj.id = dps.job_id
      WHERE dp.candidate_id = $1
        AND dp.item_type = $2
        AND dp.item_id = $3
        AND dp.field_name = $4
      ORDER BY dps.id DESC
      LIMIT 1
    `;
    const prevSourceRes = await client.query(prevSourceQuery, [
      candidateId,
      itemType,
      String(itemId),
      field
    ]);
    const prevSource = prevSourceRes.rows[0] || {
      source_file_id: null,
      confidence: null,
      evidence: null
    };

    // 2. UPDATE the core table column (and extraUpdates) for that item id
    const updates = { [field]: next.value, ...(extraUpdates || {}) };
    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    for (const [colName, colVal] of Object.entries(updates)) {
      if (!allowedColumns.has(colName)) {
        throw new Error(
          `Column "${colName}" is not whitelisted for table "${tableName}"`
        );
      }
      setClauses.push(`"${colName}" = $${paramIndex++}`);
      values.push(colVal);
    }

    if (
      tableName === 'candidate_profiles' &&
      allowedColumns.has('updated_at')
    ) {
      setClauses.push(`"updated_at" = $${paramIndex++}`);
      values.push(now);
    }

    values.push(parseInt(itemId, 10));
    const updateQuery = `
      UPDATE "${tableName}"
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
    `;
    await client.query(updateQuery, values);

    // 3. INSERT conflicts (resolved, automatic_rule, applied_rule = rule, resolved_value, resolved_at)
    const conflictInsertQuery = `
      INSERT INTO conflicts (
        candidate_id,
        field_name,
        item_type,
        item_id,
        status,
        resolution_method,
        applied_rule,
        resolved_value,
        resolved_at
      ) VALUES ($1, $2, $3, $4, 'resolved', 'automatic_rule', $5, $6, $7)
      RETURNING id
    `;
    const conflictInsertRes = await client.query(conflictInsertQuery, [
      candidateId,
      field,
      itemType,
      String(itemId),
      rule,
      JSON.stringify(next.value),
      now
    ]);
    const conflictId = conflictInsertRes.rows[0].id;
    conflictIds.push(conflictId);

    // 4. INSERT two conflict_options: previous and next
    const optionInsertQuery = `
      INSERT INTO conflict_options (
        conflict_id,
        value,
        source_file_id,
        confidence,
        evidence
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `;

    const prevOptionRes = await client.query(optionInsertQuery, [
      conflictId,
      JSON.stringify(previous),
      prevSource.source_file_id,
      prevSource.confidence,
      prevSource.evidence
    ]);
    optionIds.push(prevOptionRes.rows[0].id);

    const nextOptionRes = await client.query(optionInsertQuery, [
      conflictId,
      JSON.stringify(next.value),
      fileId,
      next.confidence,
      next.evidence
    ]);
    optionIds.push(nextOptionRes.rows[0].id);

    // 5. data_provenance for that field: upsert with resolution_method latest_value and approved_at = now
    // Delete its data_provenance_sources rows and insert one row for jobId
    const upsertProvenance = async (fieldName, val, confidence, evidence) => {
      const provUpsertQuery = `
        INSERT INTO data_provenance (
          candidate_id,
          item_type,
          item_id,
          field_name,
          resolution_method,
          approved_at
        ) VALUES ($1, $2, $3, $4, 'latest_value', $5)
        ON CONFLICT (item_type, item_id, field_name)
        DO UPDATE SET
          resolution_method = EXCLUDED.resolution_method,
          approved_at = EXCLUDED.approved_at
        RETURNING id
      `;
      const provRes = await client.query(provUpsertQuery, [
        candidateId,
        itemType,
        String(itemId),
        fieldName,
        now
      ]);
      const provenanceId = provRes.rows[0].id;

      await client.query(
        'DELETE FROM data_provenance_sources WHERE provenance_id = $1',
        [provenanceId]
      );

      await client.query(
        `INSERT INTO data_provenance_sources (
          provenance_id,
          job_id,
          source_value,
          confidence,
          evidence
        ) VALUES ($1, $2, $3, $4, $5)`,
        [
          provenanceId,
          jobId,
          JSON.stringify(val),
          confidence,
          String(evidence ?? '')
        ]
      );
    };

    await upsertProvenance(field, next.value, next.confidence, next.evidence);

    // For B1: handle is_current as a second field (provenance latest_value, but no second conflicts row)
    if (rule === 'B1') {
      await upsertProvenance(
        'is_current',
        false,
        next.confidence,
        next.evidence
      );
    }
  }

  // Handle addOptions: INSERT one conflict_options row on that conflict
  // The conflict stays pending and nothing is applied
  for (const entry of addOptions) {
    const optInsertQuery = `
      INSERT INTO conflict_options (
        conflict_id,
        value,
        source_file_id,
        confidence,
        evidence
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `;
    const optRes = await client.query(optInsertQuery, [
      entry.conflictId,
      JSON.stringify(entry.new?.value),
      fileId,
      entry.new?.confidence,
      entry.new?.evidence
    ]);
    optionIds.push(optRes.rows[0].id);
  }

  return { conflictIds, optionIds };
}

module.exports = {
  applyAutomaticDecisions,
  loadPendingConflicts,
  PROVENANCE_TABLES,
  ALLOWED_COLUMNS_BY_TABLE
};
