const { TemporaryError } = require('../../../shared/src/errors');
const {
  validateExtraction,
  getExtractionJsonSchema
} = require('../../../shared/src/extraction/schema');
const { createLlmClientFromEnv } = require('../../../shared/src/llm/client');
const {
  PROMPT_VERSION,
  buildExtractionMessages
} = require('../llm/extraction-prompt');
const { saveExtractionMetadata } = require('../jobs-repo');

// In-memory map for retry feedback (A1).
// Key: jobId, Value: array of { path, message } from the last failed attempt.
const previousErrorsByJob = new Map();

/**
 * Strips optional markdown fences from LLM output.
 * Removes one leading ```json or ``` line and one trailing ``` line.
 */
function stripFences(raw) {
  let s = raw.trim();
  if (s.startsWith('```')) {
    const firstNewline = s.indexOf('\n');
    if (firstNewline !== -1) {
      s = s.slice(firstNewline + 1);
    }
  }
  if (s.endsWith('```')) {
    s = s.slice(0, s.lastIndexOf('```'));
  }
  return s.trim();
}

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Factory: creates the call-LLM step.
 *
 * @param {object} options
 * @param {object} options.db         - Database pool.
 * @param {function} [options.getClient] - Returns an LLM client (for tests).
 * @param {function} [options.now]       - Returns the current Date (for tests).
 */
function createCallLlmStep({
  db,
  getClient = createLlmClientFromEnv,
  now = () => new Date()
}) {
  const jsonSchema = getExtractionJsonSchema();

  return async function callLlm(ctx) {
    const client = getClient();
    const processingDate = formatDate(now());
    const previousErrors = previousErrorsByJob.get(ctx.jobId) || [];

    const messages = buildExtractionMessages({
      text: ctx.text,
      links: ctx.links,
      jsonSchema,
      processingDate,
      previousErrors
    });

    const { content, modelVersion } = await client.chatJson(messages);

    // Parse JSON (strip fences if present)
    let parsed;
    try {
      if (typeof content !== 'string') {
        throw new Error('Response has no content');
      }
      parsed = JSON.parse(stripFences(content));
    } catch {
      previousErrorsByJob.set(ctx.jobId, [
        { path: '(root)', message: 'Response is not valid JSON' }
      ]);
      throw new TemporaryError('LLM output was not valid JSON');
    }

    // Validate against the EN-03 schema
    const result = validateExtraction(parsed);
    if (!result.success) {
      previousErrorsByJob.set(ctx.jobId, result.errors);
      throw new TemporaryError(
        'LLM output did not match the extraction schema'
      );
    }

    // Success: clean up and set context
    previousErrorsByJob.delete(ctx.jobId);
    ctx.extraction = result.data;

    const meta = {
      extractedAt: now(),
      modelName: client.model || process.env.LLM_MODEL || 'unknown',
      modelVersion,
      promptVersion: PROMPT_VERSION,
      documentLanguage: result.data.meta.document_language,
      extractionWarnings: result.data.meta.extraction_warnings
    };

    await saveExtractionMetadata(db, ctx.jobId, meta);

    return ctx;
  };
}

// Expose for testing
createCallLlmStep._previousErrorsByJob = previousErrorsByJob;

module.exports = { createCallLlmStep };
