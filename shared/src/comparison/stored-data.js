const { isEmpty } = require('./normalize');

const CANDIDATE_FIELDS = [
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

/**
 * Loads the stored candidate data from the database for comparison.
 * Returns null if the candidate has no stored data at all (first file).
 *
 * @param {object} db - pg Pool or client
 * @param {number} candidateId - candidate profile ID
 * @returns {Promise<object | null>} stored candidate data or null
 */
async function loadStoredCandidate(db, candidateId) {
  if (!candidateId || !db) {
    return null;
  }

  const [
    profileResult,
    workExperienceResult,
    educationResult,
    certificationsResult,
    projectsResult,
    awardsResult,
    publicationsResult,
    volunteeringResult,
    languagesResult,
    linksResult,
    skillsResult
  ] = await Promise.all([
    db.query(
      `SELECT first_name, last_name, headline, summary, phone, industry, profession, city, country_code
       FROM candidate_profiles
       WHERE id = $1`,
      [candidateId]
    ),
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
      `SELECT cs.id, s.canonical_name, cs.proficiency_level, cs.months_of_experience
       FROM candidate_skills cs
       JOIN skills s ON s.id = cs.skill_id
       WHERE cs.candidate_id = $1
       ORDER BY cs.id ASC`,
      [candidateId]
    )
  ]);

  const profileRow = profileResult.rows[0];
  const workExperience = workExperienceResult.rows;
  const education = educationResult.rows;
  const certifications = certificationsResult.rows;
  const projects = projectsResult.rows;
  const awards = awardsResult.rows;
  const publications = publicationsResult.rows;
  const volunteering = volunteeringResult.rows;
  const languages = languagesResult.rows;
  const links = linksResult.rows;
  const skills = skillsResult.rows;

  const isProfileEmpty =
    !profileRow ||
    CANDIDATE_FIELDS.every((field) => isEmpty(profileRow[field]));

  const hasAnyItems =
    workExperience.length > 0 ||
    education.length > 0 ||
    certifications.length > 0 ||
    projects.length > 0 ||
    awards.length > 0 ||
    publications.length > 0 ||
    volunteering.length > 0 ||
    languages.length > 0 ||
    links.length > 0 ||
    skills.length > 0;

  if (isProfileEmpty && !hasAnyItems) {
    return null;
  }

  const candidate = {
    first_name: profileRow?.first_name ?? null,
    last_name: profileRow?.last_name ?? null,
    headline: profileRow?.headline ?? null,
    summary: profileRow?.summary ?? null,
    phone: profileRow?.phone ?? null,
    industry: profileRow?.industry ?? null,
    profession: profileRow?.profession ?? null,
    city: profileRow?.city ?? null,
    country_code: profileRow?.country_code ?? null
  };

  return {
    candidate,
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
  };
}

module.exports = {
  loadStoredCandidate
};
