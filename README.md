# Simera Project P3

Resume parsing and profile sync system.

Candidates register, verify their email with an OTP, and upload a CV (PDF or DOCX) and a LinkedIn Markdown file. A background worker extracts the data, validates it with code, resolves conflicts with fixed rules, and stores every value with its source.

## Stack

- Backend: Node.js and Express (JavaScript)
- Database: PostgreSQL
- Frontend: React

## Team workflow

Read [docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md) before you write any code.

- `main`: stable releases only
- `develop`: integration branch, default branch
- `feature/<card>-<short-name>`: one branch per Trello card

## Project structure

The folder structure and run instructions are added by card EN-01.
