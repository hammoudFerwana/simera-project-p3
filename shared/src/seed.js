
const bcrypt = require('bcrypt');
const pool = require('./database');

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env');
  }

  if (password.length < 12) {
    throw new Error('Admin password must be at least 12 characters');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const existingUser = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rowCount > 0) {
      const userId = existingUser.rows[0].id;

      const existingAdmin = await client.query(
        'SELECT id FROM admins WHERE user_id = $1',
        [userId]
      );

      if (existingAdmin.rowCount === 0) {
        throw new Error(
          'This email belongs to an existing non-admin user. Cannot promote it automatically.'
        );
      }

      console.log('Admin account already exists. No changes made.');
    } else {
      const passwordHash = await bcrypt.hash(password, 12);

      const newUser = await client.query(
        `INSERT INTO users (
          email,
          password_hash,
          email_verified,
          created_at
        )
        VALUES ($1, $2, TRUE, CURRENT_TIMESTAMP)
        RETURNING id`,
        [email, passwordHash]
      );

      const userId = newUser.rows[0].id;

      await client.query(
        'INSERT INTO admins (user_id) VALUES ($1)',
        [userId]
      );

      console.log('Admin account created successfully.');
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

seedAdmin()
  .catch((error) => {
    console.error('Admin seeding failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
