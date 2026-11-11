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

## Testing and Code Quality

- **Run Tests**:

  ```bash
  npm test
  ```

  Runs the test suite across workspaces using Jest.

  To run a single test file and print every test name:

  ```bash
  npx jest <path-to-test-file> --verbose
  ```

  For the extraction data contract (schema, tests and field-to-column mapping), see [shared/README.md](shared/README.md).

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
