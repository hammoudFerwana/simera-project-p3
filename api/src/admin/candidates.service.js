/**
 * Candidates read service for admin candidates list and candidate profile view.
 */

function escapeIlike(str) {
  return str.replace(/[\\%_]/g, '\\$&');
}

/**
 * Returns a paginated list of candidates with search and filters.
 *
 * @param {object} db - pg Pool or client
 * @param {object} query - validated query parameters
 * @returns {Promise<{ items: Array<object>, page: number, pageSize: number, total: number }>}
 */
async function listCandidates(db, query) {
  const { page, pageSize, status, hasPendingReview, search } = query;

  const whereClauses = [];
  const params = [];

  if (status) {
    params.push(status);
    whereClauses.push(`latest_job.status = $${params.length}`);
  }

  if (hasPendingReview === true) {
    whereClauses.push('pending_reviews.count > 0');
  }

  if (search) {
    const pattern = `%${escapeIlike(search)}%`;
    params.push(pattern);
    const pIdx = params.length;
    whereClauses.push(
      `(u.email ILIKE $${pIdx} ESCAPE '\\' ` +
        `OR cp.first_name ILIKE $${pIdx} ESCAPE '\\' ` +
        `OR cp.last_name ILIKE $${pIdx} ESCAPE '\\' ` +
        `OR (COALESCE(cp.first_name, '') || ' ' || COALESCE(cp.last_name, '')) ILIKE $${pIdx} ESCAPE '\\')`
    );
  }

  const whereSql =
    whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const baseFromSql = `
    FROM candidate_profiles cp
    JOIN users u ON u.id = cp.user_id
    LEFT JOIN LATERAL (
      SELECT pj.status
      FROM processing_jobs pj
      JOIN uploaded_files uf ON uf.id = pj.file_id
      WHERE uf.candidate_id = cp.id
      ORDER BY pj.created_at DESC, pj.id DESC
      LIMIT 1
    ) latest_job ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS count
      FROM human_reviews hr
      WHERE hr.candidate_id = cp.id
        AND hr.review_status != 'completed'
    ) pending_reviews ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS count
      FROM uploaded_files uf
      WHERE uf.candidate_id = cp.id
    ) files ON true
  `;

  const totalQuery = `
    SELECT COUNT(*)::int AS total
    ${baseFromSql}
    ${whereSql}
  `;

  const offset = (page - 1) * pageSize;
  const listParams = [...params, pageSize, offset];
  const limitParamIdx = params.length + 1;
  const offsetParamIdx = params.length + 2;

  const itemsQuery = `
    SELECT
      cp.id,
      u.email,
      cp.first_name AS "firstName",
      cp.last_name AS "lastName",
      latest_job.status AS "latestJobStatus",
      COALESCE(pending_reviews.count, 0) AS "pendingReviewCount",
      COALESCE(files.count, 0) AS "fileCount",
      cp.created_at AS "createdAt"
    ${baseFromSql}
    ${whereSql}
    ORDER BY cp.created_at DESC, cp.id DESC
    LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}
  `;

  const [totalResult, itemsResult] = await Promise.all([
    db.query(totalQuery, params),
    db.query(itemsQuery, listParams)
  ]);

  const total = totalResult.rows[0]?.total ?? 0;
  const items = itemsResult.rows.map((row) => ({
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    latestJobStatus: row.latestJobStatus,
    pendingReviewCount: row.pendingReviewCount,
    fileCount: row.fileCount,
    createdAt: row.createdAt
  }));

  return {
    items,
    page,
    pageSize,
    total
  };
}

/**
 * Builds a FieldView object for an entity property.
 */
function makeFieldView({
  itemType,
  itemId,
  fieldName,
  value,
  provenanceMap,
  pendingConflictsSet,
  manualReviewIdsMap
}) {
  const key = `${itemType}:${String(itemId)}:${fieldName}`;
  const prov = provenanceMap.get(key);
  const pendingReview = pendingConflictsSet.has(key);

  if (!prov) {
    return {
      value: value ?? null,
      resolutionMethod: null,
      approvedAt: null,
      humanReviewed: false,
      manualValue: false,
      reviewId: null,
      pendingReview,
      sources: []
    };
  }

  const humanReviewed = prov.resolutionMethod === 'human_reviewed';
  const manualValue = humanReviewed && prov.sources.length === 0;
  const reviewId = manualValue ? (manualReviewIdsMap.get(key) ?? null) : null;

  return {
    value: value ?? null,
    resolutionMethod: prov.resolutionMethod,
    approvedAt: prov.approvedAt,
    humanReviewed,
    manualValue,
    reviewId,
    pendingReview,
    sources: prov.sources
  };
}

/**
 * Returns the full candidate profile with FieldViews, sections, and files.
 *
 * @param {object} db - pg Pool or client
 * @param {number} candidateId - candidate profile ID
 * @returns {Promise<object | null>} full profile response or null if not found
 */
async function getCandidateProfile(db, candidateId) {
  const profileResult = await db.query(
    `SELECT
      cp.id,
      u.email,
      cp.created_at,
      cp.first_name,
      cp.last_name,
      cp.headline,
      cp.summary,
      cp.phone,
      cp.industry,
      cp.profession,
      cp.city,
      cp.country_code
    FROM candidate_profiles cp
    JOIN users u ON u.id = cp.user_id
    WHERE cp.id = $1`,
    [candidateId]
  );

  const profileRow = profileResult.rows[0];
  if (!profileRow) {
    return null;
  }

  const [
    workExperienceResult,
    educationResult,
    certificationsResult,
    projectsResult,
    awardsResult,
    publicationsResult,
    volunteeringResult,
    languagesResult,
    linksResult,
    skillsResult,
    filesResult,
    provenanceResult,
    pendingConflictsResult,
    manualReviewsResult
  ] = await Promise.all([
    db.query(
      `SELECT id, job_title, company_name, start_date, end_date, is_current,
              location, employment_type, work_mode, description, responsibilities,
              achievements, skills_used, company_url
       FROM work_experience
       WHERE candidate_id = $1
       ORDER BY id ASC`,
      [candidateId]
    ),
    db.query(
      `SELECT id, institution_name, degree_level, degree_name, field_of_study,
              start_date, end_date, is_current, gpa, honors, location, description
       FROM education
       WHERE candidate_id = $1
       ORDER BY id ASC`,
      [candidateId]
    ),
    db.query(
      `SELECT id, name, issuing_organization, issue_date, expiration_date,
              credential_id, credential_url, description
       FROM certifications
       WHERE candidate_id = $1
       ORDER BY id ASC`,
      [candidateId]
    ),
    db.query(
      `SELECT id, name, description, role, project_url, start_date, end_date
       FROM projects
       WHERE candidate_id = $1
       ORDER BY id ASC`,
      [candidateId]
    ),
    db.query(
      `SELECT id, name, issuer, award_date, description
       FROM awards
       WHERE candidate_id = $1
       ORDER BY id ASC`,
      [candidateId]
    ),
    db.query(
      `SELECT id, title, publisher, publication_date, url, description
       FROM publications
       WHERE candidate_id = $1
       ORDER BY id ASC`,
      [candidateId]
    ),
    db.query(
      `SELECT id, organization, role, description, start_date, end_date, is_current
       FROM volunteering
       WHERE candidate_id = $1
       ORDER BY id ASC`,
      [candidateId]
    ),
    db.query(
      `SELECT id, language, proficiency_level
       FROM candidate_languages
       WHERE candidate_id = $1
       ORDER BY id ASC`,
      [candidateId]
    ),
    db.query(
      `SELECT id, link_type, url, label
       FROM candidate_links
       WHERE candidate_id = $1
       ORDER BY id ASC`,
      [candidateId]
    ),
    db.query(
      `SELECT cs.id, cs.skill_id, s.canonical_name AS skill_name,
              cs.proficiency_level, cs.months_of_experience
       FROM candidate_skills cs
       JOIN skills s ON s.id = cs.skill_id
       WHERE cs.candidate_id = $1
       ORDER BY cs.id ASC`,
      [candidateId]
    ),
    db.query(
      `SELECT
         uf.id,
         uf.source_type AS type,
         uf.original_filename AS name,
         uf.uploaded_at AS "uploadedAt",
         pj.status,
         pj.failure_reason AS "failureReason",
         pj.completed_at AS "completedAt",
         COALESCE(pj.pending_review_count, 0) AS "pendingReviewCount"
       FROM uploaded_files uf
       LEFT JOIN processing_jobs pj ON pj.file_id = uf.id
       WHERE uf.candidate_id = $1
       ORDER BY uf.uploaded_at DESC, uf.id DESC`,
      [candidateId]
    ),
    db.query(
      `SELECT
         dp.id AS provenance_id,
         dp.item_type,
         dp.item_id,
         dp.field_name,
         dp.resolution_method,
         dp.approved_at,
         dps.job_id,
         dps.source_value,
         dps.confidence,
         dps.evidence,
         uf.id AS file_id,
         uf.source_type AS file_type,
         uf.original_filename AS file_name,
         uf.uploaded_at
       FROM data_provenance dp
       LEFT JOIN data_provenance_sources dps ON dps.provenance_id = dp.id
       LEFT JOIN processing_jobs pj ON pj.id = dps.job_id
       LEFT JOIN uploaded_files uf ON uf.id = pj.file_id
       WHERE dp.candidate_id = $1
       ORDER BY dp.id ASC, uf.uploaded_at ASC NULLS LAST, dps.job_id ASC`,
      [candidateId]
    ),
    db.query(
      `SELECT item_type, item_id, field_name
       FROM conflicts
       WHERE candidate_id = $1
         AND status = 'pending'`,
      [candidateId]
    ),
    db.query(
      `SELECT DISTINCT ON (c.item_type, c.item_id, c.field_name)
         c.item_type,
         c.item_id,
         c.field_name,
         hr.id AS review_id
       FROM conflicts c
       JOIN human_reviews hr
         ON hr.candidate_id = c.candidate_id
        AND hr.review_target_type = 'conflict'
        AND hr.item_id = c.id
       WHERE c.candidate_id = $1
         AND c.status = 'resolved'
         AND c.resolution_method = 'human_review'
       ORDER BY c.item_type, c.item_id, c.field_name,
                c.resolved_at DESC NULLS LAST, c.id DESC,
                hr.created_at DESC, hr.id DESC`,
      [candidateId]
    )
  ]);

  // Group provenance
  const provenanceMap = new Map();
  for (const row of provenanceResult.rows) {
    const key = `${row.item_type}:${row.item_id}:${row.field_name}`;
    let entry = provenanceMap.get(key);
    if (!entry) {
      entry = {
        resolutionMethod: row.resolution_method,
        approvedAt: row.approved_at,
        sources: []
      };
      provenanceMap.set(key, entry);
    }

    if (row.job_id != null) {
      entry.sources.push({
        jobId: row.job_id,
        fileId: row.file_id ?? null,
        fileType: row.file_type ?? null,
        fileName: row.file_name ?? null,
        uploadedAt: row.uploaded_at ?? null,
        value: row.source_value,
        confidence: row.confidence !== null ? Number(row.confidence) : null,
        evidence: row.evidence
      });
    }
  }

  // Pending conflicts set
  const pendingConflictsSet = new Set(
    pendingConflictsResult.rows.map(
      (r) => `${r.item_type}:${r.item_id}:${r.field_name}`
    )
  );

  // Manual review ids map
  const manualReviewIdsMap = new Map(
    manualReviewsResult.rows.map((r) => [
      `${r.item_type}:${r.item_id}:${r.field_name}`,
      r.review_id
    ])
  );

  // Build profile fields
  const profileFieldNames = [
    'first_name',
    'last_name',
    'headline',
    'summary',
    'phone',
    'industry',
    'profession',
    'city',
    'country_code'
  ];

  const profile = {};
  for (const fieldName of profileFieldNames) {
    profile[fieldName] = makeFieldView({
      itemType: 'candidate_profile',
      itemId: candidateId,
      fieldName,
      value: profileRow[fieldName],
      provenanceMap,
      pendingConflictsSet,
      manualReviewIdsMap
    });
  }

  // Build section items
  const workExperience = workExperienceResult.rows.map((row) => {
    const fields = {};
    const fieldNames = [
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
    ];
    for (const f of fieldNames) {
      fields[f] = makeFieldView({
        itemType: 'work_experience',
        itemId: row.id,
        fieldName: f,
        value: row[f],
        provenanceMap,
        pendingConflictsSet,
        manualReviewIdsMap
      });
    }
    return {
      id: row.id,
      months: null,
      fields
    };
  });

  const education = educationResult.rows.map((row) => {
    const fields = {};
    const fieldNames = [
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
    ];
    for (const f of fieldNames) {
      fields[f] = makeFieldView({
        itemType: 'education',
        itemId: row.id,
        fieldName: f,
        value: row[f],
        provenanceMap,
        pendingConflictsSet,
        manualReviewIdsMap
      });
    }
    return { id: row.id, fields };
  });

  const certifications = certificationsResult.rows.map((row) => {
    const fields = {};
    const fieldNames = [
      'name',
      'issuing_organization',
      'issue_date',
      'expiration_date',
      'credential_id',
      'credential_url',
      'description'
    ];
    for (const f of fieldNames) {
      fields[f] = makeFieldView({
        itemType: 'certifications',
        itemId: row.id,
        fieldName: f,
        value: row[f],
        provenanceMap,
        pendingConflictsSet,
        manualReviewIdsMap
      });
    }
    return { id: row.id, fields };
  });

  const projects = projectsResult.rows.map((row) => {
    const fields = {};
    const fieldNames = [
      'name',
      'description',
      'role',
      'project_url',
      'start_date',
      'end_date'
    ];
    for (const f of fieldNames) {
      fields[f] = makeFieldView({
        itemType: 'projects',
        itemId: row.id,
        fieldName: f,
        value: row[f],
        provenanceMap,
        pendingConflictsSet,
        manualReviewIdsMap
      });
    }
    return { id: row.id, fields };
  });

  const awards = awardsResult.rows.map((row) => {
    const fields = {};
    const fieldNames = ['name', 'issuer', 'award_date', 'description'];
    for (const f of fieldNames) {
      fields[f] = makeFieldView({
        itemType: 'awards',
        itemId: row.id,
        fieldName: f,
        value: row[f],
        provenanceMap,
        pendingConflictsSet,
        manualReviewIdsMap
      });
    }
    return { id: row.id, fields };
  });

  const publications = publicationsResult.rows.map((row) => {
    const fields = {};
    const fieldNames = [
      'title',
      'publisher',
      'publication_date',
      'url',
      'description'
    ];
    for (const f of fieldNames) {
      fields[f] = makeFieldView({
        itemType: 'publications',
        itemId: row.id,
        fieldName: f,
        value: row[f],
        provenanceMap,
        pendingConflictsSet,
        manualReviewIdsMap
      });
    }
    return { id: row.id, fields };
  });

  const volunteering = volunteeringResult.rows.map((row) => {
    const fields = {};
    const fieldNames = [
      'organization',
      'role',
      'description',
      'start_date',
      'end_date',
      'is_current'
    ];
    for (const f of fieldNames) {
      fields[f] = makeFieldView({
        itemType: 'volunteering',
        itemId: row.id,
        fieldName: f,
        value: row[f],
        provenanceMap,
        pendingConflictsSet,
        manualReviewIdsMap
      });
    }
    return { id: row.id, fields };
  });

  const languages = languagesResult.rows.map((row) => {
    const fields = {
      language: makeFieldView({
        itemType: 'candidate_languages',
        itemId: row.id,
        fieldName: 'language',
        value: row.language,
        provenanceMap,
        pendingConflictsSet,
        manualReviewIdsMap
      }),
      proficiency_level: makeFieldView({
        itemType: 'candidate_languages',
        itemId: row.id,
        fieldName: 'proficiency_level',
        value: row.proficiency_level,
        provenanceMap,
        pendingConflictsSet,
        manualReviewIdsMap
      })
    };
    return { id: row.id, fields };
  });

  const links = linksResult.rows.map((row) => {
    const fields = {
      link_type: makeFieldView({
        itemType: 'candidate_links',
        itemId: row.id,
        fieldName: 'link_type',
        value: row.link_type,
        provenanceMap,
        pendingConflictsSet,
        manualReviewIdsMap
      }),
      url: makeFieldView({
        itemType: 'candidate_links',
        itemId: row.id,
        fieldName: 'url',
        value: row.url,
        provenanceMap,
        pendingConflictsSet,
        manualReviewIdsMap
      }),
      label: makeFieldView({
        itemType: 'candidate_links',
        itemId: row.id,
        fieldName: 'label',
        value: row.label,
        provenanceMap,
        pendingConflictsSet,
        manualReviewIdsMap
      })
    };
    return { id: row.id, fields };
  });

  const skills = skillsResult.rows.map((row) => {
    const fields = {
      skill_id: makeFieldView({
        itemType: 'candidate_skills',
        itemId: row.id,
        fieldName: 'skill_id',
        value: row.skill_id,
        provenanceMap,
        pendingConflictsSet,
        manualReviewIdsMap
      }),
      proficiency_level: makeFieldView({
        itemType: 'candidate_skills',
        itemId: row.id,
        fieldName: 'proficiency_level',
        value: row.proficiency_level,
        provenanceMap,
        pendingConflictsSet,
        manualReviewIdsMap
      }),
      months_of_experience: makeFieldView({
        itemType: 'candidate_skills',
        itemId: row.id,
        fieldName: 'months_of_experience',
        value: row.months_of_experience,
        provenanceMap,
        pendingConflictsSet,
        manualReviewIdsMap
      })
    };
    return {
      id: row.id,
      skillName: row.skill_name,
      fields
    };
  });

  const files = filesResult.rows.map((row) => ({
    id: row.id,
    type: row.type,
    name: row.name,
    uploadedAt: row.uploadedAt,
    status: row.status,
    failureReason: row.failureReason,
    completedAt: row.completedAt,
    pendingReviewCount: Number(row.pendingReviewCount),
    rawUrl: `/api/uploads/${row.id}/raw`
  }));

  return {
    candidate: {
      id: profileRow.id,
      email: profileRow.email,
      createdAt: profileRow.created_at
    },
    profile,
    sections: {
      work_experience: workExperience,
      education,
      certifications,
      projects,
      awards,
      publications,
      volunteering,
      languages,
      links,
      skills
    },
    experience: null,
    files
  };
}

module.exports = {
  listCandidates,
  getCandidateProfile,
  makeFieldView,
  escapeIlike
};
