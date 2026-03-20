// api/dashboard.js - 애널리틱스 대시보드 HTML 페이지

import { createClient } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const secret = req.query.secret;
  if (!secret || secret !== process.env.ANALYTICS_SECRET) {
    return res.status(401).send('Unauthorized');
  }

  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(500).send('KV not configured');
  }

  const kv = createClient({
    url: process.env.KV_REST_API_URL,
    token: process.env.KV_REST_API_TOKEN,
  });

  const days = Math.min(parseInt(req.query.days) || 14, 90);

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

    // Rate limit stats
    const rlKeys = await kv.keys('rl:*').catch(() => []);

    const data = JSON.stringify(results);
    const rlCount = rlKeys.length;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(renderHTML(data, days, rlCount));
  } catch (err) {
    res.status(500).send(`Error: ${err.message}`);
  }
}

function renderHTML(dataJson, days, rlCount) {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Meeting AI - Analytics Dashboard</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f1117; color: #e4e4e7; padding: 24px; }
  .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px; flex-wrap: wrap; gap: 12px; }
  .header h1 { font-size: 24px; font-weight: 600; }
  .header h1 span { color: #6366f1; }
  .period { font-size: 14px; color: #71717a; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 32px; }
  .card { background: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 20px; }
  .card-label { font-size: 12px; color: #71717a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
  .card-value { font-size: 32px; font-weight: 700; }
  .card-sub { font-size: 12px; color: #52525b; margin-top: 4px; }
  .card-value.green { color: #22c55e; }
  .card-value.blue { color: #3b82f6; }
  .card-value.purple { color: #a855f7; }
  .card-value.amber { color: #f59e0b; }

  .section { margin-bottom: 32px; }
  .section h2 { font-size: 16px; font-weight: 600; margin-bottom: 16px; color: #a1a1aa; }

  .chart-container { background: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 20px; overflow-x: auto; }
  .chart { display: flex; align-items: flex-end; gap: 4px; height: 200px; min-width: fit-content; }
  .bar-group { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 40px; }
  .bar { width: 32px; border-radius: 4px 4px 0 0; min-height: 2px; transition: height 0.3s; position: relative; }
  .bar:hover::after { content: attr(data-tooltip); position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); background: #27272a; color: #e4e4e7; padding: 4px 8px; border-radius: 4px; font-size: 11px; white-space: nowrap; margin-bottom: 4px; }
  .bar.dau { background: #6366f1; }
  .bar.sessions { background: #22c55e; }
  .bar-label { font-size: 10px; color: #52525b; writing-mode: vertical-rl; text-orientation: mixed; height: 50px; overflow: hidden; }

  .table-container { background: #18181b; border: 1px solid #27272a; border-radius: 12px; overflow: hidden; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 12px 16px; background: #1f1f23; color: #71717a; font-weight: 500; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
  td { padding: 10px 16px; border-top: 1px solid #27272a; }
  tr:hover td { background: #1f1f23; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .highlight { color: #6366f1; font-weight: 600; }

  .tags { display: flex; flex-wrap: wrap; gap: 8px; }
  .tag { background: #27272a; border-radius: 20px; padding: 6px 14px; font-size: 12px; display: flex; align-items: center; gap: 6px; }
  .tag-count { color: #6366f1; font-weight: 600; }

  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 768px) { .grid-2 { grid-template-columns: 1fr; } }

  .legend { display: flex; gap: 16px; margin-bottom: 12px; }
  .legend-item { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #71717a; }
  .legend-dot { width: 10px; height: 10px; border-radius: 2px; }
</style>
</head>
<body>

<div class="header">
  <h1><span>Meeting AI</span> Analytics</h1>
  <div class="period">${days}일 데이터 | 활성 rate-limit 키: ${rlCount}개</div>
</div>

<div id="app"></div>

<script>
const data = ${dataJson};

// Summary calculations
const totalDays = data.length;
const totalSessions = data.reduce((s, d) => s + d.sessions, 0);
const totalDau = data.reduce((s, d) => s + d.dau, 0);
const avgDau = totalDays > 0 ? (totalDau / totalDays).toFixed(1) : 0;
const todayData = data[0] || {};
const todayDau = todayData.dau || 0;
const todaySessions = todayData.sessions || 0;

// Aggregate events
const allEvents = {};
const allFeatures = {};
data.forEach(d => {
  Object.entries(d.events).forEach(([k, v]) => { allEvents[k] = (allEvents[k] || 0) + (typeof v === 'number' ? v : parseInt(v) || 0); });
  Object.entries(d.features).forEach(([k, v]) => { allFeatures[k] = (allFeatures[k] || 0) + (typeof v === 'number' ? v : parseInt(v) || 0); });
});

const totalRecordings = (allEvents['recording:start'] || 0);
const totalAnalyses = (allEvents['analysis:done'] || 0);
const totalExports = (allEvents['meeting:export'] || 0);
const totalErrors = (allEvents['error:api'] || 0) + (allEvents['error:stt'] || 0);

// Max values for chart scaling
const maxDau = Math.max(...data.map(d => d.dau), 1);
const maxSessions = Math.max(...data.map(d => d.sessions), 1);
const chartMax = Math.max(maxDau, maxSessions, 1);

// Sort events by count
const sortedEvents = Object.entries(allEvents).sort((a, b) => b[1] - a[1]);
const sortedFeatures = Object.entries(allFeatures).sort((a, b) => b[1] - a[1]);

const app = document.getElementById('app');
app.innerHTML = \`
  <div class="cards">
    <div class="card">
      <div class="card-label">Today DAU</div>
      <div class="card-value blue">\${todayDau}</div>
      <div class="card-sub">\${todaySessions} sessions</div>
    </div>
    <div class="card">
      <div class="card-label">Avg DAU (\${totalDays}d)</div>
      <div class="card-value purple">\${avgDau}</div>
      <div class="card-sub">\${totalSessions} total sessions</div>
    </div>
    <div class="card">
      <div class="card-label">Recordings</div>
      <div class="card-value green">\${totalRecordings}</div>
      <div class="card-sub">\${totalAnalyses} analyses</div>
    </div>
    <div class="card">
      <div class="card-label">Exports</div>
      <div class="card-value amber">\${totalExports}</div>
      <div class="card-sub">\${totalErrors} errors</div>
    </div>
  </div>

  <div class="section">
    <h2>DAU & Sessions</h2>
    <div class="chart-container">
      <div class="legend">
        <div class="legend-item"><div class="legend-dot" style="background:#6366f1"></div> DAU</div>
        <div class="legend-item"><div class="legend-dot" style="background:#22c55e"></div> Sessions</div>
      </div>
      <div class="chart">
        \${data.slice().reverse().map(d => {
          const dauH = Math.max((d.dau / chartMax) * 180, 2);
          const sessH = Math.max((d.sessions / chartMax) * 180, 2);
          const label = d.date.slice(5); // MM-DD
          return \`<div class="bar-group">
            <div style="display:flex;gap:2px;align-items:flex-end;height:180px">
              <div class="bar dau" style="height:\${dauH}px" data-tooltip="DAU: \${d.dau}"></div>
              <div class="bar sessions" style="height:\${sessH}px" data-tooltip="Sessions: \${d.sessions}"></div>
            </div>
            <div class="bar-label">\${label}</div>
          </div>\`;
        }).join('')}
      </div>
    </div>
  </div>

  <div class="section grid-2">
    <div>
      <h2>Events</h2>
      <div class="table-container">
        <table>
          <thead><tr><th>Event</th><th class="num">Count</th></tr></thead>
          <tbody>
            \${sortedEvents.map(([k, v]) => \`<tr><td>\${k}</td><td class="num \${v > 10 ? 'highlight' : ''}">\${v}</td></tr>\`).join('')}
            \${sortedEvents.length === 0 ? '<tr><td colspan="2" style="color:#52525b;text-align:center;padding:24px;">No data yet</td></tr>' : ''}
          </tbody>
        </table>
      </div>
    </div>
    <div>
      <h2>Features & Presets</h2>
      <div class="tags">
        \${sortedFeatures.map(([k, v]) => \`<div class="tag"><span>\${k}</span><span class="tag-count">\${v}</span></div>\`).join('')}
        \${sortedFeatures.length === 0 ? '<div style="color:#52525b;padding:24px;">No data yet</div>' : ''}
      </div>
    </div>
  </div>

  <div class="section">
    <h2>Daily Breakdown</h2>
    <div class="table-container">
      <table>
        <thead><tr><th>Date</th><th class="num">DAU</th><th class="num">Sessions</th><th class="num">Recordings</th><th class="num">Analyses</th><th class="num">Chats</th><th class="num">Exports</th></tr></thead>
        <tbody>
          \${data.map(d => \`<tr>
            <td>\${d.date}</td>
            <td class="num">\${d.dau}</td>
            <td class="num">\${d.sessions}</td>
            <td class="num">\${d.events['recording:start'] || 0}</td>
            <td class="num">\${d.events['analysis:done'] || 0}</td>
            <td class="num">\${d.events['chat:message'] || 0}</td>
            <td class="num">\${d.events['meeting:export'] || 0}</td>
          </tr>\`).join('')}
        </tbody>
      </table>
    </div>
  </div>
\`;
</script>
</body>
</html>`;
}
