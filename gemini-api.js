// gemini-api.js - Client-side Gemini API via Vertex AI proxy

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
 * Call Gemini API via Vertex AI proxy
 * @param {string} model - Model name (e.g. 'gemini-2.5-flash')
 * @param {object} body - Request body (contents, generationConfig, etc.)
 * @returns {Promise<object>} - Parsed JSON response
 */
export async function callGemini(model, body) {
  // Vertex AI requires role in contents — ensure it's present
  if (body.contents) {
    body = {
      ...body,
      contents: body.contents.map(c => c.role ? c : { ...c, role: 'user' }),
    };
  }

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
