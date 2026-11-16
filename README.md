# Simera Project P3

Resume parsing and profile sync system.

Candidates register, verify their email with an OTP, and upload a CV (PDF or DOCX) and a LinkedIn Markdown file. A background worker extracts the data, validates it with code, resolves conflicts with fixed rules, and stores every value with its source.

## Stack

- Backend: Node.js and Express (plain JavaScript, CommonJS)
- Database: PostgreSQL
- Workspaces: npm workspaces (api, worker, shared)

## Prerequisites

- **Node.js**: version 22 LTS or later (`>=22.0.0`)
- **npm**: version 10 or later
- **PostgreSQL**: installed and running

## Getting Started (Fresh Clone)

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd simera-project-p3
   ```

2. Install all dependencies across all workspaces:

   ```bash
   npm install
   ```

3. Set up the local environment configuration:

   ```bash
   cp .env.example .env
   ```

   _(On Windows PowerShell: `Copy-Item .env.example .env`)_

   Review `.env` and configure any necessary values:
   - `NODE_ENV`: application environment (default: `development`)
   - `API_PORT`: port for the Express API server (default: `3000`)
   - `DATABASE_URL`: PostgreSQL connection string
   - `TEST_DATABASE_URL`: PostgreSQL connection string for the test database (`simera_test`).
   - `ADMIN_EMAIL`: email address for the initial admin account.
   - `ADMIN_PASSWORD`: password for the initial admin account (at least 12 characters).
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`: the SMTP server that sends verification codes. See [Email (SMTP) Setup](#email-smtp-setup).

## Database Setup

Make sure PostgreSQL is installed and running before proceeding.

### 1. Create the Database

Create a local PostgreSQL database named `simera`.

You can create it using pgAdmin or the PostgreSQL command line:

```bash
createdb simera
createdb simera_test
```

### 2. Configure Environment Variables

Make sure your `.env` file contains the following variables:

- `DATABASE_URL`: PostgreSQL connection string.
- `ADMIN_EMAIL`: initial admin email address.
- `ADMIN_PASSWORD`: initial admin password (at least 12 characters).
- `TEST_DATABASE_URL`: PostgreSQL connection string for the test database (`simera_test`).

Use your own local database credentials. Never commit the `.env` file.

### 3. Initialize the Database

Run the unified setup command:

```bash
npm run db:setup
```

This command runs the following steps in order:

1. Applies the database schema, creating tables, types, and constraints.
2. Creates the initial admin account using `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

**Important:** Run this command only when initializing a new, empty database. Do not run it again on an already initialized database.

### 4. Optional Seed Scripts

The following scripts can be run separately when needed:

Insert the predefined skills list (US-13):

```bash
npm run seed:skills --workspace=shared
```

Insert sample candidate data for local development and database relationship testing:

```bash
npm run seed:candidates --workspace=shared
```

**Note:** The sample candidate seed requires the predefined skills to exist in the database. Run the skills seed before the sample candidate seed.

## Email (SMTP) Setup

The API emails verification codes (OTP) to the address the candidate registered with, through Nodemailer over SMTP. It needs `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM` in `.env`, and refuses to start if any of them is missing.

**Gmail or Google Workspace (company email).** Google doesn't accept the normal account password over SMTP; it needs an App Password.

1. Turn on **2-Step Verification** for the sending account.
2. Create an App Password at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) (16 characters). On Google Workspace, the admin must allow App Passwords.
3. Set in `.env`:

   ```dotenv
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_USER=<sending address>
   SMTP_PASS=<the App Password, without spaces>
   MAIL_FROM=TalentVault <same sending address>
   ```

`MAIL_FROM` must use the same address as `SMTP_USER`. Gmail allows about 500 emails a day for a personal account (more on Workspace).

**Another provider:** use its SMTP host, port and credentials. Port `465` uses TLS from the start; other ports (such as `587`) upgrade with STARTTLS.

**Security:** the App Password can send email as that account. Keep it only in your `.env`, never commit it, and share it with teammates privately if they need to send codes. A dedicated project account is safer than a personal one.

**Testing by hand:** register with an inbox you can read. With Gmail, every `yourname+anything@gmail.com` address is a different account for the API but lands in the `yourname@gmail.com` inbox, so one inbox is enough for many test accounts. Avoid made-up addresses: you can't read their code, and repeated bounces can get the sending account blocked.

## Running the Applications

Each component can be run individually using root npm scripts:

- **API Server**:

  ```bash
  npm run dev:api
  ```

  Runs the Express API on `http://localhost:3000`. Health check available at `GET /health`.

- **Worker Process**:
  ```bash
  npm run dev:worker
  ```
  Starts the background worker process.

## API Endpoints

The API endpoints need a PostgreSQL database with `shared/sql/schema.sql` loaded, and `DATABASE_URL` in `.env` pointing to it. `GET /health` works without a database.

### `POST /api/auth/register` (US-01)

Registers a candidate with an email and a password.

- The email is trimmed and lowercased before it's checked and saved, so `Jane@Example.com` and `jane@example.com` are the same account.
- The password must be at least 8 characters. Only a bcrypt hash (cost 12) is stored.
- One transaction creates the `users` row (`email_verified = false`, `otp_attempts = 0`) and the linked `candidate_profiles` row. If either insert fails, nothing is saved. No `admins` row is created: admins are inserted by the team directly.
- After the account is saved, a verification code is generated and emailed (see `POST /api/auth/verify-otp`). If sending fails, the account stays without a code, the response has `otpSent: false`, and the candidate requests a new code with `POST /api/auth/resend-otp`.

Request:

```json
{ "email": "jane.doe@example.com", "password": "secret-pass-1" }
```

Responses:

| Status | When                           | Body                                                                                                                                   |
| ------ | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `201`  | Account created                | `{ "message": "Account created. Enter the verification code sent to your email.", "email": "...", "otpSent": true }`                   |
| `201`  | Account created, code not sent | `{ "message": "Account created, but the verification code could not be sent. Request a new code.", "email": "...", "otpSent": false }` |
| `400`  | Invalid input                  | `{ "errors": { "email": "Enter a valid email address", "password": "Password must be at least 8 characters" } }`                       |
| `400`  | Malformed JSON body            | `{ "errors": { "body": "Invalid JSON body" } }`                                                                                        |
| `409`  | Email already registered       | `{ "errors": { "email": "This email is already in use" } }`                                                                            |
| `500`  | Unexpected error               | `{ "errors": { "server": "Something went wrong" } }`                                                                                   |

`errors` is keyed by field name, so each message can be shown next to its field.

Try it with the API running (`npm run dev:api`):

```bash
curl -i -X POST http://localhost:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"jane.doe@example.com","password":"secret-pass-1"}'
```

Then check the database:

```sql
SELECT u.id, u.email, u.email_verified, u.otp_attempts, cp.id AS profile_id
FROM users u
JOIN candidate_profiles cp ON cp.user_id = u.id
WHERE u.email = 'jane.doe@example.com';
```

### Email verification with OTP (US-02)

After registering, the candidate receives a 6-digit code by email and must enter it before logging in.

- The code is valid for **10 minutes** and can be used **once**. Only its bcrypt hash is stored (`users.otp_hash`, `users.otp_expires_at`); the code itself is never stored or logged.
- Each wrong code increments `users.otp_attempts`. The 5th wrong code invalidates the code, so even the correct code is refused afterwards, and a new code must be requested.
- An expired code is not counted as a wrong attempt.
- Requesting a new code replaces the old one (it stops working) and resets `otp_attempts` to 0.
- A new code is saved only if its email is sent. If sending fails, nothing changes: the previous code (if any) still works.
- Parallel resend requests for the same user run one after another, so the last email received always holds the valid code.
- A code with no expiry date is never accepted.
- The candidate isn't logged in yet, so both endpoints take the email in the body. It's trimmed and lowercased, like at registration.

Expected outcomes return `{ "errors": { <field>: message }, "reason": <code> }`. `reason` is a stable value the frontend can branch on, for example to show a "Resend code" button for `expired` and `too_many_attempts`.

#### `POST /api/auth/verify-otp`

Request:

```json
{ "email": "jane.doe@example.com", "code": "042137" }
```

| Status | `reason`            | When                                         | Message (`errors.<field>`)                             |
| ------ | ------------------- | -------------------------------------------- | ------------------------------------------------------ |
| `200`  |                     | Correct code: `email_verified = true`        | `{ "message": "Email verified. You can now log in." }` |
| `400`  |                     | Invalid email, or the code isn't 6 digits    | `email` / `code`: field message                        |
| `400`  | `incorrect`         | Wrong code (also returns `attemptsLeft`)     | `code`: "The code is incorrect"                        |
| `400`  | `too_many_attempts` | 5 wrong codes; the code is invalidated       | `code`: "Too many wrong attempts. Request a new code"  |
| `400`  | `expired`           | More than 10 minutes since the code was sent | `code`: "The code has expired"                         |
| `400`  | `no_active_code`    | No code to check (e.g. already cleared)      | `code`: "There is no active code. Request a new code"  |
| `404`  | `not_found`         | No account uses this email                   | `email`: "No account uses this email"                  |
| `409`  | `already_verified`  | The email is already verified                | `email`: "This email is already verified"              |

#### `POST /api/auth/resend-otp`

Request:

```json
{ "email": "jane.doe@example.com" }
```

| Status | `reason`           | When                               | Message (`errors.<field>`)                                         |
| ------ | ------------------ | ---------------------------------- | ------------------------------------------------------------------ |
| `200`  |                    | A new code was sent                | `{ "message": "A new verification code was sent to your email." }` |
| `400`  |                    | Invalid email                      | `email`: field message                                             |
| `404`  | `not_found`        | No account uses this email         | `email`: "No account uses this email"                              |
| `409`  | `already_verified` | The email is already verified      | `email`: "This email is already verified"                          |
| `503`  | `send_failed`      | The email server failed; try again | `email`: "Could not send the code. Try again"                      |

Try it with the API running and SMTP configured (the code arrives in the registered inbox):

```bash
curl -i -X POST http://localhost:3000/api/auth/verify-otp \
  -H 'Content-Type: application/json' \
  -d '{"email":"jane.doe@example.com","code":"042137"}'

curl -i -X POST http://localhost:3000/api/auth/resend-otp \
  -H 'Content-Type: application/json' \
  -d '{"email":"jane.doe@example.com"}'
```

Then check the database:

```sql
SELECT email, email_verified, otp_hash IS NOT NULL AS has_code, otp_expires_at, otp_attempts
FROM users
WHERE email = 'jane.doe@example.com';
```

Run the OTP tests only. They run against the real `simera_test` database (`TEST_DATABASE_URL`, schema loaded) with a fake mailer, so no email is sent:

```bash
npx jest api/test/otp.test.js --verbose
```

### Login, logout and access guards (US-03)

One login for candidates and admins. On success the API signs a **JWT** holding `{ userId, role }` and sends it in an **HttpOnly cookie** named `access_token`. The browser sends the cookie back automatically on every request; the frontend never reads or stores the token itself.

- **Role:** `admin` if the user has an `admins` row, otherwise `candidate` (there is no role column). It's derived at login and kept inside the token.
- **Expiry:** `JWT_EXPIRES_IN_HOURS` (default 24) for both the token and the cookie. After that the user logs in again.
- **Stateless:** tokens aren't stored anywhere. Logout clears the cookie; a token copied before logout stays valid until it expires, and a role change (an `admins` row added or removed) applies at the next login.
- **Cookie:** `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` when `NODE_ENV=production`.
- **Frontend on another port:** cookies are sent only to the same site, so run the frontend through a dev proxy to the API (e.g. Vite `server.proxy` for `/api`) and send requests with `credentials: 'include'`.

Requires `JWT_SECRET` in `.env` (the API refuses to start without it). Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

#### `POST /api/auth/login`

Request:

```json
{ "email": "jane.doe@example.com", "password": "secret-password" }
```

The email is trimmed and lowercased, like at registration.

| Status | `reason`                | When                                                                         | Body                                                                                                    |
| ------ | ----------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `200`  |                         | Correct credentials; sets the `access_token` cookie                          | `{ "message": "Logged in", "user": { "id": 2, "email": "jane.doe@example.com", "role": "candidate" } }` |
| `400`  |                         | Invalid email, or an empty password                                          | `errors.email` / `errors.password`: field message                                                       |
| `401`  | `invalid_credentials`   | Unknown email or wrong password (same message for both)                      | `errors.credentials`: "Email or password is incorrect"                                                  |
| `403`  | `verification_required` | Correct password, but the candidate's email isn't verified; no cookie is set | See the example below                                                                                   |

The `403` body also carries the account's normalized email at the top level, so the frontend can open `/verify` for it:

```json
{
  "errors": { "email": "Verify your email before logging in" },
  "reason": "verification_required",
  "email": "jane.doe@example.com"
}
```

The frontend redirects by `user.role` (`candidate` → `/candidate`, `admin` → `/admin`), and to `/verify` on `verification_required`.

#### `POST /api/auth/logout`

Clears the cookie. Always `200` with `{ "message": "Logged out" }`, with or without a token.

#### `GET /api/auth/me`

Returns the logged-in user from the cookie, so the frontend can restore the session after a page reload.

| Status | Body                                                               |
| ------ | ------------------------------------------------------------------ |
| `200`  | `{ "user": { "id": 2, "role": "candidate" } }`                     |
| `401`  | `errors.auth`: "Log in to continue" (no, invalid or expired token) |

Try it (`-c` saves the cookie, `-b` sends it):

```bash
curl -i -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"change_this_password_123"}'

curl -i -b cookies.txt http://localhost:3000/api/auth/me

curl -i -b cookies.txt -c cookies.txt -X POST http://localhost:3000/api/auth/logout
```

#### Guards for protected routes

Every later protected route uses the guards in `api/src/auth/guards.js` instead of its own checks:

| Guard                                 | Checks                                                                                                               | Fails with |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------- |
| `requireAuth`                         | A valid, unexpired token cookie. Sets `req.user = { userId, role }`                                                  | `401`      |
| `requireRole('admin' \| 'candidate')` | `req.user.role` is the given role                                                                                    | `403`      |
| `requireOwnership(getOwnerUserId)`    | A candidate owns the resource (`getOwnerUserId(req)`, sync or async, returns its `users.id`). An admin always passes | `403`      |

`requireRole` and `requireOwnership` run after `requireAuth`. Errors use `errors.auth` ("Log in to continue" / "You do not have access to this resource").

```js
const {
  requireAuth,
  requireRole,
  requireOwnership
} = require('../auth/guards');

// Admin-only API
router.get('/candidates', requireAuth, requireRole('admin'), listCandidates);

// A candidate reaches only their own file; an admin reaches any file
router.get(
  '/files/:fileId',
  requireAuth,
  requireOwnership(async (req) => findFileOwnerUserId(req.params.fileId)),
  getFile
);
```

### File upload (US-04)

A verified candidate uploads a CV (PDF or DOCX) and a LinkedIn file (md, exported with the "LinkedIn to Markdown" extension) in two separate slots, one file per request. An updated version can be uploaded at any time, and each accepted file gets its own processing job.

**What happens, in order** (requirements 3.3):

1. The extension is accepted for the slot: `cv` → `.pdf` / `.docx`, `linkedin` → `.md`.
2. The real content matches the extension: PDF starts with `%PDF-`, DOCX is a ZIP holding `word/document.xml`, md is valid UTF-8 text. The client's `Content-Type` is ignored.
3. The size is 10 MB or less.
4. The file opens and its text is extracted (unpdf for PDF, mammoth for DOCX, md read as plain text and never rendered as HTML). Text shorter than `MIN_EXTRACTED_TEXT_CHARS` (after collapsing whitespace) means "no readable text".
5. Duplicate check: SHA-256 of the extracted text (trimmed, whitespace collapsed), looked up in **all** `uploaded_files` rows. The same text with different spacing, or uploaded by another candidate, is a duplicate.
6. The raw file is saved unchanged in private storage (`UPLOAD_STORAGE_DIR`, default `storage/uploads/`), under a random name.
7. One transaction inserts the `uploaded_files` row and its `processing_jobs` row (status `queued`).
8. The job id is sent to the queue (`enqueueJob` from `shared/src/queue.js`, pg-boss), once.

**A rejected file leaves nothing behind:** no raw file, no row, no job, and the reason is only in the response. If saving fails after the raw file was written, the file is deleted again.

**Shared service:** steps 1–8 live in `processUpload()` in `shared/src/upload/upload.service.js`, with a `sourceType` parameter, so US-22 (Simera JSON) uses the same function with `createJob: false` (its job is created when the admin clicks the button).

**Settings** (optional, in `.env`):

| Variable                   | Default           | Meaning                                                                                   |
| -------------------------- | ----------------- | ----------------------------------------------------------------------------------------- |
| `UPLOAD_STORAGE_DIR`       | `storage/uploads` | Private folder for raw files, relative to the repository root (git-ignored, never served) |
| `MIN_EXTRACTED_TEXT_CHARS` | `50`              | Minimum extracted text length; below it, "no readable text"                               |

#### `POST /api/uploads/:sourceType`

- `:sourceType` is `cv` or `linkedin`.
- Body: `multipart/form-data` with the file in a field named **`file`**.
- Access: a logged-in candidate (`access_token` cookie) with a verified email.

| Status | `reason`                | When                                                 | Message (`errors.<field>`)                                                                             |
| ------ | ----------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `202`  |                         | Accepted and queued                                  | `{ "message": "File received, processing has started", "fileId": 7, "jobId": 7 }`                      |
| `400`  |                         | Unknown slot                                         | `sourceType`: "Upload type must be one of: cv, linkedin"                                               |
| `400`  |                         | No file, or not in the `file` field, or two files    | `file`: "Choose a file to upload" / "Upload exactly one file in the \"file\" field"                    |
| `400`  | `unsupported_format`    | Wrong extension for the slot, or content ≠ extension | `file`: "This file type is not accepted. Accepted formats for the CV: PDF, DOCX" (+ `acceptedFormats`) |
| `400`  | `corrupted_file`        | The file can't be opened or read                     | `file`: "The file is corrupted, please upload a valid file"                                            |
| `400`  | `no_readable_text`      | Empty or nearly empty text (e.g. a scanned PDF)      | `file`: "The file has no readable text. Scanned or image-only files are not supported"                 |
| `401`  |                         | Not logged in                                        | `auth`: "Log in to continue"                                                                           |
| `403`  |                         | Logged in as an admin                                | `auth`: "You do not have access to this resource"                                                      |
| `403`  | `verification_required` | The candidate's email isn't verified                 | `auth`: "Verify your email to continue"                                                                |
| `409`  | `duplicate_file`        | The same text was already uploaded                   | `file`: "This file was already uploaded"                                                               |
| `413`  | `file_too_large`        | Larger than 10 MB                                    | `file`: "The file is larger than 10 MB. Upload a file of 10 MB or less"                                |

#### `GET /api/uploads/:fileId/raw`

Downloads the original file unchanged. **Admin only.** It's always sent as an attachment with `X-Content-Type-Options: nosniff`, so the browser never renders it.

| Status | When                                 | Body                                                     |
| ------ | ------------------------------------ | -------------------------------------------------------- |
| `200`  | Found                                | The raw bytes (`Content-Disposition: attachment`)        |
| `400`  | `fileId` isn't a positive integer    | `errors.fileId`: "File id must be a positive integer"    |
| `401`  | Not logged in                        | `errors.auth`: "Log in to continue"                      |
| `403`  | Not an admin (even the file's owner) | `errors.auth`: "You do not have access to this resource" |
| `404`  | No such file                         | `errors.fileId`: "File not found"                        |

Try it with the API running (log in first so `cookies.txt` holds a candidate's cookie, see US-03):

```bash
curl -i -b cookies.txt -F "file=@api/test/fixtures/cv.pdf" http://localhost:3000/api/uploads/cv
curl -i -b cookies.txt -F "file=@api/test/fixtures/linkedin.md" http://localhost:3000/api/uploads/linkedin

# As an admin
curl -b admin-cookies.txt -o raw.pdf http://localhost:3000/api/uploads/1/raw
```

Then check the database:

```sql
SELECT f.id, f.source_type, f.original_filename, f.file_size, f.mime_type,
  f.storage_location, f.validated_at, j.id AS job_id, j.status
FROM uploaded_files f
JOIN processing_jobs j ON j.file_id = f.id
ORDER BY f.id DESC;
```

**Queue dependency:** sending the job needs `shared/src/queue.js` (`startBoss`, `enqueueJob`) from US-05. Once the rows are committed the upload is accepted (`202`), even if sending the job fails: the job stays `queued` in `processing_jobs` and the API logs `Sending job <id> to the queue failed`. Until US-05 is merged every real upload ends this way (the log shows `Cannot find module 'shared/src/queue'`). Such a job is processed only after it's sent to the queue, so US-05 must send every `queued` job that isn't in pg-boss yet (for example at worker startup, using the job id as the pg-boss singleton key so it's never queued twice). The tests use a fake queue and don't need it.

Run the upload tests (no database, no queue needed; sample files are in `api/test/fixtures/`):

```bash
npm test -- api/test/upload.test.js --verbose
```

## Transactional Storage and Provenance (US-10)

After extraction and code validation, the worker maps the validated extraction into the database structure and stores it in PostgreSQL using a transactional storage process.

**Storage pipeline:**

1. **Mapping (`shared/src/mapper.js`)**

   `mapExtractionToStorage()` converts the validated extraction into three groups:
   - Processing metadata, such as document language and extraction warnings.
   - Candidate profile fields.
   - List items, including work experience, education, languages, links, certifications, projects, awards, publications, and volunteering.

   Each extracted field retains its `value`, `confidence`, and `evidence` wrapper until the storage layer processes it.

   `duration_months` is not stored because experience duration is calculated when needed. Skills are handled separately in US-13.

2. **Deduplication and normalization (`shared/src/deduplication.js`)**

   List items use a deterministic SHA-256 deduplication key to identify matching records.

   Before generating the key, values are normalized:
   - Unicode is normalized using NFKC.
   - Leading and trailing whitespace is removed.
   - Text is converted to lowercase.
   - Consecutive whitespace is collapsed into a single space.
   - URLs are lowercased and trailing slashes are removed.
   - Legal suffixes are stripped from company names when generating work-experience keys.

   These rules make equivalent values produce consistent keys. Original extracted values are preserved for storage; normalization is used for matching.

3. **Transactional storage (`shared/src/storage-writer.js`)**

   `writeExtraction()` performs the database writes inside a single transaction:
   - Verifies ownership through the user, candidate profile, uploaded file, and processing job relationships.
   - Updates processing metadata in `processing_jobs`.
   - Fills candidate profile columns only when their existing database values are `NULL`.
   - Inserts new list items or updates matching items using their deduplication keys.
   - Uses `COALESCE` so existing non-null item values are not overwritten by incoming `NULL` values.
   - Rolls back the transaction if any storage operation fails.

4. **Two-level provenance**

   The storage layer preserves the origin and supporting information for extracted values:
   - `data_provenance` records the provenance entry for a field, including its resolution method. In US-10, new entries use `no_conflict` as the resolution method.
   - `data_provenance_sources` links that entry to the processing job and stores the source value, confidence, and evidence.

   Source records are associated with their provenance entry and processing job, allowing the system to trace stored data back to the file it came from.

**Worker integration:** The store step in `worker/src/steps/index.js` runs after extraction and code validation. It calls `mapExtractionToStorage()` and then `writeExtraction()` with the job's `userId`, `jobId`, and mapped data. The step is marked complete only after storage succeeds.

**Scope:** US-10 implements transactional persistence, deduplication, and provenance for the first file. Comparing new extraction values against previously stored values and applying latest-value or human-review rules belong to US-15, US-16, and US-17.

### Candidate file status (US-11)

#### `GET /api/candidate/files`

Returns all accepted CV and LinkedIn files uploaded by the currently authenticated candidate.

**Authentication:** Requires a valid `access_token` cookie and a candidate account with a verified email.

**Request:**

- No path parameters.
- No query parameters.
- No request body.
- The candidate ID is obtained from the authenticated session. Candidates can only access their own files.

**Success response (`200`):**

```json
{
  "files": [
    {
      "id": 12,
      "name": "my_cv.pdf",
      "type": "cv",
      "uploadedAt": "2026-11-13T10:30:00.000Z",
      "status": "Processing",
      "message": null
    }
  ]
}
```

**Response fields:**

- `id`: File ID.
- `name`: Original uploaded filename.
- `type`: `cv` or `linkedin`.
- `uploadedAt`: Upload timestamp.
- `status`: User-facing processing status.
- `message`: Failure explanation and retry instruction, or `null` when there is no failure.

**Status mapping:**

| Processing job status   | Candidate-facing status |
| ----------------------- | ----------------------- |
| `queued`                | `Processing`            |
| `processing`            | `Processing`            |
| `completed`             | `Completed`             |
| `completed_with_review` | `Completed`             |
| `failed`                | `Failed`                |

Failed files include a plain-language error message and the instruction to upload an updated file to try again.

**Error responses:**

| Status | When                                   | Body                                                                                   |
| ------ | -------------------------------------- | -------------------------------------------------------------------------------------- |
| `401`  | Not logged in or invalid/expired token | `{"errors":{"auth":"Log in to continue"}}`                                             |
| `403`  | User is not an authorized candidate    | `{"errors":{"auth":"You do not have access to this resource"}}`                        |
| `403`  | Candidate email is not verified        | `{"errors":{"auth":"Verify your email to continue"},"reason":"verification_required"}` |

**Important behavior:**

- Only accepted files are returned.
- Rejected uploads are not stored and do not appear in this list. Their rejection messages are returned directly by the upload endpoint (`POST /api/uploads/:sourceType`).
- The frontend should refresh the list periodically while at least one file has status `Processing`.
- Extracted data and internal human-review details are not exposed to candidates.

See the shared Apidog workspace for request and response examples.

### Admin candidates (US-12)

Endpoints under `/api/admin` provide administrative capabilities to list, search, filter, and inspect candidate profiles and data provenance.

#### `GET /api/admin/candidates`

Returns a paginated list of candidate profiles with optional search, processing status filter, and pending review filter.

**Authentication:** Requires a valid `access_token` cookie and an `admin` role.

**Request:**

- No path parameters.
- Query parameters:
  - `page` (optional): Positive integer (default `1`).
  - `pageSize` (optional): Positive integer up to `100` (default `20`).
  - `status` (optional): Filter by latest processing job status (`queued`, `processing`, `completed`, `completed_with_review`, `failed`).
  - `hasPendingReview` (optional): `true` or `false`. When `true`, returns only candidates with at least one pending human review.
  - `search` (optional): Case-insensitive substring match on email, first name, last name, or full name (max 100 characters).
- No request body.

**Success response (`200`):**

```json
{
  "items": [
    {
      "id": 1,
      "email": "jane@example.com",
      "firstName": "Jane",
      "lastName": "Doe",
      "latestJobStatus": "completed",
      "pendingReviewCount": 0,
      "fileCount": 2,
      "createdAt": "2026-11-15T10:00:00.000Z"
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 1
}
```

**Response fields:**

- `items`: Array of candidate summary objects.
  - `id`: Candidate profile ID.
  - `email`: User account email.
  - `firstName`: Candidate first name.
  - `lastName`: Candidate last name.
  - `latestJobStatus`: Status of the candidate's latest processing job, or `null` if no job exists.
  - `pendingReviewCount`: Number of non-completed human reviews for the candidate.
  - `fileCount`: Total number of uploaded files for the candidate.
  - `createdAt`: Profile creation timestamp.
- `page`: Current page number.
- `pageSize`: Number of items per page.
- `total`: Total count of matching candidates.

**Error responses:**

| Status | When                                             | Body                                                            |
| ------ | ------------------------------------------------ | --------------------------------------------------------------- |
| `400`  | Invalid query parameter (`status`, `page`, etc.) | `{"errors":{"<field>":"<validation error message>"}}`           |
| `401`  | Not logged in or invalid/expired token           | `{"errors":{"auth":"Log in to continue"}}`                      |
| `403`  | User does not have admin role                    | `{"errors":{"auth":"You do not have access to this resource"}}` |
| `500`  | Unexpected server error                          | `{"errors":{"server":"Something went wrong"}}`                  |

#### `GET /api/admin/candidates/:id`

Returns a candidate's complete profile, section items with per-field provenance and review markers, experience summary, and uploaded files.

**Authentication:** Requires a valid `access_token` cookie and an `admin` role.

**Request:**

- Path parameters:
  - `id`: Positive integer (candidate profile ID).
- No query parameters.
- No request body.

**Success response (`200`):**

```json
{
  "candidate": {
    "id": 1,
    "email": "jane@example.com",
    "createdAt": "2026-11-15T10:00:00.000Z"
  },
  "profile": {
    "first_name": {
      "value": "Jane",
      "resolutionMethod": "latest_value",
      "approvedAt": "2026-11-15T10:05:00.000Z",
      "humanReviewed": false,
      "manualValue": false,
      "reviewId": null,
      "pendingReview": false,
      "sources": [
        {
          "jobId": 10,
          "fileId": 5,
          "fileType": "cv",
          "fileName": "cv.pdf",
          "uploadedAt": "2026-11-15T10:00:00.000Z",
          "value": "Jane",
          "confidence": 0.95,
          "evidence": "Name: Jane Doe"
        }
      ]
    },
    "last_name": { "value": "Doe", "...": "..." },
    "headline": { "...": "..." },
    "summary": { "...": "..." },
    "phone": { "...": "..." },
    "industry": { "...": "..." },
    "profession": { "...": "..." },
    "city": { "...": "..." },
    "country_code": { "...": "..." }
  },
  "sections": {
    "work_experience": [
      {
        "id": 1,
        "months": 24,
        "fields": {
          "job_title": { "value": "Software Engineer", "...": "..." },
          "company_name": { "...": "..." }
        }
      }
    ],
    "education": [
      {
        "id": 1,
        "fields": {
          "institution_name": { "...": "..." }
        }
      }
    ],
    "certifications": [],
    "projects": [],
    "awards": [],
    "publications": [],
    "volunteering": [],
    "languages": [
      {
        "id": 1,
        "fields": {
          "language": { "...": "..." },
          "proficiency_level": { "...": "..." }
        }
      }
    ],
    "links": [
      {
        "id": 1,
        "fields": {
          "link_type": { "...": "..." },
          "url": { "...": "..." },
          "label": { "...": "..." }
        }
      }
    ],
    "skills": [
      {
        "id": 1,
        "skillName": "PostgreSQL",
        "fields": {
          "skill_id": { "...": "..." },
          "proficiency_level": { "...": "..." },
          "months_of_experience": { "...": "..." }
        }
      }
    ]
  },
  "experience": {
    "totalMonths": 36
  },
  "files": [
    {
      "id": 5,
      "type": "cv",
      "name": "cv.pdf",
      "uploadedAt": "2026-11-15T10:00:00.000Z",
      "status": "completed",
      "failureReason": null,
      "completedAt": "2026-11-15T10:05:00.000Z",
      "pendingReviewCount": 0,
      "rawUrl": "/api/uploads/5/raw"
    }
  ]
}
```

**Experience months:**

- `experience.totalMonths`: total months of work experience, with overlapping jobs merged. `0` when the candidate has no countable job.
- `work_experience[].months`: months of that job, or `null` when its dates cannot be counted (for example no start date).
- Both are calculated on read with `calculateExperienceMonths` (US-14) and never stored. A year-only start counts from January and a year-only end to December. An ongoing job counts until the current month.

**FieldView shape:**

Every field inside `profile` and each item's `fields` object is returned as a `FieldView`:

- `value`: Current approved or stored value.
- `resolutionMethod`: How the field value was resolved (`no_conflict`, `latest_value`, `human_reviewed`), or `null` if no provenance row exists.
- `approvedAt`: Timestamp when the value was approved, or `null`.
- `humanReviewed`: `true` if `resolutionMethod` is `human_reviewed`, otherwise `false`.
- `manualValue`: `true` if `resolutionMethod` is `human_reviewed` and the field has no provenance source rows.
- `reviewId`: ID of the human review that produced the manual value, or `null`.
- `pendingReview`: `true` if an unresolved conflict exists for this field, otherwise `false`.
- `sources`: Array of extraction sources that contributed to this field, sorted by `uploadedAt` then `jobId`.

**Error responses:**

| Status | When                                   | Body                                                                   |
| ------ | -------------------------------------- | ---------------------------------------------------------------------- |
| `400`  | Candidate ID is not a positive integer | `{"errors":{"candidateId":"Candidate id must be a positive integer"}}` |
| `401`  | Not logged in or invalid/expired token | `{"errors":{"auth":"Log in to continue"}}`                             |
| `403`  | User does not have admin role          | `{"errors":{"auth":"You do not have access to this resource"}}`        |
| `404`  | Candidate not found                    | `{"errors":{"candidateId":"Candidate not found"}}`                     |
| `500`  | Unexpected server error                | `{"errors":{"server":"Something went wrong"}}`                         |

### Human audit log (US-20)

Every human change to candidate data made during review resolution (US-18, US-19) is recorded in `human_audit_log` with the administrator who made it, the timestamp, the previous value, the new value, and an optional reason.

#### `GET /api/admin/candidates/:id/history`

Returns the complete chronological change history for a candidate profile, ordered newest first.

**Authentication:** Requires a valid `access_token` cookie and an `admin` role.

**Request:**

- Path parameters:
  - `id`: Positive integer (candidate profile ID).
- No query parameters.
- No request body.

**Success response (`200`):**

```json
{
  "items": [
    {
      "id": 1,
      "itemType": "work_experience",
      "itemId": "42",
      "fieldName": "start_date",
      "previousValue": "2019-05",
      "newValue": "2019-08",
      "changedBy": {
        "adminId": 3,
        "email": "admin@example.com"
      },
      "timestamp": "2026-11-15T12:00:00.000Z",
      "reason": "Checked the CV"
    }
  ]
}
```

**Response fields:**

- `items`: Array of change history records, ordered by `timestamp DESC`, then `id DESC`.
  - `id`: Unique audit log row ID.
  - `itemType`: Target entity type (`provenance_item_type`).
  - `itemId`: Target entity record ID (as string).
  - `fieldName`: Specific field changed.
  - `previousValue`: Field value before change (deserialized JSON value).
  - `newValue`: Field value after change (deserialized JSON value).
  - `changedBy`: Object identifying the administrator:
    - `adminId`: Administrator ID (`admins.id`).
    - `email`: Administrator email (`users.email`).
  - `timestamp`: Timestamp when the change occurred.
  - `reason`: Optional human-supplied explanation, or `null`.

**Error responses:**

| Status | When                                   | Body                                                                   |
| ------ | -------------------------------------- | ---------------------------------------------------------------------- |
| `400`  | Candidate ID is not a positive integer | `{"errors":{"candidateId":"Candidate id must be a positive integer"}}` |
| `401`  | Not logged in or invalid/expired token | `{"errors":{"auth":"Log in to continue"}}`                             |
| `403`  | User does not have admin role          | `{"errors":{"auth":"You do not have access to this resource"}}`        |
| `404`  | Candidate not found                    | `{"errors":{"candidateId":"Candidate not found"}}`                     |
| `500`  | Unexpected server error                | `{"errors":{"server":"Something went wrong"}}`                         |

#### Shared service contract (`recordHumanChange`)

`shared/src/audit/human-audit.js` exports:

- `recordHumanChange(client, options)`: Records a human change within the caller's transaction.
  - `client`: Active PostgreSQL transaction client.
  - `options`:
    - `candidateId`: Positive integer (`candidate_profiles.id`).
    - `itemType`: Valid `provenance_item_type` enum value.
    - `itemId`: Positive integer or digit string (stored as text).
    - `fieldName`: Non-empty string up to 150 characters.
    - `previousValue`: Previous value (stored as JSONB).
    - `newValue`: New value (stored as JSONB).
    - `changedBy`: Positive integer administrator ID (`admins.id`).
    - `reason`: Optional text string or `null` (default `null`).
    - `timestamp`: Optional `Date` instance (default `new Date()`).
  - **Behavior**:
    - Equal values (deep comparison after stable key sort, or both null/undefined) write nothing and return `null`.
    - Otherwise inserts a single row into `human_audit_log` and returns the inserted row.
    - Invalid parameters throw `TypeError`.
- `getAdminIdForUser(client, userId)`: Resolves an administrator ID (`admins.id`) for a given user ID (`users.id`), returning the integer ID or `null`.

### Unknown skills review (US-19)

Unknown skills detected during candidate CV or profile extraction that could not be linked to the canonical skills catalog (US-13) are stored in `unknown_skills` with status `pending`. Administrators can review these unknown skills by linking them to an existing canonical skill, adding them as a new canonical skill, or rejecting them.

#### `GET /api/admin/unknown-skills`

Returns a paginated list of unknown skills with optional filtering by status and candidate ID, ordered newest first (`created_at DESC, id DESC`).

**Authentication:** Requires a valid `access_token` cookie and an `admin` role.

**Request:**

- Query parameters:
  - `status`: Optional filter (`pending`, `accepted`, `rejected`). Defaults to `pending`.
  - `candidateId`: Optional candidate profile ID filter (positive integer).
  - `page`: Optional page number (positive integer, default `1`).
  - `pageSize`: Optional page size (positive integer `1` to `100`, default `20`).

**Success response (`200`):**

```json
{
  "items": [
    {
      "id": 1,
      "skillName": "Nodejs v18",
      "status": "pending",
      "confidence": 0.85,
      "evidence": "Extracted from technical experience",
      "createdAt": "2026-11-16T10:00:00.000Z",
      "resolvedAt": null,
      "resolvedSkill": null,
      "candidate": {
        "id": 10,
        "firstName": "Jane",
        "lastName": "Doe",
        "email": "jane@example.com"
      },
      "sourceFile": {
        "id": 5,
        "sourceType": "cv",
        "originalFilename": "resume.pdf",
        "uploadedAt": "2026-11-16T09:30:00.000Z"
      }
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 1
}
```

**Error responses:**

| Status | When                                                                  | Body                                                                         |
| ------ | --------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `400`  | Invalid query parameter (`status`, `candidateId`, `page`, `pageSize`) | `{"errors":{"status":"Status must be one of: pending, accepted, rejected"}}` |
| `401`  | Not logged in or invalid/expired token                                | `{"errors":{"auth":"Log in to continue"}}`                                   |
| `403`  | User does not have admin role                                         | `{"errors":{"auth":"You do not have access to this resource"}}`              |
| `500`  | Unexpected server error                                               | `{"errors":{"server":"Something went wrong"}}`                               |

#### `GET /api/admin/unknown-skills/:id`

Returns the detailed record of a single unknown skill.

**Authentication:** Requires a valid `access_token` cookie and an `admin` role.

**Request:**

- Path parameters:
  - `id`: Positive integer (unknown skill ID).

**Success response (`200`):**

```json
{
  "id": 1,
  "skillName": "Nodejs v18",
  "status": "pending",
  "confidence": 0.85,
  "evidence": "Extracted from technical experience",
  "createdAt": "2026-11-16T10:00:00.000Z",
  "resolvedAt": null,
  "resolvedSkill": null,
  "candidate": {
    "id": 10,
    "firstName": "Jane",
    "lastName": "Doe",
    "email": "jane@example.com"
  },
  "sourceFile": {
    "id": 5,
    "sourceType": "cv",
    "originalFilename": "resume.pdf",
    "uploadedAt": "2026-11-16T09:30:00.000Z"
  }
}
```

**Error responses:**

| Status | When                                       | Body                                                                          |
| ------ | ------------------------------------------ | ----------------------------------------------------------------------------- |
| `400`  | Unknown skill ID is not a positive integer | `{"errors":{"unknownSkillId":"Unknown skill id must be a positive integer"}}` |
| `401`  | Not logged in or invalid/expired token     | `{"errors":{"auth":"Log in to continue"}}`                                    |
| `403`  | User does not have admin role              | `{"errors":{"auth":"You do not have access to this resource"}}`               |
| `404`  | Unknown skill not found                    | `{"errors":{"unknownSkillId":"Unknown skill not found"}}`                     |
| `500`  | Unexpected server error                    | `{"errors":{"server":"Something went wrong"}}`                                |

#### `GET /api/admin/skills/search`

Searches canonical skills using fuzzy matching (Fuse.js) against `skills.canonical_name`.

**Authentication:** Requires a valid `access_token` cookie and an `admin` role.

**Request:**

- Query parameters:
  - `q`: Search query string (required, trimmed length 1 to 100 characters).

**Success response (`200`):**

```json
{
  "items": [
    {
      "id": 2,
      "canonicalName": "Node.js",
      "similarity": 0.88
    }
  ]
}
```

Returns up to 20 results sorted by similarity in descending order.

**Error responses:**

| Status | When                                   | Body                                                            |
| ------ | -------------------------------------- | --------------------------------------------------------------- |
| `400`  | `q` missing or empty after trim        | `{"errors":{"q":"Query is required"}}`                          |
| `400`  | `q` longer than 100 characters         | `{"errors":{"q":"Query must be at most 100 characters"}}`       |
| `401`  | Not logged in or invalid/expired token | `{"errors":{"auth":"Log in to continue"}}`                      |
| `403`  | User does not have admin role          | `{"errors":{"auth":"You do not have access to this resource"}}` |
| `500`  | Unexpected server error                | `{"errors":{"server":"Something went wrong"}}`                  |

#### `POST /api/admin/unknown-skills/:id/resolve`

Resolves an unknown skill by linking it to an existing canonical skill, adding it as a new canonical skill, or rejecting it.

**Authentication:** Requires a valid `access_token` cookie and an `admin` role.

**Request:**

- Path parameters:
  - `id`: Positive integer (unknown skill ID).
- Request body:
  ```json
  {
    "action": "link",
    "skillId": 2,
    "confidence": 0.9,
    "reason": "Canonical version matches"
  }
  ```
  - `action`: Required string (`link`, `add`, `reject`).
  - `skillId`: Positive integer (required for `action = 'link'`).
  - `canonicalName`: String 1 to 500 characters after trim (required for `action = 'add'`).
  - `confidence`: Number between `0` and `1` (required).
  - `reason`: Optional human justification up to 1000 characters.

**Success response (`200`):**

```json
{
  "unknownSkill": {
    "id": 1,
    "skillName": "Nodejs v18",
    "status": "accepted",
    "confidence": 0.85,
    "evidence": "Extracted from technical experience",
    "createdAt": "2026-11-16T10:00:00.000Z",
    "resolvedAt": "2026-11-16T10:15:00.000Z",
    "resolvedSkill": {
      "id": 2,
      "canonicalName": "Node.js"
    },
    "candidate": {
      "id": 10,
      "firstName": "Jane",
      "lastName": "Doe",
      "email": "jane@example.com"
    },
    "sourceFile": {
      "id": 5,
      "sourceType": "cv",
      "originalFilename": "resume.pdf",
      "uploadedAt": "2026-11-16T09:30:00.000Z"
    }
  },
  "candidateSkillId": 14,
  "created": true
}
```

**Resolution transaction rules (D2):**

1. **Transaction & Row Lock**: Runs in a single transaction on one dedicated client, acquiring an exclusive lock (`SELECT ... FOR UPDATE`) on the `unknown_skills` row.
2. **Status check**: If the row does not exist, returns `404`. If `status != 'pending'`, returns `409` (`{"errors":{"unknownSkillId":"Unknown skill already resolved"}}`).
3. **Link action**: Verifies `skillId` exists in `skills`; returns `400` (`{"errors":{"skillId":"Skill not found"}}`) if absent.
4. **Add action**: Performs a case-insensitive check against `skills.canonical_name`. If already present, returns `409` (`{"errors":{"canonicalName":"Skill already exists, link it instead"},"existingSkillId":<id>}`). Otherwise, inserts the canonical name into `skills`.
5. **Candidate skills association (`link` & `add`)**:
   - Inserts `candidate_skills (candidate_id, skill_id, created_at) ... ON CONFLICT (candidate_id, skill_id) DO NOTHING RETURNING id`.
   - If no row returned (candidate already possessed the skill), reads existing row ID (`created = false`).
   - Only when a new candidate skill was created (`created = true`):
     - Upserts `data_provenance` (`item_type = 'candidate_skills'`, `item_id = candidateSkillId`, `field_name = 'skill_id'`, `resolution_method = 'human_reviewed'`, `approved_at = NOW()`). No `data_provenance_sources` row is created.
     - Records human change via `recordHumanChange(client, { candidateId, itemType: 'candidate_skills', itemId: candidateSkillId, fieldName: 'skill_id', previousValue: null, newValue: targetSkillId, changedBy: adminId, reason })`.
   - Updates `unknown_skills` with `status = 'accepted'`, `resolved_skill_id = targetSkillId`, and `resolved_at = NOW()`.
6. **Reject action**:
   - Updates `unknown_skills` with `status = 'rejected'` and `resolved_at = NOW()`. `resolved_skill_id` remains `null`.
   - Leaves candidate skills untouched; creates no candidate skills, no provenance, and no audit log.
7. **Human review completion**:
   - Queries `human_reviews` for an existing row (`review_target_type = 'unknown_skill'`, `item_id = unknown_skills.id`, `review_status IN ('pending', 'in_review')`).
   - If present: updates to `review_status = 'completed'`, setting `admin_id`, `reviewed_at = NOW()`, `review_result` (`linked:<id>`, `added:<id>`, or `rejected`), and `confidence`.
   - If none exists (e.g. US-17 pending): inserts a completed `human_reviews` record.

**Error responses:**

| Status | When                                                         | Body                                                                                          |
| ------ | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `400`  | Missing or invalid fields in body or path                    | `{"errors":{"<field>":"<message>"}}`                                                          |
| `400`  | Confidence missing                                           | `{"errors":{"confidence":"Confidence is required"}}`                                          |
| `400`  | Confidence outside 0..1                                      | `{"errors":{"confidence":"Confidence must be between 0 and 1"}}`                              |
| `400`  | `link` action with non-existent `skillId`                    | `{"errors":{"skillId":"Skill not found"}}`                                                    |
| `401`  | Not logged in or invalid/expired token                       | `{"errors":{"auth":"Log in to continue"}}`                                                    |
| `403`  | User does not have admin role                                | `{"errors":{"auth":"You do not have access to this resource"}}`                               |
| `404`  | Unknown skill not found                                      | `{"errors":{"unknownSkillId":"Unknown skill not found"}}`                                     |
| `409`  | Unknown skill already resolved                               | `{"errors":{"unknownSkillId":"Unknown skill already resolved"}}`                              |
| `409`  | `add` action with existing canonical name (case-insensitive) | `{"errors":{"canonicalName":"Skill already exists, link it instead"},"existingSkillId":<id>}` |
| `500`  | Unexpected server error                                      | `{"errors":{"server":"Something went wrong"}}`                                                |

## Review routing (US-17)

The worker sends every case it cannot decide safely to human review. Undisputed fields are saved at once.

### Review reasons

| Reason                  | Rule       | Where it comes from                                                                |
| ----------------------- | ---------- | ---------------------------------------------------------------------------------- |
| `conflict`              | C1, C2, D2 | Rules engine on a later file (US-16)                                               |
| `item_match_uncertain`  | C3         | Compare step on a later file (US-15)                                               |
| `intra_source_conflict` | C4         | One file states two values for the same item (storage writer)                      |
| `validation_failure`    | C5         | Code validation (US-09, US-14), on profile fields and item fields                  |
| `low_confidence`        | C6         | A value below the review threshold                                                 |
| `unknown_skill`         | C7         | Skill normalization (US-13). Resolved through the unknown skills endpoints (US-19) |

Every review is built by `createReviewItem` and saved by `saveReviewItems` (`shared/src/review-items.js`), inside the job's storage transaction.

### Threshold

`REVIEW_CONFIDENCE_THRESHOLD` (default `0.5`). The store step reads it once per job, so a new value applies to the next file without a code change.

### First file and later files

- First file: only C4, C5, C6 and C7 apply.
- A field below the threshold is not stored and stays empty with a pending review. A field that is part of the item's deduplication key (for example `job_title`, `company_name`, `start_date`) is stored, because the item cannot be matched without it, and still gets a pending review.
- Later file: the rules engine reviews (C1, C2, C6, D2) and the uncertain matches (C3) are written through the same functions (`shared/src/merge/create-merge-reviews.js`). A low-confidence field fill on a matched item is not written and goes to review.
- While a review is pending, the stored value stays (or the field stays empty) and the admin profile shows the field as pending.
- A newer file on a field that already has a pending conflict adds one option to the same conflict.

### Conflict options

- Stored value option: the current stored value with the source file, confidence and evidence of its newest source row. All three are `null` when the stored value has no source row (for example a human-reviewed value).
- New value option: the value from this file with its file, confidence and evidence.
- C3: `field_name` is `__item__`, `item_id` is the stored item it may match, and the single option value is `{ "item": { ...columns }, "candidateStoredIds": [ids] }`. The new item is not inserted until an admin resolves it.

### Counter

`processing_jobs.pending_review_count` counts the new conflicts and new unknown skills of the job. An option added to an already pending conflict does not count. A job with a count above 0 ends as `completed_with_review`.

### Note on two phone numbers

The extraction schema has one phone field, so one file cannot carry two phone numbers. The intra-source case (C4) is covered by duplicate items in one file with different values.

## Testing and Code Quality

- **Run Tests**:

  ```bash
  npm test
  ```

  Runs the test suite across workspaces using Jest.

  To run a single test file and print every test name:

  ```bash
  npm test -- <path-to-test-file> --verbose
  ```

  `npm test` runs Jest with `node --experimental-vm-modules`, which the PDF extractor (unpdf) needs inside Jest. Plain `npx jest` works for the other tests but fails the PDF upload tests.

  For the extraction data contract (schema, tests and field-to-column mapping), see [shared/README.md](shared/README.md).
  For the queue and worker (job flow, retries, steps), see [worker/README.md](worker/README.md)

- **Run Tests Sequentially**:

  ```bash
  npm test -- --runInBand
  ```

  Runs all tests sequentially, which is useful for database integration tests.

  **Note:** Database integration tests use the `TEST_DATABASE_URL` environment variable and require an initialized `simera_test` database. Make sure this variable points to the test database, not the development database.

- **Lint Code**:

  ```bash
  npm run lint
  ```

  Checks all workspaces for code style and syntax issues with ESLint.

- **Format Code**:
  ```bash
  npm run format
  ```
  Formats all codebase files using Prettier.

## Project Structure

```text
├── api/          # Express HTTP API application
├── worker/       # Background worker process
├── web/          # Frontend app, added by the frontend developer
├── shared/       # Shared config loader, models, and utilities
├── package.json  # Root package with npm workspaces and scripts
├── .env.example  # Example environment variables template
└── .nvmrc        # Node.js version specification (22)
```

## Branch, Commit and PR Rules

- Branches: `main`, `develop` (default), and `feature/<CARD-ID>-<short-name>` created from `develop`.
- Commit message: `<type>(<CARD-ID>): <imperative summary>`. Types: `feat`, `fix`, `test`, `docs`, `style`, `refactor`, `chore`, `ci`. Example: `feat(US-04): add file size validation`.
- Pull requests: the title starts with the card ID. One approving review from another member. The reviewer merges into `develop` with "Create a merge commit". `main` gets the demo release only.
