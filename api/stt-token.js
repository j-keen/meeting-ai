// api/stt-token.js - Vercel Serverless endpoint to provide Deepgram API key

const ALLOWED_ORIGINS = ['https://meeting-ai-seven.vercel.app', 'http://localhost:3000', 'http://localhost:5173'];

function getCorsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const cors = getCorsHeaders(origin);
  Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return res.status(404).json({ error: 'DEEPGRAM_API_KEY not configured' });
  }

  return res.status(200).json({ key: apiKey });
}
