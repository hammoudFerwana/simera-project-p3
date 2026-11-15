/**
 * Maps validated extraction data into a storage-friendly structure.
 *
 * @param {Object} validatedExtraction - Validated extraction data.
 * @param {Array} failedChecks - Fields that failed code validation.
 * @returns {Object} Mapped data for the storage pipeline.
 */
function mapExtractionToStorage(validatedExtraction, failedChecks = []) {
  if (!validatedExtraction || typeof validatedExtraction !== 'object') {
    throw new TypeError('Validated extraction must be an object.');
  }

  if (!Array.isArray(failedChecks)) {
    throw new TypeError('failedChecks must be an array.');
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

  const mapItems = (items, section, excludedFields = []) =>
    items
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
    }
  };
}

module.exports = { mapExtractionToStorage };
