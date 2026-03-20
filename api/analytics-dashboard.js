// api/analytics-dashboard.js - 애널리틱스 대시보드 엔드포인트

import { createClient } from '@vercel/kv';

export default async function handler(req, res) {
  // CORS — 제한적 (대시보드는 관리자만)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 시크릿 인증
  const secret = req.query.secret;
  if (!secret || secret !== process.env.ANALYTICS_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(500).json({ error: 'KV not configured' });
  }

  const kv = createClient({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });

  const days = Math.min(parseInt(req.query.days) || 30, 90);
  const format = req.query.format || 'json';

  try {
    const results = [];
    const now = new Date();

    for (let i = 0; i < days; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().slice(0, 10);

      const [daily, dau, features, sessions] = await Promise.all([
        kv.hgetall(`analytics:daily:${dateKey}`).catch(() => null),
        kv.scard(`analytics:devices:${dateKey}`).catch(() => 0),
        kv.hgetall(`analytics:features:${dateKey}`).catch(() => null),
        kv.get(`analytics:sessions:${dateKey}`).catch(() => 0),
      ]);

      results.push({
        date: dateKey,
        dau: dau || 0,
        sessions: sessions || 0,
        events: daily || {},
        features: features || {},
      });
    }

    if (format === 'csv') {
      // CSV 출력
      const allEventKeys = new Set();
      results.forEach(r => Object.keys(r.events).forEach(k => allEventKeys.add(k)));
      const eventCols = [...allEventKeys].sort();

      const header = ['date', 'dau', 'sessions', ...eventCols].join(',');
      const rows = results.map(r =>
        [r.date, r.dau, r.sessions, ...eventCols.map(k => r.events[k] || 0)].join(',')
      );

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=analytics.csv');
      return res.status(200).send([header, ...rows].join('\n'));
    }

    // JSON 출력 + 요약 통계
    const summary = {
      totalDays: days,
      avgDau: results.length > 0
        ? Math.round(results.reduce((s, r) => s + r.dau, 0) / results.length)
        : 0,
      totalSessions: results.reduce((s, r) => s + r.sessions, 0),
      topEvents: _aggregateTop(results, 'events'),
      topFeatures: _aggregateTop(results, 'features'),
    };

    return res.status(200).json({ summary, daily: results });
  } catch (err) {
    console.error('[analytics-dashboard] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

function _aggregateTop(results, field) {
  const totals = {};
  for (const r of results) {
    for (const [k, v] of Object.entries(r[field] || {})) {
      totals[k] = (totals[k] || 0) + (typeof v === 'number' ? v : parseInt(v) || 0);
    }
  }
  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .reduce((obj, [k, v]) => { obj[k] = v; return obj; }, {});
}
