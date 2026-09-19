// dev-server.js - Local development server that delegates /api/* to the real
// Vercel serverless handlers in api/, via a minimal req/res compatibility shim.
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env then .env.local (later file wins, matching Vercel's precedence)
for (const name of ['.env', '.env.local']) {
  const envPath = join(__dirname, name);
  if (existsSync(envPath)) {
    readFileSync(envPath, 'utf8').split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eq = trimmed.indexOf('=');
      if (eq === -1) return;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (key) process.env[key] = val;
    });
  }
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

const PORT = process.env.PORT || 3000;

// Maps a URL pathname to its Vercel handler module under api/.
const API_ROUTES = {
  '/api/gemini': './api/gemini.js',
  '/api/transcribe': './api/transcribe.js',
  '/api/analytics': './api/analytics.js',
  '/api/analytics-dashboard': './api/analytics-dashboard.js',
  '/api/dashboard': './api/dashboard.js',
};

const handlerCache = new Map();
async function loadHandler(modulePath) {
  if (!handlerCache.has(modulePath)) {
    const mod = await import(pathToFileURL(join(__dirname, modulePath)).href);
    handlerCache.set(modulePath, mod);
  }
  return handlerCache.get(modulePath);
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Augments the raw IncomingMessage/ServerResponse in place with the small
// subset of the Vercel Node.js request/response API that our handlers use.
// req stays a real stream so handlers that read it directly (bodyParser:
// false) keep working; we only attach query/body before invoking them.
function decorateResponse(res) {
  res.status = function status(code) {
    res.statusCode = code;
    return res;
  };
  res.json = function json(body) {
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
    return res;
  };
  res.send = function send(body) {
    if (typeof body === 'object' && body !== null && !Buffer.isBuffer(body)) {
      return res.json(body);
    }
    if (!res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/octet-stream');
    }
    res.end(body);
    return res;
  };
  return res;
}

async function handleApi(modulePath, req, res, url) {
  const mod = await loadHandler(modulePath);
  const bodyParserDisabled = mod.config?.api?.bodyParser === false;

  req.query = Object.fromEntries(url.searchParams.entries());

  if (!bodyParserDisabled && req.method !== 'GET' && req.method !== 'OPTIONS') {
    const raw = await readRawBody(req);
    const contentType = req.headers['content-type'] || '';
    if (raw.length && contentType.includes('application/json')) {
      try {
        req.body = JSON.parse(raw.toString('utf8'));
      } catch {
        req.body = {};
      }
    } else {
      req.body = raw;
    }
  }

  decorateResponse(res);
  await mod.default(req, res);
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  const routeModule = API_ROUTES[url.pathname];

  // CORS preflight
  if (req.method === 'OPTIONS' && !routeModule) {
    res.writeHead(204, cors);
    return res.end();
  }

  if (routeModule) {
    try {
      await handleApi(routeModule, req, res, url);
    } catch (err) {
      console.error(`[dev-server] ${url.pathname} error:`, err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      } else {
        res.end();
      }
    }
    return;
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
