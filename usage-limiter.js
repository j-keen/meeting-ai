// usage-limiter.js - 일일 API 사용량 관리 (클라이언트 사이드)

import { emit } from './event-bus.js';

const STORAGE_KEY = 'meeting_daily_usage';

// ─── 카테고리별 일일 한도 ─────────────────────────────────────────────────────
export const DAILY_LIMITS = {
  analysis:   20,   // analyzeTranscript, reanalyzeWithAdjustment
  chat:       50,   // sendChatMessage
  minutes:     5,   // generateFinalMinutes
  docgen:     10,   // generateDocument
  tags:       30,   // generateTags, generateMeetingTitle, suggestMeetingMetadata
  prep:       15,   // meeting-prep, deep-setup AI 호출
  pro_model:   3,   // Pro 모델 사용 (전 카테고리)
  correction: 20,   // correctSentences
  refine:     10,   // refineSectionContent
  prompt_adj: 15,   // prompt-adjuster, prompt-builder
};

// ─── 카테고리 표시명 (i18n 키 매핑용) ──────────────────────────────────────────
export const CATEGORY_I18N_KEYS = {
  analysis:   'usage.cat.analysis',
  chat:       'usage.cat.chat',
  minutes:    'usage.cat.minutes',
  docgen:     'usage.cat.docgen',
  tags:       'usage.cat.tags',
  prep:       'usage.cat.prep',
  pro_model:  'usage.cat.pro_model',
  correction: 'usage.cat.correction',
  refine:     'usage.cat.refine',
  prompt_adj: 'usage.cat.prompt_adj',
};

// ─── 내부: 오늘 날짜 YYYY-MM-DD ───────────────────────────────────────────────
function _today() {
  return new Date().toISOString().slice(0, 10);
}

// ─── 내부: 사용량 데이터 로드 (날짜 다르면 리셋) ────────────────────────────────
function _loadUsage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return _createFresh();
    const data = JSON.parse(raw);
    if (data.date !== _today()) return _createFresh();
    return data;
  } catch {
    return _createFresh();
  }
}

function _createFresh() {
  const data = { date: _today() };
  for (const key of Object.keys(DAILY_LIMITS)) {
    data[key] = 0;
  }
  return data;
}

function _saveUsage(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage 용량 초과 시 무시 (서버 사이드 방어가 백업)
  }
}

// ─── 공개 API ────────────────────────────────────────────────────────────────

/**
 * 카테고리 사용량 조회
 * @returns {{ count: number, limit: number, remaining: number, ratio: number }}
 */
export function getUsage(category) {
  const data = _loadUsage();
  const count = data[category] || 0;
  const limit = DAILY_LIMITS[category] || 0;
  const remaining = Math.max(0, limit - count);
  const ratio = limit > 0 ? count / limit : 0;
  return { count, limit, remaining, ratio };
}

/**
 * 사용 가능 여부 확인
 */
export function canUse(category) {
  const { remaining } = getUsage(category);
  return remaining > 0;
}

/**
 * 사용량 1 증가 + 저장 + 이벤트 발생
 * @returns {number} 증가 후 카운트
 */
export function incrementUsage(category) {
  const data = _loadUsage();
  data[category] = (data[category] || 0) + 1;
  _saveUsage(data);

  const usage = getUsage(category);

  // 경고/소진 이벤트 발생
  const level = getWarningLevel(category);
  if (level === 'exhausted') {
    emit('usage:exhausted', { category, usage });
  } else if (level === 'approaching') {
    emit('usage:warning', { category, usage });
  }

  emit('usage:updated', { category, usage });
  return data[category];
}

/**
 * 전체 사용량 조회 (UI 표시용)
 */
export function getAllUsage() {
  const result = {};
  for (const category of Object.keys(DAILY_LIMITS)) {
    result[category] = getUsage(category);
  }
  return result;
}

/**
 * Pro 모델 사용 가능 여부
 */
export function isModelAllowed(model) {
  if (model === 'gemini-2.5-pro') {
    return canUse('pro_model');
  }
  return true;
}

/**
 * 경고 수준 확인
 * @returns {null | 'approaching' | 'exhausted'}
 */
export function getWarningLevel(category) {
  const { ratio } = getUsage(category);
  if (ratio >= 1) return 'exhausted';
  if (ratio >= 0.8) return 'approaching';
  return null;
}

/**
 * 수동 리셋 (테스트/디버그용)
 */
export function resetUsage() {
  localStorage.removeItem(STORAGE_KEY);
}
