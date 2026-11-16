# Worker (US-05)

Background worker that processes each accepted file in ordered steps. It uses pg-boss (on the same PostgreSQL database) to deliver jobs, and the `processing_jobs` table as the source of truth for job status.

## Run

```bash
npm run dev:worker
```

The first start creates the `pgboss` schema inside the database. No extra service is needed.

## Job flow

- `queued` -> `processing` -> `completed`, `completed_with_review` (when `pending_review_count > 0`) or `failed`.
- One job per file (`processing_jobs.file_id` is unique).
- A job starts only when no older job of the same candidate is `queued` or `processing`. Jobs of different candidates are independent.
- Temporary failure (`TemporaryError`): retried inside the same job, up to 3 attempts, with an increasing delay. Then `failed` with `failure_reason`.
- Permanent failure (`PermanentError`): `failed` at once, no retry.
- A failed job is never run again. The candidate uploads an updated file.
- When the worker starts, it sends every job that is `queued` or `processing` to the queue. A job that was running when the worker died is picked up by the new worker at once (pg-boss alone would give it back only after 30 minutes). The candidate lock and the job state make a second delivery of the same job harmless.
- While it runs, a **sweep** every `QUEUE_SWEEP_INTERVAL_SECONDS` (optional, default 60) sends again every job that is `queued` in `processing_jobs`, older than 60 seconds, and has no live pg-boss job (`created`, `retry` or `active`). This covers an API whose send to the queue failed after the commit (CV/LinkedIn upload, Simera send button), with no worker restart. A job waiting behind an older job of its candidate is in pg-boss as `retry`, so it's not sent twice. Unit tests: `npm test -- shared/test/queue-sweep.test.js`.
- When a job ends, `completed_at`, `changed_field_count` and `pending_review_count` are set (or `failure_reason` if it failed).

## Steps

Steps live in `worker/src/steps/index.js`, in this order:

1. extract text and links (US-06)
2. check the email (US-07)
3. call the LLM (US-08)
4. normalize skills (US-13)
5. validate with code (US-09, US-14)
6. compare with stored data and apply the latest rules (US-15, US-16, US-17)
7. store (US-10)

Recording the completion is done by the worker after the last step.

Each step is `async (ctx) => ctx`. It throws `TemporaryError` or `PermanentError` (from `shared/src/errors`). Errors are classified by type, never by message text. Do not put CV text in error messages, because the message is saved in `failure_reason`.

To replace a stub, change the entry in `worker/src/steps/index.js`. The orchestrator does not change.

### Step 1: Extract text and links (US-06)

`extractText` runs `extract(fileBuffer, mimeType)` from `shared/src/extraction/extract.js` on the raw uploaded file:

- Fetches `storage_location` and `mime_type` from `uploaded_files` for `ctx.fileId`.
- Resolves the private storage path via `createLocalStorage` and reads the file bytes.
- Extracts plain text and links (`[{ label, url }]`) for PDF, DOCX, Markdown, or JSON (Simera, US-22) files. For JSON the raw text is the file text, and bare `http(s)`/`mailto` addresses are the links.
- Sets `ctx.text` and `ctx.links` for the following steps (US-07 checks email, US-08 sends to the LLM, US-09 checks evidence).
- Safe failure handling:
  - Missing file record: `PermanentError('Uploaded file not found')`
  - Unsupported MIME type: `PermanentError('Unsupported file type')`
  - Missing file on disk (ENOENT): `PermanentError('The uploaded file is missing')`
  - Other file system error: `TemporaryError('The uploaded file could not be opened')`
  - Corrupted or unreadable file: `PermanentError('The file could not be read')`
  - Empty or almost empty extracted text: `PermanentError('Extracted text is empty')`
- Error messages and failure reasons never contain file names, paths, or CV text.

### Step 4: Normalize skills (US-13)

Normalizes raw extracted skill names to canonical names from the universal skills list:

- Exact matches (case-insensitive, trimmed) resolve immediately via code without calling the LLM.
- Fuzzy matching using Fuse.js searches canonical names with configurable minimum similarity (`SKILL_MIN_SIMILARITY`, default 0.5), returning up to 50 candidates.
- Skills with candidates are batched into a single LLM request per file for canonical selection.
- Code validation enforces that the LLM-selected name is one of the candidates provided. Otherwise, the skill is marked as unknown.
- Skills without candidates above the threshold are marked unknown without calling the LLM.
- Empty skill names are skipped.
- Resolves skills into `ctx.skillResolutions`, logging only `{ jobId, matched, unknown, llmRequests }` without sensitive text.

### Step 5: Validate with code (US-09, US-14)

`validateWithCode` runs deterministic code checks against `ctx.extraction`:

- Evidence verification: checks that every non-null wrapper's evidence appears in `ctx.text` or `ctx.links` (normalized with Unicode NFKC, lowercase, single-space whitespace). Missing evidence adds `evidence_not_found`.
- Format normalization:
  - `candidate.phone`: normalized to E.164 via `libphonenumber-js`. Numbers without country code fail with `phone_without_country_code`; invalid numbers fail with `invalid_phone`.
  - `candidate.country_code`: normalized to ISO 3166-1 alpha-2 via `i18n-iso-countries`. Invalid codes fail with `invalid_country`.
  - `languages[].language`: normalized to its English name via `Intl.DisplayNames`. Invalid languages fail with `invalid_language`.
  - URLs (`links[].url`, `work_experience[].company_url`, `certifications[].credential_url`, `projects[].project_url`, `publications[].url`): verified with http/https and domain dot checks, prepending `https://` for bare domains. Invalid URLs fail with `invalid_url`.
- Date validation (US-14):
  - Real date checks (`isRealDate`): verifies calendar existence (month 1-12, valid days in month with leap years) and year range (`minYear = 1950`, `maxYear = year of now + 10`). Failures record `invalid_date` or `year_out_of_range`.
  - Future date check: applies to start dates and single dates (`work_experience.start_date`, `education.start_date`, `volunteering.start_date`, `projects.start_date`, `certifications.issue_date`, `awards.award_date`, `publications.publication_date`) at month precision. Dates later than the month of `now` fail with `future_date`. End dates and certificate expiration dates may be in the future.
  - Chronological ordering: start dates cannot be later than end dates (or issue date after expiration date for certifications), failing with `start_after_end` on the end date / expiration date field.
  - Consistency: `is_current = true` with a non-null `end_date` in `work_experience`, `education`, or `volunteering` fails with `current_with_end_date` on `end_date`.
- Experience duration recalculation (US-14):
  - Recalculates `duration_months` for every `work_experience` item using `jobMonths` based on inclusive months at month precision. Year-only start dates count from January; year-only end dates count to December (Open Decision 20). Ongoing jobs count through the current month of `now`.
  - If the code calculation differs from the LLM value, the code's value replaces it in `ctx.extraction` (Open Decision 21). When the duration changes and `duration_months.evidence` is null, evidence and confidence are copied from `start_date`.
  - Items with failed date checks on `start_date` or `end_date` keep their existing duration without recalculation.
  - Changed durations are not failed checks and are not logged. No total experience is ever calculated or stored in `ctx` or the database (Open Decision 27).
- Safe failure handling: failed checks never change or drop values. Each failure records `{ section, index, field, reason }` in `ctx.failedChecks` and is logged with `jobId`, `section`, `index`, `field`, and `reason` only (never the value or evidence).

### Check email step (US-07)

Checks that emails found in the file match the candidate's account login email (`users.email` via `candidate_profiles.user_id`).

- Pure function `findEmails(text, links)` extracts lowercase, de-duplicated emails from document text and `mailto:` links.
- Pure function `decideEmail(fileEmails, loginEmail)` permits continuation if the file contains the account email or contains no emails at all; otherwise reports mismatch.
- On mismatch, throws `PermanentError('The file contains an email that does not match your account email')`.
- On continuation, sets `ctx.loginEmail` to the lowercase account email.

## Add a job from the API (US-04, US-22)

1. Insert the `processing_jobs` row with status `queued`.
2. Call `enqueueJob(boss, jobId)` from `shared/src/queue.js`, once.

## Files

- `src/index.js`: starts and stops the worker.
- `src/process-job.js`: runs one job (retries, ordering, lock, completion).
- `src/jobs-repo.js`: all `processing_jobs` updates.
- `src/orchestrator.js`: runs the steps in order.
- `scripts/smoke-queue.js`: manual check of the ordering with real pg-boss.
- `scripts/smoke-restart.js`: manual check that a job finishes after the worker is killed.
- `scripts/smoke-llm.js`: manual check of LLM extraction on a CV file using live AI Studio credentials.
- `../shared/src/queue.js`: pg-boss setup, `enqueueJob`, `enqueueUnfinishedJobs`, `enqueueLostJobs` / `startQueueSweep` (the periodic sweep), `startWorker` (shared with the API).

## LLM Extraction Step (US-08)

Step 3 (`worker/src/steps/call-llm.js`) performs structured extraction using an LLM.

- Formulates extraction prompt (`worker/src/llm/extraction-prompt.js`, version `extraction-v1`) with JSON Schema, extracted links, processing date, and sanitized CV text (preventing closing tag injection).
- Calls the LLM client with `response_format: { type: 'json_object' }`.
- Strips markdown code fences if returned.
- Validates the parsed object against the EN-03 Zod contract (`shared/src/extraction/schema.js`).
- On validation or JSON parse failure, tracks errors in an in-memory Map keyed by `jobId` and throws `TemporaryError`. The next retry attempt feeds the error list back to the LLM to request corrected output.
- On success, sets `ctx.extraction`, deletes the retry feedback entry, and records metadata (`extracted_at`, `model_name`, `model_version`, `prompt_version`, `document_language`, `extraction_warnings`) in `processing_jobs`.
- Never logs CV text, prompt messages, or LLM output. Logs only job IDs, attempt outcomes, and error classes.

## Tests

They use `TEST_DATABASE_URL` (`simera_test`).

```bash
npx jest worker/test/process-job.test.js --verbose --runInBand
```
