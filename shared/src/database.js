const { Pool } = require('pg');
const { loadConfig } = require('./config');

const config = loadConfig();

const pool = new Pool({
  connectionString: config.DATABASE_URL
});

module.exports = pool;
