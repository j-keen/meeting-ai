// dev-server.js - Local development server with API endpoints
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env
const envPath = join(__dirname, '.env');
if (existsSync(envPath)) {
  readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
  });
}

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const PORT = 3000;

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    return res.end();
  }

  // API: /api/stt-token
  if (url.pathname === '/api/stt-token' && req.method === 'GET') {
    const key = process.env.DEEPGRAM_API_KEY;
    res.writeHead(key ? 200 : 404, { ...cors, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(key ? { key } : { error: 'DEEPGRAM_API_KEY not configured' }));
  }

  // API: /api/gemini
  if (url.pathname === '/api/gemini' && req.method === 'POST') {
    const apiKey = process.env.VERTEX_API_KEY;
    if (!apiKey) {
      res.writeHead(500, { ...cors, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'VERTEX_API_KEY not configured' }));
    }
    const model = url.searchParams.get('model') || 'gemini-2.5-flash';
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const apiUrl = `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent?key=${apiKey}`;
      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      const data = await resp.json();
      res.writeHead(resp.status, { ...cors, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(500, { ...cors, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  // Static files
  let filePath = join(__dirname, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!existsSync(filePath)) {
    res.writeHead(404);
    return res.end('Not Found');
  }
  const ext = extname(filePath);
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime });
  res.end(readFileSync(filePath));
}).listen(PORT, () => {
  console.log(`Dev server running at http://localhost:${PORT}`);
});
