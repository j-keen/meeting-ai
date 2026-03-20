// api/gemini.js - Vercel Serverless proxy for Gemini API (with rate limiting)

import { createClient } from '@vercel/kv';

const ALLOWED_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'];
const ALLOWED_ORIGINS = ['https://meeting-ai-seven.vercel.app', 'http://localhost:3000', 'http://localhost:5173'];

// Rate limit 설정
const RATE_LIMITS = {
  default: { max: 100, windowMs: 60 * 60 * 1000 },     // 100요청/시간
  'gemini-2.5-pro': { max: 10, windowMs: 60 * 60 * 1000 }, // 10요청/시간
};

function getCorsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.socket?.remoteAddress
    || 'unknown';
}

async function checkRateLimit(ip, model) {
  // KV 환경변수 없으면 rate limit 스킵 (로컬 개발)
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return { allowed: true, count: 0, limit: 100, remaining: 100 };
  }

  const kv = createClient({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });

  const config = RATE_LIMITS[model] || RATE_LIMITS.default;
  const key = `rl:${ip}:${model === 'gemini-2.5-pro' ? 'pro' : 'std'}`;

  try {
    const count = await kv.incr(key);
    if (count === 1) {
      await kv.pexpire(key, config.windowMs);
    }
    const remaining = Math.max(0, config.max - count);
    return { allowed: count <= config.max, count, limit: config.max, remaining };
  } catch (err) {
    // KV 장애 시 fail-open (요청 허용)
    console.warn('[rate-limit] KV error, failing open:', err.message);
    return { allowed: true, count: 0, limit: config.max, remaining: config.max };
  }
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const cors = getCorsHeaders(origin);
  Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const model = req.query.model || 'gemini-2.5-flash';
  if (!ALLOWED_MODELS.includes(model)) {
    return res.status(400).json({ error: `Model not allowed: ${model}` });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
  }

  // Rate limit 체크
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(ip, model);

  res.setHeader('X-RateLimit-Limit', rateLimit.limit);
  res.setHeader('X-RateLimit-Remaining', rateLimit.remaining);

  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', '3600');
    return res.status(429).json({
      error: 'Rate limit exceeded',
      limit: rateLimit.limit,
      retryAfter: 3600,
    });
  }

  const isStream = req.query.stream === 'true';

  try {
    const action = isStream ? 'streamGenerateContent' : 'generateContent';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${action}?key=${apiKey}${isStream ? '&alt=sse' : ''}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });

    if (!response.ok) {
      const data = await response.json();
      return res.status(response.status).json(data);
    }

    if (isStream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(decoder.decode(value, { stream: true }));
        }
      } catch (streamErr) {
        console.error('Stream read error:', streamErr.message);
      }
      return res.end();
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error('Gemini proxy error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
