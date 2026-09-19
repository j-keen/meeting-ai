// gemini-api.js - Client-side Gemini API via server proxy, with personal-key fallback

import { emit } from './event-bus.js';
import { canUse, incrementUsage, isModelAllowed, getUsage, getWarningLevel } from './usage-limiter.js';

// ─── UsageLimitError ─────────────────────────────────────────────────────────
export class UsageLimitError extends Error {
  constructor(category, usage) {
    super(`Daily limit reached for ${category}`);
    this.name = 'UsageLimitError';
    this.category = category;
    this.usage = usage;
  }
}

let _proxyAvailable = null;

// ─── 사용자 개인 API 키 ──────────────────────────────────────────────────────
let _userApiKeyProvider = () => '';
let _keyMode = 'fallback'; // 'proxy' | 'fallback' | 'direct'
let _fallbackNotified = false; // emit gemini:fallback once per page load

/**
 * Register a function that returns the user's personal Gemini API key (or '').
 */
export function setUserApiKeyProvider(fn) {
  _userApiKeyProvider = typeof fn === 'function' ? fn : () => '';
}

export function hasUserKey() {
  return !!(_userApiKeyProvider() || '').trim();
}

/**
 * Returns whether AI can be used at all — via proxy or a personal key.
 */
export function isAiAvailable() {
  return isProxyAvailable() || hasUserKey();
}

export function setKeyMode(mode) {
  _keyMode = ['proxy', 'fallback', 'direct'].includes(mode) ? mode : 'fallback';
}

export function getKeyMode() {
  return _keyMode;
}

/**
 * Tests a personal API key with a minimal direct request.
 * @returns {Promise<boolean>}
 */
export async function testUserApiKey(key) {
  if (!key) return false;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
          generationConfig: { maxOutputTokens: 1 },
        }),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

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

function prepareBody(body) {
  if (body.contents) {
    return {
      ...body,
      contents: body.contents.map(c => c.role ? c : { ...c, role: 'user' }),
    };
  }
  return body;
}

// ─── Target resolution ───────────────────────────────────────────────────────
// mode 'proxy'          → always ['proxy'] (test: never calls direct even with a key)
// mode 'direct' + key   → ['direct']
// proxy unavailable     → key ? ['direct'] : ['proxy'] (no key: let the error surface normally)
// otherwise (fallback)  → key ? ['proxy', 'direct'] : ['proxy']
function _resolveTargets() {
  const key = hasUserKey();
  if (_keyMode === 'proxy') return ['proxy'];
  if (_keyMode === 'direct' && key) return ['direct'];
  if (!isProxyAvailable()) return key ? ['direct'] : ['proxy'];
  return key ? ['proxy', 'direct'] : ['proxy'];
}

function _isFallbackableError(err) {
  if (err?.name === 'AbortError') return false;
  if (!err.status) return true; // network error — fetch threw before a Response existed
  return [404, 429, 500, 501, 502, 503].includes(err.status);
}

function _buildUrl(target, model, stream) {
  if (target === 'proxy') {
    return `/api/gemini?model=${encodeURIComponent(model)}${stream ? '&stream=true' : ''}`;
  }
  const key = _userApiKeyProvider() || '';
  const method = stream ? 'streamGenerateContent' : 'generateContent';
  const query = stream ? `alt=sse&key=${encodeURIComponent(key)}` : `key=${encodeURIComponent(key)}`;
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:${method}?${query}`;
}

// SSE frames are `data: {...}` either way (proxy passthrough or Gemini's alt=sse), so both
// targets share this parser.
async function _parseSSE(res, onChunk) {
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

/**
 * Issues one request against a single target. 429 exponential-backoff retry only applies
 * when this is the last (or only) target to try — if another target can take over, a 429
 * falls over to it immediately instead of burning through the backoff first.
 * @param {'proxy'|'direct'} target
 * @param {string} model
 * @param {object} body
 * @param {object} [opts]
 * @param {boolean} [opts.stream]
 * @param {function} [opts.onChunk]
 * @param {AbortSignal} [opts.signal]
 * @param {boolean} [opts.retryOn429]
 */
async function _request(target, model, body, { stream = false, onChunk, signal, retryOn429 = true } = {}) {
  const maxRetries = retryOn429 ? MAX_RETRIES : 0;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const url = _buildUrl(target, model, stream);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });

    // 429: Too Many Requests — 지수 백오프 후 재시도
    if (res.status === 429 && attempt < maxRetries) {
      const retryAfter = parseFloat(res.headers.get('Retry-After')) || 0;
      console.warn(`[gemini-api] 429 rate limit${stream ? ' (stream)' : ''}, retry ${attempt + 1}/${maxRetries} after ${retryAfter || 'backoff'}s`);
      await _sleep(_backoffDelay(attempt, retryAfter));
      continue;
    }

    if (!res.ok) {
      const errText = await res.text();
      const label = target === 'proxy' ? 'Proxy' : 'Gemini';
      const err = new Error(`${label} API error (${res.status}): ${errText.slice(0, 200)}`);
      err.status = res.status;
      throw err;
    }

    return stream ? _parseSSE(res, onChunk) : res.json();
  }

  const err = new Error('Proxy API error (429): Rate limit exceeded after retries');
  err.status = 429;
  throw err;
}

/**
 * Resolves targets, acquires the concurrency semaphore once, and tries each target in order,
 * falling back proxy → direct on network errors or 404/429/500/501/502/503.
 */
async function _dispatch(model, body, opts = {}) {
  body = prepareBody(body);
  const targets = _resolveTargets();

  await _acquireSemaphore();
  try {
    let lastErr;
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      const isLast = i === targets.length - 1;
      try {
        const result = await _request(target, model, body, { ...opts, retryOn429: isLast });
        if (target === 'direct' && i > 0 && !_fallbackNotified) {
          _fallbackNotified = true;
          emit('gemini:fallback', { reason: lastErr?.status ? String(lastErr.status) : 'network_error' });
        }
        return { result, target };
      } catch (err) {
        lastErr = err;
        const hasNext = i < targets.length - 1;
        if (hasNext && _isFallbackableError(err)) continue;
        throw err;
      }
    }
    throw lastErr;
  } finally {
    _releaseSemaphore();
  }
}

/**
 * Call Gemini API — via proxy, personal key, or both with fallback depending on key mode.
 * @param {string} model - Model name (e.g. 'gemini-2.5-flash')
 * @param {object} body - Request body (contents, generationConfig, etc.)
 * @returns {Promise<object>} - Parsed JSON response
 */
export async function callGemini(model, body) {
  const { result } = await _dispatch(model, body, { stream: false });
  return result;
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
  const { result } = await _dispatch(model, body, { stream: true, onChunk, signal: options.signal });
  return result;
}

// ─── 사용량 제한 게이트웨이 래퍼 ──────────────────────────────────────────────

/**
 * 사용량 제한이 적용된 Gemini API 호출
 * @param {string} model - 모델명
 * @param {object} body - 요청 바디
 * @param {object} options
 * @param {string} options.category - 사용량 카테고리 (analysis, chat, minutes 등)
 * @param {function} [options.onStream] - 스트리밍 콜백 (제공 시 callGeminiStream 사용)
 * @param {AbortSignal} [options.signal] - 취소 시그널
 * @returns {Promise<object>} API 응답
 * @throws {UsageLimitError} 한도 초과 시
 */
export async function callGeminiGuarded(model, body, { category, onStream, signal } = {}) {
  // A deterministic direct-only call spends the user's own quota, not the shared one —
  // skip the model downgrade / category limit bookkeeping entirely.
  const directOnly = _resolveTargets().length === 1 && _resolveTargets()[0] === 'direct';

  if (!directOnly) {
    // 1. Pro 모델 체크 → 불가 시 Flash Lite로 다운그레이드
    if (!isModelAllowed(model)) {
      const downgraded = 'gemini-2.5-flash-lite';
      emit('usage:model_downgraded', { original: model, fallback: downgraded });
      model = downgraded;
    }

    // 2. 카테고리 한도 체크
    if (category && !canUse(category)) {
      const usage = getUsage(category);
      emit('usage:exhausted', { category, usage });
      throw new UsageLimitError(category, usage);
    }

    // 3. 접근 경고 (80% 이상)
    if (category) {
      const level = getWarningLevel(category);
      if (level === 'approaching') {
        emit('usage:warning', { category, usage: getUsage(category) });
      }
    }
  }

  // 4. 실제 API 호출
  const { result, target } = onStream
    ? await _dispatch(model, body, { stream: true, onChunk: onStream, signal })
    : await _dispatch(model, body, { stream: false });

  // 5. 성공 시 사용량 증가 — proxy(공유 쿼터)를 실제로 사용했을 때만
  if (!directOnly && target === 'proxy') {
    if (category) incrementUsage(category);
    if (model === 'gemini-2.5-pro') incrementUsage('pro_model');
  }

  return result;
}
