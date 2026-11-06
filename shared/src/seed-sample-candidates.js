const pool = require('./database');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

async function seedSampleCandidates() {
  // Allow sample data only in development
  if (process.env.NODE_ENV !== 'development') {
    throw new Error(
      'Sample candidates can only be seeded in development mode.'
    );
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const candidate = {
         email: 'john.doe@simera.local',
         password: crypto.randomBytes(32).toString('hex'),
         firstName: 'John',
         lastName: 'Doe',
  };
  // Check whether the sample candidate already exists
const existingUser = await client.query(
  'SELECT id FROM users WHERE email = $1',
  [candidate.email]
);

if (existingUser.rows.length > 0) {
  const existingCandidate = await client.query(
    'SELECT id FROM candidate_profiles WHERE user_id = $1',
    [existingUser.rows[0].id]
  );

  if (existingCandidate.rows.length > 0) {
    console.log('Sample candidate already exists. No changes made.');
    await client.query('COMMIT');
    return;
  }

  throw new Error(
    'The sample email already belongs to a user without a candidate profile.'
  );
}

// Hash the candidate password
const passwordHash = await bcrypt.hash(candidate.password, 12);

// Insert the user
const userResult = await client.query(
  `INSERT INTO users (
    email,
    password_hash,
    email_verified,
    created_at
  )
  VALUES ($1, $2, TRUE, CURRENT_TIMESTAMP)
  RETURNING id`,
  [candidate.email, passwordHash]
);

const userId = userResult.rows[0].id;
const profileResult = await client.query(
  `INSERT INTO candidate_profiles (
    user_id,
    first_name,
    last_name,
    headline,
    summary,
    industry,
    profession,
    city,
    country_code,
    created_at
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
  RETURNING id`,
  [
    userId,
    candidate.firstName,
    candidate.lastName,
    'Junior Software Developer',
    'Computer Engineering graduate interested in software development and AI.',
    'Information Technology',
    'Software Developer',
    'Nablus',
    'PS',
  ]
);

const candidateId = profileResult.rows[0].id;
await client.query(
  `INSERT INTO education (
    candidate_id,
    institution_name,
    degree_level,
    degree_name,
    field_of_study,
    start_date,
    end_date,
    is_current,
    deduplication_key
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
  [
    candidateId,
    'An-Najah National University',
    "Bachelor's",
    'Bachelor of Computer Engineering',
    'Computer Engineering',
    '2021',
    '2025',
    false,
    'sample-education-john-doe-001',
  ]
);
await client.query(
  `INSERT INTO work_experience (
    candidate_id,
    job_title,
    company_name,
    start_date,
    end_date,
    is_current,
    location,
    employment_type,
    description,
    deduplication_key
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
  [
    candidateId,
    'Junior Software Developer',
    'Tech Solutions',
    '2024-06',
    '2025-06',
    false,
    'Remote',
    'Internship',
    'Worked on backend development using Node.js and PostgreSQL.',
    'sample-work-john-doe-001',
  ]
);
await client.query(
  `INSERT INTO candidate_languages (
    candidate_id,
    language,
    proficiency_level
  )
  VALUES
    ($1, $2, $3),
    ($1, $4, $5)`,
  [
    candidateId,
    'Arabic',
    'native',
    'English',
    'advanced',
  ]
);
await client.query(
  `INSERT INTO candidate_links (
    candidate_id,
    link_type,
    url,
    label
  )
  VALUES
    ($1, $2, $3, $4),
    ($1, $5, $6, $7)`,
  [
    candidateId,
    'linkedin',
    'https://www.linkedin.com/in/john-doe-sample',
    'LinkedIn Profile',
    'github',
    'https://github.com/john-doe-sample',
    'GitHub Profile',
  ]
);
const skillNames = ['JavaScript', 'Node.js', 'PostgreSQL', 'Python'];

for (const skillName of skillNames) {
  const skillResult = await client.query(
    'SELECT id FROM skills WHERE canonical_name = $1',
    [skillName]
  );

  if (skillResult.rows.length === 0) {
    throw new Error(`Skill not found: ${skillName}`);
  }

  await client.query(
    `INSERT INTO candidate_skills (
      candidate_id,
      skill_id,
      proficiency_level,
      created_at
    )
    VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
    [candidateId, skillResult.rows[0].id, 'intermediate']
  );
}

    await client.query('COMMIT');
    console.log('Sample candidates seeded successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Sample candidates seeding failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seedSampleCandidates().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});