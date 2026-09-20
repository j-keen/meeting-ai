// @ts-check
// openai-adapter.js - Translate the app's Gemini-shaped requests/responses to and from the
// OpenAI Chat Completions API, so every caller keeps speaking "Gemini" regardless of provider.

function partsToText(parts) {
  return (parts || []).map(p => (typeof p === 'string' ? p : p?.text || '')).filter(Boolean).join('\n');
}

function mentionsJson(messages) {
  return messages.some(m => /json/i.test(typeof m.content === 'string' ? m.content : JSON.stringify(m.content)));
}

/**
 * @param {string} model                 OpenAI model id
 * @param {any} body                     Gemini request body ({ systemInstruction, contents, generationConfig })
 * @param {{ stream?: boolean, tier?: 'light'|'standard'|'heavy' }} [opts]
 */
export function toOpenAIRequest(model, body, opts = {}) {
  const messages = [];
  const sys = body?.systemInstruction;
  const sysText = typeof sys === 'string' ? sys : partsToText(sys?.parts);
  if (sysText) messages.push({ role: 'system', content: sysText });

  for (const c of body?.contents || []) {
    const role = c.role === 'model' ? 'assistant' : 'user';
    const parts = c.parts || [];
    if (role === 'user' && parts.some(p => p?.inlineData)) {
      messages.push({
        role,
        content: parts.map(p => p?.inlineData
          ? { type: 'image_url', image_url: { url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` } }
          : { type: 'text', text: p?.text || '' }),
      });
    } else {
      messages.push({ role, content: partsToText(parts) });
    }
  }

  const gc = body?.generationConfig || {};
  const req = { model, messages, stream: !!opts.stream };
  if (gc.maxOutputTokens) req.max_completion_tokens = gc.maxOutputTokens;
  if (gc.responseMimeType === 'application/json') {
    req.response_format = { type: 'json_object' };
    if (!mentionsJson(messages)) messages.push({ role: 'system', content: 'Respond with valid JSON only.' });
  }
  // GPT-5 family: temperature/max_tokens are rejected; reasoning effort is the cost/latency knob.
  req.reasoning_effort = opts.tier === 'heavy' ? 'medium' : 'low';
  return req;
}

function mapFinish(reason) {
  if (reason === 'length') return 'MAX_TOKENS';
  if (reason === 'content_filter') return 'SAFETY';
  return 'STOP';
}

/** Chat Completions JSON → Gemini generateContent shape. */
export function fromOpenAIResponse(json) {
  const choice = json?.choices?.[0];
  const text = choice?.message?.content ?? '';
  const usage = json?.usage || {};
  return {
    candidates: [{
      content: { parts: [{ text }], role: 'model' },
      finishReason: mapFinish(choice?.finish_reason),
      index: 0,
    }],
    usageMetadata: {
      promptTokenCount: usage.prompt_tokens || 0,
      candidatesTokenCount: usage.completion_tokens || 0,
      totalTokenCount: usage.total_tokens || 0,
    },
    modelVersion: json?.model,
  };
}

/**
 * Consume an OpenAI SSE stream, calling onChunk(delta, fullText) per content delta.
 * Returns the same shape as the Gemini SSE parser: { text, parts }.
 * @param {Response} res
 * @param {(chunk: string, full: string) => void} [onChunk]
 */
export async function parseOpenAISSE(res, onChunk) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          onChunk?.(delta, fullText);
        }
      } catch { /* skip malformed frame */ }
    }
  }
  return { text: fullText, parts: [{ text: fullText }] };
}
