// gemini-api.js - Client-side API routing (AI Studio direct vs Vertex AI proxy)

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

let _proxyAvailable = null;

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
 * Call Gemini API - routes to AI Studio (direct) or Vertex AI (proxy)
 * @param {string} model - Model name (e.g. 'gemini-2.5-flash')
 * @param {object} body - Request body (contents, generationConfig, etc.)
 * @param {string} [apiKey] - AI Studio API key (if provided, uses direct call)
 * @returns {Promise<object>} - Parsed JSON response
 */
export async function callGemini(model, body, apiKey) {
  if (apiKey) {
    // Direct AI Studio call
    const url = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API error (${res.status}): ${errText.slice(0, 200)}`);
    }
    return res.json();
  }

  // Proxy call via Vertex AI
  const url = `/api/gemini?model=${encodeURIComponent(model)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Proxy API error (${res.status}): ${errText.slice(0, 200)}`);
  }
  return res.json();
}
