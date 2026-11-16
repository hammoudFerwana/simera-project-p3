const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const pool = require('../src/database');
const {
  applyAutomaticDecisions,
  loadPendingConflicts
} = require('../src/rules/apply-decisions');

describe('apply-decisions database integration', () => {
  let userId;
  let candidateId;
  let file1Id;
  let file2Id;
  let job1Id;
  let job2Id;
  let workExpId;

  beforeAll(async () => {
    const res = await pool.query('SELECT current_database() AS name');
    const dbName = res.rows[0].name;
    if (!dbName.startsWith('simera_test')) {
      throw new Error(
        `Tests must run on a test database starting with simera_test, not ${dbName}`
      );
    }

    const uniqueSuffix = crypto.randomUUID().slice(0, 8);

    // 1. User
    const userRes = await pool.query(
      `INSERT INTO users (email, password_hash, created_at)
       VALUES ($1, $2, NOW())
       RETURNING id`,
      [`test-us16-${uniqueSuffix}@example.com`, 'hash']
    );
    userId = userRes.rows[0].id;

    // 2. Candidate profile
    const candRes = await pool.query(
      `INSERT INTO candidate_profiles (user_id, first_name, last_name, city, created_at)
       VALUES ($1, 'John', 'Doe', 'Amman', NOW())
       RETURNING id`,
      [userId]
    );
    candidateId = candRes.rows[0].id;

    // 3. Files
    const file1Res = await pool.query(
      `INSERT INTO uploaded_files (
         candidate_id, source_type, original_filename, file_size,
         file_hash, storage_location, mime_type, uploaded_at, validated_at
       ) VALUES ($1, 'cv', 'file1.pdf', 1024, $2, '/tmp/file1.pdf', 'application/pdf', NOW(), NOW())
       RETURNING id`,
      [candidateId, `hash1-${uniqueSuffix}`]
    );
    file1Id = file1Res.rows[0].id;

    const file2Res = await pool.query(
      `INSERT INTO uploaded_files (
         candidate_id, source_type, original_filename, file_size,
         file_hash, storage_location, mime_type, uploaded_at, validated_at
       ) VALUES ($1, 'cv', 'file2.pdf', 2048, $2, '/tmp/file2.pdf', 'application/pdf', NOW(), NOW())
       RETURNING id`,
      [candidateId, `hash2-${uniqueSuffix}`]
    );
    file2Id = file2Res.rows[0].id;

    // 4. Jobs
    const job1Res = await pool.query(
      `INSERT INTO processing_jobs (file_id, status, created_at)
       VALUES ($1, 'completed', NOW())
       RETURNING id`,
      [file1Id]
    );
    job1Id = job1Res.rows[0].id;

    const job2Res = await pool.query(
      `INSERT INTO processing_jobs (file_id, status, created_at)
       VALUES ($1, 'completed', NOW())
       RETURNING id`,
      [file2Id]
    );
    job2Id = job2Res.rows[0].id;

    // 5. Work experience (for AC1)
    const workRes = await pool.query(
      `INSERT INTO work_experience (candidate_id, job_title, company_name, is_current, deduplication_key)
       VALUES ($1, 'Backend Developer', 'Acme Corp', true, $2)
       RETURNING id`,
      [candidateId, `work-dedup-${uniqueSuffix}`]
    );
    workExpId = workRes.rows[0].id;
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
    if (job1Id || job2Id) {
      await pool.query(
        'DELETE FROM processing_jobs WHERE id = ANY($1::int[])',
        [[job1Id, job2Id].filter(Boolean)]
      );
    }
    if (file1Id || file2Id) {
      await pool.query('DELETE FROM uploaded_files WHERE id = ANY($1::int[])', [
        [file1Id, file2Id].filter(Boolean)
      ]);
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

  it('AC3 and AC10: applies B2 city change (Amman -> Dubai) with conflicts and provenance', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Seed initial city provenance for Amman pointing to file 1 / job 1
      await client.query(
        `UPDATE candidate_profiles SET city = 'Amman' WHERE id = $1`,
        [candidateId]
      );

      const provRes = await client.query(
        `INSERT INTO data_provenance (
           candidate_id, item_type, item_id, field_name, resolution_method, approved_at
         ) VALUES ($1, 'candidate_profile', $2, 'city', 'no_conflict', NOW())
         ON CONFLICT (item_type, item_id, field_name)
         DO UPDATE SET resolution_method = EXCLUDED.resolution_method
         RETURNING id`,
        [candidateId, String(candidateId)]
      );
      const provId = provRes.rows[0].id;

      await client.query(
        'DELETE FROM data_provenance_sources WHERE provenance_id = $1',
        [provId]
      );
      await client.query(
        `INSERT INTO data_provenance_sources (
           provenance_id, job_id, source_value, confidence, evidence
         ) VALUES ($1, $2, '"Amman"', 0.95, 'Lives in Amman')`,
        [provId, job1Id]
      );

      const decision = {
        rule: 'B2',
        section: 'candidate',
        itemType: 'candidate_profile',
        itemId: String(candidateId),
        field: 'city',
        previous: 'Amman',
        next: {
          value: 'Dubai',
          confidence: 0.92,
          evidence: 'Based in Dubai'
        },
        extraUpdates: {}
      };

      const now = new Date();
      const { conflictIds, optionIds } = await applyAutomaticDecisions(client, {
        candidateId,
        jobId: job2Id,
        fileId: file2Id,
        automatic: [decision],
        addOptions: [],
        now
      });

      await client.query('COMMIT');

      expect(conflictIds).toHaveLength(1);
      expect(optionIds).toHaveLength(2);

      // Verify core table update
      const candCheck = await pool.query(
        'SELECT city FROM candidate_profiles WHERE id = $1',
        [candidateId]
      );
      expect(candCheck.rows[0].city).toBe('Dubai');

      // Verify conflicts row
      const conflictCheck = await pool.query(
        'SELECT * FROM conflicts WHERE id = $1',
        [conflictIds[0]]
      );
      expect(conflictCheck.rows[0]).toMatchObject({
        candidate_id: candidateId,
        field_name: 'city',
        item_type: 'candidate_profile',
        item_id: String(candidateId),
        status: 'resolved',
        resolution_method: 'automatic_rule',
        applied_rule: 'B2',
        resolved_value: 'Dubai'
      });

      // Verify conflict_options rows
      const optionsCheck = await pool.query(
        'SELECT * FROM conflict_options WHERE conflict_id = $1 ORDER BY id ASC',
        [conflictIds[0]]
      );
      expect(optionsCheck.rows).toHaveLength(2);

      const [prevOption, nextOption] = optionsCheck.rows;
      expect(prevOption).toMatchObject({
        value: 'Amman',
        source_file_id: file1Id,
        confidence: 0.95,
        evidence: 'Lives in Amman'
      });
      expect(nextOption).toMatchObject({
        value: 'Dubai',
        source_file_id: file2Id,
        confidence: 0.92,
        evidence: 'Based in Dubai'
      });

      // Verify provenance update
      const provCheck = await pool.query(
        `SELECT * FROM data_provenance
         WHERE candidate_id = $1 AND item_type = 'candidate_profile' AND field_name = 'city'`,
        [candidateId]
      );
      expect(provCheck.rows[0].resolution_method).toBe('latest_value');

      // Verify provenance sources: exactly one row for job 2
      const sourcesCheck = await pool.query(
        'SELECT * FROM data_provenance_sources WHERE provenance_id = $1',
        [provCheck.rows[0].id]
      );
      expect(sourcesCheck.rows).toHaveLength(1);
      expect(sourcesCheck.rows[0]).toMatchObject({
        job_id: job2Id,
        source_value: 'Dubai',
        confidence: 0.92,
        evidence: 'Based in Dubai'
      });
    } finally {
      client.release();
    }
  });

  it('AC1: applies B1 end date on current job, updating is_current false with B1 conflicts row', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const decision = {
        rule: 'B1',
        section: 'work_experience',
        itemType: 'work_experience',
        itemId: String(workExpId),
        field: 'end_date',
        previous: null,
        next: {
          value: '2024-03',
          confidence: 0.89,
          evidence: 'Ended March 2024'
        },
        extraUpdates: { is_current: false }
      };

      const now = new Date();
      const { conflictIds } = await applyAutomaticDecisions(client, {
        candidateId,
        jobId: job2Id,
        fileId: file2Id,
        automatic: [decision],
        addOptions: [],
        now
      });

      await client.query('COMMIT');

      expect(conflictIds).toHaveLength(1);

      // Verify core table
      const workCheck = await pool.query(
        'SELECT end_date, is_current FROM work_experience WHERE id = $1',
        [workExpId]
      );
      expect(workCheck.rows[0]).toEqual({
        end_date: '2024-03',
        is_current: false
      });

      // Verify conflicts row: exactly one row with rule B1
      const conflictCheck = await pool.query(
        'SELECT applied_rule, status FROM conflicts WHERE id = $1',
        [conflictIds[0]]
      );
      expect(conflictCheck.rows[0]).toEqual({
        applied_rule: 'B1',
        status: 'resolved'
      });

      // Verify provenance for is_current handled as second field
      const isCurrentProv = await pool.query(
        `SELECT resolution_method FROM data_provenance
         WHERE candidate_id = $1 AND item_type = 'work_experience' AND item_id = $2 AND field_name = 'is_current'`,
        [candidateId, String(workExpId)]
      );
      expect(isCurrentProv.rows[0].resolution_method).toBe('latest_value');
    } finally {
      client.release();
    }
  });

  it('AC9: applies B2 to human_reviewed city with no source row (previous option has null source)', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Stored human_reviewed city with no data_provenance_sources
      await client.query(
        `UPDATE candidate_profiles SET city = 'Amman' WHERE id = $1`,
        [candidateId]
      );

      const provRes = await client.query(
        `INSERT INTO data_provenance (
           candidate_id, item_type, item_id, field_name, resolution_method, approved_at
         ) VALUES ($1, 'candidate_profile', $2, 'city', 'human_reviewed', NOW())
         ON CONFLICT (item_type, item_id, field_name)
         DO UPDATE SET resolution_method = EXCLUDED.resolution_method
         RETURNING id`,
        [candidateId, String(candidateId)]
      );

      await client.query(
        'DELETE FROM data_provenance_sources WHERE provenance_id = $1',
        [provRes.rows[0].id]
      );

      const decision = {
        rule: 'B2',
        section: 'candidate',
        itemType: 'candidate_profile',
        itemId: String(candidateId),
        field: 'city',
        previous: 'Amman',
        next: {
          value: 'Abu Dhabi',
          confidence: 0.95,
          evidence: 'Relocated to Abu Dhabi'
        },
        extraUpdates: {}
      };

      const { conflictIds } = await applyAutomaticDecisions(client, {
        candidateId,
        jobId: job2Id,
        fileId: file2Id,
        automatic: [decision],
        addOptions: [],
        now: new Date()
      });

      await client.query('COMMIT');

      // Verify core city updated
      const candCheck = await pool.query(
        'SELECT city FROM candidate_profiles WHERE id = $1',
        [candidateId]
      );
      expect(candCheck.rows[0].city).toBe('Abu Dhabi');

      // Verify provenance resolution_method became latest_value
      const provCheck = await pool.query(
        `SELECT resolution_method FROM data_provenance
         WHERE candidate_id = $1 AND item_type = 'candidate_profile' AND field_name = 'city'`,
        [candidateId]
      );
      expect(provCheck.rows[0].resolution_method).toBe('latest_value');

      // Verify previous option has null source_file_id, confidence, evidence
      const optionsCheck = await pool.query(
        'SELECT * FROM conflict_options WHERE conflict_id = $1 ORDER BY id ASC',
        [conflictIds[0]]
      );
      expect(optionsCheck.rows[0]).toMatchObject({
        value: 'Amman',
        source_file_id: null,
        confidence: null,
        evidence: null
      });
      expect(optionsCheck.rows[1]).toMatchObject({
        value: 'Abu Dhabi',
        source_file_id: file2Id,
        confidence: 0.95,
        evidence: 'Relocated to Abu Dhabi'
      });
    } finally {
      client.release();
    }
  });

  it('AC8: addOptions on pending conflict adds new option while conflict stays pending and city is unchanged', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Set stored city to Amman
      await client.query(
        `UPDATE candidate_profiles SET city = 'Amman' WHERE id = $1`,
        [candidateId]
      );

      // Insert pending conflict
      const pendingRes = await client.query(
        `INSERT INTO conflicts (
           candidate_id, field_name, item_type, item_id, status
         ) VALUES ($1, 'city', 'candidate_profile', $2, 'pending')
         RETURNING id`,
        [candidateId, String(candidateId)]
      );
      const pendingConflictId = pendingRes.rows[0].id;

      const addOption = {
        conflictId: pendingConflictId,
        field: 'city',
        new: {
          value: 'Sharjah',
          confidence: 0.84,
          evidence: 'Office in Sharjah'
        }
      };

      const { conflictIds, optionIds } = await applyAutomaticDecisions(client, {
        candidateId,
        jobId: job2Id,
        fileId: file2Id,
        automatic: [],
        addOptions: [addOption],
        now: new Date()
      });

      await client.query('COMMIT');

      expect(conflictIds).toHaveLength(0);
      expect(optionIds).toHaveLength(1);

      // Verify new option recorded
      const optionCheck = await pool.query(
        'SELECT * FROM conflict_options WHERE id = $1',
        [optionIds[0]]
      );
      expect(optionCheck.rows[0]).toMatchObject({
        conflict_id: pendingConflictId,
        value: 'Sharjah',
        source_file_id: file2Id,
        confidence: 0.84,
        evidence: 'Office in Sharjah'
      });

      // Verify conflict is still pending
      const confCheck = await pool.query(
        'SELECT status FROM conflicts WHERE id = $1',
        [pendingConflictId]
      );
      expect(confCheck.rows[0].status).toBe('pending');

      // Verify stored city has NOT changed
      const candCheck = await pool.query(
        'SELECT city FROM candidate_profiles WHERE id = $1',
        [candidateId]
      );
      expect(candCheck.rows[0].city).toBe('Amman');
    } finally {
      client.release();
    }
  });

  it('ROLLBACK: rolls back automatic decisions so nothing remains', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE candidate_profiles SET city = 'Amman' WHERE id = $1`,
        [candidateId]
      );

      const decision = {
        rule: 'B2',
        section: 'candidate',
        itemType: 'candidate_profile',
        itemId: String(candidateId),
        field: 'city',
        previous: 'Amman',
        next: {
          value: 'Doha',
          confidence: 0.99,
          evidence: 'Moved to Doha'
        },
        extraUpdates: {}
      };

      const { conflictIds } = await applyAutomaticDecisions(client, {
        candidateId,
        jobId: job2Id,
        fileId: file2Id,
        automatic: [decision],
        addOptions: [],
        now: new Date()
      });

      expect(conflictIds).toHaveLength(1);

      // Rollback
      await client.query('ROLLBACK');

      // Verify city was not changed
      const candCheck = await pool.query(
        'SELECT city FROM candidate_profiles WHERE id = $1',
        [candidateId]
      );
      expect(candCheck.rows[0].city).toBe('Amman');

      // Verify conflict does not exist
      const conflictCheck = await pool.query(
        'SELECT * FROM conflicts WHERE id = $1',
        [conflictIds[0]]
      );
      expect(conflictCheck.rows).toHaveLength(0);
    } finally {
      client.release();
    }
  });

  it('loadPendingConflicts returns only pending rows of that candidate', async () => {
    const client = await pool.connect();
    try {
      // 1. Pending conflict for this candidate
      const pendingRes = await client.query(
        `INSERT INTO conflicts (
           candidate_id, field_name, item_type, item_id, status
         ) VALUES ($1, 'headline', 'candidate_profile', $2, 'pending')
         RETURNING id`,
        [candidateId, String(candidateId)]
      );
      const pendingId = pendingRes.rows[0].id;

      // 2. Resolved conflict for this candidate
      await client.query(
        `INSERT INTO conflicts (
           candidate_id, field_name, item_type, item_id, status
         ) VALUES ($1, 'summary', 'candidate_profile', $2, 'resolved')`,
        [candidateId, String(candidateId)]
      );

      const rows = await loadPendingConflicts(client, candidateId);

      const found = rows.find((r) => r.conflictId === pendingId);
      expect(found).toEqual({
        conflictId: pendingId,
        itemType: 'candidate_profile',
        itemId: String(candidateId),
        fieldName: 'headline'
      });

      // No resolved conflicts included
      const hasResolved = rows.some((r) => r.fieldName === 'summary');
      expect(hasResolved).toBe(false);
    } finally {
      client.release();
    }
  });
});
