const fs = require('fs');
const os = require('os');
const path = require('path');
const { createExtractTextStep } = require('../src/steps/extract-text');
const { createCheckEmailStep } = require('../src/steps/check-email');
const { runSteps } = require('../src/orchestrator');
const { createLocalStorage } = require('shared/src/upload/storage');
const { MIME_TYPES } = require('shared/src/upload/file-types');
const { PermanentError, TemporaryError } = require('shared/src/errors');

const FIXTURES_DIR = path.resolve(__dirname, '../../shared/test/fixtures');

describe('worker/src/steps/extract-text.js (step 1)', () => {
  let tempDir;
  let storage;

  beforeAll(async () => {
    tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'simera-extract-test-')
    );
    const files = await fs.promises.readdir(FIXTURES_DIR);
    for (const file of files) {
      await fs.promises.copyFile(
        path.join(FIXTURES_DIR, file),
        path.join(tempDir, file)
      );
    }
    storage = createLocalStorage({ directory: tempDir });
  });

  afterAll(async () => {
    if (tempDir) {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  });

  function createFakeDb(row) {
    return {
      query: jest.fn(async () => ({
        rows: row ? [row] : []
      }))
    };
  }

  test('cv-links.pdf (application/pdf): ctx.text contains a known line, ctx.links contains a known URL', async () => {
    const db = createFakeDb({
      storage_location: 'cv-links.pdf',
      mime_type: MIME_TYPES.pdf,
      source_type: 'cv'
    });
    const step = createExtractTextStep({ db, getStorage: () => storage });
    const ctx = { jobId: 1, fileId: 101, candidateId: 10, userId: 1 };

    const result = await step(ctx);

    expect(result.text).toContain('Jane Doe - Software Engineer');
    expect(result.links).toEqual(
      expect.arrayContaining([
        { label: 'My Portfolio', url: 'https://janedoe.dev/portfolio' }
      ])
    );
  });

  test('cv-links.docx: ctx.text contains a known line, ctx.links contains a known URL', async () => {
    const db = createFakeDb({
      storage_location: 'cv-links.docx',
      mime_type: MIME_TYPES.docx,
      source_type: 'cv'
    });
    const step = createExtractTextStep({ db, getStorage: () => storage });
    const ctx = { jobId: 2, fileId: 102, candidateId: 10, userId: 1 };

    const result = await step(ctx);

    expect(result.text).toContain('Jane Doe - Software Engineer');
    expect(result.links).toEqual(
      expect.arrayContaining([
        { label: 'My Portfolio', url: 'https://janedoe.dev/portfolio' }
      ])
    );
  });

  test('linkedin-links.md: ctx.text contains a known line, ctx.links contains a known URL', async () => {
    const db = createFakeDb({
      storage_location: 'linkedin-links.md',
      mime_type: MIME_TYPES.markdown,
      source_type: 'linkedin'
    });
    const step = createExtractTextStep({ db, getStorage: () => storage });
    const ctx = { jobId: 3, fileId: 103, candidateId: 10, userId: 1 };

    const result = await step(ctx);

    expect(result.text).toContain('Jane Doe');
    expect(result.links).toEqual(
      expect.arrayContaining([
        { label: 'My Portfolio', url: 'https://janedoe.dev/portfolio' }
      ])
    );
  });

  test('scanned-empty.pdf: PermanentError with message "Extracted text is empty"', async () => {
    const db = createFakeDb({
      storage_location: 'scanned-empty.pdf',
      mime_type: MIME_TYPES.pdf,
      source_type: 'cv'
    });
    const step = createExtractTextStep({ db, getStorage: () => storage });
    const ctx = { jobId: 4, fileId: 104, candidateId: 10, userId: 1 };

    await expect(step(ctx)).rejects.toThrow(
      new PermanentError('Extracted text is empty')
    );
  });

  test('corrupted.pdf: PermanentError "The file could not be read"', async () => {
    const db = createFakeDb({
      storage_location: 'corrupted.pdf',
      mime_type: MIME_TYPES.pdf,
      source_type: 'cv'
    });
    const step = createExtractTextStep({ db, getStorage: () => storage });
    const ctx = { jobId: 5, fileId: 105, candidateId: 10, userId: 1 };

    await expect(step(ctx)).rejects.toThrow(
      new PermanentError('The file could not be read')
    );
  });

  test('a row whose file is not on disk: PermanentError "The uploaded file is missing"', async () => {
    const db = createFakeDb({
      storage_location: 'non-existent.pdf',
      mime_type: MIME_TYPES.pdf,
      source_type: 'cv'
    });
    const step = createExtractTextStep({ db, getStorage: () => storage });
    const ctx = { jobId: 6, fileId: 106, candidateId: 10, userId: 1 };

    await expect(step(ctx)).rejects.toThrow(
      new PermanentError('The uploaded file is missing')
    );
  });

  test('no row: PermanentError "Uploaded file not found"', async () => {
    const db = createFakeDb(null);
    const step = createExtractTextStep({ db, getStorage: () => storage });
    const ctx = { jobId: 7, fileId: 107, candidateId: 10, userId: 1 };

    await expect(step(ctx)).rejects.toThrow(
      new PermanentError('Uploaded file not found')
    );
  });

  test('simera-profile.json (US-22): the raw JSON is the text, URLs become links', async () => {
    const db = createFakeDb({
      storage_location: 'simera-profile.json',
      mime_type: MIME_TYPES.json,
      source_type: 'simera_profile'
    });
    const step = createExtractTextStep({ db, getStorage: () => storage });
    const ctx = { jobId: 8, fileId: 108, candidateId: 10, userId: 1 };

    const result = await step(ctx);

    expect(result.text).toContain('"email": "jane.doe@example.com"');
    expect(result.text).toContain('"city": "Ramallah"');
    expect(result.links).toEqual([
      {
        label: 'https://janedoe.dev/portfolio',
        url: 'https://janedoe.dev/portfolio'
      }
    ]);
  });

  test('simera-profile.json then the email check: the JSON email matches the account', async () => {
    const db = {
      query: jest.fn(async (sql) =>
        sql.includes('uploaded_files')
          ? {
              rows: [
                {
                  storage_location: 'simera-profile.json',
                  mime_type: MIME_TYPES.json
                }
              ]
            }
          : { rows: [{ email: 'jane.doe@example.com' }] }
      )
    };
    const ctx = { jobId: 12, fileId: 112, candidateId: 10, userId: 1 };

    const result = await runSteps(ctx, [
      createExtractTextStep({ db, getStorage: () => storage }),
      createCheckEmailStep({ db })
    ]);

    expect(result.loginEmail).toBe('jane.doe@example.com');
  });

  test('a Simera JSON with a second email (contact_email) still passes the email check', async () => {
    // The top-level email is the login email (the upload checks it); any
    // other address in the file does not fail the job.
    await fs.promises.writeFile(
      path.join(tempDir, 'simera-two-emails.json'),
      JSON.stringify(
        {
          email: 'jane.doe@example.com',
          contact_email: 'jane.work@acme.example',
          first_name: 'Jane',
          headline: 'Senior Software Engineer'
        },
        null,
        2
      )
    );
    const db = {
      query: jest.fn(async (sql) =>
        sql.includes('uploaded_files')
          ? {
              rows: [
                {
                  storage_location: 'simera-two-emails.json',
                  mime_type: MIME_TYPES.json
                }
              ]
            }
          : { rows: [{ email: 'jane.doe@example.com' }] }
      )
    };
    const ctx = { jobId: 13, fileId: 113, candidateId: 10, userId: 1 };

    const result = await runSteps(ctx, [
      createExtractTextStep({ db, getStorage: () => storage }),
      createCheckEmailStep({ db })
    ]);

    expect(result.text).toContain('jane.work@acme.example');
    expect(result.loginEmail).toBe('jane.doe@example.com');
  });

  test('mime_type "image/png": PermanentError "Unsupported file type"', async () => {
    const db = createFakeDb({
      storage_location: 'cv-links.pdf',
      mime_type: 'image/png',
      source_type: 'cv'
    });
    const step = createExtractTextStep({ db, getStorage: () => storage });
    const ctx = { jobId: 9, fileId: 109, candidateId: 10, userId: 1 };

    await expect(step(ctx)).rejects.toThrow(
      new PermanentError('Unsupported file type')
    );
  });

  test('a file system error other than ENOENT (inject a getStorage whose resolvePath points to a folder): TemporaryError', async () => {
    const db = createFakeDb({
      storage_location: 'cv-links.pdf',
      mime_type: MIME_TYPES.pdf,
      source_type: 'cv'
    });
    const step = createExtractTextStep({
      db,
      getStorage: () => ({
        resolvePath: () => tempDir
      })
    });
    const ctx = { jobId: 10, fileId: 110, candidateId: 10, userId: 1 };

    await expect(step(ctx)).rejects.toThrow(
      new TemporaryError('The uploaded file could not be opened')
    );
  });

  test('the step runs before the email check: passes for matching email and fails with mismatch error for another email', async () => {
    const buildFakeMultiDb = (loginEmail) => ({
      query: jest.fn(async (sql) => {
        if (sql.includes('uploaded_files')) {
          return {
            rows: [
              {
                storage_location: 'cv-wrapped-link.pdf',
                mime_type: MIME_TYPES.pdf,
                source_type: 'cv'
              }
            ]
          };
        }
        if (sql.includes('candidate_profiles')) {
          return {
            rows: [{ email: loginEmail }]
          };
        }
        return { rows: [] };
      })
    });

    const matchingDb = buildFakeMultiDb('jane.doe@example.com');
    const extractStepMatching = createExtractTextStep({
      db: matchingDb,
      getStorage: () => storage
    });
    const checkEmailStepMatching = createCheckEmailStep({ db: matchingDb });

    const ctx = { jobId: 11, fileId: 111, candidateId: 10, userId: 1 };
    const successResult = await runSteps(ctx, [
      extractStepMatching,
      checkEmailStepMatching
    ]);

    expect(successResult.loginEmail).toBe('jane.doe@example.com');
    expect(successResult.text).toBeDefined();
    expect(successResult.links).toBeDefined();

    const mismatchingDb = buildFakeMultiDb('other.user@example.com');
    const extractStepMismatch = createExtractTextStep({
      db: mismatchingDb,
      getStorage: () => storage
    });
    const checkEmailStepMismatch = createCheckEmailStep({ db: mismatchingDb });

    await expect(
      runSteps(ctx, [extractStepMismatch, checkEmailStepMismatch])
    ).rejects.toThrow(
      new PermanentError(
        'The file contains an email that does not match your account email'
      )
    );
  });
});
