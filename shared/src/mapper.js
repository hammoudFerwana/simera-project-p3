/**
 * Maps validated extraction data into a storage-friendly structure.
 *
 * @param {Object} validatedExtraction - Validated extraction data.
 * @returns {Object} Mapped data for the storage pipeline.
 */
function mapExtractionToStorage(validatedExtraction) {
  if (!validatedExtraction || typeof validatedExtraction !== 'object') {
    throw new TypeError('Validated extraction must be an object.');
  }

  const { meta, candidate } = validatedExtraction;
  const mapItems = (items, excludedFields = []) =>
    items.map((item, index) => ({
        sourceIndex: index,
        fields: Object.fromEntries(
             Object.entries(item)
             .filter(([fieldName]) => !excludedFields.includes(fieldName))
            .map(([fieldName, wrapper]) => [
                fieldName,
                { ...wrapper }
            ])
         )
    }));


  return {
    processing: {
      document_language: meta.document_language,
      extraction_warnings: meta.extraction_warnings
    },

    profile: Object.fromEntries(
        Object.entries(candidate).map(([fieldName, wrapper]) => [
            fieldName,
            { ...wrapper }
        ])
    ),

    items: {
      work_experience: mapItems(validatedExtraction.work_experience, [
        'duration_months'
      ]),
      education: mapItems(validatedExtraction.education),
      languages: mapItems(validatedExtraction.languages),
      links: mapItems(validatedExtraction.links),
      certifications: mapItems(validatedExtraction.certifications),
      projects: mapItems(validatedExtraction.projects),
      awards: mapItems(validatedExtraction.awards),
      publications: mapItems(validatedExtraction.publications),
      volunteering: mapItems(validatedExtraction.volunteering)
    }
  };
}

module.exports = { mapExtractionToStorage };