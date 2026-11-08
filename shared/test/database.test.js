const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');
const crypto = require('crypto');
const { seedAdmin } = require('../src/seed');

// Load environment variables from the root .env file.
dotenv.config({
  path: path.resolve(__dirname, '../../.env')
});

let pool;
let createdEmails = [];

beforeAll(async () => {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;

  if (!testDatabaseUrl) {
    throw new Error('TEST_DATABASE_URL must be set in .env');
  }

  pool = new Pool({
    connectionString: testDatabaseUrl
  });

  // Safety check: never run database tests on the main database.
  const result = await pool.query('SELECT current_database() AS name');

  if (result.rows[0].name !== 'simera_test') {
    await pool.end();
    throw new Error(
      `Database tests must run on simera_test, not ${result.rows[0].name}`
    );
  }
});

afterEach(async () => {
  if (createdEmails.length > 0) {
    await pool.query(
      `DELETE FROM candidate_profiles
       WHERE user_id IN (
         SELECT id FROM users WHERE email = ANY($1::varchar[])
       )`,
      [createdEmails]
    );

    await pool.query(
      `DELETE FROM admins
       WHERE user_id IN (
         SELECT id FROM users WHERE email = ANY($1::varchar[])
       )`,
      [createdEmails]
    );

    await pool.query('DELETE FROM users WHERE email = ANY($1::varchar[])', [
      createdEmails
    ]);

    createdEmails = [];
  }
});
afterAll(async () => {
  if (pool) {
    await pool.end();
  }
});

describe('Database integration tests', () => {
  it('contains the required users and candidate_profiles tables', async () => {
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('users', 'candidate_profiles')
    `);

    const tableNames = result.rows.map((row) => row.table_name);

    expect(tableNames).toContain('users');
    expect(tableNames).toContain('candidate_profiles');
  });

  it('prevents duplicate user emails', async () => {
    const email = `test-${crypto.randomUUID()}@example.com`;
    createdEmails.push(email);

    const passwordHash = 'test-password-hash';

    await pool.query(
      `INSERT INTO users (email, password_hash, created_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)`,
      [email, passwordHash]
    );

    await expect(
      pool.query(
        `INSERT INTO users (email, password_hash, created_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP)`,
        [email, passwordHash]
      )
    ).rejects.toMatchObject({
      code: '23505'
    });
  });

  it('prevents creating a candidate profile for a non-existing user', async () => {
    await expect(
      pool.query(
        `INSERT INTO candidate_profiles (user_id, created_at)
         VALUES ($1, CURRENT_TIMESTAMP)`,
        [-999999]
      )
    ).rejects.toMatchObject({
      code: '23503'
    });
  });

  it('prevents creating an admin for a non-existing user', async () => {
    await expect(
      pool.query('INSERT INTO admins (user_id) VALUES ($1)', [-999999])
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('prevents assigning more than one admin to the same user', async () => {
    const email = `test-admin-${crypto.randomUUID()}@example.com`;
    createdEmails.push(email);

    const userResult = await pool.query(
      `INSERT INTO users (email, password_hash, created_at)
     VALUES ($1, $2, CURRENT_TIMESTAMP)
     RETURNING id`,
      [email, 'test-password-hash']
    );

    const userId = userResult.rows[0].id;

    await pool.query('INSERT INTO admins (user_id) VALUES ($1)', [userId]);

    await expect(
      pool.query('INSERT INTO admins (user_id) VALUES ($1)', [userId])
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('prevents creating more than one candidate profile for the same user', async () => {
    const email = `test-candidate-${crypto.randomUUID()}@example.com`;
    createdEmails.push(email);

    const userResult = await pool.query(
      `INSERT INTO users (email, password_hash, created_at)
     VALUES ($1, $2, CURRENT_TIMESTAMP)
     RETURNING id`,
      [email, 'test-password-hash']
    );

    const userId = userResult.rows[0].id;

    await pool.query(
      'INSERT INTO candidate_profiles (user_id, created_at) VALUES ($1, CURRENT_TIMESTAMP)',
      [userId]
    );

    await expect(
      pool.query(
        'INSERT INTO candidate_profiles (user_id, created_at) VALUES ($1, CURRENT_TIMESTAMP)',
        [userId]
      )
    ).rejects.toMatchObject({ code: '23505' });
  });
  it('does not create duplicate admin accounts when seed runs twice', async () => {
    const email = `test-seed-${crypto.randomUUID()}@example.com`;
    createdEmails.push(email);

    const env = {
      ADMIN_EMAIL: email,
      ADMIN_PASSWORD: 'test-admin-password-123'
    };

    await seedAdmin({ dbPool: pool, env });
    await seedAdmin({ dbPool: pool, env });

    const result = await pool.query(
      `SELECT COUNT(*)::int AS count
     FROM users u
     JOIN admins a ON a.user_id = u.id
     WHERE u.email = $1`,
      [email]
    );

    expect(result.rows[0].count).toBe(1);
  });
});
