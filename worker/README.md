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

### Step 5: Validate with code (US-09, US-14)

`validateWithCode` runs deterministic code checks against `ctx.extraction`:
- Evidence verification: checks that every non-null wrapper's evidence appears in `ctx.text` or `ctx.links` (normalized with Unicode NFKC, lowercase, single-space whitespace). Missing evidence adds `evidence_not_found`.
- Format normalization:
  - `candidate.phone`: normalized to E.164 via `libphonenumber-js`. Numbers without country code fail with `phone_without_country_code`; invalid numbers fail with `invalid_phone`.
  - `candidate.country_code`: normalized to ISO 3166-1 alpha-2 via `i18n-iso-countries`. Invalid codes fail with `invalid_country`.
  - `languages[].language`: normalized to its English name via `Intl.DisplayNames`. Invalid languages fail with `invalid_language`.
  - URLs (`links[].url`, `work_experience[].company_url`, `certifications[].credential_url`, `projects[].project_url`, `publications[].url`): verified with http/https and domain dot checks, prepending `https://` for bare domains. Invalid URLs fail with `invalid_url`.
- Safe failure handling: failed checks never change or drop values. Each failure records `{ section, index, field, reason }` in `ctx.failedChecks` and is logged with `jobId`, `section`, `index`, `field`, and `reason` only (never the value or evidence).

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
- `../shared/src/queue.js`: pg-boss setup, `enqueueJob`, `enqueueUnfinishedJobs`, `startWorker` (shared with the API).

## Tests

They use `TEST_DATABASE_URL` (`simera_test`).

```bash
npx jest worker/test/process-job.test.js --verbose --runInBand
```
