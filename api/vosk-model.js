export default async function handler(req, res) {
  const modelUrl = req.query.url;
  if (!modelUrl || !modelUrl.startsWith('https://alphacephei.com/')) {
    return res.status(400).json({ error: 'Invalid model URL' });
  }

  try {
    const upstream = await fetch(modelUrl);
    if (!upstream.ok) {
      return res.status(upstream.status).end(`Upstream error: ${upstream.status}`);
    }

    const contentLength = upstream.headers.get('content-length');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (contentLength) res.setHeader('Content-Length', contentLength);

    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (err) {
    res.status(502).json({ error: `Proxy error: ${err.message}` });
  }
}
