/**
 * US-22 tests: the Simera upload by the dev team, the "Simera file" section
 * and the send button, with an in-memory fake DB, a real storage folder in a
 * temp directory and a fake queue. No Postgres or pg-boss is needed.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const { createLocalStorage } = require('shared/src/upload/storage');
const { createApp } = require('../src/app');
const { signToken } = require('../src/auth/token');

process.env.JWT_SECRET = 'test-secret-for-us-22';

const ADMIN = { userId: 99 };
const CANDIDATE_USERS = [
  { userId: 1, candidateId: 10, email: 'jane.doe@example.com', verified: true },
  { userId: 2, candidateId: 20, email: 'sam.lee@example.com', verified: false }
];

/** A Simera JSON for an email; `extra` changes the text (a new version). */
function simeraJson(email, extra = {}) {
  return Buffer.from(
    JSON.stringify(
      {
        email,
        first_name: 'Jane',
        last_name: 'Doe',
        headline: 'Senior Software Engineer',
        city: 'Ramallah',
        ...extra
      },
      null,
      2
    )
  );
}

/**
 * In-memory stand-in for the pg Pool. It answers the queries the Simera code
 * runs and keeps transaction writes pending until COMMIT.
 */
function createFakeDb() {
  const state = { files: [], jobs: [] };
  const newPending = () => ({ files: [] });

  function answer(sql, params, pending) {
    const text = sql.replace(/\s+/g, ' ').trim();

    if (
      text.includes(
        'JOIN candidate_profiles cp ON cp.user_id = u.id WHERE u.email = $1'
      )
    ) {
      const user = CANDIDATE_USERS.find((u) => u.email === params[0]);
      return {
        rows: user
          ? [{ candidate_id: user.candidateId, email_verified: user.verified }]
          : []
      };
    }
    if (text.startsWith('SELECT 1 FROM uploaded_files WHERE file_hash')) {
      return { rows: state.files.filter((f) => f.file_hash === params[0]) };
    }
    if (text.startsWith('SELECT 1 FROM candidate_profiles WHERE id')) {
      const exists = CANDIDATE_USERS.some((u) => u.candidateId === params[0]);
      return { rows: exists ? [{ '?column?': 1 }] : [] };
    }
    if (text.startsWith('SELECT uf.id AS file_id')) {
      expect(params[1]).toBe('simera_profile');
      const files = state.files
        .filter(
          (f) => f.candidate_id === params[0] && f.source_type === params[1]
        )
        .sort((a, b) => b.uploaded_at - a.uploaded_at || b.id - a.id);
      const file = files[0];
      if (!file) {
        return { rows: [] };
      }
      const job = state.jobs.find((j) => j.file_id === file.id);
      return {
        rows: [
          {
            file_id: file.id,
            original_filename: file.original_filename,
            uploaded_at: file.uploaded_at,
            job_id: job ? job.id : null,
            job_status: job ? job.status : null,
            job_created_at: job ? job.created_at : null,
            started_at: null,
            completed_at: null,
            failure_reason: job ? (job.failure_reason ?? null) : null,
            pending_review_count: null
          }
        ]
      };
    }
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(text)) {
      return { rows: [] };
    }
    if (text.startsWith('INSERT INTO uploaded_files')) {
      const [
        candidateId,
        sourceType,
        originalFilename,
        fileSize,
        fileHash,
        storageLocation,
        mimeType,
        uploadedAt
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
        uploaded_at: uploadedAt
      };
      pending.files.push(row);
      return { rows: [{ id: row.id }] };
    }
    if (text.startsWith('INSERT INTO processing_jobs')) {
      expect(text).toContain('CURRENT_TIMESTAMP');
      expect(text).toContain('ON CONFLICT (file_id) DO NOTHING');
      if (state.jobs.some((j) => j.file_id === params[0])) {
        return { rows: [] };
      }
      const row = {
        id: state.jobs.length + 1,
        file_id: params[0],
        status: 'queued',
        created_at: new Date()
      };
      state.jobs.push(row);
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

beforeEach(() => {
  storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'us22-'));
  db = createFakeDb();
  enqueueJob = jest.fn(async () => {});
  const storage = createLocalStorage({ directory: storageDir });
  app = createApp({
    getDb: () => db,
    getStorage: () => storage,
    enqueueJob,
    getUploadConfig: () => ({ minExtractedTextChars: 50, storageDir })
  });
});

afterEach(() => {
  fs.rmSync(storageDir, { recursive: true, force: true });
  jest.restoreAllMocks();
});

const adminCookie = () =>
  `access_token=${signToken({ userId: ADMIN.userId, role: 'admin' })}`;
const candidateCookie = () =>
  `access_token=${signToken({ userId: 1, role: 'candidate' })}`;

function uploadSimera(
  buffer,
  filename = 'simera.json',
  cookie = adminCookie()
) {
  return request(app)
    .post('/api/admin/simera-files')
    .set('Cookie', cookie)
    .attach('file', buffer, filename);
}

const getSection = (candidateId) =>
  request(app)
    .get(`/api/admin/candidates/${candidateId}/simera`)
    .set('Cookie', adminCookie());

const send = (candidateId) =>
  request(app)
    .post(`/api/admin/candidates/${candidateId}/simera/send`)
    .set('Cookie', adminCookie());

const storedFiles = () =>
  fs.existsSync(storageDir) ? fs.readdirSync(storageDir) : [];

/** Requirement 3.3: a rejected file leaves no raw file, no row and no job. */
function expectNothingStored() {
  expect(db.state.files).toHaveLength(0);
  expect(db.state.jobs).toHaveLength(0);
  expect(storedFiles()).toHaveLength(0);
}

describe('POST /api/admin/simera-files', () => {
  test('a JSON for a registered, verified email is stored as simera_profile, with no job', async () => {
    const buffer = simeraJson('  Jane.Doe@Example.com ');
    const response = await uploadSimera(buffer, 'jane-simera.json');

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      message:
        'Simera file saved. Send it to processing from the candidate page',
      fileId: 1,
      candidateId: 10
    });
    expect(db.state.files).toHaveLength(1);
    expect(db.state.files[0]).toMatchObject({
      candidate_id: 10,
      source_type: 'simera_profile',
      original_filename: 'jane-simera.json',
      mime_type: 'application/json',
      file_size: buffer.length
    });
    expect(db.state.jobs).toHaveLength(0);
    expect(enqueueJob).not.toHaveBeenCalled();

    const saved = storedFiles();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatch(/\.json$/);
    expect(fs.readFileSync(path.join(storageDir, saved[0]))).toEqual(buffer);
  });

  test('an unregistered email is rejected and nothing is saved', async () => {
    const response = await uploadSimera(simeraJson('nobody@example.com'));

    expect(response.status).toBe(422);
    expect(response.body).toEqual({
      errors: {
        file: 'No registered candidate has the email in this Simera file'
      },
      reason: 'simera_email_not_registered'
    });
    expectNothingStored();
  });

  test('an unverified email is rejected and nothing is saved', async () => {
    const response = await uploadSimera(simeraJson('sam.lee@example.com'));

    expect(response.status).toBe(422);
    expect(response.body.reason).toBe('simera_email_not_verified');
    expect(response.body.errors.file).toBe(
      'The candidate with the email in this Simera file has not verified their email yet'
    );
    expectNothingStored();
  });

  test.each([
    [
      'no email field',
      JSON.stringify({ first_name: 'Jane', headline: 'x'.repeat(60) })
    ],
    [
      'an empty email',
      JSON.stringify({ email: '  ', headline: 'x'.repeat(60) })
    ],
    [
      'a non-string email',
      JSON.stringify({ email: 42, headline: 'x'.repeat(60) })
    ],
    [
      'a JSON array',
      JSON.stringify([
        { email: 'jane.doe@example.com', headline: 'x'.repeat(60) }
      ])
    ]
  ])('%s is rejected and nothing is saved', async (label, json) => {
    const response = await uploadSimera(Buffer.from(json));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      errors: {
        file: 'The Simera file must be a JSON object with a top-level "email" field'
      },
      reason: 'simera_email_missing'
    });
    expectNothingStored();
  });

  test('invalid JSON is rejected as an unsupported format', async () => {
    const response = await uploadSimera(
      Buffer.from('{ "email": "jane.doe@example.com", broken')
    );

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      errors: {
        file: 'This file type is not accepted. Accepted formats for the Simera file: JSON'
      },
      reason: 'unsupported_format',
      acceptedFormats: ['JSON']
    });
    expectNothingStored();
  });

  test('a file that is not .json is rejected', async () => {
    const response = await uploadSimera(
      simeraJson('jane.doe@example.com'),
      'simera.md'
    );

    expect(response.status).toBe(400);
    expect(response.body.reason).toBe('unsupported_format');
    expectNothingStored();
  });

  test('nearly empty JSON text is rejected', async () => {
    const response = await uploadSimera(
      Buffer.from('{"email":"jane.doe@example.com"}')
    );

    expect(response.status).toBe(400);
    expect(response.body.reason).toBe('no_readable_text');
    expectNothingStored();
  });

  test('the same text again is a duplicate and nothing more is saved', async () => {
    const buffer = simeraJson('jane.doe@example.com');
    expect((await uploadSimera(buffer)).status).toBe(201);

    const response = await uploadSimera(buffer, 'again.json');

    expect(response.status).toBe(409);
    expect(response.body.reason).toBe('duplicate_file');
    expect(db.state.files).toHaveLength(1);
    expect(storedFiles()).toHaveLength(1);
  });

  test('no file in the request is a 400', async () => {
    const response = await request(app)
      .post('/api/admin/simera-files')
      .set('Cookie', adminCookie());

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      errors: { file: 'Choose a file to upload' }
    });
  });

  test('a candidate cannot upload a Simera file', async () => {
    const response = await uploadSimera(
      simeraJson('jane.doe@example.com'),
      'simera.json',
      candidateCookie()
    );

    expect(response.status).toBe(403);
    expectNothingStored();
  });

  test('without a login the request is a 401', async () => {
    const response = await request(app)
      .post('/api/admin/simera-files')
      .attach('file', simeraJson('jane.doe@example.com'), 'simera.json');

    expect(response.status).toBe(401);
    expectNothingStored();
  });
});

describe('GET /api/admin/candidates/:id/simera', () => {
  test('no Simera file: the button is disabled with the reason', async () => {
    const response = await getSection(10);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      candidateId: 10,
      file: null,
      job: null,
      status: null,
      canSend: false,
      disabledReason: 'No Simera file exists for this candidate'
    });
  });

  test('a Simera file exists: "not_sent" and the button is enabled', async () => {
    await uploadSimera(simeraJson('jane.doe@example.com'), 'jane.json');

    const response = await getSection(10);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      candidateId: 10,
      file: { id: 1, name: 'jane.json', rawUrl: '/api/uploads/1/raw' },
      job: null,
      status: 'not_sent',
      canSend: true,
      disabledReason: null
    });
    expect(response.body.file.uploadedAt).toEqual(expect.any(String));
  });

  test('a running job: "processing" and the button is disabled', async () => {
    await uploadSimera(simeraJson('jane.doe@example.com'));
    await send(10);

    for (const status of ['queued', 'processing']) {
      db.state.jobs[0].status = status;
      const response = await getSection(10);

      expect(response.body).toMatchObject({
        status: 'processing',
        job: { id: 1, status },
        canSend: false,
        disabledReason: 'This Simera file is being processed'
      });
    }
  });

  test.each([
    ['completed', 'completed'],
    ['completed_with_review', 'completed'],
    ['failed', 'failed']
  ])(
    'a finished job (%s): "%s" and the button is disabled as already sent',
    async (jobStatus, sectionStatus) => {
      await uploadSimera(simeraJson('jane.doe@example.com'));
      await send(10);
      db.state.jobs[0].status = jobStatus;
      if (jobStatus === 'failed') {
        db.state.jobs[0].failure_reason = 'Maximum attempts reached';
      }

      const response = await getSection(10);

      expect(response.body).toMatchObject({
        status: sectionStatus,
        job: { id: 1, status: jobStatus },
        canSend: false,
        disabledReason: 'This Simera file was already sent to processing'
      });
      if (jobStatus === 'failed') {
        expect(response.body.job.failureReason).toBe(
          'Maximum attempts reached'
        );
      }
    }
  );

  test('an unknown candidate is a 404', async () => {
    const response = await getSection(12345);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      errors: { candidateId: 'Candidate not found' }
    });
  });

  test('a bad candidate id is a 400', async () => {
    const response = await getSection('abc');

    expect(response.status).toBe(400);
    expect(response.body.errors.candidateId).toBe(
      'Candidate id must be a positive integer'
    );
  });

  test('a candidate cannot read the section', async () => {
    const response = await request(app)
      .get('/api/admin/candidates/10/simera')
      .set('Cookie', candidateCookie());

    expect(response.status).toBe(403);
  });
});

describe('POST /api/admin/candidates/:id/simera/send', () => {
  test('creates exactly one job for the file and sends it to the queue', async () => {
    await uploadSimera(simeraJson('jane.doe@example.com'));

    const response = await send(10);

    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      message: 'Simera file sent to processing',
      fileId: 1,
      jobId: 1
    });
    expect(db.state.jobs).toEqual([
      expect.objectContaining({ id: 1, file_id: 1, status: 'queued' })
    ]);
    expect(enqueueJob).toHaveBeenCalledTimes(1);
    expect(enqueueJob).toHaveBeenCalledWith(1);
  });

  test('no Simera file: refused, nothing created', async () => {
    const response = await send(10);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      errors: { simera: 'No Simera file exists for this candidate' },
      reason: 'no_simera_file'
    });
    expect(db.state.jobs).toHaveLength(0);
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  test('while the job runs: refused with the reason', async () => {
    await uploadSimera(simeraJson('jane.doe@example.com'));
    await send(10);
    db.state.jobs[0].status = 'processing';

    const response = await send(10);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      errors: { simera: 'This Simera file is being processed' },
      reason: 'simera_processing'
    });
    expect(db.state.jobs).toHaveLength(1);
    expect(enqueueJob).toHaveBeenCalledTimes(1);
  });

  test.each(['completed', 'completed_with_review', 'failed'])(
    'after the file was sent (%s): clicking again creates nothing',
    async (status) => {
      await uploadSimera(simeraJson('jane.doe@example.com'));
      await send(10);
      db.state.jobs[0].status = status;

      const response = await send(10);

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        errors: { simera: 'This Simera file was already sent to processing' },
        reason: 'simera_already_sent'
      });
      expect(db.state.jobs).toHaveLength(1);
      expect(enqueueJob).toHaveBeenCalledTimes(1);
    }
  );

  test('two clicks at the same time create one job', async () => {
    await uploadSimera(simeraJson('jane.doe@example.com'));

    const responses = await Promise.all([send(10), send(10)]);

    expect(responses.map((r) => r.status).sort()).toEqual([202, 409]);
    expect(db.state.jobs).toHaveLength(1);
    expect(enqueueJob).toHaveBeenCalledTimes(1);
  });

  test('an updated JSON with different text is a new file, and the button is enabled again', async () => {
    await uploadSimera(simeraJson('jane.doe@example.com'), 'v1.json');
    await send(10);
    db.state.jobs[0].status = 'completed';

    const upload = await uploadSimera(
      simeraJson('jane.doe@example.com', { city: 'Nablus' }),
      'v2.json'
    );
    expect(upload.status).toBe(201);
    expect(upload.body.fileId).toBe(2);

    const section = await getSection(10);
    expect(section.body).toMatchObject({
      file: { id: 2, name: 'v2.json' },
      status: 'not_sent',
      canSend: true,
      disabledReason: null
    });

    const response = await send(10);
    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({ fileId: 2, jobId: 2 });
    expect(db.state.jobs.map((j) => j.file_id)).toEqual([1, 2]);
  });

  test('a queue failure still accepts the click; the job stays queued', async () => {
    await uploadSimera(simeraJson('jane.doe@example.com'));
    enqueueJob.mockRejectedValueOnce(new Error('queue down'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await send(10);

    expect(response.status).toBe(202);
    expect(db.state.jobs).toEqual([
      expect.objectContaining({ file_id: 1, status: 'queued' })
    ]);
    expect(console.error).toHaveBeenCalledWith(
      'Sending job 1 to the queue failed',
      expect.any(String)
    );
  });

  test('an unknown candidate is a 404', async () => {
    const response = await send(12345);

    expect(response.status).toBe(404);
    expect(db.state.jobs).toHaveLength(0);
  });

  test('a candidate cannot press the button', async () => {
    await uploadSimera(simeraJson('jane.doe@example.com'));

    const response = await request(app)
      .post('/api/admin/candidates/10/simera/send')
      .set('Cookie', candidateCookie());

    expect(response.status).toBe(403);
    expect(db.state.jobs).toHaveLength(0);
  });
});
