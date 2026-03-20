// analytics.js - 익명 사용 데이터 수집 (프라이버시 우선)

import { on } from './event-bus.js';

// ─── 설정 ────────────────────────────────────────────────────────────────────
const FLUSH_INTERVAL_MS = 5 * 60 * 1000; // 5분
const MAX_BUFFER_SIZE = 50;
const ENDPOINT = '/api/analytics';
const DEVICE_ID_KEY = 'meeting-ai-device-id';
const OPT_OUT_KEY = 'meeting-ai-analytics-optout';

// ─── 상태 ────────────────────────────────────────────────────────────────────
let _buffer = [];
let _sessionId = null;
let _deviceId = null;
let _sessionStart = null;
let _flushTimer = null;
let _initialized = false;

// ─── 디바이스/세션 ID ─────────────────────────────────────────────────────────
function _getOrCreateDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id.slice(0, 12); // 앞 12자만 사용
  } catch {
    return 'unknown';
  }
}

function _createSessionId() {
  return crypto.randomUUID().slice(0, 8);
}

// ─── 옵트아웃 체크 ────────────────────────────────────────────────────────────
function _isOptedOut() {
  try {
    // Do Not Track 존중
    if (navigator.doNotTrack === '1') return true;
    return localStorage.getItem(OPT_OUT_KEY) === 'true';
  } catch {
    return true; // 에러 시 보수적으로 비활성화
  }
}

export function setAnalyticsOptOut(optOut) {
  try {
    localStorage.setItem(OPT_OUT_KEY, optOut ? 'true' : 'false');
    if (optOut) {
      _buffer = [];
      _stopFlushTimer();
    }
  } catch { /* ignore */ }
}

export function isAnalyticsEnabled() {
  return !_isOptedOut();
}

// ─── 디바이스 타입 ────────────────────────────────────────────────────────────
function _getDeviceType() {
  return window.innerWidth <= 768 ? 'mobile' : 'desktop';
}

// ─── 이벤트 추적 ─────────────────────────────────────────────────────────────
function _track(evt, props = {}) {
  if (_isOptedOut() || !_initialized) return;

  _buffer.push({
    did: _deviceId,
    sid: _sessionId,
    ts: Date.now(),
    evt,
    props,
  });

  if (_buffer.length >= MAX_BUFFER_SIZE) {
    _flush();
  }
}

// ─── 전송 ────────────────────────────────────────────────────────────────────
function _flush() {
  if (_buffer.length === 0) return;

  const events = [..._buffer];
  _buffer = [];

  try {
    const body = JSON.stringify({ events });

    // sendBeacon이 가능하면 사용 (페이지 이탈 시에도 전송 보장)
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      const sent = navigator.sendBeacon(ENDPOINT, blob);
      if (sent) return;
    }

    // fallback: fetch (fire-and-forget)
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => { /* 실패 시 무시 — 애널리틱스는 best-effort */ });
  } catch {
    // 전송 실패 시 데이터 버림 (재시도 안 함)
  }
}

function _startFlushTimer() {
  _stopFlushTimer();
  _flushTimer = setInterval(_flush, FLUSH_INTERVAL_MS);
}

function _stopFlushTimer() {
  if (_flushTimer) {
    clearInterval(_flushTimer);
    _flushTimer = null;
  }
}

// ─── 이벤트 버스 구독 ────────────────────────────────────────────────────────
function _subscribeToEvents() {
  // 녹음
  on('recording:started', () => {
    _track('recording:start', {
      device: _getDeviceType(),
    });
  });

  on('recording:stopped', (data) => {
    _track('recording:stop', {
      duration: data?.duration || 0,
      transcriptLines: data?.transcriptLines || 0,
    });
  });

  // 분석
  on('analysis:complete', (data) => {
    _track('analysis:done', {
      preset: data?.preset || 'unknown',
      isRerun: data?.isRerun || false,
    });
  });

  // 미팅 종료
  on('meeting:ending', (data) => {
    _track('meeting:end', {
      duration: data?.duration || 0,
      analysisCount: data?.analysisCount || 0,
      chatCount: data?.chatCount || 0,
      transcriptLines: data?.transcriptLines || 0,
    });
  });

  // 내보내기
  on('meeting:export', (data) => {
    _track('meeting:export', {
      format: data?.format || 'unknown',
    });
  });

  // 프리셋 선택
  on('preset:select', (data) => {
    _track('preset:select', {
      preset: data?.preset || 'unknown',
    });
  });

  // 미팅 준비 완료
  on('meetingPrep:complete', (data) => {
    _track('prep:complete', {
      hasParticipants: data?.hasParticipants || false,
      hasLocation: data?.hasLocation || false,
    });
  });

  // 북마크
  on('transcript:bookmark', () => {
    _track('transcript:bookmark');
  });

  // 테마 변경
  on('theme:change', (data) => {
    _track('theme:change', { theme: data?.theme || 'unknown' });
  });

  // 언어 변경
  on('language:change', (data) => {
    _track('language:change', { lang: data?.lang || 'unknown' });
  });

  // API 에러
  on('api:error', (data) => {
    _track('error:api', { type: data?.type || 'unknown' });
  });

  // STT 에러
  on('stt:error', (data) => {
    _track('error:stt', { type: data?.type || 'unknown' });
  });

  // 사용량 소진
  on('usage:exhausted', (data) => {
    _track('usage:exhausted', { category: data?.category || 'unknown' });
  });
}

// ─── 페이지 가시성/언로드 핸들러 ──────────────────────────────────────────────
function _setupLifecycleHandlers() {
  // 페이지 숨김 시 flush
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      _track('session:end', {
        duration: Math.round((Date.now() - _sessionStart) / 1000),
      });
      _flush();
    }
  });

  // 페이지 언로드 시 flush (백업)
  window.addEventListener('beforeunload', () => {
    _flush();
  });
}

// ─── 초기화 ──────────────────────────────────────────────────────────────────

/**
 * 애널리틱스 초기화. app.js의 init()에서 호출.
 */
export function initAnalytics() {
  if (_isOptedOut()) return;
  if (_initialized) return;

  _initialized = true;
  _deviceId = _getOrCreateDeviceId();
  _sessionId = _createSessionId();
  _sessionStart = Date.now();

  // 세션 시작 이벤트
  _track('session:start', {
    lang: document.documentElement.lang || navigator.language?.slice(0, 2) || 'unknown',
    theme: document.documentElement.dataset.theme || 'light',
    device: _getDeviceType(),
    returning: !!localStorage.getItem(DEVICE_ID_KEY),
  });

  _subscribeToEvents();
  _startFlushTimer();
  _setupLifecycleHandlers();
}
