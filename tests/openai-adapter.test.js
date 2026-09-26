import { describe, it, expect, vi } from 'vitest';
import { toOpenAIRequest, fromOpenAIResponse, parseOpenAISSE } from '../openai-adapter.js';
import { modelFor, toProviderModel, tierOf, providerOf, resolveModel, GEMINI, OPENAI } from '../models.js';

describe('toOpenAIRequest', () => {
  it('maps systemInstruction + contents roles and joins text parts', () => {
    const req = toOpenAIRequest('gpt-5.4-nano', {
      systemInstruction: { parts: [{ text: 'You are helpful.' }] },
      contents: [
        { role: 'user', parts: [{ text: 'Hello' }, { text: 'World' }] },
        { role: 'model', parts: [{ text: 'Hi!' }] },
        { parts: [{ text: 'no role → user' }] },
      ],
      generationConfig: { temperature: 0.3, maxOutputTokens: 123 },
    }, { stream: true, tier: 'light' });
    expect(req.model).toBe('gpt-5.4-nano');
    expect(req.stream).toBe(true);
    expect(req.messages).toEqual([
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hello\nWorld' },
      { role: 'assistant', content: 'Hi!' },
      { role: 'user', content: 'no role → user' },
    ]);
    expect(req.max_completion_tokens).toBe(123);
    expect(req).not.toHaveProperty('temperature');
    expect(req).not.toHaveProperty('max_tokens');
    expect(req.reasoning_effort).toBe('low');
  });

  it('turns inlineData into image_url parts and json mime into response_format', () => {
    const req = toOpenAIRequest('gpt-5.4-nano', {
      contents: [{ role: 'user', parts: [{ text: 'Read this card' }, { inlineData: { mimeType: 'image/png', data: 'AAAA' } }] }],
      generationConfig: { responseMimeType: 'application/json' },
    });
    expect(req.messages[0].content).toEqual([
      { type: 'text', text: 'Read this card' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
    ]);
    expect(req.response_format).toEqual({ type: 'json_object' });
    // OpenAI requires the word JSON somewhere in the prompt for json_object mode
    expect(req.messages.some(m => /json/i.test(JSON.stringify(m.content)))).toBe(true);
  });

  it('keeps reasoning low on every tier (heavy uses HEAVY_EFFORT)', () => {
    expect(toOpenAIRequest('gpt-5.6-sol', { contents: [] }, { tier: 'heavy' }).reasoning_effort).toBe('low');
    expect(toOpenAIRequest('gpt-5.6-luna', { contents: [] }, { tier: 'light' }).reasoning_effort).toBe('low');
  });
});

describe('fromOpenAIResponse', () => {
  it('produces the Gemini candidates shape', () => {
    const out = fromOpenAIResponse({
      model: 'gpt-5.4-mini-2026-03-17',
      choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 7, completion_tokens: 1, total_tokens: 8 },
    });
    expect(out.candidates[0].content.parts[0].text).toBe('OK');
    expect(out.candidates[0].finishReason).toBe('STOP');
    expect(out.usageMetadata.totalTokenCount).toBe(8);
  });
});

describe('parseOpenAISSE', () => {
  it('accumulates delta.content and ignores [DONE]', async () => {
    const frames = [
      'data: {"choices":[{"delta":{"role":"assistant","content":""}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"one"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":", two"}}]}\n\ndata: [DONE]\n\n',
    ];
    const enc = new TextEncoder();
    const body = new ReadableStream({
      start(c) { frames.forEach(f => c.enqueue(enc.encode(f))); c.close(); },
    });
    const onChunk = vi.fn();
    const out = await parseOpenAISSE({ body }, onChunk);
    expect(out.text).toBe('one, two');
    expect(out.parts).toEqual([{ text: 'one, two' }]);
    expect(onChunk).toHaveBeenNthCalledWith(1, 'one', 'one');
    expect(onChunk).toHaveBeenNthCalledWith(2, ', two', 'one, two');
  });
});

describe('models: tiers and provider mapping', () => {
  it('routes frequent tasks (incl. live analysis) light, setup standard, minutes/docs heavy', () => {
    expect(modelFor('correction')).toBe(GEMINI.light);
    expect(modelFor('analysis', { provider: 'openai' })).toBe('gpt-5.6-luna');
    expect(modelFor('chat', { provider: 'openai' })).toBe('gpt-5.6-luna');
    expect(modelFor('prompt_builder', { provider: 'openai' })).toBe('gpt-5.4-mini');
    expect(modelFor('deep_setup', { provider: 'openai' })).toBe('gpt-5.4-mini');
    expect(modelFor('compare', { provider: 'openai' })).toBe('gpt-5.4-mini');
    expect(modelFor('minutes', { provider: 'openai' })).toBe('gpt-5.6-sol');
    // No user choice anymore: a stored flash pick no longer downgrades minutes.
    expect(modelFor('minutes', { userModel: GEMINI.standard, provider: 'openai' })).toBe(OPENAI.heavy);
    expect(modelFor('docs', { provider: 'openai' })).toBe('gpt-5.6-sol');
  });

  it('maps previous OpenAI ids onto the new tiers', () => {
    expect(resolveModel('gpt-5.4-nano')).toBe('gpt-5.6-luna');
    expect(resolveModel('gpt-5.5')).toBe('gpt-5.6-sol');
    expect(toProviderModel('gemini-3.5-flash-lite', 'openai')).toBe('gpt-5.6-luna');
    expect(toProviderModel('gemini-3.1-pro-preview', 'openai')).toBe('gpt-5.6-sol');
    expect(tierOf('gpt-5.6-sol')).toBe('heavy');
  });

  it('converts between providers by tier and keeps same-provider ids', () => {
    expect(toProviderModel('gemini-2.5-flash-lite', 'openai')).toBe(OPENAI.light);
    expect(toProviderModel(GEMINI.heavy, 'openai')).toBe(OPENAI.heavy);
    expect(toProviderModel(OPENAI.standard, 'openai')).toBe(OPENAI.standard);
    expect(toProviderModel(OPENAI.standard, 'gemini')).toBe(GEMINI.standard);
    expect(providerOf('gpt-5.4-mini')).toBe('openai');
    expect(providerOf('gemini-2.5-pro')).toBe('gemini');
    expect(tierOf('gemini-2.5-pro')).toBe('heavy');
    expect(resolveModel(undefined)).toBe(GEMINI.standard);
  });
});
