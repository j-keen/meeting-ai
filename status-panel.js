// @ts-check
// status-panel.js - One plain line: is speech recognition + AI ready?
// The app runs on OpenAI only (server key): cloud STT (gpt-4o-mini-transcribe) + GPT models.
// Shown as a small chip next to the REC button (tap → short modal). On phones the chip lives in
// the ⋯ menu, and the ⋯ toggle gets a warning dot while something is wrong.

import { state, on } from './event-bus.js';
import { t } from './i18n.js';
import { isProxyAvailableFor, isRealtimeTokenAvailable, isProbeComplete } from './gemini-api.js';
import { resolveEngine } from './stt.js';
import { escapeHtml } from './utils.js';

const $ = (sel) => document.querySelector(sel);

/** Structured snapshot used by both the chip and the modal. */
export async function getRuntimeStatus() {
  const s = state.settings || {};
  const checking = !safe(() => isProbeComplete(), true);
  const live = state.phase === 'recording' && !!state.sttEngineName;
  const engine = live ? state.sttEngineName : resolveEngine(s);
  const cloud = engine === 'cloud' || safe(() => isRealtimeTokenAvailable(), false);
  const aiOk = safe(() => isProxyAvailableFor('openai'), false);

  const problems = [];
  if (!checking) {
    if (!cloud) problems.push(t('status.problem_stt_fallback'));
    if (!aiOk) problems.push(t('status.problem_ai_no_key'));
  }
  return { checking, live, engine, sttOk: checking || cloud, aiOk: checking || aiOk, ok: problems.length === 0, problems };
}

function safe(fn, fallback) {
  try { return fn(); } catch { return fallback; }
}

/** Short text for the chip next to the REC button. */
export function chipText(status) {
  if (status.checking) return t('status.chip_checking');
  if (!status.ok) return `⚠ ${t('status.chip_problem')}`;
  return status.live ? t('status.chip_live') : t('status.chip_ready');
}

/** One human sentence (plus problem lines when something is wrong). */
export function renderStatusHtml(status) {
  const line = status.checking
    ? t('status.summary_checking')
    : status.ok ? t('status.summary_ok') : t('status.summary_problem');
  const problems = status.problems.map(p => `<div class="status-problem">${escapeHtml(p)}</div>`).join('');
  return `<div class="status-summary"><div class="status-summary-row${status.ok ? '' : ' status-bad'}">${escapeHtml(line)}</div>${problems}</div>`;
}

export async function refreshStatusUI() {
  const status = await getRuntimeStatus();
  const chip = $('#sttStatusChip');
  if (chip) {
    chip.textContent = chipText(status);
    chip.classList.toggle('status-bad', !status.ok);
    chip.title = status.problems.join(' ') || t('status.chip_hint');
  }
  // On phones the chip lives in the ⋯ menu: flag the toggle so a warning stays visible.
  $('#btnBottomOverflow')?.classList.toggle('has-warning', !status.ok);
  return status;
}

export async function openStatusModal() {
  const status = await getRuntimeStatus();
  document.querySelector('.status-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay status-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:420px;">
      <div class="modal-header"><h3>${t('status.title')}</h3><button class="modal-close" aria-label="${escapeHtml(t('status.close'))}">&times;</button></div>
      <div class="modal-body status-body">${renderStatusHtml(status)}</div>
      <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:12px 16px;">
        <button class="btn btn-primary" id="btnStatusClose">${t('status.close')}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('.modal-close').onclick = close;
  overlay.querySelector('#btnStatusClose').onclick = close;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}

let initialized = false;
export function initStatusPanel() {
  if (initialized) return;
  initialized = true;
  $('#sttStatusChip')?.addEventListener('click', () => openStatusModal());
  on('session:transition', () => refreshStatusUI());
  on('stt:engine-changed', () => refreshStatusUI());
  // The proxy/token probes finish shortly after load; re-render once they have.
  on('ai:probed', () => refreshStatusUI());
  refreshStatusUI();
}
