const path = require('path');
const dotenv = require('dotenv');

const DEFAULT_REQUIRED_VARS = ['NODE_ENV', 'API_PORT', 'DATABASE_URL'];

function loadConfig(options = {}) {
  const envPath =
    options.envPath ||
    process.env.DOTENV_CONFIG_PATH ||
    path.resolve(__dirname, '../../.env');

  if (!options.skipDotenv) {
    dotenv.config({ path: envPath });
  }

  const env = options.env || process.env;
  const requiredVars = options.requiredVars || DEFAULT_REQUIRED_VARS;

  const missingVars = requiredVars.filter((varName) => {
    const val = env[varName];
    return val === undefined || val === null || String(val).trim() === '';
  });

  if (missingVars.length > 0) {
    console.error(
      `Missing required environment variable(s): ${missingVars.join(', ')}`
    );
    process.exit(1);
  }

  const config = {
    NODE_ENV: env.NODE_ENV,
    API_PORT: env.API_PORT ? parseInt(env.API_PORT, 10) : 3000,
    DATABASE_URL: env.DATABASE_URL
  };

  return Object.freeze(config);
}

module.exports = { loadConfig };
