
const request = require('supertest');
const { createApp } = require('../src/app');
const { signToken } = require('../src/auth/token');

process.env.JWT_SECRET = 'test-secret-for-us-11';

const USERS = {
  candidate: { userId: 1, candidateId: 10, emailVerified: true },
  otherCandidate: { userId: 2, candidateId: 20, emailVerified: true },
  unverified: { userId: 3, candidateId: 30, emailVerified: false },
  admin: { userId: 99 }
};

function createFakeDb() {
  const state = {
    files: [],
    jobs: []
  };

  return {
    state,

    async query(sql, params) {
      const text = sql.replace(/\s+/g, ' ').trim();

      // Used by requireVerifiedCandidate.
      if (text.includes('FROM users u JOIN candidate_profiles')) {
        const user = Object.values(USERS).find(
          (item) => item.userId === params[0]
        );

        return {
          rows:
            user && user.candidateId
              ? [{
                  candidate_id: user.candidateId,
                  email_verified: user.emailVerified
                }]
              : []
        };
      }

      // Used by GET /api/candidate/files.
      if (text.includes('FROM uploaded_files f INNER JOIN processing_jobs j')) {
        const candidateId = params[0];

        const files = state.files
          .filter(
            (file) =>
              file.candidate_id === candidateId &&
              ['cv', 'linkedin'].includes(file.source_type)
          )
          .map((file) => {
            const job = state.jobs.find(
              (item) => item.file_id === file.id
            );

            return job ? {
              id: file.id,
              original_filename: file.original_filename,
              source_type: file.source_type,
              uploaded_at: file.uploaded_at,
              status: job.status,
              failure_reason: job.failure_reason
            } : null;
          })
          .filter(Boolean)
          .sort(
            (a, b) =>
              new Date(b.uploaded_at) - new Date(a.uploaded_at)
          );

        return { rows: files };
      }

      throw new Error(`Unexpected query: ${text}`);
    }
  };
}

let db;
let app;

function cookieFor(userKey) {
  const user = USERS[userKey];
  const role = userKey === 'admin' ? 'admin' : 'candidate';

  return `access_token=${signToken({
    userId: user.userId,
    role
  })}`;
}

function addFile({
  id,
  candidateId = 10,
  sourceType = 'cv',
  filename = 'resume.pdf',
  status = 'queued',
  failureReason = null,
  uploadedAt = '2026-11-13T10:00:00.000Z'
}) {
  db.state.files.push({
    id,
    candidate_id: candidateId,
    source_type: sourceType,
    original_filename: filename,
    uploaded_at: uploadedAt
  });

  db.state.jobs.push({
    file_id: id,
    status,
    failure_reason: failureReason
  });
}

beforeEach(() => {
  db = createFakeDb();

  app = createApp({
    getDb: () => db
  });
});

describe('GET /api/candidate/files', () => {
  test('returns only the logged-in candidate files', async () => {
    addFile({ id: 1, candidateId: 10, filename: 'my-cv.pdf' });
    addFile({
      id: 2,
      candidateId: 20,
      filename: 'other-candidate.pdf'
    });

    const response = await request(app)
      .get('/api/candidate/files')
      .set('Cookie', cookieFor('candidate'));

    expect(response.status).toBe(200);
    expect(response.body.files).toHaveLength(1);
    expect(response.body.files[0].name).toBe('my-cv.pdf');
  });

  test.each([
    ['queued', 'Processing'],
    ['processing', 'Processing'],
    ['completed', 'Completed'],
    ['completed_with_review', 'Completed'],
    ['failed', 'Failed']
  ])('maps %s status to %s', async (jobStatus, expectedStatus) => {
    addFile({
      id: 1,
      status: jobStatus,
      failureReason: jobStatus === 'failed' ? 'LLM connection lost' : null
    });

    const response = await request(app)
      .get('/api/candidate/files')
      .set('Cookie', cookieFor('candidate'));

    expect(response.status).toBe(200);
    expect(response.body.files[0].status).toBe(expectedStatus);
  });

  test('returns a friendly message and retry hint for failed files', async () => {
    addFile({
      id: 1,
      status: 'failed',
      failureReason: 'LLM connection lost'
    });

    const response = await request(app)
      .get('/api/candidate/files')
      .set('Cookie', cookieFor('candidate'));

    expect(response.status).toBe(200);
    expect(response.body.files[0].message).toContain(
      "We couldn't process your file. Please try again."
    );
    expect(response.body.files[0].message).toContain(
      'Upload an updated file to try again.'
    );
    expect(response.body.files[0].message).not.toContain(
      'LLM connection lost'
    );
  });

  test('returns an empty list when the candidate has no accepted files', async () => {
    const response = await request(app)
      .get('/api/candidate/files')
      .set('Cookie', cookieFor('candidate'));

    expect(response.status).toBe(200);
    expect(response.body.files).toEqual([]);
  });

  test('does not include simera_profile files', async () => {
    addFile({
      id: 1,
      sourceType: 'simera_profile',
      filename: 'simera-profile.json'
    });

    const response = await request(app)
      .get('/api/candidate/files')
      .set('Cookie', cookieFor('candidate'));

    expect(response.status).toBe(200);
    expect(response.body.files).toEqual([]);
  });

  test('does not include rejected files that were never stored', async () => {
    // Rejected uploads do not create uploaded_files or processing_jobs rows.
    const response = await request(app)
      .get('/api/candidate/files')
      .set('Cookie', cookieFor('candidate'));

    expect(response.status).toBe(200);
    expect(response.body.files).toEqual([]);
  });

  test('returns 401 when the user is not logged in', async () => {
    const response = await request(app)
      .get('/api/candidate/files');

    expect(response.status).toBe(401);
  });

  test('returns 403 when an admin tries to access the candidate endpoint', async () => {
    const response = await request(app)
      .get('/api/candidate/files')
      .set('Cookie', cookieFor('admin'));

    expect(response.status).toBe(403);
  });

  test('returns 403 when the candidate email is not verified', async () => {
    const response = await request(app)
      .get('/api/candidate/files')
      .set('Cookie', cookieFor('unverified'));

    expect(response.status).toBe(403);
  });

  test('includes LinkedIn files', async () => {
    addFile({
      id: 1,
      sourceType: 'linkedin',
      filename: 'linkedin.pdf'
    });

    const response = await request(app)
      .get('/api/candidate/files')
      .set('Cookie', cookieFor('candidate'));

    expect(response.status).toBe(200);
    expect(response.body.files).toHaveLength(1);
    expect(response.body.files[0].type).toBe('linkedin');
  });

  test.each([
    [
       'email mismatch',
       "The email in your uploaded file doesn't match your account email."
    ],
    [
      'empty text',
      "We couldn't extract readable text from this file."
    ],
    [
      'LLM connection lost',
      "We couldn't process your file. Please try again."
    ]
  ])('maps failure reason "%s" to a friendly message', async (
    reason,
    expectedMessage
  ) => {
    addFile({
      id: 1,
      status: 'failed',
      failureReason: reason
    });

    const response = await request(app)
      .get('/api/candidate/files')
      .set('Cookie', cookieFor('candidate'));

    expect(response.status).toBe(200);
    expect(response.body.files[0].message).toContain(expectedMessage);
  });

  test('returns files from newest to oldest', async () => {
    addFile({
      id: 1,
      filename: 'old.pdf',
      uploadedAt: '2026-11-12T10:00:00.000Z'
    });

    addFile({
      id: 2,
      filename: 'new.pdf',
      uploadedAt: '2026-11-13T10:00:00.000Z'
    });

    const response = await request(app)
      .get('/api/candidate/files')
      .set('Cookie', cookieFor('candidate'));

    expect(response.status).toBe(200);
    expect(response.body.files.map((file) => file.name)).toEqual([
      'new.pdf',
      'old.pdf'
    ]);
  });

  test('does not include files without a processing job', async () => {
    db.state.files.push({
      id: 1,
      candidate_id: 10,
      source_type: 'cv',
      original_filename: 'without-job.pdf',
      uploaded_at: '2026-11-13T10:00:00.000Z'
    });

    const response = await request(app)
      .get('/api/candidate/files')
      .set('Cookie', cookieFor('candidate'));

    expect(response.status).toBe(200);
    expect(response.body.files).toEqual([]);
  });

});
