// @ts-check
// status-panel.js - "What is running right now?" — STT engine/model/key source and AI provider/models.
// Shown as a chip next to the REC button (tap → detail modal) and at the top of Settings.

import { state, on } from './event-bus.js';
import { t } from './i18n.js';
import { getProvider, getUserApiKey, isProxyAvailableFor, isRealtimeTokenAvailable } from './gemini-api.js';
import { GEMINI, OPENAI, TASK_TIER, toProviderModel } from './models.js';
import { resolveEngine } from './stt.js';
import { CLOUD_STT_MODELS } from './stt-cloud.js';
import { WHISPER_MODELS, getWhisperModelStatus, isWhisperSupported } from './stt-whisper.js';
import { escapeHtml } from './utils.js';

const $ = (sel) => document.querySelector(sel);

const ENGINE_LABEL = {
  cloud: 'status.engine_cloud',
  whisper: 'status.engine_whisper',
  webspeech: 'status.engine_webspeech',
  'webspeech-local': 'status.engine_webspeech_local',
  keyboard: 'status.engine_keyboard',
  native: 'status.engine_native',
};

/** Structured snapshot used by both the chip and the modal. */
export async function getRuntimeStatus() {
  const s = state.settings || {};
  const configured = resolveEngine(s);
  const live = state.phase === 'recording' && state.sttEngineName ? state.sttEngineName : null;
  const engine = live || configured;

  const openaiKey = !!getUserApiKey('openai');
  const geminiKey = !!getUserApiKey('gemini');
  const serverToken = isRealtimeTokenAvailable();

  const stt = { engine, live: !!live, label: t(ENGINE_LABEL[engine] || 'status.engine_webspeech'), model: '', auth: 'n/a', ok: true, problem: '' };
  if (engine === 'cloud') {
    stt.model = CLOUD_STT_MODELS.includes(s.cloudSttModel) ? s.cloudSttModel : CLOUD_STT_MODELS[0];
    stt.auth = openaiKey ? 'personal' : serverToken ? 'server' : 'none';
    if (stt.auth === 'none') { stt.ok = false; stt.problem = t('status.problem_cloud_no_key'); }
  } else if (engine === 'whisper') {
    stt.model = s.whisperModel || WHISPER_MODELS[0].id;
    stt.auth = 'local';
    if (!isWhisperSupported()) { stt.ok = false; stt.problem = t('settings.whisper_unsupported'); }
    else {
      const st = await getWhisperModelStatus(stt.model).catch(() => ({ downloaded: false }));
      if (!st.downloaded) { stt.ok = false; stt.problem = t('status.problem_whisper_not_downloaded'); }
    }
  } else if (engine === 'webspeech' || engine === 'webspeech-local') {
    stt.model = t('status.model_browser');
    stt.auth = 'free';
  } else if (engine === 'keyboard') {
    stt.model = t('status.model_keyboard');
    stt.auth = 'free';
  } else if (engine === 'native') {
    stt.model = t('status.model_native');
    stt.auth = 'free';
  }

  const provider = getProvider();
  const table = provider === 'openai' ? OPENAI : GEMINI;
  const ai = {
    provider,
    proxy: isProxyAvailableFor(provider),
    personalKey: provider === 'openai' ? openaiKey : geminiKey,
    models: {
      light: table.light,
      standard: table.standard,
      heavy: toProviderModel(s.geminiModel || GEMINI.standard, provider),
    },
    ok: true,
    problem: '',
  };
  ai.auth = ai.proxy ? 'server' : ai.personalKey ? 'personal' : 'none';
  if (ai.auth === 'none') { ai.ok = false; ai.problem = t('status.problem_ai_no_key'); }

  return { stt, ai, keys: { gemini: geminiKey, openai: openaiKey, serverToken } };
}

function authLabel(auth) {
  return t({
    personal: 'status.auth_personal', server: 'status.auth_server', none: 'status.auth_none',
    local: 'status.auth_local', free: 'status.auth_free', 'n/a': 'status.auth_free',
  }[auth] || 'status.auth_free');
}

/** Short text for the chip next to the REC button. */
export function chipText(status) {
  const stt = status.stt;
  const model = stt.model && stt.engine === 'cloud' ? ` · ${stt.model.replace('gpt-4o-', '')}` : '';
  return `${stt.ok ? '' : '⚠ '}STT: ${stt.label}${model}`;
}

export function renderStatusHtml(status) {
  const { stt, ai, keys } = status;
  const row = (k, v, bad = false) => `<div class="status-row${bad ? ' status-bad' : ''}"><span class="status-k">${escapeHtml(k)}</span><span class="status-v">${escapeHtml(v)}</span></div>`;
  const tierRows = ['light', 'standard', 'heavy'].map(tier => {
    const tasks = Object.entries(TASK_TIER).filter(([, v]) => v === tier || (tier === 'heavy' && v === 'user')).map(([k]) => t(`status.task_${k}`)).join(', ');
    return row(t(`status.tier_${tier}`), `${ai.models[tier]} — ${tasks}`);
  }).join('');
  return `
    <div class="status-block">
      <div class="status-title">${t('status.stt_title')}${stt.live ? ` <span class="status-live">${t('status.live')}</span>` : ''}</div>
      ${row(t('status.engine'), stt.label)}
      ${stt.model ? row(t('status.model'), stt.model) : ''}
      ${row(t('status.auth'), authLabel(stt.auth), stt.auth === 'none')}
      ${stt.problem ? `<div class="status-problem">${escapeHtml(stt.problem)}</div>` : ''}
    </div>
    <div class="status-block">
      <div class="status-title">${t('status.ai_title')}</div>
      ${row(t('status.provider'), ai.provider === 'openai' ? 'OpenAI (GPT)' : 'Google Gemini')}
      ${row(t('status.auth'), authLabel(ai.auth), ai.auth === 'none')}
      ${tierRows}
      ${ai.problem ? `<div class="status-problem">${escapeHtml(ai.problem)}</div>` : ''}
    </div>
    <div class="status-block">
      <div class="status-title">${t('status.keys_title')}</div>
      ${row(t('status.key_gemini'), keys.gemini ? t('status.key_set') : t('status.key_missing'))}
      ${row(t('status.key_openai'), keys.openai ? t('status.key_set') : t('status.key_missing'))}
      ${row(t('status.key_server'), keys.serverToken ? t('status.key_set') : t('status.key_missing'))}
      <div class="status-note">${t('status.keys_note')}</div>
    </div>`;
}

export async function refreshStatusUI() {
  const status = await getRuntimeStatus();
  const chip = $('#sttStatusChip');
  if (chip) {
    chip.textContent = chipText(status);
    chip.classList.toggle('status-bad', !status.stt.ok);
    chip.title = status.stt.problem || t('status.chip_hint');
  }
  const panel = $('#runtimeStatus');
  if (panel) panel.innerHTML = renderStatusHtml(status);
  return status;
}

export async function openStatusModal() {
  const status = await getRuntimeStatus();
  document.querySelector('.status-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay status-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:460px;">
      <div class="modal-header"><h3>${t('status.title')}</h3><button class="modal-close" aria-label="close">&times;</button></div>
      <div class="modal-body status-body">${renderStatusHtml(status)}</div>
      <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:12px 16px;">
        <button class="btn" id="btnStatusSettings">${t('status.open_settings')}</button>
        <button class="btn btn-primary" id="btnStatusClose">${t('status.close')}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('.modal-close').onclick = close;
  overlay.querySelector('#btnStatusClose').onclick = close;
  overlay.querySelector('#btnStatusSettings').onclick = () => { close(); import('./settings.js').then(m => m.openSettings()); };
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}

let initialized = false;
export function initStatusPanel() {
  if (initialized) return;
  initialized = true;
  $('#sttStatusChip')?.addEventListener('click', () => openStatusModal());
  $('#btnRuntimeStatusRefresh')?.addEventListener('click', () => refreshStatusUI());
  on('session:transition', () => refreshStatusUI());
  on('stt:engine-changed', () => refreshStatusUI());
  $('#btnSettingsSave')?.addEventListener('click', () => setTimeout(refreshStatusUI, 0));
  $('#selectSttEngine')?.addEventListener('change', () => setTimeout(refreshStatusUI, 0));
  $('#selectAiProvider')?.addEventListener('change', () => setTimeout(refreshStatusUI, 0));
  on('settings:opened', () => refreshStatusUI());
  refreshStatusUI();
  // The proxy/token probes finish shortly after load; re-render once they have.
  setTimeout(refreshStatusUI, 2500);
}
