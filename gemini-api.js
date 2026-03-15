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

  const url = `/api/gemini?model=${encodeURIComponent(model)}&stream=true`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options.signal,
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Proxy API error (${res.status}): ${errText.slice(0, 200)}`);
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
