/**
 * Cleanup helper for the golden runner.
 * Deletes all rows belonging to @golden.example users (children first) and their raw files.
 */

async function cleanupGoldenUsers(pool, storage) {
  const usersRes = await pool.query(
    "SELECT id FROM users WHERE email LIKE '%@golden.example'"
  );
  if (usersRes.rows.length === 0) {
    return { cleanedUsers: 0 };
  }

  const userIds = usersRes.rows.map((r) => r.id);

  const candsRes = await pool.query(
    'SELECT id FROM candidate_profiles WHERE user_id = ANY($1::int[])',
    [userIds]
  );
  const candidateIds = candsRes.rows.map((r) => r.id);

  if (candidateIds.length > 0) {
    // Collect raw files to remove from disk
    const filesRes = await pool.query(
      'SELECT storage_location FROM uploaded_files WHERE candidate_id = ANY($1::int[])',
      [candidateIds]
    );

    if (storage && typeof storage.remove === 'function') {
      for (const row of filesRes.rows) {
        if (row.storage_location) {
          try {
            await storage.remove(row.storage_location);
          } catch {
            // ignore missing files on disk
          }
        }
      }
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (candidateIds.length > 0) {
      await client.query(
        'DELETE FROM human_audit_log WHERE candidate_id = ANY($1::int[])',
        [candidateIds]
      );

      await client.query(
        'DELETE FROM human_reviews WHERE candidate_id = ANY($1::int[])',
        [candidateIds]
      );

      await client.query(
        'DELETE FROM conflict_options WHERE conflict_id IN (SELECT id FROM conflicts WHERE candidate_id = ANY($1::int[]))',
        [candidateIds]
      );

      await client.query(
        'DELETE FROM conflicts WHERE candidate_id = ANY($1::int[])',
        [candidateIds]
      );

      await client.query(
        'DELETE FROM data_provenance_sources WHERE provenance_id IN (SELECT id FROM data_provenance WHERE candidate_id = ANY($1::int[]))',
        [candidateIds]
      );

      await client.query(
        'DELETE FROM data_provenance WHERE candidate_id = ANY($1::int[])',
        [candidateIds]
      );

      await client.query(
        'DELETE FROM unknown_skills WHERE candidate_id = ANY($1::int[])',
        [candidateIds]
      );

      await client.query(
        'DELETE FROM candidate_skills WHERE candidate_id = ANY($1::int[])',
        [candidateIds]
      );

      await client.query(
        'DELETE FROM candidate_languages WHERE candidate_id = ANY($1::int[])',
        [candidateIds]
      );

      await client.query(
        'DELETE FROM candidate_links WHERE candidate_id = ANY($1::int[])',
        [candidateIds]
      );

      await client.query(
        'DELETE FROM work_experience WHERE candidate_id = ANY($1::int[])',
        [candidateIds]
      );

      await client.query(
        'DELETE FROM education WHERE candidate_id = ANY($1::int[])',
        [candidateIds]
      );

      await client.query(
        'DELETE FROM certifications WHERE candidate_id = ANY($1::int[])',
        [candidateIds]
      );

      await client.query(
        'DELETE FROM projects WHERE candidate_id = ANY($1::int[])',
        [candidateIds]
      );

      await client.query(
        'DELETE FROM awards WHERE candidate_id = ANY($1::int[])',
        [candidateIds]
      );

      await client.query(
        'DELETE FROM publications WHERE candidate_id = ANY($1::int[])',
        [candidateIds]
      );

      await client.query(
        'DELETE FROM volunteering WHERE candidate_id = ANY($1::int[])',
        [candidateIds]
      );

      await client.query(
        'DELETE FROM processing_jobs WHERE file_id IN (SELECT id FROM uploaded_files WHERE candidate_id = ANY($1::int[]))',
        [candidateIds]
      );

      await client.query(
        'DELETE FROM uploaded_files WHERE candidate_id = ANY($1::int[])',
        [candidateIds]
      );

      await client.query(
        'DELETE FROM candidate_profiles WHERE id = ANY($1::int[])',
        [candidateIds]
      );
    }

    await client.query('DELETE FROM admins WHERE user_id = ANY($1::int[])', [
      userIds
    ]);

    await client.query('DELETE FROM users WHERE id = ANY($1::int[])', [
      userIds
    ]);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return { cleanedUsers: userIds.length };
}

module.exports = { cleanupGoldenUsers };
