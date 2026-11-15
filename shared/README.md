# shared

Code shared by `api` and `worker`.

- `src/config.js`: environment config loader (`loadConfig`).
- `src/extraction/schema.js`: extraction data contract (the LLM output schema).

## Extraction data contract

`src/extraction/schema.js` defines the single data shape used by the LLM call, the validation layer and the persistence layer.

```js
const {
  SCHEMA_VERSION,
  validateExtraction,
  getExtractionJsonSchema
} = require('shared/src/extraction/schema');

const result = validateExtraction(llmOutput);
// { success: true, data }  -> data with undefined fields stripped
// { success: false, errors: [{ path: 'candidate.first_name', message }] }

const jsonSchema = getExtractionJsonSchema(); // JSON Schema sent to the LLM
```

### Running and testing

The contract is a library, not a service. `npm run dev:api` and `npm run dev:worker` don't use it yet. Run all commands from the repository root after `npm install`.

**Run the contract tests:**

```bash
npx jest shared/test/extraction-schema.test.js --verbose
```

Every test name is printed with a check mark. `npm test` runs the same tests together with the rest of the suite.

The tests cover:

- a complete and correct JSON (one item in every section) passes;
- `null` values and empty lists (`[]`) pass;
- a non-object input fails at `(root)`;
- a missing field fails, and the error names its path (`candidate.first_name`, `work_experience[0].end_date`, the first field of every list section);
- extra undefined fields are stripped at every level (root, `meta`, `candidate`, wrappers, every list section);
- dates: `YYYY` (year only), `YYYY-MM` and `YYYY-MM-DD` are accepted; other formats such as `May 2019` are rejected;
- value wrapper rules: evidence and confidence are required for a non-null value, both must be null for a null value, and confidence must be in 0..1;
- `work_experience.duration_months`: whole months ≥ 0 or `null`; negative, fractional and string values are rejected; it's an `integer` in the JSON Schema;
- `is_current = true` with an `end_date` passes the contract (the validation layer checks it);
- enum fields (language level, link type, duration unit) reject values that aren't in their allowed list;
- the six excluded personal fields aren't in the schema and are stripped from the input.

`buildValidExtraction()` in `shared/test/extraction-schema.test.js` is a complete, valid example of the contract. Use it as a reference for the full JSON shape.

**Try it manually** in the Node REPL (`node`, then paste):

```js
const s = require('./shared/src/extraction/schema');

// Missing sections: fails and lists each missing field path
s.validateExtraction({
  meta: { document_language: 'en', extraction_warnings: [] }
}).errors;

// Print the JSON Schema that will be sent to the LLM
console.log(JSON.stringify(s.getExtractionJsonSchema(), null, 2));

s.SCHEMA_VERSION;
```

Exit the REPL with `Ctrl + D`.

**Lint:**

```bash
npm run lint
```

### Exports

| Export                        | Description                                                              |
| ----------------------------- | ------------------------------------------------------------------------ |
| `SCHEMA_VERSION`              | Version of the contract. Code constant only; not stored in the database. |
| `extractionSchema`            | Zod schema (runtime validator).                                          |
| `validateExtraction(input)`   | Validates and strips unknown fields. Errors name the failing field path. |
| `getExtractionJsonSchema()`   | JSON Schema (draft 2020-12) of the contract, for the LLM prompt.         |
| `LANGUAGE_PROFICIENCY_LEVELS` | `basic`, `intermediate`, `advanced`, `native`                            |
| `LINK_TYPES`                  | `linkedin`, `github`, `portfolio`, `other`                               |
| `DURATION_UNITS`              | `years`, `months`                                                        |

### Rules

- **Value wrapper:** every candidate data field is `{ value, confidence, evidence }`.
  - `value = null`: the information is not in the file. `evidence` must be `null`.
  - `value != null`: `confidence` is a number from 0 to 1, and `evidence` is a non-empty snippet copied verbatim from the file.
- **No field is omitted:** every field must be present. Missing information is `null`, an empty list is `[]`. A missing field fails validation and the error names its path (e.g. `work_experience[0].end_date`).
- **Unknown fields are stripped** at every level and never reach storage.
- **Dates** are strings that keep the precision written in the source: `YYYY` (year only), `YYYY-MM` or `YYYY-MM-DD`. A missing month is never filled in. Range checks (month 1 to 12, start before end, no future dates) are done by the validation layer.
- **Ongoing items** (`work_experience`, `education`, `volunteering`) are written as `is_current = true` with `end_date = null`. The contract checks types only. Consistency between `is_current` and `end_date` is a validation-layer check: a failure sends that item alone to human review instead of failing the whole file.
- **Job duration:** `work_experience[].duration_months` is the duration of each job in whole months, calculated by the LLM from `start_date` and `end_date` (or the processing date when the job is current). Its evidence is the date range as written. The validation layer recalculates it from the dates; when the two differ, the code's result is used. It's never stored: experience is calculated when needed.
- **Skills** are extracted with their name as written in the file. Normalization against the universal skills list happens later and is not part of this contract.
- **Excluded personal fields:** date of birth, nationality, gender, religion, marital status and photo are not part of the schema. If they appear in the input, they are stripped.
- **Content checks belong to the validation layer**, not to this contract: date ranges, `is_current` consistency, ISO country codes, phone format, evidence found in the source text, and the duration recalculation.
- Database-generated fields (`id`, `candidate_id`, `deduplication_key`, timestamps) are not part of the contract.

### Schema field to database column mapping

Every field below (except `meta`) is a value wrapper. The table lists the type of `value`.

#### meta → `processing_jobs`

| Schema field               | Type           | Column                                | Notes                        |
| -------------------------- | -------------- | ------------------------------------- | ---------------------------- |
| `meta.document_language`   | string \| null | `processing_jobs.document_language`   | Not wrapped.                 |
| `meta.extraction_warnings` | string[]       | `processing_jobs.extraction_warnings` | Not wrapped. Stored as text. |

#### candidate → `candidate_profiles` (provenance item_type `candidate_profile`)

| Schema field             | Type   | Column                            | Notes                                                |
| ------------------------ | ------ | --------------------------------- | ---------------------------------------------------- |
| `candidate.first_name`   | string | `candidate_profiles.first_name`   |                                                      |
| `candidate.last_name`    | string | `candidate_profiles.last_name`    |                                                      |
| `candidate.headline`     | string | `candidate_profiles.headline`     |                                                      |
| `candidate.summary`      | string | `candidate_profiles.summary`      |                                                      |
| `candidate.phone`        | string | `candidate_profiles.phone`        | Normalized to international format by code.          |
| `candidate.industry`     | string | `candidate_profiles.industry`     |                                                      |
| `candidate.profession`   | string | `candidate_profiles.profession`   |                                                      |
| `candidate.city`         | string | `candidate_profiles.city`         |                                                      |
| `candidate.country_code` | string | `candidate_profiles.country_code` | As written; converted to ISO 3166-1 alpha-2 by code. |

The email is not part of the contract: the worker finds emails in the extracted text with code and matches them against the login email (`users.email`).

#### work_experience[] → `work_experience` (item_type `work_experience`)

| Schema field       | Type        | Column             |
| ------------------ | ----------- | ------------------ |
| `job_title`        | string      | `job_title`        |
| `company_name`     | string      | `company_name`     |
| `start_date`       | date string | `start_date`       |
| `end_date`         | date string | `end_date`         |
| `is_current`       | boolean     | `is_current`       |
| `duration_months`  | integer ≥ 0 | _not stored_       |
| `location`         | string      | `location`         |
| `employment_type`  | string      | `employment_type`  |
| `work_mode`        | string      | `work_mode`        |
| `description`      | string      | `description`      |
| `responsibilities` | string      | `responsibilities` |
| `achievements`     | string      | `achievements`     |
| `skills_used`      | string      | `skills_used`      |
| `company_url`      | string      | `company_url`      |

`skills_used` is free text as written and is not linked to the universal skills list. `duration_months` is used only to verify the code's own calculation and has no column.

#### education[] → `education` (item_type `education`)

| Schema field       | Type        | Column             |
| ------------------ | ----------- | ------------------ |
| `institution_name` | string      | `institution_name` |
| `degree_level`     | string      | `degree_level`     |
| `degree_name`      | string      | `degree_name`      |
| `field_of_study`   | string      | `field_of_study`   |
| `start_date`       | date string | `start_date`       |
| `end_date`         | date string | `end_date`         |
| `is_current`       | boolean     | `is_current`       |
| `gpa`              | string      | `gpa`              |
| `honors`           | string      | `honors`           |
| `location`         | string      | `location`         |
| `description`      | string      | `description`      |

#### skills[] → `candidate_skills` (item_type `candidate_skills`)

| Schema field        | Type                                          | Column                                 | Notes                                                                         |
| ------------------- | --------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------- |
| `name`              | string                                        | `candidate_skills.skill_id` → `skills` | Temporary name as written; never stored. Resolved to a `skills.id` by code.   |
| `proficiency_level` | string                                        | `proficiency_level`                    | Only when explicitly stated.                                                  |
| `stated_duration`   | `{ amount: number > 0, unit: years\|months }` | `months_of_experience`                 | Only when explicitly stated; converted to whole months by code (1 year = 12). |

A skill that can't be matched to the universal list is stored in `unknown_skills.skill_name` instead.

#### languages[] → `candidate_languages` (item_type `candidate_languages`)

| Schema field        | Type                                    | Column              | Notes                               |
| ------------------- | --------------------------------------- | ------------------- | ----------------------------------- |
| `language`          | string                                  | `language`          | Full English name (e.g. `English`). |
| `proficiency_level` | `basic\|intermediate\|advanced\|native` | `proficiency_level` | `language_proficiency` enum.        |

#### links[] → `candidate_links` (item_type `candidate_links`)

| Schema field | Type                                 | Column      | Notes                                              |
| ------------ | ------------------------------------ | ----------- | -------------------------------------------------- |
| `link_type`  | `linkedin\|github\|portfolio\|other` | `link_type` |                                                    |
| `url`        | string                               | `url`       | Normalized by code (lowercase, no trailing slash). |
| `label`      | string                               | `label`     |                                                    |

#### certifications[] → `certifications` (item_type `certifications`)

| Schema field           | Type        | Column                 |
| ---------------------- | ----------- | ---------------------- |
| `name`                 | string      | `name`                 |
| `issuing_organization` | string      | `issuing_organization` |
| `issue_date`           | date string | `issue_date`           |
| `expiration_date`      | date string | `expiration_date`      |
| `credential_id`        | string      | `credential_id`        |
| `credential_url`       | string      | `credential_url`       |
| `description`          | string      | `description`          |

#### projects[] → `projects` (item_type `projects`)

| Schema field  | Type        | Column        |
| ------------- | ----------- | ------------- |
| `name`        | string      | `name`        |
| `description` | string      | `description` |
| `role`        | string      | `role`        |
| `project_url` | string      | `project_url` |
| `start_date`  | date string | `start_date`  |
| `end_date`    | date string | `end_date`    |

#### awards[] → `awards` (item_type `awards`)

| Schema field  | Type        | Column        |
| ------------- | ----------- | ------------- |
| `name`        | string      | `name`        |
| `issuer`      | string      | `issuer`      |
| `award_date`  | date string | `award_date`  |
| `description` | string      | `description` |

#### publications[] → `publications` (item_type `publications`)

| Schema field       | Type        | Column             |
| ------------------ | ----------- | ------------------ |
| `title`            | string      | `title`            |
| `publisher`        | string      | `publisher`        |
| `publication_date` | date string | `publication_date` |
| `url`              | string      | `url`              |
| `description`      | string      | `description`      |

#### volunteering[] → `volunteering` (item_type `volunteering`)

| Schema field   | Type        | Column         |
| -------------- | ----------- | -------------- |
| `organization` | string      | `organization` |
| `role`         | string      | `role`         |
| `description`  | string      | `description`  |
| `start_date`   | date string | `start_date`   |
| `end_date`     | date string | `end_date`     |
| `is_current`   | boolean     | `is_current`   |

### Where confidence and evidence go

Core tables have no confidence or evidence columns. For each field, the wrapper's `value`, `confidence` and `evidence` are stored with its provenance:

- approved value: `data_provenance` (how and when it was approved), plus a `data_provenance_sources` row (`source_value`, `confidence`, `evidence`) pointing to the processing job of the file the current value came from. When a newer file updates the value, the source rows are updated to point to that file;
- difference with the stored value (automatic or sent to review): `conflict_options` (`value`, `confidence`, `evidence`), with one option for the stored value and one for each new value;
- unknown skill: `unknown_skills` (`skill_name`, `confidence`, `evidence`).

## LLM Client (US-08)

`shared/src/llm/client.js` provides an OpenAI-compatible Chat Completions client using Node 22 native `fetch`.

```js
const {
  createLlmClient,
  createLlmClientFromEnv
} = require('shared/src/llm/client');

const client = createLlmClientFromEnv();
const { content, modelVersion } = await client.chatJson(messages);
```

### Features

- Generic OpenAI-compatible Chat Completions endpoint (`POST {baseUrl}/chat/completions`).
- Requests `temperature: 0` and `response_format: { type: 'json_object' }`.
- Configurable timeout via `AbortSignal.timeout(timeoutMs)` (default 90,000 ms).
- Classified errors: HTTP 408, 429, 5xx and network errors throw `TemporaryError`; 4xx throws `PermanentError`.
- Error messages never expose request or response body content.
- Reads `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, and optional `LLM_TIMEOUT_MS`.

## Experience months (US-14)

`shared/src/experience.js` provides pure functions for date parsing and experience month calculations. It is used during extraction validation (worker step 5) and by the API on read (e.g. candidate profile in US-12).

```js
const {
  parseDate,
  isRealDate,
  toMonthIndex,
  jobMonths,
  calculateExperienceMonths
} = require('shared/src/experience');

// Calculate total experience across jobs, merging overlapping intervals:
const { totalMonths, perJob } = calculateExperienceMonths(jobs, {
  now: () => new Date()
});
```

### Key behaviors

- `parseDate(s)`: parses `"YYYY"`, `"YYYY-MM"`, or `"YYYY-MM-DD"` into `{ year, month, day }` (or `null`).
- `isRealDate(parts, { minYear, maxYear })`: verifies calendar validity (1-12 month, valid days with leap years) and year range.
- `toMonthIndex(s, side)`: continuous month index `year * 12 + (month - 1)`. Year-only start dates count from January (`'start'`); year-only end dates count through December (`'end'`).
- `jobMonths(job, { now })`: counts inclusive months for a single job or `null` if unparseable/invalid. Ongoing items end at the month of `now`.
- `calculateExperienceMonths(jobs, { now })`: sorts valid intervals, merges overlapping intervals, and returns `{ totalMonths, perJob }`. Never mutates the input array.
- Total experience is never stored in the database or extraction schema; it is calculated on read.
