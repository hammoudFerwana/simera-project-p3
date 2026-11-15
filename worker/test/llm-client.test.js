const { createLlmClient } = require('../../shared/src/llm/client');
const { TemporaryError, PermanentError } = require('../../shared/src/errors');

function mockFetch(status, body) {
  return async (_url, _options) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  });
}

function successBody(content, model) {
  return {
    model: model || 'test-model-v1',
    choices: [{ message: { content } }]
  };
}

describe('createLlmClient', () => {
  it('sends model, temperature 0, response_format json_object and Bearer header', async () => {
    let capturedUrl, capturedOptions;
    const fakeFetch = async (url, options) => {
      capturedUrl = url;
      capturedOptions = options;
      return {
        ok: true,
        status: 200,
        json: async () => successBody('{"ok":true}')
      };
    };

    const client = createLlmClient({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'test-key-123',
      model: 'test-model',
      timeoutMs: 5000,
      fetchImpl: fakeFetch
    });

    await client.chatJson([{ role: 'user', content: 'hello' }]);

    expect(capturedUrl).toBe('https://api.example.com/v1/chat/completions');
    const sentBody = JSON.parse(capturedOptions.body);
    expect(sentBody.model).toBe('test-model');
    expect(sentBody.temperature).toBe(0);
    expect(sentBody.response_format).toEqual({ type: 'json_object' });
    expect(capturedOptions.headers.Authorization).toBe('Bearer test-key-123');
    expect(capturedOptions.headers['Content-Type']).toBe('application/json');
  });

  it('strips trailing slash from baseUrl', async () => {
    let capturedUrl;
    const fakeFetch = async (url) => {
      capturedUrl = url;
      return {
        ok: true,
        status: 200,
        json: async () => successBody('{}')
      };
    };

    const client = createLlmClient({
      baseUrl: 'https://api.example.com/v1/',
      apiKey: 'k',
      model: 'm',
      fetchImpl: fakeFetch
    });

    await client.chatJson([]);
    expect(capturedUrl).toBe('https://api.example.com/v1/chat/completions');
  });

  it('returns content and modelVersion from the response', async () => {
    const client = createLlmClient({
      baseUrl: 'https://api.example.com',
      apiKey: 'k',
      model: 'default-model',
      fetchImpl: mockFetch(200, successBody('{"data":1}', 'actual-v2'))
    });

    const result = await client.chatJson([]);
    expect(result.content).toBe('{"data":1}');
    expect(result.modelVersion).toBe('actual-v2');
  });

  it('falls back to the configured model when response.model is missing', async () => {
    const client = createLlmClient({
      baseUrl: 'https://api.example.com',
      apiKey: 'k',
      model: 'my-model',
      fetchImpl: mockFetch(200, {
        choices: [{ message: { content: '{}' } }]
      })
    });

    const result = await client.chatJson([]);
    expect(result.modelVersion).toBe('my-model');
  });

  it('throws TemporaryError on 429', async () => {
    const client = createLlmClient({
      baseUrl: 'https://api.example.com',
      apiKey: 'k',
      model: 'm',
      fetchImpl: mockFetch(429, { error: 'rate limited' })
    });

    await expect(client.chatJson([])).rejects.toThrow(TemporaryError);
  });

  it('throws TemporaryError on 503', async () => {
    const client = createLlmClient({
      baseUrl: 'https://api.example.com',
      apiKey: 'k',
      model: 'm',
      fetchImpl: mockFetch(503, { error: 'unavailable' })
    });

    await expect(client.chatJson([])).rejects.toThrow(TemporaryError);
  });

  it('throws TemporaryError on a network error', async () => {
    const client = createLlmClient({
      baseUrl: 'https://api.example.com',
      apiKey: 'k',
      model: 'm',
      fetchImpl: async () => {
        throw new TypeError('fetch failed');
      }
    });

    await expect(client.chatJson([])).rejects.toThrow(TemporaryError);
  });

  it('includes cause code in the error message when available', async () => {
    const err = new TypeError('fetch failed');
    err.cause = { code: 'ENOTFOUND' };
    const client = createLlmClient({
      baseUrl: 'https://api.example.com',
      apiKey: 'k',
      model: 'm',
      fetchImpl: async () => {
        throw err;
      }
    });

    await expect(client.chatJson([])).rejects.toThrow(
      'LLM request failed: TypeError (ENOTFOUND)'
    );
  });

  it('throws PermanentError on 401', async () => {
    const client = createLlmClient({
      baseUrl: 'https://api.example.com',
      apiKey: 'k',
      model: 'm',
      fetchImpl: mockFetch(401, { error: 'unauthorized' })
    });

    await expect(client.chatJson([])).rejects.toThrow(PermanentError);
  });

  it('does not include the response body in the error message', async () => {
    const secretBody = { error: 'secret-token-leaked-abc123' };
    const client = createLlmClient({
      baseUrl: 'https://api.example.com',
      apiKey: 'k',
      model: 'm',
      fetchImpl: mockFetch(401, secretBody)
    });

    try {
      await client.chatJson([]);
    } catch (err) {
      expect(err.message).not.toContain('secret-token-leaked-abc123');
      expect(err.message).not.toContain('secret');
    }
  });

  it('throws TemporaryError on 408', async () => {
    const client = createLlmClient({
      baseUrl: 'https://api.example.com',
      apiKey: 'k',
      model: 'm',
      fetchImpl: mockFetch(408, {})
    });

    await expect(client.chatJson([])).rejects.toThrow(TemporaryError);
  });

  it('throws TemporaryError on 500', async () => {
    const client = createLlmClient({
      baseUrl: 'https://api.example.com',
      apiKey: 'k',
      model: 'm',
      fetchImpl: mockFetch(500, {})
    });

    await expect(client.chatJson([])).rejects.toThrow(TemporaryError);
  });

  it('throws PermanentError on 400', async () => {
    const client = createLlmClient({
      baseUrl: 'https://api.example.com',
      apiKey: 'k',
      model: 'm',
      fetchImpl: mockFetch(400, {})
    });

    await expect(client.chatJson([])).rejects.toThrow(PermanentError);
  });

  it('throws PermanentError on 403', async () => {
    const client = createLlmClient({
      baseUrl: 'https://api.example.com',
      apiKey: 'k',
      model: 'm',
      fetchImpl: mockFetch(403, {})
    });

    await expect(client.chatJson([])).rejects.toThrow(PermanentError);
  });
});
