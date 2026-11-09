const fs = require('fs');
const path = require('path');
const pool = require('./database');

async function runSchema() {
  let client;
  let transactionStarted = false;

  try {
    client = await pool.connect();

    // Check whether the database is already initialized.
    const result = await client.query(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
      ) AS initialized
    `);

    if (result.rows[0].initialized) {
      throw new Error(
        'Database is already initialized. Schema execution was skipped.'
      );
    }

    const schemaPath = path.join(__dirname, '../sql/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Start transaction.
    await client.query('BEGIN');
    transactionStarted = true;

    await client.query(schema);

    // Commit changes if everything succeeds.
    await client.query('COMMIT');
    transactionStarted = false;

    console.log('Database schema applied successfully.');
  } catch (error) {
    if (client && transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Rollback failed:', rollbackError.message);
      }
    }

    console.error('Failed to apply database schema:', error.message);
    process.exitCode = 1;
  } finally {
    if (client) {
      client.release();
    }

    await pool.end();
  }
}

runSchema();
