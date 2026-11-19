/**
 * US-25 integration tests: the traceability checks run their real SQL against
 * the simera_test database (TEST_DATABASE_URL). Every test runs inside one
 * transaction that is rolled back, so nothing is left behind. The database
 * may already hold other rows, so each test compares failure counts with a
 * baseline taken inside the same transaction.
 */
const crypto = require('crypto');
const { Pool } = require('pg');
const { loadConfig } = require('../../shared/src/config');
const {
  runTraceabilityChecks,
  formatTraceabilityReport
} = require('../lib/traceability-checks');

loadConfig({ requiredVars: [] });

jest.setTimeout(30000);

const describeDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;

function failuresOf(report, checkId) {
  const check = report.checks.find((c) => c.id === checkId);
  if (!check) {
    throw new Error(`Unknown check ${checkId}`);
  }
  return check;
}

async function insertOne(client, sql, params) {
  const result = await client.query(sql, params);
  return result.rows[0].id;
}

/**
 * Inserts a fully traceable candidate: one profile value with provenance and
 * an evidenced source from a versioned job, one automatic B2 decision with
 * two options, and one complete human decision with an audit row.
 */
async function insertTraceableFixture(client) {
  const runId = crypto.randomBytes(4).toString('hex');

  const userId = await insertOne(
    client,
    `INSERT INTO users (email, password_hash, email_verified, created_at)
     VALUES ($1, 'x', TRUE, CURRENT_TIMESTAMP) RETURNING id`,
    [`us25-${runId}@example.com`]
  );
  const adminUserId = await insertOne(
    client,
    `INSERT INTO users (email, password_hash, email_verified, created_at)
     VALUES ($1, 'x', TRUE, CURRENT_TIMESTAMP) RETURNING id`,
    [`us25-admin-${runId}@example.com`]
  );
  const adminId = await insertOne(
    client,
    'INSERT INTO admins (user_id) VALUES ($1) RETURNING id',
    [adminUserId]
  );
  const candidateId = await insertOne(
    client,
    `INSERT INTO candidate_profiles (user_id, headline, city, created_at)
     VALUES ($1, 'Backend Developer', 'Dubai', CURRENT_TIMESTAMP) RETURNING id`,
    [userId]
  );

  const oldFileId = await insertOne(
    client,
    `INSERT INTO uploaded_files (candidate_id, source_type, original_filename,
       file_size, file_hash, storage_location, uploaded_at, validated_at)
     VALUES ($1, 'cv', 'cv.pdf', 100, $2, 'x', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     RETURNING id`,
    [candidateId, `us25-old-${runId}`]
  );
  const fileId = await insertOne(
    client,
    `INSERT INTO uploaded_files (candidate_id, source_type, original_filename,
       file_size, file_hash, storage_location, uploaded_at, validated_at)
     VALUES ($1, 'cv', 'cv2.pdf', 100, $2, 'x', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     RETURNING id`,
    [candidateId, `us25-new-${runId}`]
  );
  const jobId = await insertOne(
    client,
    `INSERT INTO processing_jobs (file_id, status, created_at, extracted_at,
       model_name, model_version, prompt_version)
     VALUES ($1, 'completed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
       'model', '1', 'p1')
     RETURNING id`,
    [fileId]
  );

  // headline: extracted, no conflict.
  const headlineProvenanceId = await insertOne(
    client,
    `INSERT INTO data_provenance (candidate_id, item_type, item_id, field_name,
       resolution_method, approved_at)
     VALUES ($1, 'candidate_profile', $2, 'headline', 'no_conflict', CURRENT_TIMESTAMP)
     RETURNING id`,
    [candidateId, String(candidateId)]
  );
  await client.query(
    `INSERT INTO data_provenance_sources (provenance_id, job_id, source_value,
       confidence, evidence)
     VALUES ($1, $2, '"Backend Developer"', 0.9, 'Backend Developer')`,
    [headlineProvenanceId, jobId]
  );

  // city: changed automatically by B2.
  const cityProvenanceId = await insertOne(
    client,
    `INSERT INTO data_provenance (candidate_id, item_type, item_id, field_name,
       resolution_method, approved_at)
     VALUES ($1, 'candidate_profile', $2, 'city', 'latest_value', CURRENT_TIMESTAMP)
     RETURNING id`,
    [candidateId, String(candidateId)]
  );
  await client.query(
    `INSERT INTO data_provenance_sources (provenance_id, job_id, source_value,
       confidence, evidence)
     VALUES ($1, $2, '"Dubai"', 0.9, 'Dubai')`,
    [cityProvenanceId, jobId]
  );
  const autoConflictId = await insertOne(
    client,
    `INSERT INTO conflicts (candidate_id, field_name, item_type, item_id, status,
       resolution_method, applied_rule, resolved_value, resolved_at)
     VALUES ($1, 'city', 'candidate_profile', $2, 'resolved', 'automatic_rule',
       'B2', '"Dubai"', CURRENT_TIMESTAMP)
     RETURNING id`,
    [candidateId, String(candidateId)]
  );
  await client.query(
    `INSERT INTO conflict_options (conflict_id, value, source_file_id, confidence, evidence)
     VALUES ($1, '"Amman"', $2, 0.9, 'Amman'), ($1, '"Dubai"', $3, 0.9, 'Dubai')`,
    [autoConflictId, oldFileId, fileId]
  );

  // A completed human decision on the summary field.
  const humanConflictId = await insertOne(
    client,
    `INSERT INTO conflicts (candidate_id, field_name, item_type, item_id, status,
       resolution_method, resolved_value, resolved_at)
     VALUES ($1, 'summary', 'candidate_profile', $2, 'resolved', 'human_review',
       '"Kept"', CURRENT_TIMESTAMP)
     RETURNING id`,
    [candidateId, String(candidateId)]
  );
  await client.query(
    `INSERT INTO conflict_options (conflict_id, value, source_file_id, confidence, evidence)
     VALUES ($1, '"Kept"', $2, 0.9, 'Kept'), ($1, '"Other"', $3, 0.4, 'Other')`,
    [humanConflictId, oldFileId, fileId]
  );
  const humanReviewId = await insertOne(
    client,
    `INSERT INTO human_reviews (candidate_id, review_target_type, item_id,
       review_reason, review_status, admin_id, reviewed_at, review_result,
       confidence, created_at)
     VALUES ($1, 'conflict', $2, 'conflict', 'completed', $3, CURRENT_TIMESTAMP,
       'choose', 0.95, CURRENT_TIMESTAMP)
     RETURNING id`,
    [candidateId, humanConflictId, adminId]
  );
  await client.query(
    `INSERT INTO human_audit_log (candidate_id, item_type, item_id, field_name,
       previous_value, new_value, changed_by, timestamp)
     VALUES ($1, 'candidate_profile', $2, 'summary', 'null', '"Kept"', $3,
       CURRENT_TIMESTAMP)`,
    [candidateId, String(candidateId), adminId]
  );

  return {
    candidateId,
    jobId,
    headlineProvenanceId,
    autoConflictId,
    humanReviewId
  };
}

describeDb('US-25 traceability checks', () => {
  let pool;
  let client;

  beforeAll(() => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    client = await pool.connect();
    await client.query('BEGIN');
  });

  afterEach(async () => {
    await client.query('ROLLBACK');
    client.release();
  });

  test('a fully traceable candidate adds no failure to any check', async () => {
    const baseline = await runTraceabilityChecks(client);
    await insertTraceableFixture(client);
    const report = await runTraceabilityChecks(client);

    for (const check of report.checks) {
      expect({
        id: check.id,
        failures: check.failures
      }).toEqual({
        id: check.id,
        failures: failuresOf(baseline, check.id).failures
      });
    }
    expect(report.automaticDecisions).toBe(baseline.automaticDecisions + 1);
  });

  test('a provenance row deleted on purpose is reported as a failure', async () => {
    const { candidateId, headlineProvenanceId } =
      await insertTraceableFixture(client);
    const before = await runTraceabilityChecks(client);

    await client.query(
      'DELETE FROM data_provenance_sources WHERE provenance_id = $1',
      [headlineProvenanceId]
    );
    await client.query('DELETE FROM data_provenance WHERE id = $1', [
      headlineProvenanceId
    ]);
    const after = await runTraceabilityChecks(client);

    const check = failuresOf(after, 'values_without_provenance');
    expect(check.failures).toBe(
      failuresOf(before, 'values_without_provenance').failures + 1
    );
    expect(check.passed).toBe(false);
    expect(after.passed).toBe(false);
    expect(formatTraceabilityReport(after)).toContain('Result: FAIL');

    const offending = await client.query(
      `SELECT 1 FROM candidate_profiles cp
       WHERE cp.id = $1 AND NOT EXISTS (
         SELECT 1 FROM data_provenance dp
         WHERE dp.item_type = 'candidate_profile'
           AND dp.item_id = cp.id::text AND dp.field_name = 'headline')`,
      [candidateId]
    );
    expect(offending.rowCount).toBe(1);
  });

  test('an extracted value whose evidence is blank is reported', async () => {
    const { headlineProvenanceId } = await insertTraceableFixture(client);
    const before = await runTraceabilityChecks(client);

    await client.query(
      `UPDATE data_provenance_sources SET evidence = '  ' WHERE provenance_id = $1`,
      [headlineProvenanceId]
    );
    const after = await runTraceabilityChecks(client);

    expect(
      failuresOf(after, 'extracted_values_without_evidence').failures
    ).toBe(
      failuresOf(before, 'extracted_values_without_evidence').failures + 1
    );
  });

  test('an automatic decision with one option is reported', async () => {
    const { autoConflictId } = await insertTraceableFixture(client);
    const before = await runTraceabilityChecks(client);

    await client.query(
      `DELETE FROM conflict_options
       WHERE id = (SELECT MIN(id) FROM conflict_options WHERE conflict_id = $1)`,
      [autoConflictId]
    );
    const after = await runTraceabilityChecks(client);

    expect(failuresOf(after, 'invalid_automatic_conflicts').failures).toBe(
      failuresOf(before, 'invalid_automatic_conflicts').failures + 1
    );
  });

  test('a human decision without confidence is reported', async () => {
    const { humanReviewId } = await insertTraceableFixture(client);
    const before = await runTraceabilityChecks(client);

    await client.query(
      'UPDATE human_reviews SET confidence = NULL WHERE id = $1',
      [humanReviewId]
    );
    const after = await runTraceabilityChecks(client);

    const check = failuresOf(after, 'incomplete_human_decisions');
    expect(check.failures).toBe(
      failuresOf(before, 'incomplete_human_decisions').failures + 1
    );
    expect(check.completePercent).toBeLessThan(100);
  });

  test('an extraction without a prompt version is reported', async () => {
    const { jobId } = await insertTraceableFixture(client);
    const before = await runTraceabilityChecks(client);

    await client.query(
      'UPDATE processing_jobs SET prompt_version = NULL WHERE id = $1',
      [jobId]
    );
    const after = await runTraceabilityChecks(client);

    expect(failuresOf(after, 'extractions_without_versions').failures).toBe(
      failuresOf(before, 'extractions_without_versions').failures + 1
    );
    // Both sources of the fixture come from that job.
    expect(
      failuresOf(after, 'approved_values_without_versioned_job').failures
    ).toBe(
      failuresOf(before, 'approved_values_without_versioned_job').failures + 2
    );
  });
});
