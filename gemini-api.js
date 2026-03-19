// gemini-api.js - Client-side Gemini API via server proxy

let _proxyAvailable = null;

// ─── 동시 요청 제한 (최대 2개) ───────────────────────────────────────────────
const MAX_CONCURRENT = 2;
let _activeCount = 0;
const _waitQueue = [];

function _acquireSemaphore() {
  return new Promise(resolve => {
    if (_activeCount < MAX_CONCURRENT) {
      _activeCount++;
      resolve();
    } else {
      _waitQueue.push(resolve);
    }
  });
}

function _releaseSemaphore() {
  if (_waitQueue.length > 0) {
    const next = _waitQueue.shift();
    next(); // 대기 중인 요청 실행
  } else {
    _activeCount--;
  }
}

// ─── 429 지수 백오프 재시도 ──────────────────────────────────────────────────
const MAX_RETRIES = 3;

function _sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 지터(jitter) 포함 대기 시간 계산: baseMs * 2^attempt + 랜덤 0~1000ms
function _backoffDelay(attempt, retryAfterSec) {
  if (retryAfterSec > 0) return retryAfterSec * 1000;
  const base = 5000 * Math.pow(2, attempt); // 5s, 10s, 20s
  const jitter = Math.random() * 1000;
  return base + jitter;
}

/**
 * Check if the server proxy is available (called once at app load)
 */
export async function checkProxyAvailable() {
  try {
    const res = await fetch('/api/gemini', { method: 'OPTIONS' });
    _proxyAvailable = res.status === 204 || res.ok;
  } catch {
    _proxyAvailable = false;
  }
  return _proxyAvailable;
}

/**
 * Returns whether the proxy is available (cached result)
 */
export function isProxyAvailable() {
  return _proxyAvailable === true;
}

/**
 * Call Gemini API via Vertex AI proxy
 * @param {string} model - Model name (e.g. 'gemini-2.5-flash')
 * @param {object} body - Request body (contents, generationConfig, etc.)
 * @returns {Promise<object>} - Parsed JSON response
 */
function prepareBody(body) {
  if (body.contents) {
    return {
      ...body,
      contents: body.contents.map(c => c.role ? c : { ...c, role: 'user' }),
    };
  }
  return body;
}

export async function callGemini(model, body) {
  body = prepareBody(body);

  await _acquireSemaphore();
  try {
    const url = `/api/gemini?model=${encodeURIComponent(model)}`;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      // 429: Too Many Requests — 지수 백오프 후 재시도
      if (res.status === 429 && attempt < MAX_RETRIES) {
        const retryAfter = parseFloat(res.headers.get('Retry-After')) || 0;
        console.warn(`[gemini-api] 429 rate limit, retry ${attempt + 1}/${MAX_RETRIES} after ${retryAfter || 'backoff'}s`);
        await _sleep(_backoffDelay(attempt, retryAfter));
        continue;
      }

      if (!res.ok) {
        const errText = await res.text();
        const err = new Error(`Proxy API error (${res.status}): ${errText.slice(0, 200)}`);
        err.status = res.status;
        throw err;
      }
      return res.json();
    }

    const err = new Error('Proxy API error (429): Rate limit exceeded after retries');
    err.status = 429;
    throw err;
  } finally {
    _releaseSemaphore();
  }
}

/**
 * Call Gemini API with streaming (SSE) — yields text chunks as they arrive.
 * @param {string} model
 * @param {object} body
 * @param {function} onChunk - Called with (textChunk, fullTextSoFar)
 * @param {object} [options]
 * @param {AbortSignal} [options.signal] - AbortSignal for cancellation
 * @returns {Promise<{text: string, parts: Array}>} - Full response when complete
 */
export async function callGeminiStream(model, body, onChunk, options = {}) {
  body = prepareBody(body);

  await _acquireSemaphore();
  try {
    const url = `/api/gemini?model=${encodeURIComponent(model)}&stream=true`;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: options.signal,
      });

      // 429: Too Many Requests — 지수 백오프 후 재시도
      if (res.status === 429 && attempt < MAX_RETRIES) {
        const retryAfter = parseFloat(res.headers.get('Retry-After')) || 0;
        console.warn(`[gemini-api] 429 rate limit (stream), retry ${attempt + 1}/${MAX_RETRIES} after ${retryAfter || 'backoff'}s`);
        await _sleep(_backoffDelay(attempt, retryAfter));
        continue;
      }

      if (!res.ok) {
        const errText = await res.text();
        const err = new Error(`Proxy API error (${res.status}): ${errText.slice(0, 200)}`);
        err.status = res.status;
        throw err;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let allParts = [];
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;

          try {
            const data = JSON.parse(jsonStr);
            const parts = data.candidates?.[0]?.content?.parts || [];
            for (const part of parts) {
              allParts.push(part);
              if (part.text) {
                fullText += part.text;
                onChunk(part.text, fullText);
              }
            }
          } catch {
            // skip unparseable chunks
          }
        }
      }

      return { text: fullText, parts: allParts };
    }

    const err = new Error('Proxy API error (429): Rate limit exceeded after retries');
    err.status = 429;
    throw err;
  } finally {
    _releaseSemaphore();
  }
}
