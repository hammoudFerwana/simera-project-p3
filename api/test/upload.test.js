/**
 * US-04 tests: the upload endpoint and the admin raw-file download, with an
 * in-memory fake DB, a real storage folder in a temp directory and a fake
 * queue. No Postgres or pg-boss is needed.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const { createLocalStorage } = require('shared/src/upload/storage');
const { createApp } = require('../src/app');
const { signToken } = require('../src/auth/token');

process.env.JWT_SECRET = 'test-secret-for-us-04';

const FIXTURES = path.join(__dirname, 'fixtures');
const fixture = (name) => fs.readFileSync(path.join(FIXTURES, name));

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const USERS = {
  candidate: { userId: 1, candidateId: 10, emailVerified: true },
  otherCandidate: { userId: 2, candidateId: 20, emailVerified: true },
  unverified: { userId: 3, candidateId: 30, emailVerified: false },
  admin: { userId: 99 }
};

/**
 * In-memory stand-in for the pg Pool. It answers the queries the upload code
 * runs and keeps transaction writes pending until COMMIT.
 */
function createFakeDb({
  failJobInsert = false,
  raceOnFileInsert = false
} = {}) {
  const state = { files: [], jobs: [] };
  const newPending = () => ({ files: [], jobs: [] });

  function answer(sql, params, pending) {
    const text = sql.replace(/\s+/g, ' ').trim();

    if (text.includes('FROM users u JOIN candidate_profiles')) {
      const user = Object.values(USERS).find((u) => u.userId === params[0]);
      return {
        rows:
          user && user.candidateId
            ? [
                {
                  candidate_id: user.candidateId,
                  email_verified: user.emailVerified
                }
              ]
            : []
      };
    }
    if (text.startsWith('SELECT 1 FROM uploaded_files WHERE file_hash')) {
      return { rows: state.files.filter((f) => f.file_hash === params[0]) };
    }
    if (text.startsWith('SELECT original_filename')) {
      return { rows: state.files.filter((f) => f.id === params[0]) };
    }
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(text)) {
      return { rows: [] };
    }
    if (text.startsWith('INSERT INTO uploaded_files')) {
      if (raceOnFileInsert) {
        const error = new Error('duplicate key value');
        error.code = '23505';
        error.table = 'uploaded_files';
        throw error;
      }
      const [
        candidateId,
        sourceType,
        originalFilename,
        fileSize,
        fileHash,
        storageLocation,
        mimeType,
        uploadedAt,
        validatedAt
      ] = params;
      const row = {
        id: state.files.length + pending.files.length + 1,
        candidate_id: candidateId,
        source_type: sourceType,
        original_filename: originalFilename,
        file_size: fileSize,
        file_hash: fileHash,
        storage_location: storageLocation,
        mime_type: mimeType,
        uploaded_at: uploadedAt,
        validated_at: validatedAt
      };
      pending.files.push(row);
      return { rows: [{ id: row.id }] };
    }
    if (text.startsWith('INSERT INTO processing_jobs')) {
      if (failJobInsert) {
        throw new Error('job insert failed');
      }
      expect(text).toContain('CURRENT_TIMESTAMP');
      const row = {
        id: state.jobs.length + pending.jobs.length + 1,
        file_id: params[0],
        status: 'queued'
      };
      pending.jobs.push(row);
      return { rows: [{ id: row.id }] };
    }
    throw new Error(`Unexpected query: ${text}`);
  }

  return {
    state,
    async query(sql, params) {
      return answer(sql, params, newPending());
    },
    async connect() {
      let pending = newPending();
      return {
        async query(sql, params) {
          const result = answer(sql, params, pending);
          if (sql === 'COMMIT') {
            state.files.push(...pending.files);
            state.jobs.push(...pending.jobs);
          }
          if (sql === 'ROLLBACK') {
            pending = newPending();
          }
          return result;
        },
        release: jest.fn()
      };
    }
  };
}

let storageDir;
let db;
let enqueueJob;
let app;

function buildApp(dbOptions) {
  db = createFakeDb(dbOptions);
  enqueueJob = jest.fn(async () => {});
  const storage = createLocalStorage({ directory: storageDir });
  app = createApp({
    getDb: () => db,
    getStorage: () => storage,
    enqueueJob,
    getUploadConfig: () => ({ minExtractedTextChars: 50, storageDir })
  });
}

function cookieFor(userKey) {
  const user = USERS[userKey];
  const role = userKey === 'admin' ? 'admin' : 'candidate';
  return `access_token=${signToken({ userId: user.userId, role })}`;
}

function upload(slot, buffer, filename, userKey = 'candidate') {
  return request(app)
    .post(`/api/uploads/${slot}`)
    .set('Cookie', cookieFor(userKey))
    .attach('file', buffer, filename);
}

function storedFiles() {
  return fs.existsSync(storageDir) ? fs.readdirSync(storageDir) : [];
}

/** Requirement 3.3: a rejected file leaves no raw file, no row and no job. */
function expectNothingStored() {
  expect(db.state.files).toHaveLength(0);
  expect(db.state.jobs).toHaveLength(0);
  expect(storedFiles()).toHaveLength(0);
  expect(enqueueJob).not.toHaveBeenCalled();
}

beforeEach(() => {
  storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'us04-'));
  buildApp();
});

afterEach(() => {
  fs.rmSync(storageDir, { recursive: true, force: true });
  jest.restoreAllMocks();
});

describe('POST /api/uploads/:sourceType: accepted files', () => {
  test('a valid PDF CV is saved, recorded and queued', async () => {
    const buffer = fixture('cv.pdf');
    const response = await upload('cv', buffer, 'cv.pdf');

    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      message: 'File received, processing has started',
      fileId: 1,
      jobId: 1
    });

    const [file] = db.state.files;
    expect(file).toMatchObject({
      candidate_id: USERS.candidate.candidateId,
      source_type: 'cv',
      original_filename: 'cv.pdf',
      file_size: buffer.length,
      mime_type: 'application/pdf'
    });
    expect(file.file_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(file.uploaded_at).toBeInstanceOf(Date);
    expect(file.validated_at).toBeInstanceOf(Date);

    expect(db.state.jobs).toEqual([{ id: 1, file_id: 1, status: 'queued' }]);
    expect(enqueueJob).toHaveBeenCalledTimes(1);
    expect(enqueueJob).toHaveBeenCalledWith(1);

    // The raw copy is saved unchanged.
    const saved = fs.readFileSync(path.join(storageDir, file.storage_location));
    expect(saved.equals(buffer)).toBe(true);
  });

  test('a valid DOCX CV is accepted', async () => {
    const response = await upload('cv', fixture('cv.docx'), 'cv.docx');

    expect(response.status).toBe(202);
    expect(db.state.files[0].mime_type).toBe(DOCX_MIME);
  });

  test('a valid LinkedIn md file is accepted', async () => {
    const response = await upload(
      'linkedin',
      fixture('linkedin.md'),
      'linkedin.md'
    );

    expect(response.status).toBe(202);
    expect(db.state.files[0]).toMatchObject({
      source_type: 'linkedin',
      mime_type: 'text/markdown'
    });
  });

  test('an updated CV with different text is a new file with its own job', async () => {
    await upload('cv', fixture('cv.pdf'), 'cv.pdf');
    const response = await upload('cv', fixture('cv-updated.pdf'), 'cv.pdf');

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({ fileId: 2, jobId: 2 });
    expect(db.state.files).toHaveLength(2);
    expect(db.state.jobs).toHaveLength(2);
    expect(enqueueJob).toHaveBeenCalledTimes(2);
  });

  test('the extension is matched case-insensitively', async () => {
    const response = await upload('cv', fixture('cv.pdf'), 'CV.PDF');

    expect(response.status).toBe(202);
  });
});

describe('POST /api/uploads/:sourceType: rejected files', () => {
  test('a .pdf whose content is not PDF lists the accepted formats', async () => {
    const response = await upload(
      'cv',
      Buffer.from('This is plain text pretending to be a PDF document.'),
      'cv.pdf'
    );

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      errors: {
        file: 'This file type is not accepted. Accepted formats for the CV: PDF, DOCX'
      },
      reason: 'unsupported_format',
      acceptedFormats: ['PDF', 'DOCX']
    });
    expectNothingStored();
  });

  test('an md file in the CV slot is rejected', async () => {
    const response = await upload('cv', fixture('linkedin.md'), 'linkedin.md');

    expect(response.status).toBe(400);
    expect(response.body.reason).toBe('unsupported_format');
    expectNothingStored();
  });

  test('a PDF in the LinkedIn slot is rejected', async () => {
    const response = await upload('linkedin', fixture('cv.pdf'), 'cv.pdf');

    expect(response.status).toBe(400);
    expect(response.body.reason).toBe('unsupported_format');
    expect(response.body.acceptedFormats).toEqual(['MD']);
    expectNothingStored();
  });

  test('a binary file named .md is rejected', async () => {
    const response = await upload('linkedin', fixture('cv.docx'), 'profile.md');

    expect(response.status).toBe(400);
    expect(response.body.reason).toBe('unsupported_format');
    expectNothingStored();
  });

  test('a file above 10 MB is rejected with a size message', async () => {
    const buffer = Buffer.concat([
      Buffer.from('%PDF-1.4\n'),
      Buffer.alloc(10 * 1024 * 1024)
    ]);
    const response = await upload('cv', buffer, 'big.pdf');

    expect(response.status).toBe(413);
    expect(response.body).toEqual({
      errors: {
        file: 'The file is larger than 10 MB. Upload a file of 10 MB or less'
      },
      reason: 'file_too_large'
    });
    expectNothingStored();
  });

  test.each([
    ['a corrupted PDF', 'corrupted.pdf', () => fixture('corrupted.pdf')],
    [
      'a corrupted DOCX',
      'cv.docx',
      () => Buffer.from('PK\u0003\u0004 word/document.xml broken zip')
    ]
  ])('%s is rejected as corrupted', async (_label, filename, buffer) => {
    const response = await upload('cv', buffer(), filename);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      errors: { file: 'The file is corrupted, please upload a valid file' },
      reason: 'corrupted_file'
    });
    expectNothingStored();
  });

  test('a scanned PDF with no text is rejected as no readable text', async () => {
    const response = await upload('cv', fixture('scanned.pdf'), 'scan.pdf');

    expect(response.status).toBe(400);
    expect(response.body.reason).toBe('no_readable_text');
    expect(response.body.errors.file).toMatch(/no readable text/);
    expectNothingStored();
  });

  test('a nearly empty md file is rejected as no readable text', async () => {
    const response = await upload(
      'linkedin',
      Buffer.from('# Jane\n\n   \n'),
      'linkedin.md'
    );

    expect(response.status).toBe(400);
    expect(response.body.reason).toBe('no_readable_text');
    expectNothingStored();
  });

  test('the same file again is a duplicate and creates no job', async () => {
    await upload('cv', fixture('cv.pdf'), 'cv.pdf');
    const response = await upload('cv', fixture('cv.pdf'), 'cv-again.pdf');

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      errors: { file: 'This file was already uploaded' },
      reason: 'duplicate_file'
    });
    expect(db.state.files).toHaveLength(1);
    expect(db.state.jobs).toHaveLength(1);
    expect(storedFiles()).toHaveLength(1);
    expect(enqueueJob).toHaveBeenCalledTimes(1);
  });

  test('the same text with different whitespace is a duplicate', async () => {
    const text = fixture('linkedin.md').toString('utf8');
    await upload('linkedin', Buffer.from(text), 'a.md');
    const response = await upload(
      'linkedin',
      Buffer.from(`\n\n${text.replace(/\n/g, '\n\n  ')}   `),
      'b.md'
    );

    expect(response.status).toBe(409);
    expect(db.state.files).toHaveLength(1);
  });

  test('the duplicate check covers every candidate', async () => {
    await upload('cv', fixture('cv.pdf'), 'cv.pdf');
    const response = await upload(
      'cv',
      fixture('cv.pdf'),
      'cv.pdf',
      'otherCandidate'
    );

    expect(response.status).toBe(409);
  });

  test('a concurrent duplicate (unique violation) is rejected and leaves no raw file', async () => {
    buildApp({ raceOnFileInsert: true });
    const response = await upload('cv', fixture('cv.pdf'), 'cv.pdf');

    expect(response.status).toBe(409);
    expect(response.body.reason).toBe('duplicate_file');
    expectNothingStored();
  });
});

describe('POST /api/uploads/:sourceType: request and access errors', () => {
  test('an unknown slot is rejected', async () => {
    const response = await upload('photo', fixture('cv.pdf'), 'cv.pdf');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      errors: { sourceType: 'Upload type must be one of: cv, linkedin' }
    });
    expectNothingStored();
  });

  test('a request without a file is rejected', async () => {
    const response = await request(app)
      .post('/api/uploads/cv')
      .set('Cookie', cookieFor('candidate'))
      .field('note', 'no file');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      errors: { file: 'Choose a file to upload' }
    });
  });

  test('a file in another field is rejected', async () => {
    const response = await request(app)
      .post('/api/uploads/cv')
      .set('Cookie', cookieFor('candidate'))
      .attach('document', fixture('cv.pdf'), 'cv.pdf');

    expect(response.status).toBe(400);
    expect(response.body.errors.file).toBe(
      'Upload exactly one file in the "file" field'
    );
    expectNothingStored();
  });

  test('a logged-out request gets 401', async () => {
    const response = await request(app)
      .post('/api/uploads/cv')
      .attach('file', fixture('cv.pdf'), 'cv.pdf');

    expect(response.status).toBe(401);
    expectNothingStored();
  });

  test('an admin cannot use the candidate upload', async () => {
    const response = await upload('cv', fixture('cv.pdf'), 'cv.pdf', 'admin');

    expect(response.status).toBe(403);
    expectNothingStored();
  });

  test('a candidate with an unverified email gets 403', async () => {
    const response = await upload(
      'cv',
      fixture('cv.pdf'),
      'cv.pdf',
      'unverified'
    );

    expect(response.status).toBe(403);
    expect(response.body.reason).toBe('verification_required');
    expectNothingStored();
  });

  test('a failed job insert rolls back the file row and removes the raw file', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    buildApp({ failJobInsert: true });
    const response = await upload('cv', fixture('cv.pdf'), 'cv.pdf');

    expect(response.status).toBe(500);
    expectNothingStored();
  });

  test('a queue failure still accepts the file and keeps the queued job', async () => {
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
    enqueueJob.mockRejectedValueOnce(new Error('queue down'));
    const response = await upload('cv', fixture('cv.pdf'), 'cv.pdf');

    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      message: 'File received, processing has started',
      fileId: 1,
      jobId: 1
    });
    expect(db.state.files).toHaveLength(1);
    expect(db.state.jobs).toEqual([{ id: 1, file_id: 1, status: 'queued' }]);
    expect(storedFiles()).toHaveLength(1);
    expect(enqueueJob).toHaveBeenCalledTimes(1);
    expect(errorLog).toHaveBeenCalledWith(
      'Sending job 1 to the queue failed',
      expect.any(String)
    );
  });
});

describe('GET /api/uploads/:fileId/raw', () => {
  let buffer;

  beforeEach(async () => {
    buffer = fixture('linkedin.md');
    await upload('linkedin', buffer, 'linkedin.md');
  });

  test('an admin downloads the raw file unchanged, as an attachment', async () => {
    const response = await request(app)
      .get('/api/uploads/1/raw')
      .set('Cookie', cookieFor('admin'))
      .buffer(true)
      .parse((res, done) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);
    expect(response.body.equals(buffer)).toBe(true);
    expect(response.headers['content-type']).toMatch(/^text\/markdown/);
    expect(response.headers['content-disposition']).toMatch(
      /^attachment; filename="linkedin.md"/
    );
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  test('the file owner (a candidate) gets 403', async () => {
    const response = await request(app)
      .get('/api/uploads/1/raw')
      .set('Cookie', cookieFor('candidate'));

    expect(response.status).toBe(403);
  });

  test('a logged-out request gets 401', async () => {
    const response = await request(app).get('/api/uploads/1/raw');

    expect(response.status).toBe(401);
  });

  test('an unknown file id gets 404', async () => {
    const response = await request(app)
      .get('/api/uploads/42/raw')
      .set('Cookie', cookieFor('admin'));

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ errors: { fileId: 'File not found' } });
  });

  test('an invalid file id gets 400', async () => {
    const response = await request(app)
      .get('/api/uploads/abc/raw')
      .set('Cookie', cookieFor('admin'));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      errors: { fileId: 'File id must be a positive integer' }
    });
  });
});
