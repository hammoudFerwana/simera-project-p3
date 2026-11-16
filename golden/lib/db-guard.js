/**
 * Safety check for the golden test database name.
 * Refuses to run against any database whose name does not start with "simera_golden".
 */

function extractDatabaseName(url) {
  if (!url || typeof url !== 'string' || url.trim() === '') {
    throw new Error('GOLDEN_DATABASE_URL is not set or empty');
  }

  try {
    const parsed = new URL(url.trim());
    const dbName = parsed.pathname.replace(/^\/+/, '').split('?')[0];
    if (!dbName) {
      throw new Error('No database name found in GOLDEN_DATABASE_URL');
    }
    return dbName;
  } catch (err) {
    if (
      err.message.includes('simera_golden') ||
      err.message.includes('GOLDEN_DATABASE_URL')
    ) {
      throw err;
    }
    // Fallback regex for non-standard connection strings
    const match = url.match(/\/([^/?]+)(?:\?|$)/);
    if (match && match[1]) {
      return match[1];
    }
    throw new Error(`Invalid GOLDEN_DATABASE_URL: ${err.message}`);
  }
}

function validateGoldenDatabaseUrl(url) {
  const dbName = extractDatabaseName(url);
  if (!dbName.startsWith('simera_golden')) {
    throw new Error(
      `Refusing to start: database name "${dbName}" does not start with "simera_golden". Never run against main or test databases.`
    );
  }
  return dbName;
}

module.exports = {
  extractDatabaseName,
  validateGoldenDatabaseUrl
};
