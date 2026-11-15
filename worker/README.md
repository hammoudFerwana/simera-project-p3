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
- `../shared/src/queue.js`: pg-boss setup, `enqueueJob`, `enqueueUnfinishedJobs`, `startWorker` (shared with the API).

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
