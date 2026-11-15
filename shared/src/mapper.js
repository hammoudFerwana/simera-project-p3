/**
 * Maps validated extraction data into a storage-friendly structure.
 *
 * @param {Object} validatedExtraction - Validated extraction data.
 * @param {Array} failedChecks - Fields that failed code validation.
 * @param {Array} skillResolutions - Normalization resolutions for extracted skills.
 * @returns {Object} Mapped data for the storage pipeline.
 */
function mapExtractionToStorage(
  validatedExtraction,
  failedChecks = [],
  skillResolutions = []
) {
  if (!validatedExtraction || typeof validatedExtraction !== 'object') {
    throw new TypeError('Validated extraction must be an object.');
  }

  if (!Array.isArray(failedChecks)) {
    throw new TypeError('failedChecks must be an array.');
  }

  if (!Array.isArray(skillResolutions)) {
    throw new TypeError('skillResolutions must be an array.');
  }

  const { meta, candidate } = validatedExtraction;

  const isFailedField = (section, index, fieldName) =>
    failedChecks.some(
      (check) =>
        check.section === section &&
        check.index === index &&
        check.field === fieldName
    );

  const hasValue = (fields, fieldName) => {
    const value = fields[fieldName]?.value;

    return (
      value !== null &&
      value !== undefined &&
      (typeof value !== 'string' || value.trim() !== '')
    );
  };

  const requiredFields = {
    work_experience: ['job_title', 'company_name'],
    education: ['institution_name'],
    certifications: ['name'],
    projects: ['name'],
    awards: ['name'],
    publications: ['title'],
    languages: ['language'],
    links: ['url']
  };

  const mapItems = (items, section, excludedFields = []) => {
    if (!Array.isArray(items)) {
      return [];
    }

    return items
      .map((item, index) => {
        const fields = Object.fromEntries(
          Object.entries(item)
            .filter(
              ([fieldName]) =>
                !excludedFields.includes(fieldName) &&
                !isFailedField(section, index, fieldName)
            )
            .map(([fieldName, wrapper]) => [fieldName, { ...wrapper }])
        );

        const required = requiredFields[section] || [];

        const hasRequiredFields = required.every((fieldName) =>
          hasValue(fields, fieldName)
        );

        const hasVolunteeringValue =
          section !== 'volunteering' ||
          ['organization', 'role', 'start_date'].some((fieldName) =>
            hasValue(fields, fieldName)
          );

        if (!hasRequiredFields || !hasVolunteeringValue) {
          return null;
        }

        return {
          sourceIndex: index,
          fields
        };
      })
      .filter(Boolean);
  };

  const rawSkills = Array.isArray(validatedExtraction.skills)
    ? validatedExtraction.skills
    : [];

  const resolutionsByIndex = new Map();
  for (const res of skillResolutions) {
    if (res && typeof res === 'object' && Number.isInteger(res.index)) {
      resolutionsByIndex.set(res.index, res);
    }
  }

  const matchedBySkillId = new Map();
  const unknownSkills = [];

  for (let i = 0; i < rawSkills.length; i++) {
    const rawSkill = rawSkills[i];
    const resolution = resolutionsByIndex.get(i);

    if (!resolution || resolution.status === 'skipped') {
      continue;
    }

    if (isFailedField('skills', i, 'name')) {
      continue;
    }

    if (resolution.status === 'matched') {
      const skillId = resolution.skillId;
      const fields = {};

      fields.skill_id = {
        value: skillId,
        confidence: rawSkill.name?.confidence ?? null,
        evidence: rawSkill.name?.evidence ?? null
      };

      if (!isFailedField('skills', i, 'proficiency_level')) {
        if (rawSkill.proficiency_level) {
          fields.proficiency_level = { ...rawSkill.proficiency_level };
        } else {
          fields.proficiency_level = {
            value: null,
            confidence: null,
            evidence: null
          };
        }
      }

      if (!isFailedField('skills', i, 'stated_duration')) {
        const statedDuration = rawSkill.stated_duration;
        let months = null;
        if (
          statedDuration &&
          statedDuration.value &&
          typeof statedDuration.value === 'object'
        ) {
          const { amount, unit } = statedDuration.value;
          if (typeof amount === 'number' && Number.isFinite(amount)) {
            months = Math.round(unit === 'years' ? amount * 12 : amount);
          }
        }

        fields.months_of_experience = {
          value: months,
          confidence: statedDuration?.confidence ?? null,
          evidence: statedDuration?.evidence ?? null
        };
      }

      if (!matchedBySkillId.has(skillId)) {
        matchedBySkillId.set(skillId, {
          sourceIndex: i,
          skillId,
          fields
        });
      } else {
        const existing = matchedBySkillId.get(skillId);
        for (const fieldName of ['proficiency_level', 'months_of_experience']) {
          const existingWrapper = existing.fields[fieldName];
          const newWrapper = fields[fieldName];

          const isExistingEmpty =
            !existingWrapper ||
            existingWrapper.value === null ||
            existingWrapper.value === undefined;

          const isNewNonEmpty =
            newWrapper &&
            newWrapper.value !== null &&
            newWrapper.value !== undefined;

          if (isExistingEmpty && isNewNonEmpty) {
            existing.fields[fieldName] = newWrapper;
          }
        }
      }
    } else if (resolution.status === 'unknown') {
      unknownSkills.push({
        sourceIndex: i,
        skillName: rawSkill.name?.value,
        confidence: rawSkill.name?.confidence ?? null,
        evidence: rawSkill.name?.evidence ?? ''
      });
    }
  }

  return {
    processing: {
      document_language: meta.document_language,
      extraction_warnings: meta.extraction_warnings
    },

    profile: Object.fromEntries(
      Object.entries(candidate)
        .filter(([fieldName]) => !isFailedField('candidate', null, fieldName))
        .map(([fieldName, wrapper]) => [fieldName, { ...wrapper }])
    ),

    items: {
      work_experience: mapItems(
        validatedExtraction.work_experience,
        'work_experience',
        ['duration_months']
      ),
      education: mapItems(validatedExtraction.education, 'education'),
      languages: mapItems(validatedExtraction.languages, 'languages'),
      links: mapItems(validatedExtraction.links, 'links'),
      certifications: mapItems(
        validatedExtraction.certifications,
        'certifications'
      ),
      projects: mapItems(validatedExtraction.projects, 'projects'),
      awards: mapItems(validatedExtraction.awards, 'awards'),
      publications: mapItems(validatedExtraction.publications, 'publications'),
      volunteering: mapItems(validatedExtraction.volunteering, 'volunteering')
    },

    skills: {
      matched: Array.from(matchedBySkillId.values()),
      unknown: unknownSkills
    }
  };
}

module.exports = { mapExtractionToStorage };
