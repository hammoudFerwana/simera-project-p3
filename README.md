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
- **PostgreSQL**: installed and running (required for later database cards)

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
- After the account is saved, the OTP service is called to send the verification code. It's a placeholder (`api/src/auth/send-otp.js`) until US-02 provides the real service. If sending fails, the account stays, and the candidate can request a new code.

Request:

```json
{ "email": "jane.doe@example.com", "password": "secret-pass-1" }
```

Responses:

| Status | When                     | Body                                                                                                             |
| ------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `201`  | Account created          | `{ "message": "Account created. Enter the verification code sent to your email.", "email": "..." }`              |
| `400`  | Invalid input            | `{ "errors": { "email": "Enter a valid email address", "password": "Password must be at least 8 characters" } }` |
| `400`  | Malformed JSON body      | `{ "errors": { "body": "Invalid JSON body" } }`                                                                  |
| `409`  | Email already registered | `{ "errors": { "email": "This email is already in use" } }`                                                      |
| `500`  | Unexpected error         | `{ "errors": { "server": "Something went wrong" } }`                                                             |

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

Run the registration tests only (no database needed, it's replaced by an in-memory fake):

```bash
npx jest api/test/register.test.js --verbose
```

## Testing and Code Quality

- **Run Tests**:

  ```bash
  npm test
  ```

  Runs the test suite across workspaces using Jest.

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
