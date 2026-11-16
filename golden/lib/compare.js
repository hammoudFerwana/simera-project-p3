const {
  calculateExperienceMonths,
  parseDate
} = require('../../shared/src/experience');

const DATE_FIELDS = new Set([
  'start_date',
  'end_date',
  'issue_date',
  'expiration_date',
  'award_date',
  'publication_date'
]);

function normalizeString(val) {
  if (val === null || val === undefined) return '';
  return String(val).trim().replace(/\s+/g, ' ');
}

function compareDates(expected, actual) {
  if (expected === actual) return true;
  if (!expected && !actual) return true;
  if (!expected || !actual) return false;

  const expNorm = normalizeString(expected);
  const actNorm = normalizeString(actual);
  if (expNorm === actNorm) return true;

  const expParsed = parseDate(expNorm);
  const actParsed = parseDate(actNorm);
  if (!expParsed || !actParsed) {
    return expNorm.toLowerCase() === actNorm.toLowerCase();
  }

  if (expParsed.year !== actParsed.year) return false;
  if (expParsed.month !== null) {
    if (actParsed.month === null) return false;
    if (expParsed.month !== actParsed.month) return false;
  }
  if (expParsed.day !== null) {
    if (actParsed.day === null) return false;
    if (expParsed.day !== actParsed.day) return false;
  }
  return true;
}

function compareValues(expected, actual, fieldName) {
  if (expected === null || expected === undefined) {
    return actual === null || actual === undefined;
  }
  if (actual === null || actual === undefined) {
    return false;
  }

  if (DATE_FIELDS.has(fieldName)) {
    return compareDates(expected, actual);
  }

  if (typeof expected === 'boolean') {
    return Boolean(actual) === expected;
  }

  if (typeof expected === 'number') {
    return Number(actual) === expected;
  }

  // String comparison: case-insensitive, normalized whitespace
  return (
    normalizeString(expected).toLowerCase() ===
    normalizeString(actual).toLowerCase()
  );
}

function unwrapValue(fieldViewOrVal) {
  if (
    fieldViewOrVal &&
    typeof fieldViewOrVal === 'object' &&
    'value' in fieldViewOrVal
  ) {
    return fieldViewOrVal.value;
  }
  return fieldViewOrVal;
}

/**
 * Compares stored profile from getCandidateProfile with expected JSON.
 */
function compareStoredWithExpected(storedProfile, expected) {
  const result = {
    matched: 0,
    compared: 0,
    sections: {},
    dateMatched: 0,
    dateCompared: 0,
    fieldDetails: [],
    experienceMonths: {
      expected: expected.experienceMonths ?? null,
      actual: null,
      matches: null
    }
  };

  function recordField(section, fieldName, expectedVal, actualVal) {
    const isDate = DATE_FIELDS.has(fieldName);
    const matches = compareValues(expectedVal, actualVal, fieldName);

    result.compared += 1;
    if (matches) result.matched += 1;

    if (!result.sections[section]) {
      result.sections[section] = { compared: 0, matched: 0 };
    }
    result.sections[section].compared += 1;
    if (matches) result.sections[section].matched += 1;

    if (isDate) {
      result.dateCompared += 1;
      if (matches) result.dateMatched += 1;
    }

    result.fieldDetails.push({
      section,
      field: fieldName,
      expected: expectedVal,
      actual: actualVal,
      matches
    });
  }

  if (!storedProfile) {
    return result;
  }

  // 1. Candidate section
  if (expected.candidate && typeof expected.candidate === 'object') {
    const storedCand = storedProfile.profile || {};
    for (const [key, expectedVal] of Object.entries(expected.candidate)) {
      if (expectedVal !== undefined) {
        const actualVal = unwrapValue(storedCand[key]);
        recordField('candidate', key, expectedVal, actualVal);
      }
    }
  }

  // 2. Work Experience section
  if (Array.isArray(expected.work_experience)) {
    const storedJobs = (storedProfile.sections?.work_experience || []).map(
      (j) => {
        const plain = {};
        if (j.fields) {
          for (const [k, v] of Object.entries(j.fields)) {
            plain[k] = unwrapValue(v);
          }
        }
        return plain;
      }
    );

    for (const expJob of expected.work_experience) {
      // Find matching stored job by company_name
      const expCompany = normalizeString(expJob.company_name).toLowerCase();
      const match = storedJobs.find(
        (sj) => normalizeString(sj.company_name).toLowerCase() === expCompany
      );

      for (const [key, expectedVal] of Object.entries(expJob)) {
        if (expectedVal !== undefined) {
          const actualVal = match ? match[key] : null;
          recordField('work_experience', key, expectedVal, actualVal);
        }
      }
    }

    // Experience months check
    if (
      expected.experienceMonths !== undefined &&
      expected.experienceMonths !== null
    ) {
      const calcResult = calculateExperienceMonths(storedJobs);
      result.experienceMonths.actual = calcResult.totalMonths;
      result.experienceMonths.matches =
        calcResult.totalMonths === expected.experienceMonths;
    }
  }

  // 3. Education section
  if (Array.isArray(expected.education)) {
    const storedEdu = (storedProfile.sections?.education || []).map((e) => {
      const plain = {};
      if (e.fields) {
        for (const [k, v] of Object.entries(e.fields)) {
          plain[k] = unwrapValue(v);
        }
      }
      return plain;
    });

    for (const expEdu of expected.education) {
      const expInst = normalizeString(expEdu.institution_name).toLowerCase();
      const match = storedEdu.find(
        (se) => normalizeString(se.institution_name).toLowerCase() === expInst
      );

      for (const [key, expectedVal] of Object.entries(expEdu)) {
        if (expectedVal !== undefined) {
          const actualVal = match ? match[key] : null;
          recordField('education', key, expectedVal, actualVal);
        }
      }
    }
  }

  // 4. Skills section
  if (Array.isArray(expected.skills)) {
    const storedSkills = (storedProfile.sections?.skills || []).map((s) =>
      normalizeString(
        s.skillName || unwrapValue(s.fields?.skill_id)
      ).toLowerCase()
    );

    for (const expSkill of expected.skills) {
      const expNorm = normalizeString(expSkill).toLowerCase();
      const matches = storedSkills.includes(expNorm);
      result.compared += 1;
      if (matches) result.matched += 1;

      if (!result.sections.skills) {
        result.sections.skills = { compared: 0, matched: 0 };
      }
      result.sections.skills.compared += 1;
      if (matches) result.sections.skills.matched += 1;

      result.fieldDetails.push({
        section: 'skills',
        field: expSkill,
        expected: expSkill,
        actual: matches ? expSkill : null,
        matches
      });
    }
  }

  // 5. Languages section
  if (Array.isArray(expected.languages)) {
    const storedLangs = (storedProfile.sections?.languages || []).map((l) => {
      const plain = {};
      if (l.fields) {
        for (const [k, v] of Object.entries(l.fields)) {
          plain[k] = unwrapValue(v);
        }
      }
      return plain;
    });

    for (const expLang of expected.languages) {
      const expName = normalizeString(expLang.language).toLowerCase();
      const match = storedLangs.find(
        (sl) => normalizeString(sl.language).toLowerCase() === expName
      );

      for (const [key, expectedVal] of Object.entries(expLang)) {
        if (expectedVal !== undefined) {
          const actualVal = match ? match[key] : null;
          recordField('languages', key, expectedVal, actualVal);
        }
      }
    }
  }

  // 6. Projects section
  if (Array.isArray(expected.projects)) {
    const storedProj = (storedProfile.sections?.projects || []).map((p) => {
      const plain = {};
      if (p.fields) {
        for (const [k, v] of Object.entries(p.fields)) {
          plain[k] = unwrapValue(v);
        }
      }
      return plain;
    });

    for (const expProj of expected.projects) {
      const expName = normalizeString(expProj.name).toLowerCase();
      const match = storedProj.find(
        (sp) => normalizeString(sp.name).toLowerCase() === expName
      );

      for (const [key, expectedVal] of Object.entries(expProj)) {
        if (expectedVal !== undefined) {
          const actualVal = match ? match[key] : null;
          recordField('projects', key, expectedVal, actualVal);
        }
      }
    }
  }

  return result;
}

function calculateRate(matched, total) {
  if (!total || total === 0) return 0;
  return Number(((matched / total) * 100).toFixed(2));
}

module.exports = {
  compareValues,
  compareDates,
  compareStoredWithExpected,
  calculateRate,
  normalizeString
};
