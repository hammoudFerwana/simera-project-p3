#!/usr/bin/env node
/**
 * Traceability verification (US-25).
 * Runs every Requirements 4.3 check against the golden database after the
 * golden dataset run, prints PASS or FAIL per check, and exits with code 1
 * when any check fails. All checks are read-only.
 */

require('dotenv').config();

const { Pool } = require('pg');
const { validateGoldenDatabaseUrl } = require('./lib/db-guard');
const {
  runTraceabilityChecks,
  formatTraceabilityReport
} = require('./lib/traceability-checks');

async function main() {
  const databaseUrl = process.env.GOLDEN_DATABASE_URL;
  validateGoldenDatabaseUrl(databaseUrl);

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const report = await runTraceabilityChecks(pool);
    console.log(formatTraceabilityReport(report));
    return report.passed ? 0 : 1;
  } finally {
    await pool.end();
  }
}

main()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error) => {
    console.error('Traceability verification failed to run:', error.message);
    process.exitCode = 1;
  });
