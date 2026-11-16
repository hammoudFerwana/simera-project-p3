/**
 * Links extraction skills to their canonical names based on skill resolutions.
 * Pure function: returns a shallow copy of the extraction with updated skills,
 * leaving the original extraction and its skills unmutated.
 *
 * @param {object} extraction - validated extraction object
 * @param {Array<object>} [skillResolutions] - skill resolutions from US-13
 * @returns {object} copy of extraction with skills carrying canonical_name
 */
function withSkillNames(extraction, skillResolutions = []) {
  if (!extraction) {
    return extraction;
  }

  const resolutions = Array.isArray(skillResolutions) ? skillResolutions : [];

  const resolutionMap = new Map();
  for (const res of resolutions) {
    if (res && typeof res.index === 'number') {
      resolutionMap.set(res.index, res);
    }
  }

  const skills = (extraction.skills || []).map((skill, i) => {
    const res = resolutionMap.has(i) ? resolutionMap.get(i) : resolutions[i];
    const canonicalName =
      res && res.status === 'matched' && res.canonicalName
        ? res.canonicalName
        : null;

    return {
      ...skill,
      canonical_name: canonicalName
    };
  });

  return {
    ...extraction,
    skills
  };
}

module.exports = {
  withSkillNames
};
