#!/usr/bin/env node
/**
 * Manual smoke test for LLM extraction.
 * Usage: node worker/scripts/smoke-llm.js <path-to-file>
 *
 * Uses real LLM from .env. Not part of npm test.
 */
const fs = require('fs');
const path = require('path');
const { loadConfig } = require('../../shared/src/config');

loadConfig({
  requiredVars: [
    'NODE_ENV',
    'API_PORT',
    'DATABASE_URL',
    'LLM_BASE_URL',
    'LLM_MODEL',
    'LLM_API_KEY'
  ]
});

const { createLlmClientFromEnv } = require('../../shared/src/llm/client');
const {
  validateExtraction,
  getExtractionJsonSchema
} = require('../../shared/src/extraction/schema');
const {
  PROMPT_VERSION,
  buildExtractionMessages
} = require('../src/llm/extraction-prompt');

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node worker/scripts/smoke-llm.js <path-to-file>');
  process.exit(1);
}

function collapseWhitespace(s) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

async function main() {
  const absPath = path.resolve(filePath);
  const ext = path.extname(absPath).toLowerCase();

  let text;
  let links = [];

  // Try to use extract() from shared/src/extraction/extract.js if it exists
  let extractFn;
  try {
    extractFn = require('../../shared/src/extraction/extract');
  } catch {
    extractFn = null;
  }

  if (extractFn && typeof extractFn.extract === 'function') {
    const result = await extractFn.extract(absPath);
    text = result.text;
    links = result.links || [];
  } else {
    // Fallback: .md only, read as UTF-8
    if (ext !== '.md') {
      console.error(
        'extract() not available. Only .md files are supported in fallback mode.'
      );
      process.exit(1);
    }
    text = fs.readFileSync(absPath, 'utf-8');
  }

  const client = createLlmClientFromEnv();
  const jsonSchema = getExtractionJsonSchema();
  const processingDate = new Date().toISOString().slice(0, 10);

  const messages = buildExtractionMessages({
    text,
    links,
    jsonSchema,
    processingDate,
    previousErrors: []
  });

  console.log(`File: ${path.basename(absPath)}`);
  console.log(`Model: ${process.env.LLM_MODEL}`);
  console.log(`Prompt version: ${PROMPT_VERSION}`);
  console.log(`Processing date: ${processingDate}`);
  console.log('---');

  const { content, modelVersion } = await client.chatJson(messages);

  // Strip fences if present
  let raw = content.trim();
  if (raw.startsWith('```')) {
    const nl = raw.indexOf('\n');
    if (nl !== -1) raw = raw.slice(nl + 1);
  }
  if (raw.endsWith('```')) {
    raw = raw.slice(0, raw.lastIndexOf('```'));
  }
  raw = raw.trim();

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error('FAILED: Response is not valid JSON');
    console.error(e.message);
    process.exit(1);
  }

  const result = validateExtraction(parsed);

  if (result.success) {
    console.log('✓ Validation PASSED');
  } else {
    console.log('✗ Validation FAILED');
    result.errors.forEach((e) => console.log(`  ${e.path}: ${e.message}`));
  }

  const data = result.success ? result.data : parsed;

  // Section counts
  const sections = [
    'work_experience',
    'education',
    'skills',
    'languages',
    'links',
    'certifications',
    'projects',
    'awards',
    'publications',
    'volunteering'
  ];
  console.log('\nSection counts:');
  sections.forEach((s) => {
    const arr = data[s];
    console.log(`  ${s}: ${Array.isArray(arr) ? arr.length : 'N/A'}`);
  });

  // Phone check
  const phone = data.candidate && data.candidate.phone;
  console.log(
    `\ncandidate.phone.value === null: ${phone ? phone.value === null : 'N/A'}`
  );

  // Work experience dates
  if (data.work_experience && data.work_experience.length > 0) {
    console.log('\nWork experience dates:');
    data.work_experience.forEach((w, i) => {
      console.log(
        `  [${i}] start_date: ${w.start_date?.value ?? 'null'}, ` +
          `end_date: ${w.end_date?.value ?? 'null'}, ` +
          `is_current: ${w.is_current?.value ?? 'null'}, ` +
          `duration_months: ${w.duration_months?.value ?? 'null'}`
      );
    });
  }

  // Links
  if (data.links && data.links.length > 0) {
    console.log('\nLinks:');
    data.links.forEach((l, i) => {
      console.log(
        `  [${i}] url: ${l.url?.value ?? 'null'}, link_type: ${l.link_type?.value ?? 'null'}`
      );
    });
  }

  // Check (a): no excluded personal fields
  const excludedKeys = [
    'date_of_birth',
    'nationality',
    'gender',
    'religion',
    'marital_status',
    'photo'
  ];
  function findExcludedKeys(obj, path = '') {
    const found = [];
    if (obj && typeof obj === 'object') {
      for (const [key, val] of Object.entries(obj)) {
        const fullPath = path ? `${path}.${key}` : key;
        if (excludedKeys.includes(key)) found.push(fullPath);
        if (typeof val === 'object' && val !== null) {
          found.push(...findExcludedKeys(val, fullPath));
        }
      }
    }
    return found;
  }
  const foundExcluded = findExcludedKeys(data);
  console.log(
    `\nCheck (a) no excluded personal fields: ${foundExcluded.length === 0 ? '✓ PASS' : '✗ FAIL ' + foundExcluded.join(', ')}`
  );

  // Check (b): evidence found in text
  const collapsedText = collapseWhitespace(text);
  let evidenceTotal = 0;
  let evidenceFound = 0;

  function checkEvidence(obj) {
    if (obj && typeof obj === 'object') {
      if ('evidence' in obj && 'value' in obj && 'confidence' in obj) {
        // It's a value wrapper
        if (obj.evidence !== null && typeof obj.evidence === 'string') {
          evidenceTotal++;
          const collapsedEvidence = collapseWhitespace(obj.evidence);
          if (collapsedText.includes(collapsedEvidence)) {
            evidenceFound++;
          }
        }
        return;
      }
      for (const val of Object.values(obj)) {
        if (typeof val === 'object' && val !== null) {
          checkEvidence(val);
        }
      }
    }
  }
  checkEvidence(data);
  console.log(
    `Check (b) evidence found in text: ${evidenceFound}/${evidenceTotal}`
  );

  // Check (c): every non-null duration_months has non-null evidence
  if (data.work_experience) {
    let durationCheck = true;
    data.work_experience.forEach((w, i) => {
      if (
        w.duration_months &&
        w.duration_months.value !== null &&
        w.duration_months.evidence === null
      ) {
        durationCheck = false;
        console.log(
          `  ✗ work_experience[${i}].duration_months has value but no evidence`
        );
      }
    });
    console.log(
      `Check (c) duration_months evidence: ${durationCheck ? '✓ PASS' : '✗ FAIL'}`
    );
  }

  // Save full JSON
  const outputDir = path.resolve(__dirname, '../../storage/smoke');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, path.basename(absPath) + '.json');
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`\nFull extraction saved to: ${outputPath}`);
  console.log(`Model version: ${modelVersion}`);
}

main().catch((err) => {
  console.error('Smoke test failed:', err.message);
  process.exit(1);
});
