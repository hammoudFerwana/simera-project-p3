const { TemporaryError, PermanentError } = require('../errors');

/**
 * Creates a generic OpenAI-compatible Chat Completions client.
 *
 * @param {object} options
 * @param {string} options.baseUrl   - Base URL (trailing slash is stripped).
 * @param {string} options.apiKey    - Bearer token.
 * @param {string} options.model     - Model name sent in every request.
 * @param {number} [options.timeoutMs=90000] - Request timeout in ms.
 * @param {function} [options.fetchImpl=fetch] - Fetch implementation (for tests).
 */
function createLlmClient({
  baseUrl,
  apiKey,
  model,
  timeoutMs = 90000,
  fetchImpl = fetch
}) {
  const url = baseUrl.replace(/\/+$/, '') + '/chat/completions';

  /**
   * Sends a chat completion request with json_object response format.
   * Returns { content, modelVersion }.
   */
  async function chatJson(messages) {
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages
        }),
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (err) {
      // Network error or timeout
      const causeCode =
        err.cause && err.cause.code ? ` (${err.cause.code})` : '';
      throw new TemporaryError(
        `LLM request failed: ${err.name || 'NetworkError'}${causeCode}`
      );
    }

    if (!response.ok) {
      const status = response.status;
      // 408, 429, 5xx are temporary; everything else is permanent
      if (status === 408 || status === 429 || status >= 500) {
        throw new TemporaryError(`LLM returned HTTP ${status}`);
      }
      throw new PermanentError(`LLM returned HTTP ${status}`);
    }

    const data = await response.json();
    const content =
      data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content
        : null;
    const modelVersion = data.model || model;

    return { content, modelVersion };
  }

  return { chatJson, model };
}

/**
 * Creates an LLM client from the environment variables.
 * Reads env vars at call time so tests and the API never need LLM vars
 * at module load.
 */
function createLlmClientFromEnv() {
  return createLlmClient({
    baseUrl: process.env.LLM_BASE_URL,
    apiKey: process.env.LLM_API_KEY,
    model: process.env.LLM_MODEL,
    timeoutMs: process.env.LLM_TIMEOUT_MS
      ? parseInt(process.env.LLM_TIMEOUT_MS, 10)
      : 90000
  });
}

module.exports = { createLlmClient, createLlmClientFromEnv };
