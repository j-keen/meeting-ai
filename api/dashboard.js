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
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f1117; color: #e4e4e7; padding: 24px; max-width: 1200px; margin: 0 auto; }

  .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 12px; }
  .header h1 { font-size: 24px; font-weight: 600; }
  .header h1 span { color: #6366f1; }
  .period { font-size: 14px; color: #71717a; }

  /* Guide banner */
  .guide { background: #1a1a2e; border: 1px solid #27274a; border-radius: 12px; padding: 20px; margin-bottom: 28px; }
  .guide-toggle { display: flex; justify-content: space-between; align-items: center; cursor: pointer; }
  .guide-toggle h2 { font-size: 15px; color: #818cf8; font-weight: 600; }
  .guide-toggle .arrow { color: #818cf8; font-size: 18px; transition: transform 0.2s; }
  .guide-toggle .arrow.open { transform: rotate(180deg); }
  .guide-body { margin-top: 16px; display: none; }
  .guide-body.open { display: block; }
  .guide-body p { font-size: 13px; color: #a1a1aa; line-height: 1.7; margin-bottom: 8px; }
  .guide-body strong { color: #c4b5fd; }
  .guide-section { margin-bottom: 14px; }
  .guide-section h3 { font-size: 13px; color: #6366f1; margin-bottom: 6px; }
  .guide-section ul { list-style: none; padding: 0; }
  .guide-section li { font-size: 12px; color: #71717a; padding: 3px 0; padding-left: 16px; position: relative; }
  .guide-section li::before { content: "\\2022"; color: #6366f1; position: absolute; left: 0; }

  /* Cards */
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 32px; }
  .card { background: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 20px; }
  .card-label { font-size: 13px; color: #a1a1aa; font-weight: 600; margin-bottom: 4px; }
  .card-hint { font-size: 11px; color: #52525b; margin-bottom: 10px; line-height: 1.4; }
  .card-value { font-size: 32px; font-weight: 700; }
  .card-sub { font-size: 12px; color: #52525b; margin-top: 4px; }
  .card-value.green { color: #22c55e; }
  .card-value.blue { color: #3b82f6; }
  .card-value.purple { color: #a855f7; }
  .card-value.amber { color: #f59e0b; }

  /* Sections */
  .section { margin-bottom: 32px; }
  .section-header { margin-bottom: 16px; }
  .section-header h2 { font-size: 16px; font-weight: 600; color: #a1a1aa; }
  .section-desc { font-size: 12px; color: #52525b; margin-top: 4px; line-height: 1.5; }

  /* Chart */
  .chart-container { background: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 20px; overflow-x: auto; }
  .chart { display: flex; align-items: flex-end; gap: 4px; height: 200px; min-width: fit-content; }
  .bar-group { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 40px; }
  .bar { width: 32px; border-radius: 4px 4px 0 0; min-height: 2px; transition: height 0.3s; position: relative; cursor: pointer; }
  .bar:hover::after { content: attr(data-tooltip); position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); background: #3f3f46; color: #e4e4e7; padding: 4px 10px; border-radius: 6px; font-size: 11px; white-space: nowrap; margin-bottom: 6px; z-index: 10; }
  .bar.dau { background: #6366f1; }
  .bar.sessions { background: #22c55e; }
  .bar-label { font-size: 10px; color: #52525b; writing-mode: vertical-rl; text-orientation: mixed; height: 50px; overflow: hidden; }

  /* Tables */
  .table-container { background: #18181b; border: 1px solid #27272a; border-radius: 12px; overflow: hidden; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 12px 16px; background: #1f1f23; color: #71717a; font-weight: 500; font-size: 11px; letter-spacing: 0.3px; }
  th .th-hint { font-weight: 400; color: #3f3f46; font-size: 10px; display: block; margin-top: 2px; }
  td { padding: 10px 16px; border-top: 1px solid #27272a; }
  tr:hover td { background: #1f1f23; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  th.num { text-align: right; }
  .highlight { color: #6366f1; font-weight: 600; }
  .event-name { font-family: monospace; font-size: 12px; color: #a1a1aa; }
  .event-kr { font-size: 12px; color: #e4e4e7; margin-bottom: 2px; }
  .event-why { font-size: 10px; color: #52525b; }

  /* Tags */
  .tags { display: flex; flex-wrap: wrap; gap: 8px; }
  .tag { background: #27272a; border-radius: 20px; padding: 8px 14px; font-size: 12px; display: flex; align-items: center; gap: 8px; }
  .tag-label { color: #a1a1aa; }
  .tag-count { color: #6366f1; font-weight: 600; }

  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 768px) { .grid-2 { grid-template-columns: 1fr; } }

  .legend { display: flex; gap: 16px; margin-bottom: 12px; }
  .legend-item { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #71717a; }
  .legend-dot { width: 10px; height: 10px; border-radius: 2px; }

  .empty { color: #52525b; text-align: center; padding: 24px; font-size: 13px; }
  .data-note { font-size: 11px; color: #3f3f46; text-align: center; margin-top: 16px; }
</style>
</head>
<body>

<div class="header">
  <h1><span>Meeting AI</span> Analytics</h1>
  <div class="period">${days}일 | rate-limit 활성 키: ${rlCount}개</div>
</div>

<div class="guide">
  <div class="guide-toggle" onclick="this.querySelector('.arrow').classList.toggle('open'); this.nextElementSibling.classList.toggle('open');">
    <h2>이 대시보드 활용법</h2>
    <span class="arrow">&#9660;</span>
  </div>
  <div class="guide-body open">
    <div class="guide-section">
      <h3>무엇을 볼 수 있나요?</h3>
      <ul>
        <li>앱에 매일 몇 명이 접속하고, 어떤 기능을 얼마나 쓰는지 확인합니다</li>
        <li>모든 데이터는 <strong>익명</strong>입니다 - 누가 썼는지는 알 수 없고, 몇 명이 어떤 기능을 썼는지만 보입니다</li>
        <li>데이터는 최대 90일 보관되며, 이후 자동 삭제됩니다</li>
      </ul>
    </div>
    <div class="guide-section">
      <h3>이런 결정을 내릴 때 보세요</h3>
      <ul>
        <li><strong>유료화 시점 판단</strong> - DAU가 꾸준히 늘고 있다면 유료 전환 고려</li>
        <li><strong>어떤 기능을 Pro로 만들지</strong> - 가장 많이 쓰는 기능 = 유료 가치가 높은 기능</li>
        <li><strong>어떤 기능이 안 쓰이는지</strong> - 사용량 0인 기능은 개선하거나 제거</li>
        <li><strong>API 비용 예측</strong> - 분석/채팅 횟수로 월 Gemini API 비용 추정 가능</li>
        <li><strong>바이럴 효과 측정</strong> - 커뮤니티 포스팅 후 DAU 변화 관찰</li>
      </ul>
    </div>
  </div>
</div>

<div id="app"></div>

<script>
const data = ${dataJson};

// ─── 이벤트명 한글 매핑 ──────────────────────────────────────────────
const eventMap = {
  'session:start':      { kr: '앱 접속', why: '사용자가 앱을 열었을 때. DAU의 기본 지표.' },
  'session:end':        { kr: '앱 종료', why: '사용자가 앱을 떠났을 때. 평균 체류 시간 파악용.' },
  'recording:start':    { kr: '녹음 시작', why: '실제로 미팅 녹음을 시작한 횟수. 핵심 사용 지표.' },
  'recording:stop':     { kr: '녹음 종료', why: '녹음을 완료한 횟수. 시작 대비 낮으면 중도 이탈.' },
  'analysis:done':      { kr: 'AI 분석 완료', why: '가장 비용이 드는 기능. API 비용과 직결.' },
  'chat:message':       { kr: 'AI 채팅', why: '채팅 메시지 수. 활발할수록 유료 가치가 높음.' },
  'meeting:end':        { kr: '미팅 종료', why: '미팅을 정상 종료한 횟수. 전체 플로우 완주율.' },
  'meeting:export':     { kr: '내보내기', why: '회의록 내보낸 횟수. 높으면 실무에 사용 중인 것.' },
  'preset:select':      { kr: '프리셋 선택', why: '어떤 분석 프리셋이 인기인지 파악.' },
  'prep:complete':      { kr: '미팅 준비 완료', why: '미팅 준비 위자드 사용률. 낮으면 UX 개선 필요.' },
  'transcript:bookmark': { kr: '북마크', why: '중요 발언 표시. 사용자의 적극적 참여 지표.' },
  'theme:change':       { kr: '테마 변경', why: '다크/라이트 선호도 파악.' },
  'language:change':    { kr: '언어 변경', why: '글로벌 사용자 비율 파악.' },
  'error:api':          { kr: 'API 오류', why: '높으면 서비스 장애. 즉시 확인 필요.' },
  'error:stt':          { kr: '음성인식 오류', why: '높으면 STT 품질 문제. 브라우저/마이크 이슈.' },
  'usage:exhausted':    { kr: '사용량 한도 도달', why: '높으면 한도가 너무 낮다는 신호. 한도 조정 검토.' },
};

// ─── 기능 태그 한글 매핑 ─────────────────────────────────────────────
const featureMap = {
  'device:desktop': '데스크톱',
  'device:mobile': '모바일',
  'preset:copilot': '대화 코치',
  'preset:minutes': '회의록',
  'preset:lecture': '강의 노트',
  'format:md': 'Markdown',
  'format:pdf': 'PDF',
  'format:docx': 'Word',
};

// ─── 계산 ────────────────────────────────────────────────────────────
const totalDays = data.length;
const totalSessions = data.reduce((s, d) => s + d.sessions, 0);
const totalDau = data.reduce((s, d) => s + d.dau, 0);
const avgDau = totalDays > 0 ? (totalDau / totalDays).toFixed(1) : 0;
const todayData = data[0] || {};
const todayDau = todayData.dau || 0;
const todaySessions = todayData.sessions || 0;

const allEvents = {};
const allFeatures = {};
data.forEach(d => {
  Object.entries(d.events).forEach(([k, v]) => { allEvents[k] = (allEvents[k] || 0) + (typeof v === 'number' ? v : parseInt(v) || 0); });
  Object.entries(d.features).forEach(([k, v]) => { allFeatures[k] = (allFeatures[k] || 0) + (typeof v === 'number' ? v : parseInt(v) || 0); });
});

const totalRecordings = allEvents['recording:start'] || 0;
const totalAnalyses = allEvents['analysis:done'] || 0;
const totalChats = allEvents['chat:message'] || 0;
const totalExports = allEvents['meeting:export'] || 0;
const totalErrors = (allEvents['error:api'] || 0) + (allEvents['error:stt'] || 0);
const totalLimitHits = allEvents['usage:exhausted'] || 0;

const maxDau = Math.max(...data.map(d => d.dau), 1);
const maxSessions = Math.max(...data.map(d => d.sessions), 1);
const chartMax = Math.max(maxDau, maxSessions, 1);

const sortedEvents = Object.entries(allEvents).sort((a, b) => b[1] - a[1]);
const sortedFeatures = Object.entries(allFeatures).sort((a, b) => b[1] - a[1]);

// ─── 렌더링 ─────────────────────────────────────────────────────────
const app = document.getElementById('app');
app.innerHTML = \`
  <div class="cards">
    <div class="card">
      <div class="card-label">오늘 방문자 (DAU)</div>
      <div class="card-hint">오늘 앱을 열어본 고유 사용자 수</div>
      <div class="card-value blue">\${todayDau}</div>
      <div class="card-sub">세션 \${todaySessions}회</div>
    </div>
    <div class="card">
      <div class="card-label">평균 일일 방문자</div>
      <div class="card-hint">최근 \${totalDays}일 동안의 하루 평균. 이 숫자가 꾸준히 오르면 성장 중</div>
      <div class="card-value purple">\${avgDau}</div>
      <div class="card-sub">총 세션 \${totalSessions}회</div>
    </div>
    <div class="card">
      <div class="card-label">녹음 횟수</div>
      <div class="card-hint">실제 미팅에서 녹음 버튼을 누른 횟수. 핵심 사용 지표</div>
      <div class="card-value green">\${totalRecordings}</div>
      <div class="card-sub">AI 분석 \${totalAnalyses}회</div>
    </div>
    <div class="card">
      <div class="card-label">내보내기</div>
      <div class="card-hint">회의록을 파일로 저장한 횟수. 높으면 실무에 활용 중</div>
      <div class="card-value amber">\${totalExports}</div>
      <div class="card-sub">\${totalErrors > 0 ? '오류 ' + totalErrors + '건' : '오류 없음'}</div>
    </div>
    <div class="card">
      <div class="card-label">AI 채팅</div>
      <div class="card-hint">AI에게 질문한 횟수. 많을수록 유료 가치가 높은 기능</div>
      <div class="card-value blue">\${totalChats}</div>
      <div class="card-sub">한도 도달 \${totalLimitHits}회</div>
    </div>
  </div>

  <div class="section">
    <div class="section-header">
      <h2>일별 방문자 & 세션 추이</h2>
      <div class="section-desc">보라색 = 고유 방문자 수 (같은 사람이 여러 번 와도 1명), 초록색 = 총 접속 횟수. 마케팅 후 보라색 막대가 올라가면 바이럴 효과가 있는 것.</div>
    </div>
    <div class="chart-container">
      <div class="legend">
        <div class="legend-item"><div class="legend-dot" style="background:#6366f1"></div> 고유 방문자 (DAU)</div>
        <div class="legend-item"><div class="legend-dot" style="background:#22c55e"></div> 세션 (접속 횟수)</div>
      </div>
      <div class="chart">
        \${data.slice().reverse().map(d => {
          const dauH = Math.max((d.dau / chartMax) * 180, 2);
          const sessH = Math.max((d.sessions / chartMax) * 180, 2);
          const label = d.date.slice(5);
          return \`<div class="bar-group">
            <div style="display:flex;gap:2px;align-items:flex-end;height:180px">
              <div class="bar dau" style="height:\${dauH}px" data-tooltip="방문자: \${d.dau}명"></div>
              <div class="bar sessions" style="height:\${sessH}px" data-tooltip="세션: \${d.sessions}회"></div>
            </div>
            <div class="bar-label">\${label}</div>
          </div>\`;
        }).join('')}
      </div>
    </div>
  </div>

  <div class="section grid-2">
    <div>
      <div class="section-header">
        <h2>이벤트 상세</h2>
        <div class="section-desc">사용자가 앱에서 수행한 행동들. 숫자가 높은 항목이 가장 많이 쓰이는 기능.</div>
      </div>
      <div class="table-container">
        <table>
          <thead><tr>
            <th>행동<span class="th-hint">사용자가 수행한 동작</span></th>
            <th class="num">횟수<span class="th-hint">\${totalDays}일 합계</span></th>
          </tr></thead>
          <tbody>
            \${sortedEvents.map(([k, v]) => {
              const info = eventMap[k] || { kr: k, why: '' };
              return \`<tr>
                <td>
                  <div class="event-kr">\${info.kr}</div>
                  <div class="event-name">\${k}</div>
                  \${info.why ? '<div class="event-why">' + info.why + '</div>' : ''}
                </td>
                <td class="num \${v > 10 ? 'highlight' : ''}">\${v.toLocaleString()}</td>
              </tr>\`;
            }).join('')}
            \${sortedEvents.length === 0 ? '<tr><td colspan="2" class="empty">아직 데이터가 없습니다. 앱을 사용하면 여기에 표시됩니다.</td></tr>' : ''}
          </tbody>
        </table>
      </div>
    </div>
    <div>
      <div class="section-header">
        <h2>기능 & 환경</h2>
        <div class="section-desc">어떤 프리셋, 기기, 내보내기 형식이 인기인지. 유료화 시 참고.</div>
      </div>
      <div class="tags" style="margin-top: 8px;">
        \${sortedFeatures.map(([k, v]) => {
          const label = featureMap[k] || k;
          return \`<div class="tag"><span class="tag-label">\${label}</span><span class="tag-count">\${v}</span></div>\`;
        }).join('')}
        \${sortedFeatures.length === 0 ? '<div class="empty">아직 데이터가 없습니다</div>' : ''}
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-header">
      <h2>일별 상세</h2>
      <div class="section-desc">날짜별로 핵심 지표를 한눈에. 특정 날 수치가 급등하면 그날 뭐가 있었는지 확인해보세요.</div>
    </div>
    <div class="table-container">
      <table>
        <thead><tr>
          <th>날짜</th>
          <th class="num">방문자<span class="th-hint">고유 사용자</span></th>
          <th class="num">세션<span class="th-hint">접속 횟수</span></th>
          <th class="num">녹음<span class="th-hint">미팅 녹음</span></th>
          <th class="num">분석<span class="th-hint">AI 분석</span></th>
          <th class="num">채팅<span class="th-hint">AI 질문</span></th>
          <th class="num">내보내기<span class="th-hint">파일 저장</span></th>
        </tr></thead>
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

  <div class="data-note">
    데이터 보관: 최대 90일 | URL의 days 파라미터로 조회 기간 변경 가능 (최대 90)
  </div>
\`;
</script>
</body>
</html>`;
}
