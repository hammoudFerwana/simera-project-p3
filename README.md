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
   *(On Windows PowerShell: `Copy-Item .env.example .env`)*

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

Branches: main, develop (default), feature/<CARD-ID>-<short-name> from develop.
Commit message: "<type>(<CARD-ID>): <imperative summary>". Types: feat, fix, test, docs, style, refactor, chore, ci. Example: "feat(US-04): add file size validation".
Pull requests: the title starts with the card ID. One approving review from another member. The reviewer merges into develop with "Create a merge commit". main gets the demo release only.
