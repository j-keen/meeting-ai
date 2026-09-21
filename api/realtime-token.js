// api/realtime-token.js - Mint a short-lived OpenAI Realtime transcription secret.
// The browser never sees OPENAI_API_KEY; it gets an ek_… value valid for ~10 minutes,
// good only for opening one transcription session.

import { createClient } from '@vercel/kv';

const ALLOWED_ORIGINS = ['https://meeting-ai-seven.vercel.app', 'http://localhost:3000', 'http://localhost:5173'];
const ALLOWED_MODELS = ['gpt-4o-mini-transcribe', 'gpt-4o-transcribe', 'gpt-live-transcribe'];
const ALLOWED_LANGS = ['ko', 'en', 'ja', 'zh'];
const LIMIT = { max: 60, windowMs: 60 * 60 * 1000 }; // 60 sessions / hour / IP

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function clientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

async function rateLimited(ip) {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return false;
  try {
    const kv = createClient({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
    const key = `rl:${ip}:rt-token`;
    const count = await kv.incr(key);
    if (count === 1) await kv.pexpire(key, LIMIT.windowMs);
    return count > LIMIT.max;
  } catch (err) {
    console.warn('[rate-limit] KV error, failing open:', err.message);
    return false;
  }
}

export default async function handler(req, res) {
  const cors = corsHeaders(req.headers.origin || '');
  Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v));
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();
  // GET is a capability probe for the status panel: says whether the server key exists, never reveals it.
  if (req.method === 'GET') return res.status(200).json({ configured: !!process.env.OPENAI_API_KEY });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });

  if (await rateLimited(clientIp(req))) {
    return res.status(429).json({ error: 'Rate limit exceeded', retryAfter: 3600 });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const model = ALLOWED_MODELS.includes(body.model) ? body.model : ALLOWED_MODELS[0];
  const language = ALLOWED_LANGS.includes(body.language) ? body.language : 'ko';

  try {
    const upstream = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session: {
          type: 'transcription',
          audio: {
            input: {
              format: { type: 'audio/pcm', rate: 24000 },
              transcription: { model, language },
              turn_detection: { type: 'server_vad', silence_duration_ms: 700 },
            },
          },
        },
      }),
    });
    const data = await upstream.json();
    if (!upstream.ok || !data.value) {
      return res.status(upstream.status || 502).json({ error: data?.error?.message || 'Could not create realtime session' });
    }
    return res.status(200).json({ value: data.value, expires_at: data.expires_at, model, language });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
