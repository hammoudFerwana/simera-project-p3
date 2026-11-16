const pool = require('./database');
const { PermanentError } = require('./errors');
const {
  buildDeduplicationKey,
  normalizeUrlForStorage,
  mergeDuplicateItems
} = require('./deduplication');
const { createReviewItem } = require('./review-items');
async function saveEducation(client, candidateId, educationItems) {
  const savedItems = [];

  for (const item of educationItems) {
    const { fields, sourceIndex } = item;

    const deduplicationKey = buildDeduplicationKey('education', fields);

    const values = {
      institution_name: fields.institution_name?.value ?? null,
      degree_level: fields.degree_level?.value ?? null,
      degree_name: fields.degree_name?.value ?? null,
      field_of_study: fields.field_of_study?.value ?? null,
      start_date: fields.start_date?.value ?? null,
      end_date: fields.end_date?.value ?? null,
      is_current: fields.is_current?.value ?? null,
      gpa: fields.gpa?.value ?? null,
      honors: fields.honors?.value ?? null,
      location: fields.location?.value ?? null,
      description: fields.description?.value ?? null
    };

    if (!values.institution_name) {
      throw new PermanentError(
        `Education item at source index ${sourceIndex} has no institution name.`
      );
    }

    const result = await client.query(
      `INSERT INTO education (
        candidate_id,
        institution_name,
        degree_level,
        degree_name,
        field_of_study,
        start_date,
        end_date,
        is_current,
        gpa,
        honors,
        location,
        description,
        deduplication_key
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13
      )
      ON CONFLICT (candidate_id, deduplication_key)
      DO UPDATE SET
        institution_name = COALESCE(education.institution_name, EXCLUDED.institution_name),
        degree_level = COALESCE(education.degree_level, EXCLUDED.degree_level),
        degree_name = COALESCE(education.degree_name, EXCLUDED.degree_name),
        field_of_study = COALESCE(education.field_of_study, EXCLUDED.field_of_study),
        start_date = COALESCE(education.start_date, EXCLUDED.start_date),
        end_date = COALESCE(education.end_date, EXCLUDED.end_date),
        is_current = COALESCE(education.is_current, EXCLUDED.is_current),
        gpa = COALESCE(education.gpa, EXCLUDED.gpa),
        honors = COALESCE(education.honors, EXCLUDED.honors),
        location = COALESCE(education.location, EXCLUDED.location),
        description = COALESCE(education.description, EXCLUDED.description)
      RETURNING *`,
      [
        candidateId,
        values.institution_name,
        values.degree_level,
        values.degree_name,
        values.field_of_study,
        values.start_date,
        values.end_date,
        values.is_current,
        values.gpa,
        values.honors,
        values.location,
        values.description,
        deduplicationKey
      ]
    );

    const savedItem = result.rows[0];

    if (!savedItem?.id) {
      throw new Error('Failed to save item.');
    }

    savedItems.push({
      itemType: 'education',
      itemId: savedItem.id,
      deduplicationKey,
      sourceIndex,
      sourceIndexes: item.sourceIndexes ?? [sourceIndex],
      fields,
      reviewFields: item.reviewFields ?? {},
      storedRow: savedItem
    });
  }

  return savedItems;
}

async function saveWorkExperience(client, candidateId, workItems) {
  const savedItems = [];

  for (const item of workItems) {
    const { fields, sourceIndex } = item;

    const deduplicationKey = buildDeduplicationKey('work_experience', fields);

    const values = {
      job_title: fields.job_title?.value ?? null,
      company_name: fields.company_name?.value ?? null,
      start_date: fields.start_date?.value ?? null,
      end_date: fields.end_date?.value ?? null,
      is_current: fields.is_current?.value ?? null,
      location: fields.location?.value ?? null,
      employment_type: fields.employment_type?.value ?? null,
      work_mode: fields.work_mode?.value ?? null,
      description: fields.description?.value ?? null,
      responsibilities: fields.responsibilities?.value ?? null,
      achievements: fields.achievements?.value ?? null,
      skills_used: fields.skills_used?.value ?? null,
      company_url: fields.company_url?.value ?? null
    };

    if (!values.job_title || !values.company_name) {
      throw new PermanentError(
        `Work experience item at source index ${sourceIndex} must have job title and company name.`
      );
    }

    const result = await client.query(
      `INSERT INTO work_experience (
        candidate_id,
        job_title,
        company_name,
        start_date,
        end_date,
        is_current,
        location,
        employment_type,
        work_mode,
        description,
        responsibilities,
        achievements,
        skills_used,
        company_url,
        deduplication_key
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14, $15
      )
      ON CONFLICT (candidate_id, deduplication_key)
      DO UPDATE SET
        job_title = COALESCE(work_experience.job_title, EXCLUDED.job_title),
        company_name = COALESCE(work_experience.company_name, EXCLUDED.company_name),
        start_date = COALESCE(work_experience.start_date, EXCLUDED.start_date),
        end_date = COALESCE(work_experience.end_date, EXCLUDED.end_date),
        is_current = COALESCE(work_experience.is_current, EXCLUDED.is_current),
        location = COALESCE(work_experience.location, EXCLUDED.location),
        employment_type = COALESCE(work_experience.employment_type, EXCLUDED.employment_type),
        work_mode = COALESCE(work_experience.work_mode, EXCLUDED.work_mode),
        description = COALESCE(work_experience.description, EXCLUDED.description),
        responsibilities = COALESCE(work_experience.responsibilities, EXCLUDED.responsibilities),
        achievements = COALESCE(work_experience.achievements, EXCLUDED.achievements),
        skills_used = COALESCE(work_experience.skills_used, EXCLUDED.skills_used),
        company_url = COALESCE(work_experience.company_url, EXCLUDED.company_url)
      RETURNING *`,
      [
        candidateId,
        values.job_title,
        values.company_name,
        values.start_date,
        values.end_date,
        values.is_current,
        values.location,
        values.employment_type,
        values.work_mode,
        values.description,
        values.responsibilities,
        values.achievements,
        values.skills_used,
        values.company_url,
        deduplicationKey
      ]
    );

    const savedItem = result.rows[0];

    if (!savedItem?.id) {
      throw new Error('Failed to save item.');
    }

    savedItems.push({
      itemType: 'work_experience',
      itemId: savedItem.id,
      deduplicationKey,
      sourceIndex,
      sourceIndexes: item.sourceIndexes ?? [sourceIndex],
      fields,
      reviewFields: item.reviewFields ?? {},
      storedRow: savedItem
    });
  }

  return savedItems;
}

async function saveCertifications(client, candidateId, certificationItems) {
  const savedItems = [];

  for (const item of certificationItems) {
    const fields = item.fields;

    const getValue = (fieldName) => fields[fieldName]?.value ?? null;

    const name = getValue('name');

    if (!name) {
      throw new PermanentError('Certification name is required.');
    }

    const values = {
      name,
      issuing_organization: getValue('issuing_organization'),
      issue_date: getValue('issue_date'),
      expiration_date: getValue('expiration_date'),
      credential_id: getValue('credential_id'),
      credential_url: getValue('credential_url'),
      description: getValue('description')
    };

    const deduplicationKey = buildDeduplicationKey('certifications', fields);

    const result = await client.query(
      `INSERT INTO certifications (
        candidate_id,
        name,
        issuing_organization,
        issue_date,
        expiration_date,
        credential_id,
        credential_url,
        description,
        deduplication_key
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (candidate_id, deduplication_key)
      DO UPDATE SET
        name = COALESCE(certifications.name, EXCLUDED.name),
        issuing_organization = COALESCE(
          certifications.issuing_organization,
          EXCLUDED.issuing_organization
        ),
        issue_date = COALESCE(
          certifications.issue_date,
          EXCLUDED.issue_date
        ),
        expiration_date = COALESCE(
          certifications.expiration_date,
          EXCLUDED.expiration_date
        ),
        credential_id = COALESCE(
          certifications.credential_id,
          EXCLUDED.credential_id
        ),
        credential_url = COALESCE(
          certifications.credential_url,
          EXCLUDED.credential_url
        ),
        description = COALESCE(
          certifications.description,
          EXCLUDED.description
        )
      RETURNING *`,
      [
        candidateId,
        values.name,
        values.issuing_organization,
        values.issue_date,
        values.expiration_date,
        values.credential_id,
        values.credential_url,
        values.description,
        deduplicationKey
      ]
    );

    const savedItem = result.rows[0];

    if (!savedItem?.id) {
      throw new Error('Failed to save item.');
    }

    savedItems.push({
      itemType: 'certifications',
      itemId: savedItem.id,
      deduplicationKey,
      sourceIndex: item.sourceIndex,
      sourceIndexes: item.sourceIndexes ?? [item.sourceIndex],
      fields,
      reviewFields: item.reviewFields ?? {},
      storedRow: savedItem
    });
  }

  return savedItems;
}

async function saveProjects(client, candidateId, projectItems) {
  const savedItems = [];

  for (const item of projectItems) {
    const fields = item.fields;

    const getValue = (fieldName) => fields[fieldName]?.value ?? null;

    const name = getValue('name');

    if (!name) {
      throw new PermanentError('Project name is required.');
    }

    const values = {
      name,
      description: getValue('description'),
      role: getValue('role'),
      project_url: getValue('project_url'),
      start_date: getValue('start_date'),
      end_date: getValue('end_date')
    };

    const deduplicationKey = buildDeduplicationKey('projects', fields);

    const result = await client.query(
      `INSERT INTO projects (
        candidate_id,
        name,
        description,
        role,
        project_url,
        start_date,
        end_date,
        deduplication_key
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (candidate_id, deduplication_key)
      DO UPDATE SET
        name = COALESCE(projects.name, EXCLUDED.name),
        description = COALESCE(projects.description, EXCLUDED.description),
        role = COALESCE(projects.role, EXCLUDED.role),
        project_url = COALESCE(projects.project_url, EXCLUDED.project_url),
        start_date = COALESCE(projects.start_date, EXCLUDED.start_date),
        end_date = COALESCE(projects.end_date, EXCLUDED.end_date)
      RETURNING *`,
      [
        candidateId,
        values.name,
        values.description,
        values.role,
        values.project_url,
        values.start_date,
        values.end_date,
        deduplicationKey
      ]
    );

    const savedItem = result.rows[0];

    if (!savedItem?.id) {
      throw new Error('Failed to save item.');
    }

    savedItems.push({
      itemType: 'projects',
      itemId: savedItem.id,
      deduplicationKey,
      sourceIndex: item.sourceIndex,
      sourceIndexes: item.sourceIndexes ?? [item.sourceIndex],
      fields,
      reviewFields: item.reviewFields ?? {},
      storedRow: savedItem
    });
  }

  return savedItems;
}

async function saveAwards(client, candidateId, awardItems) {
  const savedItems = [];

  for (const item of awardItems) {
    const fields = item.fields;

    const values = {
      name: fields.name?.value ?? null,
      issuer: fields.issuer?.value ?? null,
      award_date: fields.award_date?.value ?? null,
      description: fields.description?.value ?? null
    };

    if (!values.name) {
      throw new PermanentError('Award name is required.');
    }

    const deduplicationKey = buildDeduplicationKey('awards', fields);

    const result = await client.query(
      `INSERT INTO awards (
        candidate_id,
        name,
        issuer,
        award_date,
        description,
        deduplication_key
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (candidate_id, deduplication_key)
      DO UPDATE SET
        name = COALESCE(awards.name, EXCLUDED.name),
        issuer = COALESCE(awards.issuer, EXCLUDED.issuer),
        award_date = COALESCE(awards.award_date, EXCLUDED.award_date),
        description = COALESCE(awards.description, EXCLUDED.description)
      RETURNING *`,
      [
        candidateId,
        values.name,
        values.issuer,
        values.award_date,
        values.description,
        deduplicationKey
      ]
    );

    const savedItem = result.rows[0];

    if (!savedItem?.id) {
      throw new Error('Failed to save award.');
    }

    savedItems.push({
      itemType: 'awards',
      itemId: savedItem.id,
      deduplicationKey,
      sourceIndex: item.sourceIndex,
      sourceIndexes: item.sourceIndexes ?? [item.sourceIndex],
      fields,
      reviewFields: item.reviewFields ?? {},
      storedRow: savedItem
    });
  }

  return savedItems;
}
async function savePublications(client, candidateId, publicationItems) {
  const savedItems = [];

  for (const item of publicationItems) {
    const fields = item.fields;

    const values = {
      title: fields.title?.value ?? null,
      publisher: fields.publisher?.value ?? null,
      publication_date: fields.publication_date?.value ?? null,
      url: fields.url?.value ?? null,
      description: fields.description?.value ?? null
    };

    if (!values.title) {
      throw new PermanentError('Publication title is required.');
    }

    const deduplicationKey = buildDeduplicationKey('publications', fields);

    const result = await client.query(
      `INSERT INTO publications (
        candidate_id,
        title,
        publisher,
        publication_date,
        url,
        description,
        deduplication_key
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (candidate_id, deduplication_key)
      DO UPDATE SET
        title = COALESCE(publications.title, EXCLUDED.title),
        publisher = COALESCE(publications.publisher, EXCLUDED.publisher),
        publication_date = COALESCE(publications.publication_date, EXCLUDED.publication_date),
        url = COALESCE(publications.url, EXCLUDED.url),
        description = COALESCE(publications.description, EXCLUDED.description)
      RETURNING *`,
      [
        candidateId,
        values.title,
        values.publisher,
        values.publication_date,
        values.url,
        values.description,
        deduplicationKey
      ]
    );

    const savedItem = result.rows[0];

    if (!savedItem?.id) {
      throw new Error('Failed to save publication.');
    }

    savedItems.push({
      itemType: 'publications',
      itemId: savedItem.id,
      deduplicationKey,
      sourceIndex: item.sourceIndex,
      sourceIndexes: item.sourceIndexes ?? [item.sourceIndex],
      fields,
      reviewFields: item.reviewFields ?? {},
      storedRow: savedItem
    });
  }

  return savedItems;
}
async function saveVolunteering(client, candidateId, volunteeringItems) {
  const savedItems = [];

  for (const item of volunteeringItems) {
    const fields = item.fields;

    const values = {
      organization: fields.organization?.value ?? null,
      role: fields.role?.value ?? null,
      description: fields.description?.value ?? null,
      start_date: fields.start_date?.value ?? null,
      end_date: fields.end_date?.value ?? null,
      is_current: fields.is_current?.value ?? null
    };
    const hasDeduplicationValue = [
      fields.organization?.value,
      fields.role?.value,
      fields.start_date?.value
    ].some((value) => typeof value === 'string' && value.trim() !== '');

    if (!hasDeduplicationValue) {
      throw new PermanentError(
        'Volunteering item must contain organization, role, or start date for deduplication.'
      );
    }

    const deduplicationKey = buildDeduplicationKey('volunteering', fields);

    const result = await client.query(
      `INSERT INTO volunteering (
        candidate_id,
        organization,
        role,
        description,
        start_date,
        end_date,
        is_current,
        deduplication_key
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (candidate_id, deduplication_key)
      DO UPDATE SET
        organization = COALESCE(volunteering.organization, EXCLUDED.organization),
        role = COALESCE(volunteering.role, EXCLUDED.role),
        description = COALESCE(volunteering.description, EXCLUDED.description),
        start_date = COALESCE(volunteering.start_date, EXCLUDED.start_date),
        end_date = COALESCE(volunteering.end_date, EXCLUDED.end_date),
        is_current = COALESCE(volunteering.is_current, EXCLUDED.is_current)
      RETURNING *`,
      [
        candidateId,
        values.organization,
        values.role,
        values.description,
        values.start_date,
        values.end_date,
        values.is_current,
        deduplicationKey
      ]
    );

    const savedItem = result.rows[0];

    if (!savedItem?.id) {
      throw new Error('Failed to save volunteering item.');
    }

    savedItems.push({
      itemType: 'volunteering',
      itemId: savedItem.id,
      deduplicationKey,
      sourceIndex: item.sourceIndex,
      sourceIndexes: item.sourceIndexes ?? [item.sourceIndex],
      fields,
      reviewFields: item.reviewFields ?? {},
      storedRow: savedItem
    });
  }

  return savedItems;
}
async function saveLanguages(client, candidateId, languageItems) {
  const savedItems = [];

  for (const item of languageItems) {
    const fields = item.fields;

    const values = {
      language: fields.language?.value ?? null,
      proficiency_level: fields.proficiency_level?.value ?? null
    };

    if (!values.language) {
      throw new PermanentError('Language is required.');
    }

    const result = await client.query(
      `INSERT INTO candidate_languages (
        candidate_id,
        language,
        proficiency_level
      )
      VALUES ($1, $2, $3)
      ON CONFLICT (candidate_id, language)
      DO UPDATE SET
        proficiency_level = COALESCE(
          candidate_languages.proficiency_level,
          EXCLUDED.proficiency_level
        )
      RETURNING *`,
      [candidateId, values.language, values.proficiency_level]
    );

    const savedItem = result.rows[0];

    if (!savedItem?.id) {
      throw new Error('Failed to save language item.');
    }

    savedItems.push({
      itemType: 'candidate_languages',
      itemId: savedItem.id,
      sourceIndex: item.sourceIndex,
      fields,
      storedRow: savedItem
    });
  }

  return savedItems;
}
async function saveLinks(client, candidateId, linkItems) {
  const savedItems = [];

  for (const item of linkItems) {
    const fields = item.fields;

    const values = {
      link_type: fields.link_type?.value ?? 'other',
      url: normalizeUrlForStorage(fields.url?.value),
      label: fields.label?.value ?? null
    };

    if (!values.url) {
      throw new PermanentError('Link URL is required.');
    }

    const result = await client.query(
      `INSERT INTO candidate_links (
        candidate_id,
        link_type,
        url,
        label
      )
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (candidate_id, url)
      DO UPDATE SET
        link_type = COALESCE(candidate_links.link_type, EXCLUDED.link_type),
        label = COALESCE(candidate_links.label, EXCLUDED.label)
      RETURNING *`,
      [candidateId, values.link_type, values.url, values.label]
    );

    const savedItem = result.rows[0];

    if (!savedItem?.id) {
      throw new Error('Failed to save link item.');
    }

    savedItems.push({
      itemType: 'candidate_links',
      itemId: savedItem.id,
      sourceIndex: item.sourceIndex,
      fields,
      storedRow: savedItem
    });
  }

  return savedItems;
}

async function saveSkills(
  client,
  { candidateId, fileId, jobId, skills, confidenceThreshold }
) {
  const savedSkills = {
  matched: [],
  unknown: [],
  reviewCandidates: []
};
  const savedProvenance = [];

  for (const item of skills.matched) {
    const { skillId, fields } = item;

const safeFields = {};
const lowConfidenceFields = [];

for (const [fieldName, wrapper] of Object.entries(fields ?? {})) {
  if (wrapper?.value === null || wrapper?.value === undefined) {
    continue;
  }

  if (
    typeof wrapper.confidence === 'number' &&
    wrapper.confidence < confidenceThreshold
  ) {
    if (typeof wrapper.evidence === 'string' && wrapper.evidence.trim()) {
      lowConfidenceFields.push({
        fieldName,
        value: wrapper.value,
        confidence: wrapper.confidence,
        evidence: wrapper.evidence
      });
    }

    continue;
  }

  safeFields[fieldName] = wrapper;
}

const proficiencyLevel = safeFields.proficiency_level?.value ?? null;
const monthsOfExperience =
  safeFields.months_of_experience?.value ?? null;

    const result = await client.query(
      `INSERT INTO candidate_skills (
        candidate_id,
        skill_id,
        proficiency_level,
        months_of_experience,
        created_at
      )
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      ON CONFLICT (candidate_id, skill_id)
      DO UPDATE SET
        proficiency_level = COALESCE(candidate_skills.proficiency_level, EXCLUDED.proficiency_level),
        months_of_experience = COALESCE(candidate_skills.months_of_experience, EXCLUDED.months_of_experience)
      RETURNING *`,
      [candidateId, skillId, proficiencyLevel, monthsOfExperience]
    );

    const savedRow = result.rows[0];
    if (!savedRow?.id) {
      throw new Error('Failed to save candidate skill.');
    }

    const itemProvenance = await saveProvenance(client, {
      candidateId,
      itemType: 'candidate_skills',
      itemId: savedRow.id,
      jobId,
      fields: safeFields,
      storedRow: savedRow
    });

    savedProvenance.push(...itemProvenance);
savedSkills.matched.push(savedRow);

for (const field of lowConfidenceFields) {
  savedSkills.reviewCandidates.push({
    itemType: 'candidate_skills',
    itemId: savedRow.id,
    fieldName: field.fieldName,
    value: field.value,
    confidence: field.confidence,
    evidence: field.evidence
  });
}
  }

  for (const item of skills.unknown) {
    const { skillName, confidence, evidence } = item;

    const result = await client.query(
      `INSERT INTO unknown_skills (
        candidate_id,
        skill_name,
        source_file_id,
        confidence,
        evidence,
        status,
        created_at
      )
      SELECT $1::integer, $2::varchar, $3::integer, $4::float, $5::text, 'pending', CURRENT_TIMESTAMP
      WHERE NOT EXISTS (
        SELECT 1 FROM unknown_skills
        WHERE candidate_id = $1
          AND source_file_id = $3
          AND LOWER(skill_name) = LOWER($2)
      )
      RETURNING *`,
      [candidateId, skillName, fileId, confidence ?? null, evidence]
    );

    if (result.rows.length > 0) {
      const unknownSkill = result.rows[0];

      savedSkills.unknown.push(unknownSkill);

      await client.query(
        `INSERT INTO human_reviews (
       candidate_id,
       review_target_type,
       item_id,
       review_reason,
       review_status,
       created_at
     )
     VALUES ($1, 'unknown_skill', $2, 'unknown_skill', 'pending', CURRENT_TIMESTAMP)`,
        [candidateId, unknownSkill.id]
      );
    }
  }

  return { savedSkills, savedProvenance };
}

const PROVENANCE_TABLES = {
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
};
function isSameStoredValue(itemType, fieldName, storedValue, extractedValue) {
  if (itemType === 'candidate_links' && fieldName === 'url') {
    return (
      normalizeUrlForStorage(storedValue) ===
      normalizeUrlForStorage(extractedValue)
    );
  }

  if (storedValue === null || storedValue === undefined) {
    return extractedValue === null || extractedValue === undefined;
  }

  if (extractedValue === null || extractedValue === undefined) {
    return false;
  }

  return (
    storedValue === extractedValue ||
    String(storedValue) === String(extractedValue)
  );
}
async function saveProvenance(
  client,
  { candidateId, itemType, itemId, jobId, fields, storedRow }
) {
  const tableName = PROVENANCE_TABLES[itemType];

  if (!tableName) {
    throw new Error(`Unsupported provenance item type: ${itemType}`);
  }

  if (!storedRow || typeof storedRow !== 'object') {
    throw new Error('Stored database row is required for provenance.');
  }
  if (String(storedRow.id) !== String(itemId)) {
    throw new Error('Stored row ID does not match itemId.');
  }
  const savedProvenance = [];

  for (const [fieldName, wrapper] of Object.entries(fields)) {
    // Skip fields that have no extracted value.
    if (
      !wrapper ||
      typeof wrapper !== 'object' ||
      !Object.prototype.hasOwnProperty.call(wrapper, 'value')
    ) {
      throw new TypeError(
        `Invalid field wrapper for ${itemType}.${fieldName}.`
      );
    }

    if (wrapper.value === null || wrapper.value === undefined) {
      continue;
    }
    if (
      !isSameStoredValue(
        itemType,
        fieldName,
        storedRow[fieldName],
        wrapper.value
      )
    ) {
      continue;
    }

    if (
      typeof wrapper.confidence !== 'number' ||
      !Number.isFinite(wrapper.confidence) ||
      wrapper.confidence < 0 ||
      wrapper.confidence > 1 ||
      typeof wrapper.evidence !== 'string' ||
      !wrapper.evidence.trim()
    ) {
      throw new Error(`Invalid provenance data for ${itemType}.${fieldName}.`);
    }

    const provenanceResult = await client.query(
      `INSERT INTO data_provenance (
        candidate_id,
        item_type,
        item_id,
        field_name,
        resolution_method,
        approved_at
      )
      VALUES ($1, $2, $3, $4, 'no_conflict', CURRENT_TIMESTAMP)
      ON CONFLICT (item_type, item_id, field_name)
      DO NOTHING
      RETURNING *`,
      [candidateId, itemType, String(itemId), fieldName]
    );

    let provenanceId = provenanceResult.rows[0]?.id;

    if (!provenanceId) {
      const existingResult = await client.query(
        `SELECT id
         FROM data_provenance
         WHERE item_type = $1
           AND item_id = $2
           AND field_name = $3`,
        [itemType, String(itemId), fieldName]
      );

      provenanceId = existingResult.rows[0]?.id;

      if (!provenanceId) {
        throw new Error(
          `Failed to retrieve provenance for ${itemType}.${fieldName}.`
        );
      }
    }

    await client.query(
      `INSERT INTO data_provenance_sources (
        provenance_id,
        job_id,
        source_value,
        confidence,
        evidence
      )
      VALUES ($1, $2, $3::jsonb, $4, $5)
      ON CONFLICT (provenance_id, job_id)
      DO UPDATE SET
        source_value = EXCLUDED.source_value,
        confidence = EXCLUDED.confidence,
        evidence = EXCLUDED.evidence`,
      [
        provenanceId,
        jobId,
        JSON.stringify(wrapper.value),
        wrapper.confidence,
        wrapper.evidence
      ]
    );

    savedProvenance.push({
      provenanceId,
      fieldName
    });
  }

  return savedProvenance;
}
function validateMappedItems(items, itemType) {
  if (!Array.isArray(items)) {
    throw new TypeError(`${itemType} must be an array.`);
  }

  const sourceIndexes = new Set();

  for (const item of items) {
    if (!item || typeof item !== 'object') {
      throw new TypeError(`Invalid ${itemType} item.`);
    }

    if (!Number.isInteger(item.sourceIndex) || item.sourceIndex < 0) {
      throw new TypeError(`Invalid sourceIndex in ${itemType}.`);
    }

    if (
      !item.fields ||
      typeof item.fields !== 'object' ||
      Array.isArray(item.fields)
    ) {
      throw new TypeError(`Invalid fields in ${itemType}.`);
    }
    for (const [fieldName, wrapper] of Object.entries(item.fields)) {
      if (
        !wrapper ||
        typeof wrapper !== 'object' ||
        Array.isArray(wrapper) ||
        !Object.prototype.hasOwnProperty.call(wrapper, 'value')
      ) {
        throw new TypeError(`Invalid field wrapper: ${itemType}.${fieldName}.`);
      }
      const value = wrapper.value;

      if (
        value !== null &&
        (!['string', 'number', 'boolean'].includes(typeof value) ||
          (typeof value === 'number' && !Number.isFinite(value)))
      ) {
        throw new TypeError(`Invalid field value: ${itemType}.${fieldName}.`);
      }
    }

    if (sourceIndexes.has(item.sourceIndex)) {
      throw new Error(`Duplicate sourceIndex in ${itemType}.`);
    }

    sourceIndexes.add(item.sourceIndex);
  }
}

function validateMappedSkills(skills) {
  if (!skills || typeof skills !== 'object' || Array.isArray(skills)) {
    throw new TypeError('mappedData.skills must be an object.');
  }

  if (!Array.isArray(skills.matched)) {
    throw new TypeError('mappedData.skills.matched must be an array.');
  }

  if (!Array.isArray(skills.unknown)) {
    throw new TypeError('mappedData.skills.unknown must be an array.');
  }

  for (const item of skills.matched) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new TypeError('Invalid matched skill item.');
    }

    if (!Number.isInteger(item.sourceIndex) || item.sourceIndex < 0) {
      throw new TypeError('Invalid sourceIndex in matched skills.');
    }

    if (!Number.isInteger(item.skillId) || item.skillId <= 0) {
      throw new TypeError('skillId must be a positive integer.');
    }

    if (
      !item.fields ||
      typeof item.fields !== 'object' ||
      Array.isArray(item.fields)
    ) {
      throw new TypeError('Invalid fields in matched skills.');
    }

    for (const [fieldName, wrapper] of Object.entries(item.fields)) {
      if (
        !wrapper ||
        typeof wrapper !== 'object' ||
        Array.isArray(wrapper) ||
        !Object.prototype.hasOwnProperty.call(wrapper, 'value')
      ) {
        throw new TypeError(
          `Invalid field wrapper: candidate_skills.${fieldName}.`
        );
      }
      const value = wrapper.value;

      if (
        value !== null &&
        (!['string', 'number', 'boolean'].includes(typeof value) ||
          (typeof value === 'number' && !Number.isFinite(value)))
      ) {
        throw new TypeError(
          `Invalid field value: candidate_skills.${fieldName}.`
        );
      }
    }
  }

  for (const item of skills.unknown) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new TypeError('Invalid unknown skill item.');
    }

    if (!Number.isInteger(item.sourceIndex) || item.sourceIndex < 0) {
      throw new TypeError('Invalid sourceIndex in unknown skills.');
    }

    if (typeof item.skillName !== 'string' || !item.skillName.trim()) {
      throw new TypeError('Invalid skillName in unknown skills.');
    }

    if (typeof item.evidence !== 'string' || !item.evidence.trim()) {
      throw new TypeError('Invalid evidence in unknown skills.');
    }

    if (
      item.confidence !== null &&
      item.confidence !== undefined &&
      (typeof item.confidence !== 'number' ||
        item.confidence < 0 ||
        item.confidence > 1 ||
        !Number.isFinite(item.confidence))
    ) {
      throw new TypeError('Invalid confidence in unknown skills.');
    }
  }
}
function mergeItemsByDeduplicationKey(itemType, items) {
  const groups = new Map();

  for (const item of items) {
    const key = buildDeduplicationKey(itemType, item.fields);

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(item);
  }

  const mergedItems = [];

  for (const group of groups.values()) {
    if (group.length === 1) {
      mergedItems.push(group[0]);
      continue;
    }

    const merged = mergeDuplicateItems(itemType, ...group);

    mergedItems.push({
      sourceIndex: merged.sourceIndexes[0],
      fields: merged.fields,
      fieldSources: merged.fieldSources,
      reviewFields: merged.reviewFields,
      sourceIndexes: merged.sourceIndexes,
      deduplicationKey: merged.deduplicationKey
    });
  }

  return mergedItems;
}

/**
 * Writes extracted candidate data within one database transaction.
 *
 * @param {Object} params
 * @param {number} params.userId
 * @param {number} params.jobId
 * @param {Object} params.mappedData
 * @param {Array} [params.reviewItems]
 * @param {Object} params.extraction
 * @param {Array} [params.skillResolutions]
 */
async function writeExtraction({
  userId,
  jobId,
  mappedData,
  reviewItems = [],
  confidenceThreshold = 0.5
}) {
  // Validate input before acquiring a database connection.
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new TypeError('userId must be a positive integer.');
  }

  if (!Number.isInteger(jobId) || jobId <= 0) {
    throw new TypeError('jobId must be a positive integer.');
  }
  if (
    typeof confidenceThreshold !== 'number' ||
    !Number.isFinite(confidenceThreshold) ||
    confidenceThreshold < 0 ||
    confidenceThreshold > 1
  ) {
    throw new TypeError(
      'confidenceThreshold must be a number between 0 and 1.'
    );
  }

  if (!mappedData || typeof mappedData !== 'object') {
    throw new TypeError('mappedData must be an object.');
  }
  if (
    mappedData.profile !== undefined &&
    (mappedData.profile === null ||
      typeof mappedData.profile !== 'object' ||
      Array.isArray(mappedData.profile))
  ) {
    throw new TypeError('mappedData.profile must be an object.');
  }
  if (
    mappedData.items !== undefined &&
    (!mappedData.items ||
      typeof mappedData.items !== 'object' ||
      Array.isArray(mappedData.items))
  ) {
    throw new TypeError('mappedData.items must be an object.');
  }

  if (!Array.isArray(reviewItems)) {
    throw new TypeError('reviewItems must be an array.');
  }

  const items = mappedData.items ?? {};

  const itemTypes = [
    'education',
    'work_experience',
    'certifications',
    'projects',
    'awards',
    'publications',
    'volunteering',
    'languages',
    'links'
  ];

  for (const itemType of itemTypes) {
    validateMappedItems(
      items[itemType] === undefined ? [] : items[itemType],
      itemType
    );
  }
  const allowedItemTypes = new Set(itemTypes);

  for (const itemType of Object.keys(items)) {
    if (!allowedItemTypes.has(itemType)) {
      throw new Error(`Unsupported item type: ${itemType}`);
    }
  }

  if (mappedData.skills !== undefined) {
    validateMappedSkills(mappedData.skills);
  }

  const client = await pool.connect();
  let transactionStarted = false;
  let releaseError = null;
  try {
    await client.query('BEGIN');
    transactionStarted = true;

    // Verify that the processing job belongs to the given user.
    const result = await client.query(
      `SELECT
         cp.id AS candidate_id,
         pj.id AS job_id,
         uf.id AS file_id
       FROM users u
       JOIN candidate_profiles cp
         ON cp.user_id = u.id
       JOIN uploaded_files uf
         ON uf.candidate_id = cp.id
       JOIN processing_jobs pj
         ON pj.file_id = uf.id
       WHERE u.id = $1
         AND pj.id = $2`,
      [userId, jobId]
    );

    if (result.rows.length === 0) {
      throw new Error('Processing job does not belong to the given user.');
    }

    const { candidate_id: candidateId, file_id: fileId } = result.rows[0];

    const processing = mappedData.processing ?? {};

    if (typeof processing !== 'object' || Array.isArray(processing)) {
      throw new TypeError('mappedData.processing must be an object.');
    }

    if (
      processing.document_language !== undefined &&
      processing.document_language !== null &&
      typeof processing.document_language !== 'string'
    ) {
      throw new TypeError('document_language must be a string or null.');
    }

    if (
      processing.extraction_warnings !== undefined &&
      processing.extraction_warnings !== null &&
      (!Array.isArray(processing.extraction_warnings) ||
        !processing.extraction_warnings.every(
          (warning) => typeof warning === 'string'
        ))
    ) {
      throw new TypeError(
        'extraction_warnings must be an array of strings or null.'
      );
    }
    await client.query(
      `UPDATE processing_jobs
   SET document_language = $1,
       extraction_warnings = $2
   WHERE id = $3`,
      [
        processing.document_language ?? null,
        processing.extraction_warnings == null
          ? null
          : JSON.stringify(processing.extraction_warnings),
        jobId
      ]
    );

    // Update only empty candidate profile fields.
    const allowedProfileFields = new Set([
      'first_name',
      'last_name',
      'headline',
      'summary',
      'phone',
      'industry',
      'profession',
      'city',
      'country_code'
    ]);

    const profile = mappedData.profile || {};

    const profileFields = Object.entries(profile).filter(
      ([fieldName, wrapper]) => {
        if (!allowedProfileFields.has(fieldName)) {
          throw new Error(`Unsupported profile field: ${fieldName}`);
        }

        if (
          !wrapper ||
          typeof wrapper !== 'object' ||
          !Object.prototype.hasOwnProperty.call(wrapper, 'value')
        ) {
          throw new TypeError(`Invalid profile wrapper: ${fieldName}`);
        }
        const value = wrapper.value;

        if (value !== null && typeof value !== 'string') {
          throw new TypeError(`Invalid profile value: ${fieldName}`);
        }

        return (
          wrapper.value !== null &&
          wrapper.value !== undefined &&
          wrapper.value.trim() !== ''
        );
      }
    );
    let profileResult;
    if (profileFields.length > 0) {
      const values = profileFields.map(([, wrapper]) => wrapper.value);

      const assignments = profileFields.map(
        ([fieldName], index) =>
          `${fieldName} = COALESCE(${fieldName}, $${index + 1})`
      );

      profileResult = await client.query(
        `UPDATE candidate_profiles
   SET ${assignments.join(', ')},
       updated_at = CURRENT_TIMESTAMP
   WHERE id = $${values.length + 1}
   RETURNING *`,
        [...values, candidateId]
      );
    }

    let storedProfileRow;

    if (profileFields.length > 0) {
      storedProfileRow = profileResult.rows[0];
    } else {
      const profileResult = await client.query(
        `SELECT *
     FROM candidate_profiles
     WHERE id = $1`,
        [candidateId]
      );

      storedProfileRow = profileResult.rows[0];
    }

    if (!storedProfileRow) {
      throw new Error('Candidate profile was not found.');
    }

    const savedProfileProvenance = await saveProvenance(client, {
      candidateId,
      itemType: 'candidate_profile',
      itemId: candidateId,
      jobId,
      fields: profile,
      storedRow: storedProfileRow
    });

    const educationItems = mergeItemsByDeduplicationKey(
      'education',
      mappedData.items?.education ?? []
    );

    const workExperienceItems = mergeItemsByDeduplicationKey(
      'work_experience',
      mappedData.items?.work_experience ?? []
    );

    const certificationItems = mergeItemsByDeduplicationKey(
      'certifications',
      mappedData.items?.certifications ?? []
    );

    const projectItems = mergeItemsByDeduplicationKey(
      'projects',
      mappedData.items?.projects ?? []
    );

    const awardItems = mergeItemsByDeduplicationKey(
      'awards',
      mappedData.items?.awards ?? []
    );

    const publicationItems = mergeItemsByDeduplicationKey(
      'publications',
      mappedData.items?.publications ?? []
    );

    const volunteeringItems = mergeItemsByDeduplicationKey(
      'volunteering',
      mappedData.items?.volunteering ?? []
    );

    const languageItems = mergeItemsByDeduplicationKey(
      'languages',
      mappedData.items?.languages ?? []
    );

    const linkItems = mergeItemsByDeduplicationKey(
      'links',
      mappedData.items?.links ?? []
    );

    const savedEducationItems = await saveEducation(
      client,
      candidateId,
      educationItems
    );

    const savedWorkExperienceItems = await saveWorkExperience(
      client,
      candidateId,
      workExperienceItems
    );
    const savedCertificationItems = await saveCertifications(
      client,
      candidateId,
      certificationItems
    );
    const savedProjectItems = await saveProjects(
      client,
      candidateId,
      projectItems
    );
    const savedAwardItems = await saveAwards(client, candidateId, awardItems);
    const savedPublicationItems = await savePublications(
      client,
      candidateId,
      publicationItems
    );
    const savedVolunteeringItems = await saveVolunteering(
      client,
      candidateId,
      volunteeringItems
    );
    const savedLanguageItems = await saveLanguages(
      client,
      candidateId,
      languageItems
    );
    const savedLinks = await saveLinks(client, candidateId, linkItems);
    const savedProvenance = [...savedProfileProvenance];
    let savedSkills = { matched: [], unknown: [], reviewCandidates: [] };

if (mappedData.skills) {
  const result = await saveSkills(client, {
    candidateId,
    fileId,
    jobId,
    skills: mappedData.skills,
    confidenceThreshold
  });

  savedSkills = result.savedSkills;
  savedProvenance.push(...result.savedProvenance);
}

    const allSavedItems = [
      ...savedEducationItems,
      ...savedWorkExperienceItems,
      ...savedCertificationItems,
      ...savedProjectItems,
      ...savedAwardItems,
      ...savedPublicationItems,
      ...savedVolunteeringItems,
      ...savedLanguageItems,
      ...savedLinks
    ];
    const reviewCandidates = allSavedItems.flatMap((item) => {
      const reviewFields = item.reviewFields ?? {};

      return Object.entries(reviewFields).map(([fieldName, conflict]) => ({
        itemType: item.itemType,
        itemId: item.itemId,
        deduplicationKey: item.deduplicationKey,
        fieldName,
        values: conflict.values
      }));
    });

    const lowConfidenceReviewCandidates = allSavedItems.flatMap((item) => {
      const fields = item.fields ?? {};
      const reviewFields = item.reviewFields ?? {};

      return Object.entries(fields)
        .filter(([fieldName, wrapper]) => {
          return (
            wrapper?.value !== null &&
            wrapper?.value !== undefined &&
            typeof wrapper.confidence === 'number' &&
            wrapper.confidence < confidenceThreshold &&
            typeof wrapper.evidence === 'string' &&
            wrapper.evidence.trim() !== '' &&
            !Object.hasOwn(reviewFields, fieldName)
          );
        })
        .map(([fieldName, wrapper]) => ({
          itemType: item.itemType,
          itemId: item.itemId,
          fieldName,
          value: wrapper.value,
          confidence: wrapper.confidence,
          evidence: wrapper.evidence
        }));
    });

    const normalizedReviewItems = [
      ...savedSkills.reviewCandidates.map((reviewCandidate) =>
  createReviewItem({
    targetType: 'conflict',
    candidateId,
    reviewReason: 'low_confidence',
    itemType: reviewCandidate.itemType,
    itemId: reviewCandidate.itemId,
    fieldName: reviewCandidate.fieldName,
    options: [
      {
        value: reviewCandidate.value,
        sourceFileId: fileId,
        confidence: reviewCandidate.confidence,
        evidence: reviewCandidate.evidence
      }
    ]
  })
),
      ...reviewCandidates.map((reviewCandidate) =>
        createReviewItem({
          targetType: 'conflict',
          candidateId,
          reviewReason: 'intra_source_conflict',
          itemType: reviewCandidate.itemType,
          itemId: reviewCandidate.itemId,
          fieldName: reviewCandidate.fieldName,
          options: reviewCandidate.values.map(({ wrapper }) => ({
            value: wrapper.value,
            sourceFileId: fileId,
            confidence: wrapper.confidence,
            evidence: wrapper.evidence
          }))
        })
      ),
      ...lowConfidenceReviewCandidates.map((candidate) =>
        createReviewItem({
          targetType: 'conflict',
          candidateId,
          reviewReason: 'low_confidence',
          itemType: candidate.itemType,
          itemId: candidate.itemId,
          fieldName: candidate.fieldName,
          options: [
            {
              value: candidate.value,
              sourceFileId: fileId,
              confidence: candidate.confidence,
              evidence: candidate.evidence
            }
          ]
        })
      ),
      ...reviewItems.map((reviewItem) =>
        createReviewItem({
          ...reviewItem,
          candidateId,
          itemId:
            reviewItem.itemType === 'candidate_profile'
              ? String(candidateId)
              : reviewItem.itemId,
          options: reviewItem.options?.map((option) => ({
            ...option,
            sourceFileId: option.sourceFileId ?? fileId
          }))
        })
      )
    ];

    let pendingReviewCount = 0;

    for (const reviewItem of normalizedReviewItems) {
      // Check whether a pending conflict already exists.
      const existingConflictResult = await client.query(
        `SELECT id
     FROM conflicts
     WHERE candidate_id = $1
       AND item_type = $2
       AND item_id = $3
       AND field_name = $4
       AND status = 'pending'
     ORDER BY id
     LIMIT 1
     FOR UPDATE`,
        [
          reviewItem.candidateId,
          reviewItem.itemType,
          reviewItem.itemId,
          reviewItem.fieldName
        ]
      );

      let conflictId;
      const existingConflict = existingConflictResult.rows[0];

      if (existingConflict) {
        // Reuse the existing pending conflict.
        conflictId = existingConflict.id;
      } else {
        // Create a new conflict.
        const conflictResult = await client.query(
          `INSERT INTO conflicts (
         candidate_id,
         item_type,
         item_id,
         field_name,
         status
       )
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING id`,
          [
            reviewItem.candidateId,
            reviewItem.itemType,
            reviewItem.itemId,
            reviewItem.fieldName
          ]
        );

        conflictId = conflictResult.rows[0].id;

        // Create one human review for the new conflict.
        await client.query(
          `INSERT INTO human_reviews (
         candidate_id,
         review_target_type,
         item_id,
         review_reason,
         review_status,
         created_at
       )
       VALUES ($1, 'conflict', $2, $3, 'pending', CURRENT_TIMESTAMP)`,
          [reviewItem.candidateId, conflictId, reviewItem.reviewReason]
        );

        pendingReviewCount += 1;
      }

      // Add the new options to the conflict (new or existing).
      for (const option of reviewItem.options) {
        await client.query(
          `INSERT INTO conflict_options (
         conflict_id,
         value,
         source_file_id,
         confidence,
         evidence
       )
       VALUES ($1, $2, $3, $4, $5)`,
          [
            conflictId,
            JSON.stringify(option.value),
            option.sourceFileId,
            option.confidence,
            option.evidence
          ]
        );
      }
    }

    for (const item of allSavedItems) {
      const itemProvenance = await saveProvenance(client, {
        candidateId,
        itemType: item.itemType,
        itemId: item.itemId,
        jobId,
        fields: item.fields,
        storedRow: item.storedRow
      });

      savedProvenance.push(...itemProvenance);
    }

    pendingReviewCount += savedSkills.unknown.length;

    await client.query('COMMIT');
    transactionStarted = false;

    return {
      candidateId,
      jobId,
      education: savedEducationItems,
      work_experience: savedWorkExperienceItems,
      certifications: savedCertificationItems,
      projects: savedProjectItems,
      awards: savedAwardItems,
      publications: savedPublicationItems,
      volunteering: savedVolunteeringItems,
      languages: savedLanguageItems,
      links: savedLinks,
      skills: savedSkills,
      provenance: savedProvenance,
      reviewCandidates,
      pendingReviewCount
    };
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
        releaseError = rollbackError;
      }
    }

    throw error;
  } finally {
    client.release(releaseError);
  }
}

module.exports = {
  writeExtraction
};
