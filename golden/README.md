# Golden Dataset & Accuracy Measurement (US-23)

A reference dataset of synthetic candidate files with hand-written expected results and an automated measurement runner that evaluates field extraction accuracy, date exact-match rates, experience duration matching, and conflict resolution rules before production deployment.

---

## 1. Structure

```text
golden/
├── files/               # Synthetic input files (PDF, DOCX, Markdown, corrupted, scanned)
├── expected/            # Hand-written expected profile extractions in EN-03 shape
├── lib/
│   ├── cleanup.js       # Cleans up @golden.example database records and raw storage
│   ├── compare.js       # Field-by-field, date, and experience comparison logic
│   ├── db-guard.js      # Safety check ensuring database name starts with simera_golden
│   ├── planted.js       # Resolves planted conflict and review case decisions
│   └── report.js        # Markdown report generator
├── test/                # Unit test suites for runner helpers and manifest validation
├── manifest.json        # Test suite specification and planted case definitions
├── make-golden-files.js # Generator script for all synthetic input files
├── run-golden.js        # Accuracy measurement test runner
└── README.md            # Documentation
```

---

## 2. Dataset Scenarios & Planted Cases

All inputs are completely fictional (privacy-by-design, using the RFC 2606 `@golden.example` domain):

### Person 1: Lina Haddad (`lina.haddad@golden.example`)

1. **`01-standard-cv.pdf`**: Base CV with current job at Nova Labs (2021-03 to present), older ended job at Apex Solutions (2018-01 to 2020-12), intern job at Byte Systems (2016-06 to 2017-12), education at University of Jordan, 6 skills including unknown skill **Zorbex** (**C7** planted), English and Arabic, city Amman, headline "Backend Developer".
2. **`02-linkedin.md`**: Start of old job written as "2018" only (**A3** precision upgrade keeps 2018-01), older Byte Systems job omitted (**A4** keeps missing job), headline updated to "Senior Backend Developer" (**B2**).
3. **`03-cv-v2.docx`**: Nova Labs job now ended 2024-03 (**B1**), city changed to Dubai (**B2**).
4. **`04-cv-v3.pdf`**: Ended job Apex Solutions claimed as "present" (**C1** conflict sent to review, stored data kept).
5. **`05-cv-v4.pdf`**: Education start date shifted by 3 months (**C2** conflict sent to review, stored data kept).
6. **`06-cv-v5.pdf`**: Nova Labs with overlapping title "Lead Systems Architect" (**C3** conflict sent to review, stored data kept).
7. **`07-cv-v6.pdf`**: Vague headline intended to test low-confidence extraction (**C6**).

### Person 2: Omar Saleh (`omar.saleh@golden.example`)

8. **`08-standard-cv.docx`**: Base CV with job at Pyramid Tech (2020-05 to present), education at Cairo University, skills Python, Django, React, PostgreSQL.
9. **`09-linkedin.md`**: Adds project "E-Commerce Gateway" (**A1** adds project).
10. **`10-cv-wrong-email.pdf`**: CV containing a different email (`tariq.nadim@golden.example`) triggering an email mismatch permanent failure (**US-07**).

### Corrupted & Unreadable Files

11. **`11-corrupted.pdf`**: Non-PDF binary stream rejected at upload as `corrupted_file`.
12. **`12-scanned.pdf`**: Image-only PDF with no text rejected at upload as `no_readable_text`.

---

## 3. How to Generate the Files

Input files are generated programmatically via `pdfkit` and `docx`:

```bash
npm run golden:files
```

Or directly:

```bash
node golden/make-golden-files.js
```

Generated files are committed to `golden/files/`.

---

## 4. Database Setup

The runner enforces strict isolation (**Decision D4**). It refuses to run against any database whose name does not start with `simera_golden`:

1. Create a dedicated golden test database:

   ```bash
   createdb -U postgres simera_golden
   ```

2. Load the project schema:

   ```bash
   psql -U postgres -d simera_golden -f shared/sql/schema.sql
   ```

3. Seed canonical skills:

   ```bash
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/simera_golden" npm run seed:skills --workspace=shared
   ```

4. Configure `GOLDEN_DATABASE_URL` in `.env`:
   ```env
   GOLDEN_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/simera_golden
   ```

---

## 5. How to Run the Measurement

Run the measurement script against the golden dataset:

```bash
npm run golden
```

Or directly:

```bash
node golden/run-golden.js
```

### Options

- `--steps=develop`: Uses real worker steps from `worker/src/steps/index.js` (default).
- Output: A comprehensive summary is printed to the console and written to `golden/report.md` (git-ignored).

---

## 6. Running Unit Tests

Unit tests verify the runner helpers, math calculation, safety guards, and manifest integrity with fakes (no database or LLM connection required):

```bash
npm test -- golden/test --verbose
```

---

## 7. Traceability Verification (US-25)

After a golden run, verify every traceability target of Requirements 4.3 against the same database:

```bash
npm run golden:trace
```

The script reads `GOLDEN_DATABASE_URL` (same `simera_golden*` guard as the runner), runs read-only queries, prints `PASS`/`FAIL` per check with up to 10 offending rows, and exits with code `1` when any check fails.

| Requirement            | Check                                                                                                                      | Target |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------ |
| Record per value       | Stored non-empty values (core tables) with no `data_provenance` row                                                        | 0      |
| Evidence per value     | `no_conflict` / `latest_value` provenance with no `data_provenance_sources` row with non-blank evidence                    | 0      |
| Automatic decisions    | `automatic_rule` conflicts not resolved, without a B1/B2/B3 code, resolved value or date, or without exactly two options   | 0      |
| Automatic decisions    | Conflicts with a B code that are not `automatic_rule`                                                                      | 0      |
| Automatic decisions    | `latest_value` provenance not explained by an `automatic_rule` conflict (`is_current` is covered by the B1 `end_date` row) | 0      |
| Human decisions        | Completed reviews missing who, when, confidence, the new value or the previous value                                       | 100%   |
| Human decisions        | `human_audit_log` rows not matched by a completed review of the same admin                                                 | 0      |
| Versions               | Extractions (`extracted_at` set) missing model name, model version or prompt version                                       | 100%   |
| Versions               | Provenance sources whose job has no extraction or misses a version                                                         | 0      |
| No repeated processing | Files with more than one job, and duplicate `file_hash` values                                                             | 0 / 0  |

How a human decision counts as complete:

- **Who / when / confidence:** `human_reviews.admin_id`, `reviewed_at`, and `confidence` in [0, 1].
- **New value:** `conflicts.resolved_value` (resolved by `human_review`), or for an unknown skill `unknown_skills.status` = `accepted` with `resolved_skill_id`, or `rejected`.
- **Previous value:** the conflict's `conflict_options` (at least one), or the `unknown_skills` row itself. `human_audit_log` only records decisions that changed a value, so it is checked in the other direction (every audit row belongs to a completed decision).

Manual and human-decided values have no `data_provenance_sources` rows by design; they are covered by the human decision checks.

Tests (integration, on `TEST_DATABASE_URL`, each test rolled back; skipped when the variable is missing). They include the negative test that deletes a provenance row on purpose:

```bash
npm test -- golden/test/traceability.test.js --verbose
```
