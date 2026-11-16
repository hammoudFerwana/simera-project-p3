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
const { writeExtraction } = require('../src/storage-writer');
const { seedSkills } = require('../src/seed-skills');

describe('skills-storage integration', () => {
  let userId;
  let candidateId;
  let file1Id;
  let file2Id;
  let job1Id;
  let job2Id;
  let reactSkillId;

  const testSuffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const testEmail = `test_skills_${testSuffix}@example.com`;

  beforeAll(async () => {
    const dbCheck = await pool.query('SELECT current_database() AS name');
    const currentDb = dbCheck.rows[0].name;

    if (!currentDb.startsWith('simera_test')) {
      throw new Error(
        `Safety check failed: database ${currentDb} does not start with simera_test`
      );
    }

    // Seed skills first to ensure standard canonical skills exist.
    await seedSkills({ dbPool: pool });

    const skillRes = await pool.query(
      "SELECT id FROM skills WHERE canonical_name = 'React'"
    );
    if (skillRes.rows.length === 0) {
      const insRes = await pool.query(
        "INSERT INTO skills (canonical_name, created_at) VALUES ('React', CURRENT_TIMESTAMP) RETURNING id"
      );
      reactSkillId = insRes.rows[0].id;
    } else {
      reactSkillId = skillRes.rows[0].id;
    }

    // Create user
    const userRes = await pool.query(
      `INSERT INTO users (email, password_hash, email_verified, created_at)
       VALUES ($1, 'hash', true, CURRENT_TIMESTAMP)
       RETURNING id`,
      [testEmail]
    );
    userId = userRes.rows[0].id;

    // Create candidate profile
    const candidateRes = await pool.query(
      `INSERT INTO candidate_profiles (user_id, first_name, last_name, created_at)
       VALUES ($1, 'Test', 'Candidate', CURRENT_TIMESTAMP)
       RETURNING id`,
      [userId]
    );
    candidateId = candidateRes.rows[0].id;

    // Create two uploaded files
    const file1Res = await pool.query(
      `INSERT INTO uploaded_files (
        candidate_id, source_type, original_filename, file_size, file_hash, storage_location, uploaded_at, validated_at
      )
      VALUES ($1, 'cv', 'cv.pdf', 1000, $2, '/tmp/cv.pdf', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id`,
      [candidateId, `hash1_${testSuffix}`]
    );
    file1Id = file1Res.rows[0].id;

    const file2Res = await pool.query(
      `INSERT INTO uploaded_files (
        candidate_id, source_type, original_filename, file_size, file_hash, storage_location, uploaded_at, validated_at
      )
      VALUES ($1, 'linkedin', 'linkedin.pdf', 1200, $2, '/tmp/linkedin.pdf', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id`,
      [candidateId, `hash2_${testSuffix}`]
    );
    file2Id = file2Res.rows[0].id;

    // Create two processing jobs
    const job1Res = await pool.query(
      `INSERT INTO processing_jobs (file_id, status, created_at)
       VALUES ($1, 'processing', CURRENT_TIMESTAMP)
       RETURNING id`,
      [file1Id]
    );
    job1Id = job1Res.rows[0].id;

    const job2Res = await pool.query(
      `INSERT INTO processing_jobs (file_id, status, created_at)
       VALUES ($1, 'processing', CURRENT_TIMESTAMP)
       RETURNING id`,
      [file2Id]
    );
    job2Id = job2Res.rows[0].id;
  });

  afterAll(async () => {
    if (candidateId) {
      await pool.query(
        `DELETE FROM data_provenance_sources
         WHERE provenance_id IN (SELECT id FROM data_provenance WHERE candidate_id = $1)`,
        [candidateId]
      );
      await pool.query('DELETE FROM data_provenance WHERE candidate_id = $1', [
        candidateId
      ]);
      await pool.query('DELETE FROM candidate_skills WHERE candidate_id = $1', [
        candidateId
      ]);
      await pool.query('DELETE FROM unknown_skills WHERE candidate_id = $1', [
        candidateId
      ]);
      await pool.query('DELETE FROM human_reviews WHERE candidate_id = $1', [
        candidateId
      ]);
      await pool.query('DELETE FROM education WHERE candidate_id = $1', [
        candidateId
      ]);
      await pool.query('DELETE FROM processing_jobs WHERE id IN ($1, $2)', [
        job1Id,
        job2Id
      ]);
      await pool.query('DELETE FROM uploaded_files WHERE id IN ($1, $2)', [
        file1Id,
        file2Id
      ]);
      await pool.query('DELETE FROM candidate_profiles WHERE id = $1', [
        candidateId
      ]);
    }
    if (userId) {
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    }
    await pool.end();
  });

  it('AC6: running seedSkills twice does not duplicate skills', async () => {
    const count1Res = await pool.query(
      'SELECT count(*)::int AS count FROM skills'
    );
    const count1 = count1Res.rows[0].count;

    await seedSkills({ dbPool: pool });

    const count2Res = await pool.query(
      'SELECT count(*)::int AS count FROM skills'
    );
    const count2 = count2Res.rows[0].count;

    expect(count2).toBe(count1);
  });

  it('AC5: "React" stored from job 1, then job 2 -> one candidate_skills row and two provenance sources', async () => {
    // Job 1
    const mappedData1 = {
      skills: {
        matched: [
          {
            sourceIndex: 0,
            skillId: reactSkillId,
            fields: {
              skill_id: {
                value: reactSkillId,
                confidence: 0.9,
                evidence: 'React'
              },
              proficiency_level: {
                value: 'intermediate',
                confidence: 0.8,
                evidence: 'intermediate'
              },
              months_of_experience: {
                value: 12,
                confidence: 0.8,
                evidence: '1 year'
              }
            }
          }
        ],
        unknown: []
      }
    };

    await writeExtraction({
      userId,
      jobId: job1Id,
      mappedData: mappedData1
    });

    // Job 2 (e.g. from LinkedIn file)
    const mappedData2 = {
      skills: {
        matched: [
          {
            sourceIndex: 0,
            skillId: reactSkillId,
            fields: {
              skill_id: {
                value: reactSkillId,
                confidence: 0.95,
                evidence: 'React'
              },
              proficiency_level: {
                value: 'advanced',
                confidence: 0.9,
                evidence: 'advanced'
              },
              months_of_experience: {
                value: 24,
                confidence: 0.9,
                evidence: '2 years'
              }
            }
          }
        ],
        unknown: []
      }
    };

    await writeExtraction({
      userId,
      jobId: job2Id,
      mappedData: mappedData2
    });

    const rowsRes = await pool.query(
      'SELECT * FROM candidate_skills WHERE candidate_id = $1 AND skill_id = $2',
      [candidateId, reactSkillId]
    );

    expect(rowsRes.rows.length).toBe(1);
    const candidateSkillRow = rowsRes.rows[0];

    // Check data provenance for skill_id
    const provRes = await pool.query(
      `SELECT id FROM data_provenance
       WHERE candidate_id = $1
         AND item_type = 'candidate_skills'
         AND item_id = $2
         AND field_name = 'skill_id'`,
      [candidateId, String(candidateSkillRow.id)]
    );

    expect(provRes.rows.length).toBe(1);
    const provenanceId = provRes.rows[0].id;

    const sourcesRes = await pool.query(
      `SELECT * FROM data_provenance_sources
       WHERE provenance_id = $1
       ORDER BY job_id ASC`,
      [provenanceId]
    );

    expect(sourcesRes.rows.length).toBe(2);
    const jobIds = sourcesRes.rows.map((s) => s.job_id);
    expect(jobIds).toContain(job1Id);
    expect(jobIds).toContain(job2Id);
  });

  it('AC8 & D11: stores unknown skill with evidence, status pending, file_id; retry does not duplicate', async () => {
    const mappedData = {
      skills: {
        matched: [],
        unknown: [
          {
            sourceIndex: 0,
            skillName: 'QuantumComputingFramework',
            confidence: 0.88,
            evidence: 'Designed algorithms in QuantumComputingFramework'
          }
        ]
      }
    };

    // First write (AC8)
    await writeExtraction({
      userId,
      jobId: job1Id,
      mappedData
    });

    const queryUnknown = async () =>
      (
        await pool.query(
          `SELECT * FROM unknown_skills
           WHERE candidate_id = $1 AND LOWER(skill_name) = LOWER($2)`,
          [candidateId, 'QuantumComputingFramework']
        )
      ).rows;

    const rows1 = await queryUnknown();
    expect(rows1.length).toBe(1);
    expect(rows1[0].evidence).toBe(
      'Designed algorithms in QuantumComputingFramework'
    );
    expect(rows1[0].status).toBe('pending');
    expect(rows1[0].source_file_id).toBe(file1Id);
    expect(rows1[0].confidence).toBeCloseTo(0.88, 2);

    // Second write for same job (D11 - retry)
    await writeExtraction({
      userId,
      jobId: job1Id,
      mappedData
    });

    const rows2 = await queryUnknown();
    expect(rows2.length).toBe(1);
  });

  it('rolls back whole transaction when an error occurs in the skills writer', async () => {
    const mappedDataWithInvalidSkill = {
      items: {
        education: [
          {
            sourceIndex: 0,
            fields: {
              institution_name: {
                value: 'Test Rollback University',
                confidence: 0.9,
                evidence: 'Test Rollback University'
              }
            }
          }
        ]
      },
      skills: {
        matched: [
          {
            sourceIndex: 0,
            skillId: 999999999, // non-existent skill ID triggers foreign key violation
            fields: {
              skill_id: {
                value: 999999999,
                confidence: 0.9,
                evidence: 'NonExistent'
              }
            }
          }
        ],
        unknown: []
      }
    };

    await expect(
      writeExtraction({
        userId,
        jobId: job1Id,
        mappedData: mappedDataWithInvalidSkill
      })
    ).rejects.toThrow();

    // Verify education item was rolled back
    const eduRes = await pool.query(
      `SELECT * FROM education
       WHERE candidate_id = $1 AND institution_name = 'Test Rollback University'`,
      [candidateId]
    );

    expect(eduRes.rows.length).toBe(0);
  });
});
