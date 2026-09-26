// @ts-check
// openai-adapter.js - Translate the app's Gemini-shaped requests/responses to and from the
// OpenAI Chat Completions API, so every caller keeps speaking "Gemini" regardless of provider.
//
// Function calling: Gemini `tools[].function_declarations` become OpenAI `tools`, a model turn's
// `functionCall` parts become `assistant.tool_calls`, a user turn's `functionResponse` parts
// become `tool` messages, and OpenAI `tool_calls` come back as `functionCall` parts.

/** Reasoning effort for the heavy tier (final minutes, generated documents). */
export const HEAVY_EFFORT = 'low';

function partsToText(parts) {
  return (parts || []).map(p => (typeof p === 'string' ? p : p?.text || '')).filter(Boolean).join('\n');
}

function mentionsJson(messages) {
  return messages.some(m => /json/i.test(typeof m.content === 'string' ? m.content : JSON.stringify(m.content)));
}

/** Gemini tools ([{ function_declarations | functionDeclarations }]) → OpenAI tools. */
export function toOpenAITools(tools) {
  const out = [];
  for (const t of tools || []) {
    for (const fd of t?.function_declarations || t?.functionDeclarations || []) {
      if (!fd?.name) continue;
      const parameters = fd.parameters && typeof fd.parameters === 'object'
        ? { ...fd.parameters, properties: fd.parameters.properties || {} }
        : { type: 'object', properties: {} };
      if (!parameters.type) parameters.type = 'object';
      out.push({ type: 'function', function: { name: fd.name, description: fd.description || '', parameters } });
    }
  }
  return out;
}

const TOOL_CHOICE = { NONE: 'none', ANY: 'required', AUTO: 'auto' };

/**
 * @param {string} model                 OpenAI model id
 * @param {any} body                     Gemini request body ({ systemInstruction, contents, generationConfig, tools?, toolConfig? })
 * @param {{ stream?: boolean, tier?: 'light'|'standard'|'heavy' }} [opts]
 */
export function toOpenAIRequest(model, body, opts = {}) {
  const messages = [];
  const sys = body?.systemInstruction;
  const sysText = typeof sys === 'string' ? sys : partsToText(sys?.parts);
  if (sysText) messages.push({ role: 'system', content: sysText });

  // Gemini function calls carry no id; OpenAI needs one to pair each tool result with its call.
  let callSeq = 0;
  const pendingIds = []; // [{ name, id }] of calls not yet answered, in order

  for (const c of body?.contents || []) {
    const role = c.role === 'model' ? 'assistant' : 'user';
    const parts = c.parts || [];
    const calls = parts.filter(p => p?.functionCall);
    const responses = parts.filter(p => p?.functionResponse);

    if (role === 'assistant' && calls.length) {
      const text = partsToText(parts.filter(p => !p?.functionCall));
      messages.push({
        role: 'assistant',
        content: text || null,
        tool_calls: calls.map(p => {
          const id = p.functionCall.id || `call_${++callSeq}`;
          pendingIds.push({ name: p.functionCall.name, id });
          return { id, type: 'function', function: { name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args || {}) } };
        }),
      });
      continue;
    }

    if (responses.length) {
      for (const p of responses) {
        const fr = p.functionResponse;
        let idx = fr.id ? pendingIds.findIndex(x => x.id === fr.id) : -1;
        if (idx === -1) idx = pendingIds.findIndex(x => x.name === fr.name);
        if (idx === -1) idx = 0;
        const id = fr.id || pendingIds[idx]?.id || `call_${++callSeq}`;
        if (pendingIds.length) pendingIds.splice(idx, 1);
        messages.push({ role: 'tool', tool_call_id: id, content: JSON.stringify(fr.response ?? {}) });
      }
      const rest = partsToText(parts.filter(p => !p?.functionResponse));
      if (rest) messages.push({ role: 'user', content: rest });
      continue;
    }

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
  /** @type {any} */
  const req = { model, messages, stream: !!opts.stream };
  if (gc.maxOutputTokens) req.max_completion_tokens = gc.maxOutputTokens;
  if (gc.responseMimeType === 'application/json') {
    req.response_format = { type: 'json_object' };
    if (!mentionsJson(messages)) messages.push({ role: 'system', content: 'Respond with valid JSON only.' });
  }
  const tools = toOpenAITools(body?.tools);
  if (tools.length) {
    req.tools = tools;
    const mode = body?.toolConfig?.functionCallingConfig?.mode;
    if (mode && TOOL_CHOICE[mode]) req.tool_choice = TOOL_CHOICE[mode];
  }
  // GPT-5 family: temperature/max_tokens are rejected; reasoning effort is the cost/latency knob.
  // 'low' on every tier, heavy included: the heavy model runs once per meeting (minutes/docs)
  // and 'medium' roughly doubles-to-triples its billed reasoning tokens for little visible gain.
  // Raise HEAVY_EFFORT to 'medium' if minutes quality ever needs it (≈ +$0.02–0.05 per meeting).
  req.reasoning_effort = opts.tier === 'heavy' ? HEAVY_EFFORT : 'low';
  // Gemini-style "no thinking" (thinkingBudget 0) for mechanical tasks such as STT correction.
  if (gc.thinkingConfig?.thinkingBudget === 0) req.reasoning_effort = 'none';
  // Chat Completions rejects function tools combined with reasoning on gpt-5.6-luna (HTTP 400:
  // "Function tools with reasoning_effort are not supported … set reasoning_effort to 'none'",
  // verified 2026-09-26). Tool-carrying requests (the side chat) therefore run without reasoning.
  if (req.tools) req.reasoning_effort = 'none';
  return req;
}

function mapFinish(reason) {
  if (reason === 'length') return 'MAX_TOKENS';
  if (reason === 'content_filter') return 'SAFETY';
  return 'STOP';
}

function parseArgs(str) {
  if (!str) return {};
  try {
    const v = JSON.parse(str);
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

/** OpenAI tool_calls → Gemini functionCall parts (id kept so the follow-up can pair results). */
function toFunctionCallParts(toolCalls) {
  return (toolCalls || [])
    .filter(tc => tc?.function?.name)
    .map(tc => ({ functionCall: { name: tc.function.name, args: parseArgs(tc.function.arguments), ...(tc.id ? { id: tc.id } : {}) } }));
}

/** Chat Completions JSON → Gemini generateContent shape. */
export function fromOpenAIResponse(json) {
  const choice = json?.choices?.[0];
  const text = choice?.message?.content ?? '';
  const usage = json?.usage || {};
  return {
    candidates: [{
      content: { parts: [{ text }, ...toFunctionCallParts(choice?.message?.tool_calls)], role: 'model' },
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
 * Returns the same shape as the Gemini SSE parser: { text, parts } — parts[0] is the text,
 * followed by one { functionCall } part per streamed tool call.
 * @param {Response} res
 * @param {(chunk: string, full: string) => void} [onChunk]
 */
export async function parseOpenAISSE(res, onChunk) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  /** @type {Array<{ id?: string, function: { name: string, arguments: string } }>} */
  const toolCalls = [];
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
        const d = JSON.parse(payload)?.choices?.[0]?.delta;
        const delta = d?.content;
        if (delta) {
          fullText += delta;
          onChunk?.(delta, fullText);
        }
        // Tool calls stream as fragments keyed by index: id/name once, arguments in pieces.
        for (const tc of d?.tool_calls || []) {
          const i = typeof tc.index === 'number' ? tc.index : toolCalls.length;
          const slot = toolCalls[i] || (toolCalls[i] = { function: { name: '', arguments: '' } });
          if (tc.id) slot.id = tc.id;
          if (tc.function?.name) slot.function.name += tc.function.name;
          if (tc.function?.arguments) slot.function.arguments += tc.function.arguments;
        }
      } catch { /* skip malformed frame */ }
    }
  }
  return { text: fullText, parts: [{ text: fullText }, ...toFunctionCallParts(toolCalls.filter(Boolean))] };
}
