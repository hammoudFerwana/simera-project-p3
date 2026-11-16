const path = require('path');
const dotenv = require('dotenv');

dotenv.config({
  path: path.resolve(__dirname, '../../.env')
});

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must be set in .env');
}

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const pool = require('../src/database');
const { loadStoredCandidate } = require('../src/comparison/stored-data');

describe('loadStoredCandidate integration', () => {
  let emptyUserId;
  let emptyCandidateId;

  let fullUserId;
  let fullCandidateId;
  let job1Id;
  let job2Id;
  let langId;
  let linkId;
  let skillId;
  let candidateSkillId;

  const testSuffix = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;

  beforeAll(async () => {
    const dbCheck = await pool.query('SELECT current_database() AS name');
    const currentDb = dbCheck.rows[0].name;

    if (!currentDb.startsWith('simera_test')) {
      throw new Error(
        `Safety check failed: database ${currentDb} does not start with simera_test`
      );
    }

    // 1. Candidate with only an empty profile row
    const emptyUserRes = await pool.query(
      `INSERT INTO users (email, password_hash, created_at)
       VALUES ($1, 'hash', CURRENT_TIMESTAMP)
       RETURNING id`,
      [`empty_${testSuffix}@example.com`]
    );
    emptyUserId = emptyUserRes.rows[0].id;

    const emptyCandRes = await pool.query(
      `INSERT INTO candidate_profiles (user_id, created_at)
       VALUES ($1, CURRENT_TIMESTAMP)
       RETURNING id`,
      [emptyUserId]
    );
    emptyCandidateId = emptyCandRes.rows[0].id;

    // 2. Candidate with a full profile and items
    const fullUserRes = await pool.query(
      `INSERT INTO users (email, password_hash, created_at)
       VALUES ($1, 'hash', CURRENT_TIMESTAMP)
       RETURNING id`,
      [`full_${testSuffix}@example.com`]
    );
    fullUserId = fullUserRes.rows[0].id;

    const fullCandRes = await pool.query(
      `INSERT INTO candidate_profiles (
        user_id, first_name, last_name, headline, summary, phone, industry, profession, city, country_code, created_at
      ) VALUES (
        $1, 'Jane', 'Doe', 'Software Engineer', 'Experienced engineer', '+962791234567', 'Technology', 'Software Engineering', 'Amman', 'JO', CURRENT_TIMESTAMP
      ) RETURNING id`,
      [fullUserId]
    );
    fullCandidateId = fullCandRes.rows[0].id;

    // Two jobs
    const job1Res = await pool.query(
      `INSERT INTO work_experience (
        candidate_id, job_title, company_name, start_date, end_date, is_current, location, employment_type, work_mode, description, responsibilities, achievements, skills_used, company_url, deduplication_key
      ) VALUES (
        $1, 'Junior Developer', 'Acme Corp', '2020-01', '2021-12', false, 'Amman', 'full-time', 'hybrid', 'Worked on backend', 'Writing APIs', 'Shipped v1', 'Node.js, PostgreSQL', 'https://acme.example.com', $2
      ) RETURNING id`,
      [fullCandidateId, `job1_${testSuffix}`]
    );
    job1Id = job1Res.rows[0].id;

    const job2Res = await pool.query(
      `INSERT INTO work_experience (
        candidate_id, job_title, company_name, start_date, end_date, is_current, location, employment_type, work_mode, description, responsibilities, achievements, skills_used, company_url, deduplication_key
      ) VALUES (
        $1, 'Senior Developer', 'Beta Inc', '2022-01', null, true, 'Remote', 'full-time', 'remote', 'Lead developer', 'Architecture and reviews', 'Scaled platform', 'Distributed systems', 'https://beta.example.com', $2
      ) RETURNING id`,
      [fullCandidateId, `job2_${testSuffix}`]
    );
    job2Id = job2Res.rows[0].id;

    // One language
    const langRes = await pool.query(
      `INSERT INTO candidate_languages (candidate_id, language, proficiency_level)
       VALUES ($1, 'Arabic', 'native')
       RETURNING id`,
      [fullCandidateId]
    );
    langId = langRes.rows[0].id;

    // One link
    const linkRes = await pool.query(
      `INSERT INTO candidate_links (candidate_id, link_type, url, label)
       VALUES ($1, 'linkedin', 'https://linkedin.com/in/janedoe', 'LinkedIn')
       RETURNING id`,
      [fullCandidateId]
    );
    linkId = linkRes.rows[0].id;

    // One skill
    const skillCheck = await pool.query(
      "SELECT id FROM skills WHERE canonical_name = 'PostgreSQL'"
    );
    if (skillCheck.rows.length === 0) {
      const skillIns = await pool.query(
        "INSERT INTO skills (canonical_name, created_at) VALUES ('PostgreSQL', CURRENT_TIMESTAMP) RETURNING id"
      );
      skillId = skillIns.rows[0].id;
    } else {
      skillId = skillCheck.rows[0].id;
    }

    const csRes = await pool.query(
      `INSERT INTO candidate_skills (candidate_id, skill_id, proficiency_level, months_of_experience, created_at)
       VALUES ($1, $2, 'expert', 36, CURRENT_TIMESTAMP)
       RETURNING id`,
      [fullCandidateId, skillId]
    );
    candidateSkillId = csRes.rows[0].id;
  });

  afterAll(async () => {
    const candidateIds = [emptyCandidateId, fullCandidateId].filter(Boolean);
    const userIds = [emptyUserId, fullUserId].filter(Boolean);

    if (candidateIds.length > 0) {
      await pool.query(
        'DELETE FROM candidate_skills WHERE candidate_id = ANY($1)',
        [candidateIds]
      );
      await pool.query(
        'DELETE FROM candidate_languages WHERE candidate_id = ANY($1)',
        [candidateIds]
      );
      await pool.query(
        'DELETE FROM candidate_links WHERE candidate_id = ANY($1)',
        [candidateIds]
      );
      await pool.query(
        'DELETE FROM work_experience WHERE candidate_id = ANY($1)',
        [candidateIds]
      );
      await pool.query('DELETE FROM candidate_profiles WHERE id = ANY($1)', [
        candidateIds
      ]);
    }

    if (userIds.length > 0) {
      await pool.query('DELETE FROM users WHERE id = ANY($1)', [userIds]);
    }

    await pool.end();
  });

  it('returns null for a candidate with only an empty profile row', async () => {
    const result = await loadStoredCandidate(pool, emptyCandidateId);
    expect(result).toBeNull();
  });

  it('returns the exact D2 object for a candidate with profile and items', async () => {
    const result = await loadStoredCandidate(pool, fullCandidateId);
    expect(result).toEqual({
      candidate: {
        first_name: 'Jane',
        last_name: 'Doe',
        headline: 'Software Engineer',
        summary: 'Experienced engineer',
        phone: '+962791234567',
        industry: 'Technology',
        profession: 'Software Engineering',
        city: 'Amman',
        country_code: 'JO'
      },
      work_experience: [
        {
          id: job1Id,
          job_title: 'Junior Developer',
          company_name: 'Acme Corp',
          start_date: '2020-01',
          end_date: '2021-12',
          is_current: false,
          location: 'Amman',
          employment_type: 'full-time',
          work_mode: 'hybrid',
          description: 'Worked on backend',
          responsibilities: 'Writing APIs',
          achievements: 'Shipped v1',
          skills_used: 'Node.js, PostgreSQL',
          company_url: 'https://acme.example.com'
        },
        {
          id: job2Id,
          job_title: 'Senior Developer',
          company_name: 'Beta Inc',
          start_date: '2022-01',
          end_date: null,
          is_current: true,
          location: 'Remote',
          employment_type: 'full-time',
          work_mode: 'remote',
          description: 'Lead developer',
          responsibilities: 'Architecture and reviews',
          achievements: 'Scaled platform',
          skills_used: 'Distributed systems',
          company_url: 'https://beta.example.com'
        }
      ],
      education: [],
      certifications: [],
      projects: [],
      awards: [],
      publications: [],
      volunteering: [],
      languages: [
        {
          id: langId,
          language: 'Arabic',
          proficiency_level: 'native'
        }
      ],
      links: [
        {
          id: linkId,
          link_type: 'linkedin',
          url: 'https://linkedin.com/in/janedoe',
          label: 'LinkedIn'
        }
      ],
      skills: [
        {
          id: candidateSkillId,
          canonical_name: 'PostgreSQL',
          proficiency_level: 'expert',
          months_of_experience: 36
        }
      ]
    });
  });

  it('returns items ordered by id ascending', async () => {
    const result = await loadStoredCandidate(pool, fullCandidateId);
    expect(result.work_experience[0].id).toBeLessThan(
      result.work_experience[1].id
    );
  });
});
