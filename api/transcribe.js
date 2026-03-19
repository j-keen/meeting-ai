// api/transcribe.js - Vercel Serverless proxy for Deepgram pre-recorded transcription (P-6)

export const config = {
  api: { bodyParser: false },
};

const ALLOWED_ORIGINS = ['https://meeting-ai-seven.vercel.app', 'http://localhost:3000', 'http://localhost:5173'];
const MAX_SIZE = 4.5 * 1024 * 1024; // 4.5MB

function getCorsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_SIZE) {
        reject(new Error('File too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
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

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'DEEPGRAM_API_KEY not configured' });
  }

  try {
    const body = await collectBody(req);

    if (body.length === 0) {
      return res.status(400).json({ error: 'Empty request body' });
    }

    const language = req.query.language || 'ko';
    const contentType = req.headers['content-type'] || 'audio/mpeg';

    const dgUrl = `https://api.deepgram.com/v1/listen?model=nova-2&language=${language}&punctuate=true&utterances=true&smart_format=true`;

    const dgResponse = await fetch(dgUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': contentType,
      },
      body,
    });

    if (!dgResponse.ok) {
      const errText = await dgResponse.text();
      console.error('[transcribe] Deepgram error:', dgResponse.status, errText);
      return res.status(dgResponse.status).json({ error: `Deepgram API error: ${dgResponse.status}` });
    }

    const data = await dgResponse.json();

    // Extract utterances (preferred) or alternatives
    let lines = [];
    let duration = 0;

    if (data.results?.utterances?.length) {
      lines = data.results.utterances.map(u => ({
        text: u.transcript,
        start: u.start,
        end: u.end,
      }));
      duration = data.metadata?.duration || 0;
    } else if (data.results?.channels?.[0]?.alternatives?.[0]) {
      const alt = data.results.channels[0].alternatives[0];
      if (alt.paragraphs?.paragraphs) {
        alt.paragraphs.paragraphs.forEach(p => {
          p.sentences?.forEach(s => {
            lines.push({ text: s.text, start: s.start, end: s.end });
          });
        });
      } else if (alt.transcript) {
        lines.push({ text: alt.transcript, start: 0, end: data.metadata?.duration || 0 });
      }
      duration = data.metadata?.duration || 0;
    }

    return res.status(200).json({ lines, duration });
  } catch (err) {
    console.error('[transcribe] Error:', err);
    if (err.message === 'File too large') {
      return res.status(413).json({ error: 'File too large (max 4.5MB)' });
    }
    return res.status(500).json({ error: err.message });
  }
}
