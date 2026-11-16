const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const pool = require('../src/database');
const { writeExtraction } = require('../src/storage-writer');
const { applyMerge } = require('../src/merge/apply-merge');
const {
  buildMergeReviewItems,
  createReviews
} = require('../src/merge/create-merge-reviews');

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
      await pool.query('DELETE FROM human_reviews WHERE candidate_id = $1', [
        candidateId
      ]);
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

  it('routes a low-confidence field fill on a matched item to review without writing to DB', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const workRes = await client.query(
        `INSERT INTO work_experience (candidate_id, company_name, job_title, start_date, deduplication_key)
         VALUES ($1, 'Acme Corp', 'Engineer', '2020-01', 'key-test-fill')
         RETURNING id`,
        [candidateId]
      );
      const storedWorkId = workRes.rows[0].id;

      const diff = {
        differences: [],
        uncertainMatches: [],
        added: [
          {
            scope: 'field',
            section: 'work_experience',
            storedId: storedWorkId,
            newIndex: 0,
            field: 'description'
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
                description: {
                  value: 'Low confidence description',
                  confidence: 0.3,
                  evidence: 'Found description'
                }
              }
            }
          ]
        }
      };

      const mockCreateReviews = jest.fn().mockResolvedValue(1);

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
      expect(callArgs.reviewItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            reason: 'low_confidence',
            rule: 'C6',
            section: 'work_experience',
            itemType: 'work_experience',
            itemId: String(storedWorkId),
            field: 'description'
          })
        ])
      );

      const checkRes = await client.query(
        'SELECT description FROM work_experience WHERE id = $1',
        [storedWorkId]
      );
      expect(checkRes.rows[0].description).toBeNull();
      expect(result.changedFieldCount).toBe(0);

      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('buildMergeReviewItems constructs conflict items with stored provenance source and new values', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const workRes = await client.query(
        `INSERT INTO work_experience (candidate_id, company_name, job_title, start_date, deduplication_key)
         VALUES ($1, 'Acme Corp', 'Engineer', '2019-01', 'key-test-build')
         RETURNING id`,
        [candidateId]
      );
      const storedWorkId = workRes.rows[0].id;

      // Insert provenance and source
      const provRes = await client.query(
        `INSERT INTO data_provenance (candidate_id, item_type, item_id, field_name, resolution_method, approved_at)
         VALUES ($1, 'work_experience', $2, 'start_date', 'no_conflict', NOW())
         RETURNING id`,
        [candidateId, String(storedWorkId)]
      );
      await client.query(
        `INSERT INTO data_provenance_sources (provenance_id, job_id, source_value, confidence, evidence)
         VALUES ($1, $2, '"2019-01"', 0.95, 'Started Jan 2019')`,
        [provRes.rows[0].id, jobId]
      );

      const reviewItems = [
        {
          rule: 'C2',
          reason: 'conflict',
          section: 'work_experience',
          itemId: storedWorkId,
          field: 'start_date',
          stored: '2019-01',
          new: {
            value: '2020-01',
            confidence: 0.88,
            evidence: 'Started Jan 2020'
          }
        }
      ];

      const built = await buildMergeReviewItems({
        candidateId,
        fileId,
        reviewItems,
        diff: {},
        mapped: {},
        client
      });

      expect(built).toHaveLength(1);
      expect(built[0].targetType).toBe('conflict');
      expect(built[0].reviewReason).toBe('conflict');
      expect(built[0].itemType).toBe('work_experience');
      expect(built[0].itemId).toBe(String(storedWorkId));
      expect(built[0].fieldName).toBe('start_date');
      expect(built[0].options).toHaveLength(2);
      // Stored option
      expect(built[0].options[0].value).toBe('2019-01');
      expect(built[0].options[0].sourceFileId).toBe(fileId);
      expect(built[0].options[0].confidence).toBe(0.95);
      expect(built[0].options[0].evidence).toBe('Started Jan 2019');
      // New option
      expect(built[0].options[1].value).toBe('2020-01');
      expect(built[0].options[1].sourceFileId).toBe(fileId);
      expect(built[0].options[1].confidence).toBe(0.88);
      expect(built[0].options[1].evidence).toBe('Started Jan 2020');

      await client.query('ROLLBACK');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  it('createReviews saves built review items into conflicts and human_reviews inside a transaction', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const workRes = await client.query(
        `INSERT INTO work_experience (candidate_id, company_name, job_title, start_date, deduplication_key)
         VALUES ($1, 'Acme Corp', 'Engineer', '2019-01', 'key-test-save')
         RETURNING id`,
        [candidateId]
      );
      const storedWorkId = workRes.rows[0].id;

      const reviewItems = [
        {
          rule: 'C2',
          reason: 'conflict',
          section: 'work_experience',
          itemId: storedWorkId,
          field: 'start_date',
          stored: '2019-01',
          new: {
            value: '2020-01',
            confidence: 0.88,
            evidence: 'Started Jan 2020'
          }
        }
      ];

      const count = await createReviews(client, {
        candidateId,
        fileId,
        jobId,
        reviewItems,
        diff: {},
        mapped: {}
      });

      expect(count).toBe(1);

      const conflictRes = await client.query(
        'SELECT id, status, field_name FROM conflicts WHERE candidate_id = $1 AND item_id = $2',
        [candidateId, String(storedWorkId)]
      );
      expect(conflictRes.rows).toHaveLength(1);
      expect(conflictRes.rows[0].status).toBe('pending');
      expect(conflictRes.rows[0].field_name).toBe('start_date');

      const reviewRes = await client.query(
        'SELECT id, review_reason, review_status FROM human_reviews WHERE candidate_id = $1 AND item_id = $2',
        [candidateId, conflictRes.rows[0].id]
      );
      expect(reviewRes.rows).toHaveLength(1);
      expect(reviewRes.rows[0].review_reason).toBe('conflict');
      expect(reviewRes.rows[0].review_status).toBe('pending');

      const optRes = await client.query(
        'SELECT id, confidence, evidence FROM conflict_options WHERE conflict_id = $1',
        [conflictRes.rows[0].id]
      );
      expect(optRes.rows).toHaveLength(2);

      // Adding another option to already pending conflict
      const count2 = await createReviews(client, {
        candidateId,
        fileId,
        jobId,
        reviewItems: [
          {
            rule: 'C2',
            reason: 'conflict',
            section: 'work_experience',
            itemId: storedWorkId,
            field: 'start_date',
            stored: '2019-01',
            new: {
              value: '2022-01',
              confidence: 0.9,
              evidence: 'Started Jan 2022'
            }
          }
        ],
        diff: {},
        mapped: {}
      });

      expect(count2).toBe(0); // already pending, not a new conflict

      const optRes2 = await client.query(
        'SELECT id FROM conflict_options WHERE conflict_id = $1',
        [conflictRes.rows[0].id]
      );
      expect(optRes2.rows).toHaveLength(3); // 2 original + 1 new option

      await client.query('ROLLBACK');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });
});
