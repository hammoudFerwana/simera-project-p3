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
