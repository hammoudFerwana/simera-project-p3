const fs = require('fs');
const os = require('os');
const path = require('path');
const { Pool } = require('pg');
const dotenv = require('dotenv');
const request = require('supertest');
const { Document, Packer, Paragraph, TextRun } = require('docx');
const JSZip = require('jszip');

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL must be set in .env');
}

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-sec-files-jwt-secret';

jest.setTimeout(30000);

const { createApp } = require('../../../api/src/app');
const { signToken } = require('../../../api/src/auth/token');
const { createLocalStorage } = require('../../src/upload/storage');
const {
  processUpload,
  UploadError
} = require('../../src/upload/upload.service');
const { extract } = require('../../src/extraction/extract');
const { MIME_TYPES } = require('../../src/upload/file-types');

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');

let pool;
let storageDir;
let storage;
let app;
let enqueueJob;
let candidateUserId;
let candidateProfileId;
let candidateCookie;
let adminCookie;

/**
 * Creates a valid DOCX file with an embedded macro part (word/vbaProject.bin).
 */
async function makeDocxWithEmbeddedMacro(textContent) {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [new TextRun(textContent)]
          })
        ]
      }
    ]
  });

  const baseBuffer = await Packer.toBuffer(doc);
  const zip = await JSZip.loadAsync(baseBuffer);
  zip.file(
    'word/vbaProject.bin',
    Buffer.from('FAKE_VBA_MACRO_PAYLOAD_FOR_SECURITY_TESTING')
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

beforeAll(async () => {
  pool = new Pool({ connectionString: testDatabaseUrl });

  // Safety check: database name must start with 'simera_test'
  const checkResult = await pool.query('SELECT current_database() AS name');
  const dbName = checkResult.rows[0].name;
  if (!dbName.startsWith('simera_test')) {
    await pool.end();
    throw new Error(`Database tests must run on simera_test, not ${dbName}`);
  }

  // Create verified candidate user and profile for upload tests
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const userResult = await pool.query(
    `INSERT INTO users (email, password_hash, email_verified, created_at)
     VALUES ($1, 'dummy_hash', true, CURRENT_TIMESTAMP)
     RETURNING id`,
    [`sec_files_test_${suffix}@example.com`]
  );
  candidateUserId = userResult.rows[0].id;

  const profileResult = await pool.query(
    `INSERT INTO candidate_profiles (user_id, created_at)
     VALUES ($1, CURRENT_TIMESTAMP)
     RETURNING id`,
    [candidateUserId]
  );
  candidateProfileId = profileResult.rows[0].id;

  storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sec-files-'));
  storage = createLocalStorage({ directory: storageDir });

  enqueueJob = jest.fn(async () => {});
  app = createApp({
    getDb: () => pool,
    getStorage: () => storage,
    enqueueJob,
    getUploadConfig: () => ({ minExtractedTextChars: 50, storageDir })
  });

  candidateCookie = `access_token=${signToken({
    userId: candidateUserId,
    role: 'candidate'
  })}`;
  adminCookie = `access_token=${signToken({
    userId: 99999,
    role: 'admin'
  })}`;
});

afterAll(async () => {
  if (storageDir && fs.existsSync(storageDir)) {
    fs.rmSync(storageDir, { recursive: true, force: true });
  }

  if (pool) {
    if (candidateProfileId) {
      await pool.query(
        'DELETE FROM processing_jobs WHERE file_id IN (SELECT id FROM uploaded_files WHERE candidate_id = $1)',
        [candidateProfileId]
      );
      await pool.query('DELETE FROM uploaded_files WHERE candidate_id = $1', [
        candidateProfileId
      ]);
      await pool.query('DELETE FROM candidate_profiles WHERE id = $1', [
        candidateProfileId
      ]);
    }
    if (candidateUserId) {
      await pool.query('DELETE FROM users WHERE id = $1', [candidateUserId]);
    }
    await pool.end();
  }
});

describe('Files Security Tests (US-24)', () => {
  describe('D7: DOCX macro security (AC3)', () => {
    test('extract() safely extracts text from a DOCX with an embedded macro part without executing macros or erroring', async () => {
      const cvText =
        'Experienced Senior Software Engineer with over 10 years of expertise in distributed backend systems and cloud platforms.';
      const macroDocxBuffer = await makeDocxWithEmbeddedMacro(cvText);

      // Extract must succeed and extract document text without executing macros or throwing
      const result = await extract(macroDocxBuffer, MIME_TYPES.docx);
      expect(result).toBeDefined();
      expect(result.text).toContain(cvText);
      expect(result.isEmpty).toBe(false);
    });

    test('rejects a file with .docm extension (resume.docm) at upload with unsupported_format (400)', async () => {
      const macroBuffer = await makeDocxWithEmbeddedMacro(
        'Valid candidate text with more than 50 characters for resume.docm rejection test.'
      );

      // 1. Rejected via HTTP POST /api/uploads/cv
      const response = await request(app)
        .post('/api/uploads/cv')
        .set('Cookie', candidateCookie)
        .attach('file', macroBuffer, 'resume.docm');

      expect(response.status).toBe(400);
      expect(response.body.reason).toBe('unsupported_format');

      // 2. Rejected when calling processUpload directly
      await expect(
        processUpload(
          {
            db: pool,
            storage,
            enqueueJob,
            config: { minExtractedTextChars: 50 }
          },
          {
            candidateId: candidateProfileId,
            sourceType: 'cv',
            originalFilename: 'resume.docm',
            buffer: macroBuffer
          }
        )
      ).rejects.toBeInstanceOf(UploadError);
    });
  });

  describe('D3: Markdown file with <script> tag raw download (AC4)', () => {
    test('uploaded markdown with <script> is served safely as attachment with security headers and non-HTML content type', async () => {
      const xssMarkdown = [
        '# Security Engineer Profile',
        '',
        '<script>alert("xss")</script>',
        '',
        'Experienced security analyst and backend developer with comprehensive knowledge of defensive architecture.',
        '',
        '## Experience',
        '- Security Engineer, CyberSec Corp (2020 - Present)',
        '',
        '## Skills',
        '- Node.js',
        '- AppSec'
      ].join('\n');
      const xssBuffer = Buffer.from(xssMarkdown, 'utf8');

      // Upload the markdown file containing <script>alert("xss")</script>
      const uploadResponse = await request(app)
        .post('/api/uploads/linkedin')
        .set('Cookie', candidateCookie)
        .attach('file', xssBuffer, 'profile-with-xss.md');

      expect(uploadResponse.status).toBe(202);
      const fileId = uploadResponse.body.fileId;
      expect(fileId).toBeDefined();

      // Request GET /api/uploads/:fileId/raw as admin
      const rawResponse = await request(app)
        .get(`/api/uploads/${fileId}/raw`)
        .set('Cookie', adminCookie)
        .buffer(true)
        .parse((res, done) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => done(null, Buffer.concat(chunks)));
        });

      // Assert status 200
      expect(rawResponse.status).toBe(200);

      // Assert Content-Disposition is attachment; filename=...
      expect(rawResponse.headers['content-disposition']).toMatch(
        /^attachment;\s*filename="profile-with-xss\.md"/
      );

      // Assert X-Content-Type-Options is nosniff
      expect(rawResponse.headers['x-content-type-options']).toBe('nosniff');

      // Assert Content-Security-Policy is default-src 'none'; sandbox
      expect(rawResponse.headers['content-security-policy']).toBe(
        "default-src 'none'; sandbox"
      );

      // Assert Content-Type is non-HTML (text/markdown or application/octet-stream, never text/html)
      const contentType = rawResponse.headers['content-type'];
      expect(contentType).toMatch(/^text\/markdown/);
      expect(contentType).not.toMatch(/html/i);

      // Assert the raw content is preserved
      expect(rawResponse.body.equals(xssBuffer)).toBe(true);
    });
  });

  describe('D8: Rejected uploads leave nothing (AC7)', () => {
    /**
     * Helper to verify that an operation leaves no new files in storage and no new row in uploaded_files.
     */
    async function assertLeavesNothing(operation) {
      const storageCountBefore = fs.readdirSync(storageDir).length;
      const dbCountResBefore = await pool.query(
        'SELECT COUNT(*) FROM uploaded_files WHERE candidate_id = $1',
        [candidateProfileId]
      );
      const dbCountBefore = Number(dbCountResBefore.rows[0].count);

      await operation();

      const storageCountAfter = fs.readdirSync(storageDir).length;
      const dbCountResAfter = await pool.query(
        'SELECT COUNT(*) FROM uploaded_files WHERE candidate_id = $1',
        [candidateProfileId]
      );
      const dbCountAfter = Number(dbCountResAfter.rows[0].count);

      expect(storageCountAfter).toBe(storageCountBefore);
      expect(dbCountAfter).toBe(dbCountBefore);
    }

    test('1. unsupported format / extension (file.exe and resume.docm) leaves nothing', async () => {
      // Test file.exe
      await assertLeavesNothing(async () => {
        const res = await request(app)
          .post('/api/uploads/cv')
          .set('Cookie', candidateCookie)
          .attach('file', Buffer.from('binary content'), 'file.exe');

        expect(res.status).toBe(400);
        expect(res.body.reason).toBe('unsupported_format');
      });

      // Test resume.docm
      await assertLeavesNothing(async () => {
        const res = await request(app)
          .post('/api/uploads/cv')
          .set('Cookie', candidateCookie)
          .attach('file', Buffer.from('binary content'), 'resume.docm');

        expect(res.status).toBe(400);
        expect(res.body.reason).toBe('unsupported_format');
      });
    });

    test('2. content mismatch (.pdf extension containing text or invalid binary) leaves nothing', async () => {
      const invalidPdfBuffer = Buffer.from(
        'This is plain text with no PDF magic header bytes at all.'
      );

      await assertLeavesNothing(async () => {
        const res = await request(app)
          .post('/api/uploads/cv')
          .set('Cookie', candidateCookie)
          .attach('file', invalidPdfBuffer, 'cv-mismatch.pdf');

        expect(res.status).toBe(400);
        expect(res.body.reason).toBe('unsupported_format');
      });
    });

    test('3. file too large (> 10 MB) leaves nothing', async () => {
      const oversizeBuffer = Buffer.alloc(10 * 1024 * 1024 + 1);
      oversizeBuffer.write('%PDF-1.4\n');

      // Via HTTP upload (Multer catches and returns 413)
      await assertLeavesNothing(async () => {
        const res = await request(app)
          .post('/api/uploads/cv')
          .set('Cookie', candidateCookie)
          .attach('file', oversizeBuffer, 'too-large.pdf');

        expect(res.status).toBe(413);
        expect(res.body.reason).toBe('file_too_large');
      });

      // Via processUpload directly
      await assertLeavesNothing(async () => {
        await expect(
          processUpload(
            {
              db: pool,
              storage,
              enqueueJob,
              config: { minExtractedTextChars: 50 }
            },
            {
              candidateId: candidateProfileId,
              sourceType: 'cv',
              originalFilename: 'too-large.pdf',
              buffer: oversizeBuffer
            }
          )
        ).rejects.toMatchObject({
          status: 413,
          reason: 'file_too_large'
        });
      });
    });

    test('4. corrupted file (invalid PDF structure) leaves nothing', async () => {
      const corruptedPdfBuffer = fs.readFileSync(
        path.join(FIXTURES_DIR, 'corrupted.pdf')
      );

      await assertLeavesNothing(async () => {
        const res = await request(app)
          .post('/api/uploads/cv')
          .set('Cookie', candidateCookie)
          .attach('file', corruptedPdfBuffer, 'corrupted.pdf');

        expect(res.status).toBe(400);
        expect(res.body.reason).toBe('corrupted_file');
      });
    });

    test('5. no readable text (empty or scanned document < 50 chars) leaves nothing', async () => {
      const scannedEmptyBuffer = fs.readFileSync(
        path.join(FIXTURES_DIR, 'scanned-empty.pdf')
      );

      await assertLeavesNothing(async () => {
        const res = await request(app)
          .post('/api/uploads/cv')
          .set('Cookie', candidateCookie)
          .attach('file', scannedEmptyBuffer, 'scanned-empty.pdf');

        expect(res.status).toBe(400);
        expect(res.body.reason).toBe('no_readable_text');
      });
    });

    test('6. duplicate file (file with identical text hash already uploaded) leaves nothing', async () => {
      const validDoc = [
        '# Distinct Unique Candidate',
        '',
        'Senior Platform Engineer with 12 years of hands-on experience in distributed cloud infrastructure.',
        '',
        '## Experience',
        '- Lead Architect at Cloud Platforms LLC (2020 - Present)',
        '',
        '## Skills',
        '- Distributed Systems',
        '- Infrastructure as Code'
      ].join('\n');
      const validBuffer = Buffer.from(validDoc, 'utf8');

      // First upload: should succeed and create 1 file in storage, 1 row in DB
      const firstRes = await request(app)
        .post('/api/uploads/linkedin')
        .set('Cookie', candidateCookie)
        .attach('file', validBuffer, 'unique-profile.md');

      expect(firstRes.status).toBe(202);

      // Second upload with identical text hash: must reject with duplicate_file and leave nothing new
      await assertLeavesNothing(async () => {
        const secondRes = await request(app)
          .post('/api/uploads/linkedin')
          .set('Cookie', candidateCookie)
          .attach('file', validBuffer, 'duplicate-profile.md');

        expect(secondRes.status).toBe(409);
        expect(secondRes.body.reason).toBe('duplicate_file');
      });
    });
  });
});
