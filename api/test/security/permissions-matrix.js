/**
 * Permissions matrix for all develop endpoints.
 *
 * Each row specifies:
 * - method: HTTP method (GET, POST)
 * - path: route path template (e.g. /api/auth/login, /api/uploads/:fileId/raw)
 * - publicRoute: true if reachable without authentication cookie (never 401/403)
 * - expectedNoAuth: expected HTTP status code when request has no credentials
 *   ('public' means the test only checks the answer is never 401 or 403)
 * - expectedCandidate: expected HTTP status code when request is authenticated as candidate
 * - expectedAdmin: expected HTTP status code when request is authenticated as admin
 * - description: human-readable purpose of the endpoint
 * - body: sample request body for methods that expect JSON payloads
 * - params: path parameters to substitute in parameterized paths
 */
const permissionsMatrix = [
  {
    method: 'POST',
    path: '/api/auth/register',
    publicRoute: true,
    expectedNoAuth: 201,
    expectedCandidate: 'public',
    expectedAdmin: 'public',
    description: 'Register candidate account',
    body: { email: 'candidate@example.com', password: 'ValidPassword123' },
    params: null
  },
  {
    method: 'POST',
    path: '/api/auth/verify-otp',
    publicRoute: true,
    expectedNoAuth: 'public',
    expectedCandidate: 'public',
    expectedAdmin: 'public',
    description: 'Verify email with OTP code',
    body: { email: 'candidate@example.com', code: '123456' },
    params: null
  },
  {
    method: 'POST',
    path: '/api/auth/resend-otp',
    publicRoute: true,
    expectedNoAuth: 'public',
    expectedCandidate: 'public',
    expectedAdmin: 'public',
    description: 'Resend OTP verification code',
    body: { email: 'candidate@example.com' },
    params: null
  },
  {
    method: 'POST',
    path: '/api/auth/login',
    publicRoute: true,
    expectedNoAuth: 'public',
    expectedCandidate: 'public',
    expectedAdmin: 'public',
    description: 'Authenticate with email and password',
    body: { email: 'candidate@example.com', password: 'ValidPassword123' },
    params: null
  },
  {
    method: 'POST',
    path: '/api/auth/logout',
    publicRoute: true,
    expectedNoAuth: 200,
    expectedCandidate: 'public',
    expectedAdmin: 'public',
    description: 'Clear session authentication cookie',
    body: null,
    params: null
  },
  {
    method: 'GET',
    path: '/api/auth/me',
    publicRoute: false,
    expectedNoAuth: 401,
    expectedCandidate: 200,
    expectedAdmin: 200,
    description: 'Get authenticated user profile and role',
    body: null,
    params: null
  },
  {
    method: 'POST',
    path: '/api/uploads/cv',
    publicRoute: false,
    expectedNoAuth: 401,
    expectedCandidate: 202,
    expectedAdmin: 403,
    description: 'Upload candidate CV (PDF or DOCX)',
    body: null,
    params: null
  },
  {
    method: 'POST',
    path: '/api/uploads/linkedin',
    publicRoute: false,
    expectedNoAuth: 401,
    expectedCandidate: 202,
    expectedAdmin: 403,
    description: 'Upload LinkedIn export file (Markdown)',
    body: null,
    params: null
  },
  {
    method: 'GET',
    path: '/api/uploads/:fileId/raw',
    publicRoute: false,
    expectedNoAuth: 401,
    expectedCandidate: 403,
    expectedAdmin: 200,
    description: 'Download raw uploaded file (admin only)',
    body: null,
    params: { fileId: ':fileId' }
  },
  {
    method: 'GET',
    path: '/api/candidate/files',
    publicRoute: false,
    expectedNoAuth: 401,
    expectedCandidate: 200,
    expectedAdmin: 403,
    description: 'List files for authenticated candidate',
    body: null,
    params: null
  },
  {
    method: 'GET',
    path: '/api/admin/candidates',
    publicRoute: false,
    expectedNoAuth: 401,
    expectedCandidate: 403,
    expectedAdmin: 200,
    description: 'List candidate profiles with search and pagination',
    body: null,
    params: null
  },
  {
    method: 'GET',
    path: '/api/admin/candidates/:id',
    publicRoute: false,
    expectedNoAuth: 401,
    expectedCandidate: 403,
    expectedAdmin: 200,
    description: 'Get single candidate profile details',
    body: null,
    params: { id: ':id' }
  },
  {
    method: 'GET',
    path: '/api/admin/candidates/:id/history',
    publicRoute: false,
    expectedNoAuth: 401,
    expectedCandidate: 403,
    expectedAdmin: 200,
    description: 'Get candidate audit change history',
    body: null,
    params: { id: ':id' }
  },
  {
    method: 'GET',
    path: '/api/admin/unknown-skills',
    publicRoute: false,
    expectedNoAuth: 401,
    expectedCandidate: 403,
    expectedAdmin: 200,
    description: 'List unknown skills waiting for review',
    body: null,
    params: null
  },
  {
    method: 'GET',
    path: '/api/admin/unknown-skills/:id',
    publicRoute: false,
    expectedNoAuth: 401,
    expectedCandidate: 403,
    expectedAdmin: 200,
    description: 'Get one unknown skill',
    body: null,
    params: { id: ':unknownSkillId' }
  },
  {
    method: 'GET',
    path: '/api/admin/skills/search',
    publicRoute: false,
    expectedNoAuth: 401,
    expectedCandidate: 403,
    expectedAdmin: 200,
    description: 'Search canonical skills',
    body: null,
    params: null,
    query: { q: 'node' }
  },
  {
    method: 'POST',
    path: '/api/admin/unknown-skills/:id/resolve',
    publicRoute: false,
    expectedNoAuth: 401,
    expectedCandidate: 403,
    expectedAdmin: 200,
    description: 'Resolve an unknown skill (link, add or reject)',
    body: { action: 'reject', confidence: 0.9 },
    params: { id: ':unknownSkillId' }
  }
];

module.exports = { permissionsMatrix };
