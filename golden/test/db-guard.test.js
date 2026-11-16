const {
  validateGoldenDatabaseUrl,
  extractDatabaseName
} = require('../lib/db-guard');

describe('db-guard: safety check for golden database', () => {
  test('extracts database name from valid PostgreSQL connection string', () => {
    const dbName = extractDatabaseName(
      'postgresql://postgres:secret@localhost:5432/simera_golden'
    );
    expect(dbName).toBe('simera_golden');
  });

  test('extracts database name with query parameters', () => {
    const dbName = extractDatabaseName(
      'postgres://user:pass@localhost:5432/simera_golden_test?sslmode=disable'
    );
    expect(dbName).toBe('simera_golden_test');
  });

  test('accepts database names starting with simera_golden', () => {
    expect(() =>
      validateGoldenDatabaseUrl('postgresql://localhost:5432/simera_golden')
    ).not.toThrow();

    expect(() =>
      validateGoldenDatabaseUrl(
        'postgresql://localhost:5432/simera_golden_integration'
      )
    ).not.toThrow();
  });

  test('refuses main database (simera)', () => {
    expect(() =>
      validateGoldenDatabaseUrl('postgresql://localhost:5432/simera')
    ).toThrow(
      /Refusing to start: database name "simera" does not start with "simera_golden"/
    );
  });

  test('refuses test database (simera_test)', () => {
    expect(() =>
      validateGoldenDatabaseUrl('postgresql://localhost:5432/simera_test')
    ).toThrow(
      /Refusing to start: database name "simera_test" does not start with "simera_golden"/
    );
  });

  test('refuses dev database (simera_dev)', () => {
    expect(() =>
      validateGoldenDatabaseUrl('postgresql://localhost:5432/simera_dev')
    ).toThrow(
      /Refusing to start: database name "simera_dev" does not start with "simera_golden"/
    );
  });

  test('refuses empty or missing url', () => {
    expect(() => validateGoldenDatabaseUrl('')).toThrow(
      /GOLDEN_DATABASE_URL is not set or empty/
    );
    expect(() => validateGoldenDatabaseUrl(null)).toThrow(
      /GOLDEN_DATABASE_URL is not set or empty/
    );
    expect(() => validateGoldenDatabaseUrl(undefined)).toThrow(
      /GOLDEN_DATABASE_URL is not set or empty/
    );
  });
});
