// api/analytics.js - 이벤트 수집 엔드포인트 (Vercel KV)

import { createClient } from '@vercel/kv';

const ALLOWED_ORIGINS = ['https://meeting-ai-seven.vercel.app', 'http://localhost:3000', 'http://localhost:5173'];
const MAX_EVENTS_PER_BATCH = 100;
const MAX_EVENT_SIZE = 1024; // 1KB per event
const TTL_DAYS = 90;
const TTL_SECONDS = TTL_DAYS * 24 * 60 * 60;

function getCorsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin);
  return {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function getDateKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
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

  // KV 환경변수 없으면 로컬 개발에서는 조용히 성공 반환
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(204).end();
  }

  try {
    const { events } = req.body || {};

    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'events array required' });
    }

    if (events.length > MAX_EVENTS_PER_BATCH) {
      return res.status(400).json({ error: `Max ${MAX_EVENTS_PER_BATCH} events per batch` });
    }

    // 이벤트 크기 검증
    const validEvents = events.filter(e =>
      e && typeof e.evt === 'string' && JSON.stringify(e).length <= MAX_EVENT_SIZE
    );

    if (validEvents.length === 0) {
      return res.status(400).json({ error: 'No valid events' });
    }

    const kv = createClient({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });

    const dateKey = getDateKey();
    const pipeline = kv.pipeline();

    for (const event of validEvents) {
      // 일별 이벤트 카운트
      pipeline.hincrby(`analytics:daily:${dateKey}`, event.evt, 1);

      // DAU (디바이스 ID 셋)
      if (event.did) {
        pipeline.sadd(`analytics:devices:${dateKey}`, event.did);
      }

      // 기능별 사용량 (프리셋, 포맷 등)
      if (event.props?.preset) {
        pipeline.hincrby(`analytics:features:${dateKey}`, `preset:${event.props.preset}`, 1);
      }
      if (event.props?.format) {
        pipeline.hincrby(`analytics:features:${dateKey}`, `format:${event.props.format}`, 1);
      }
      if (event.props?.device) {
        pipeline.hincrby(`analytics:features:${dateKey}`, `device:${event.props.device}`, 1);
      }
    }

    // TTL 설정 (이미 존재하면 덮어쓰지 않음 — 첫 쓰기 시에만)
    pipeline.expire(`analytics:daily:${dateKey}`, TTL_SECONDS, 'NX');
    pipeline.expire(`analytics:devices:${dateKey}`, TTL_SECONDS, 'NX');
    pipeline.expire(`analytics:features:${dateKey}`, TTL_SECONDS, 'NX');

    // 세션 카운트
    const sessionEvents = validEvents.filter(e => e.evt === 'session:start');
    if (sessionEvents.length > 0) {
      pipeline.incrby(`analytics:sessions:${dateKey}`, sessionEvents.length);
      pipeline.expire(`analytics:sessions:${dateKey}`, TTL_SECONDS, 'NX');
    }

    await pipeline.exec();

    return res.status(204).end();
  } catch (err) {
    console.error('[analytics] Error:', err.message);
    // 애널리틱스 에러는 클라이언트에게 성공으로 응답 (best-effort)
    return res.status(204).end();
  }
}
