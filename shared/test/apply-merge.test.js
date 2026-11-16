const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const pool = require('../src/database');
const { writeExtraction } = require('../src/storage-writer');
const { applyMerge } = require('../src/merge/apply-merge');

describe('applyMerge and storage-writer beforeCommit integration', () => {
  let userId;
  let candidateId;
  let fileId;
  let jobId;
  const uniqueSuffix = crypto.randomUUID().slice(0, 8);

  beforeAll(async () => {
    const res = await pool.query('SELECT current_database() AS name');
    const dbName = res.rows[0].name;
    if (!dbName.startsWith('simera_test')) {
      throw new Error(
        `Tests must run on a test database starting with simera_test, not ${dbName}`
      );
    }

    // 1. User
    const userRes = await pool.query(
      `INSERT INTO users (email, password_hash, created_at)
       VALUES ($1, 'hash', NOW())
       RETURNING id`,
      [`test-merge-${uniqueSuffix}@example.com`]
    );
    userId = userRes.rows[0].id;

    // 2. Candidate
    const candRes = await pool.query(
      `INSERT INTO candidate_profiles (user_id, first_name, last_name, headline, city, created_at)
       VALUES ($1, 'InitialFirst', 'InitialLast', 'Initial Headline', 'Amman', NOW())
       RETURNING id`,
      [userId]
    );
    candidateId = candRes.rows[0].id;

    // 3. File
    const fileRes = await pool.query(
      `INSERT INTO uploaded_files (
         candidate_id, source_type, original_filename, file_size,
         file_hash, storage_location, mime_type, uploaded_at, validated_at
       ) VALUES ($1, 'cv', 'test.pdf', 1024, $2, '/tmp/test.pdf', 'application/pdf', NOW(), NOW())
       RETURNING id`,
      [candidateId, `hash-${uniqueSuffix}`]
    );
    fileId = fileRes.rows[0].id;

    // 4. Job
    const jobRes = await pool.query(
      `INSERT INTO processing_jobs (file_id, status, created_at)
       VALUES ($1, 'processing', NOW())
       RETURNING id`,
      [fileId]
    );
    jobId = jobRes.rows[0].id;
  });

  afterAll(async () => {
    if (candidateId) {
      await pool.query(
        `DELETE FROM conflict_options
         WHERE conflict_id IN (SELECT id FROM conflicts WHERE candidate_id = $1)`,
        [candidateId]
      );
      await pool.query('DELETE FROM conflicts WHERE candidate_id = $1', [
        candidateId
      ]);
      await pool.query(
        `DELETE FROM data_provenance_sources
         WHERE provenance_id IN (SELECT id FROM data_provenance WHERE candidate_id = $1)`,
        [candidateId]
      );
      await pool.query('DELETE FROM data_provenance WHERE candidate_id = $1', [
        candidateId
      ]);
      await pool.query('DELETE FROM work_experience WHERE candidate_id = $1', [
        candidateId
      ]);
    }
    if (jobId) {
      await pool.query('DELETE FROM processing_jobs WHERE id = $1', [jobId]);
    }
    if (fileId) {
      await pool.query('DELETE FROM uploaded_files WHERE id = $1', [fileId]);
    }
    if (candidateId) {
      await pool.query('DELETE FROM candidate_profiles WHERE id = $1', [
        candidateId
      ]);
    }
    if (userId) {
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    }
    await pool.end();
  });

  it('proves a throw inside beforeCommit rolls the whole write back', async () => {
    const mappedData = {
      profile: {
        headline: {
          value: 'Changed Headline Should Roll Back',
          confidence: 0.9,
          evidence: 'Headline evidence'
        }
      },
      items: {
        work_experience: [
          {
            sourceIndex: 0,
            fields: {
              job_title: {
                value: 'Temporary Job',
                confidence: 0.9,
                evidence: 'Temporary Job'
              },
              company_name: {
                value: 'Temporary Corp',
                confidence: 0.9,
                evidence: 'Temporary Corp'
              },
              start_date: {
                value: '2023-01',
                confidence: 0.9,
                evidence: '2023-01'
              }
            }
          }
        ]
      }
    };

    const simulatedError = new Error('Simulated beforeCommit failure');

    await expect(
      writeExtraction({
        userId,
        jobId,
        mappedData,
        beforeCommit: async () => {
          throw simulatedError;
        }
      })
    ).rejects.toThrow('Simulated beforeCommit failure');

    // Verify candidate profile was NOT modified
    const profileRes = await pool.query(
      'SELECT headline FROM candidate_profiles WHERE id = $1',
      [candidateId]
    );
    expect(profileRes.rows[0].headline).toBe('Initial Headline');

    // Verify work_experience row was rolled back
    const workRes = await pool.query(
      'SELECT COUNT(*) FROM work_experience WHERE candidate_id = $1',
      [candidateId]
    );
    expect(Number(workRes.rows[0].count)).toBe(0);

    // Verify data_provenance was rolled back
    const provRes = await pool.query(
      'SELECT COUNT(*) FROM data_provenance WHERE candidate_id = $1',
      [candidateId]
    );
    expect(Number(provRes.rows[0].count)).toBe(0);
  });

  it('calls createReviews hook once with the review items and returns pendingReviewCount', async () => {
    const diff = {
      added: [],
      unchanged: [],
      precisionUpgrades: [],
      uncertainMatches: [
        {
          section: 'work_experience',
          newIndex: 1,
          newItem: { job_title: { value: 'VP' } },
          candidates: [{ storedIndex: 0, storedId: 100 }]
        }
      ],
      differences: [
        {
          section: 'work_experience',
          storedIndex: 0,
          storedId: 100,
          newIndex: 0,
          field: 'start_date',
          stored: '2019-01',
          new: { value: '2020-01', confidence: 0.9, evidence: '2020-01' }
        }
      ]
    };

    const mapped = {
      profile: {},
      items: {
        work_experience: [
          {
            sourceIndex: 0,
            fields: {
              start_date: {
                value: '2020-01',
                confidence: 0.9,
                evidence: '2020-01'
              }
            }
          }
        ]
      }
    };

    const mockCreateReviews = jest.fn().mockResolvedValue(5);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await applyMerge(client, {
        candidateId,
        fileId,
        jobId,
        diff,
        mapped,
        threshold: 0.5,
        createReviews: mockCreateReviews
      });

      expect(mockCreateReviews).toHaveBeenCalledTimes(1);
      const callArgs = mockCreateReviews.mock.calls[0][1];
      expect(callArgs.candidateId).toBe(candidateId);
      expect(callArgs.fileId).toBe(fileId);
      expect(callArgs.jobId).toBe(jobId);

      // Verify reviewItems includes the C2 start_date difference and the C3 uncertain match
      expect(callArgs.reviewItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: 'C2', field: 'start_date' }),
          expect.objectContaining({
            rule: 'C3',
            reason: 'item_match_uncertain',
            section: 'work_experience',
            newIndex: 1
          })
        ])
      );

      expect(result.pendingReviewCount).toBe(5);
      expect(result.reviewItems).toBe(callArgs.reviewItems);

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
});
