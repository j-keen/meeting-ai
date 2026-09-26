// tests/gemini-fallback.test.js - Proxy-first / personal-key-fallback behavior of gemini-api.js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../event-bus.js', () => ({
  emit: vi.fn(),
}));

vi.mock('../usage-limiter.js', () => ({
  canUse: vi.fn(() => true),
  incrementUsage: vi.fn(),
  isModelAllowed: vi.fn(() => true),
  getUsage: vi.fn(() => ({ used: 0, limit: 10 })),
  getWarningLevel: vi.fn(() => 'ok'),
}));

// ===== Response helpers =====

function jsonResponse(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => headers[k] ?? null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function sseResponse(status, frames) {
  const encoder = new TextEncoder();
  let i = 0;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => '',
    body: {
      getReader() {
        return {
          async read() {
            if (i >= frames.length) return { done: true, value: undefined };
            const chunk = encoder.encode(frames[i]);
            i++;
            return { done: false, value: chunk };
          },
        };
      },
    },
  };
}

function sseFramesFor(texts) {
  return texts.map(t => `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] } }] })}\n\n`);
}

// ===== Module reload helper (module-level singletons need a fresh instance per test) =====

// The app fixes the provider to OpenAI; these tests cover the dormant Gemini proxy/key path.
async function loadGeminiApi() {
  vi.resetModules();
  const api = await import('../gemini-api.js');
  api.setProvider('gemini');
  return api;
}

describe('gemini-api.js — proxy-first, personal-key-fallback', () => {
  let fetchMock;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('(a) proxy 429 + key → falls over to a direct request containing generativelanguage and key=', async () => {
    const api = await loadGeminiApi();
    fetchMock.mockResolvedValueOnce(jsonResponse(204, {})); // OPTIONS proxy check
    await api.checkProxyAvailable();
    expect(api.isProxyAvailable()).toBe(true);

    api.setUserApiKeyProvider(() => 'my-secret-key');

    fetchMock.mockClear();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(429, { error: 'rate limited' }))
      .mockResolvedValueOnce(jsonResponse(200, { candidates: [{ content: { parts: [{ text: 'ok' }] } }] }));

    const result = await api.callGemini('gemini-3.5-flash', { contents: [{ parts: [{ text: 'hi' }] }] });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondUrl = fetchMock.mock.calls[1][0];
    expect(secondUrl).toContain('generativelanguage');
    expect(secondUrl).toContain('key=my-secret-key');
    expect(result.candidates[0].content.parts[0].text).toBe('ok');
  });

  it('(b) proxy 429 + no key → throws with status 429 after exhausting retries', async () => {
    vi.useFakeTimers();
    const api = await loadGeminiApi();
    fetchMock.mockResolvedValueOnce(jsonResponse(204, {}));
    await api.checkProxyAvailable();
    expect(api.isProxyAvailable()).toBe(true);
    // no setUserApiKeyProvider call — no key registered

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(jsonResponse(429, { error: 'rate limited' }));

    const promise = api.callGemini('gemini-3.5-flash', { contents: [{ parts: [{ text: 'hi' }] }] });
    const assertion = expect(promise).rejects.toMatchObject({ status: 429 });
    await vi.runAllTimersAsync();
    await assertion;

    // Only the 'proxy' target exists (no key), so every attempt hits /api/gemini.
    fetchMock.mock.calls.forEach(call => {
      expect(call[0]).toContain('/api/gemini');
    });
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    vi.useRealTimers();
  });

  it('(c) proxy unavailable + key → makes a single direct request', async () => {
    const api = await loadGeminiApi();
    fetchMock.mockRejectedValueOnce(new Error('network down')); // OPTIONS fails
    await api.checkProxyAvailable();
    expect(api.isProxyAvailable()).toBe(false);

    api.setUserApiKeyProvider(() => 'direct-key');

    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { candidates: [{ content: { parts: [{ text: 'direct-ok' }] } }] }));

    const result = await api.callGemini('gemini-3.5-flash', { contents: [{ parts: [{ text: 'hi' }] }] });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('generativelanguage');
    expect(result.candidates[0].content.parts[0].text).toBe('direct-ok');
  });

  it('(d) streaming yields identical chunk sequences from proxy and direct for the same data: frames', async () => {
    const frames = sseFramesFor(['Hel', 'lo', ' world']);

    // --- proxy path ---
    const apiProxy = await loadGeminiApi();
    fetchMock.mockResolvedValueOnce(jsonResponse(204, {}));
    await apiProxy.checkProxyAvailable();
    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce(sseResponse(200, frames));

    const proxyChunks = [];
    const proxyResult = await apiProxy.callGeminiStream(
      'gemini-3.5-flash',
      { contents: [{ parts: [{ text: 'hi' }] }] },
      (chunk) => proxyChunks.push(chunk)
    );

    // --- direct path (proxy unavailable, key set) ---
    const apiDirect = await loadGeminiApi();
    fetchMock.mockRejectedValueOnce(new Error('down'));
    await apiDirect.checkProxyAvailable();
    apiDirect.setUserApiKeyProvider(() => 'stream-key');
    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce(sseResponse(200, frames));

    const directChunks = [];
    const directResult = await apiDirect.callGeminiStream(
      'gemini-3.5-flash',
      { contents: [{ parts: [{ text: 'hi' }] }] },
      (chunk) => directChunks.push(chunk)
    );

    expect(directChunks).toEqual(proxyChunks);
    expect(directResult.text).toBe(proxyResult.text);
    expect(directResult.parts).toEqual(proxyResult.parts);
  });

  it('(e) mode "proxy" never calls direct even when a key is set and requests fail', async () => {
    const api = await loadGeminiApi();
    fetchMock.mockResolvedValueOnce(jsonResponse(204, {}));
    await api.checkProxyAvailable();
    api.setUserApiKeyProvider(() => 'unused-key');
    api.setKeyMode('proxy');

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(jsonResponse(500, { error: 'boom' }));

    await expect(
      api.callGemini('gemini-3.5-flash', { contents: [{ parts: [{ text: 'hi' }] }] })
    ).rejects.toMatchObject({ status: 500 });

    fetchMock.mock.calls.forEach(call => {
      expect(call[0]).toContain('/api/gemini');
      expect(call[0]).not.toContain('generativelanguage');
    });
  });
});
