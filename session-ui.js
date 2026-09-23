// @ts-check
// session-ui.js - The only module that draws lifecycle chrome.
// Everything here is a pure function of (state.phase, state.source, state.sttEngineName,
// state._audioRecordingActive, status override) — call syncSessionUI() after any transition.

import { state } from './event-bus.js';
import { t } from './i18n.js';

const $ = (sel) => document.querySelector(sel);

/** @type {{ onResume?: () => void, onNew?: () => void, onDocGen?: () => void, onEditInfo?: () => void }} */
let actions = {};
/** @type {string | null} */
let statusOverride = null;

/** Register click handlers for the dynamic post-end / loaded-mode buttons. */
export function initSessionUI(handlers) {
  actions = { ...actions, ...handlers };
}

/** One-shot status text used by the next sync (draft recovery, import). */
export function setSessionStatusOverride(text) {
  statusOverride = text;
}

function makeBtn(id, className, html) {
  const btn = document.createElement('button');
  btn.id = id;
  btn.className = className;
  btn.innerHTML = html;
  return btn;
}

function removeDynamicButtons() {
  ['#btnResumeMeeting', '#btnNewMeeting', '#btnPostDocGen', '#btnPostExport', '#btnBottomResume', '#btnEditSaveInfo']
    .forEach(sel => $(sel)?.remove());
}

function statusText() {
  if (statusOverride) return statusOverride;
  switch (state.phase) {
    case 'recording': return t('record.status_recording');
    case 'paused':
      if (state.source === 'imported') {
        return state.importType === 'uploaded' ? t('import.status_uploaded') : t('import.status_imported');
      }
      return t('record.status_paused');
    case 'ended': return state.source === 'loaded' ? t('history.load') : t('record.status_ended');
    default: return '';
  }
}

export function syncSessionUI() {
  const phase = state.phase;
  const recBtn = $('#btnRecord');
  const recLabel = recBtn?.querySelector('.record-label');
  const pill = $('#meetingPill');
  const status = $('#meetingStatus');
  const endBtn = $('#btnEndMeeting');
  const titleInput = $('#meetingTitleInput');
  const engineBadge = $('#sttEngineBadge');
  const audioBadge = $('#audioRecBadge');
  const loadedBanner = $('#loadedMeetingBanner');
  if (!recBtn || !pill || !endBtn) return; // not in a full DOM (tests)

  removeDynamicButtons();

  // Record button
  recBtn.classList.toggle('recording', phase === 'recording');
  recBtn.classList.toggle('paused', phase === 'paused');
  if (recLabel) {
    recLabel.textContent = phase === 'recording' ? t('record.meeting_active')
      : phase === 'paused' ? t('record.paused')
      : t('record.label');
  }

  // Pill + status
  pill.hidden = phase === 'idle';
  pill.classList.toggle('recording', phase === 'recording');
  pill.classList.toggle('paused', phase === 'paused' || phase === 'ended');
  if (status) status.textContent = statusText();
  statusOverride = null;

  // Badges — the engine code ("WS", "HQ"…) is developer jargon; the engine is
  // already shown in #sttStatusChip, so the record-button badge stays hidden.
  if (engineBadge) engineBadge.hidden = true;
  if (audioBadge) audioBadge.hidden = !(phase === 'recording' && state._audioRecordingActive);

  // Title input
  if (titleInput) {
    titleInput.hidden = phase === 'idle';
    if (phase !== 'idle' && titleInput.value !== state.meetingTitle) titleInput.value = state.meetingTitle || '';
  }

  // Loaded-meeting banner + body modes
  const isLoaded = phase === 'ended' && state.source === 'loaded';
  if (loadedBanner) {
    loadedBanner.hidden = !isLoaded;
    if (isLoaded) {
      const bt = $('#loadedBannerTitle');
      const bd = $('#loadedBannerDate');
      if (bt) bt.textContent = state.meetingTitle || t('history.untitled');
      if (bd) bd.textContent = state.meetingStartTime ? new Date(state.meetingStartTime).toLocaleDateString() : '';
    }
  }
  document.body.classList.toggle('loaded-mode', isLoaded);
  document.body.classList.toggle('imported-mode', state.source === 'imported' && phase !== 'idle');

  // End button + dynamic buttons
  endBtn.hidden = !(phase === 'recording' || phase === 'paused');
  if (phase === 'ended') {
    if (isLoaded) {
      const btnResume = makeBtn('btnBottomResume', 'btn btn-end-meeting', `<span>▶</span> <span>${t('loaded.resume_recording')}</span>`);
      btnResume.onclick = () => actions.onResume?.();
      const btnEdit = makeBtn('btnEditSaveInfo', 'btn btn-end-meeting', `<span>📋</span> <span>${t('end_meeting.edit_info_btn')}</span>`);
      btnEdit.onclick = () => actions.onEditInfo?.();
      endBtn.after(btnResume, btnEdit);
    } else {
      const btnResume = makeBtn('btnResumeMeeting', 'btn btn-sm', t('meeting.resume'));
      btnResume.style.color = 'var(--accent)';
      btnResume.style.borderColor = 'var(--accent)';
      btnResume.onclick = () => actions.onResume?.();
      const btnDocGen = makeBtn('btnPostDocGen', 'btn btn-sm', '📄 ' + t('dg.button_label'));
      btnDocGen.onclick = () => actions.onDocGen?.();
      const btnNew = makeBtn('btnNewMeeting', 'btn btn-sm', t('meeting.new'));
      btnNew.onclick = () => actions.onNew?.();
      endBtn.after(btnResume, btnDocGen, btnNew);
    }
  }

  syncLiveRecordingState(phase);

  if (phase === 'idle') {
    const timer = $('#meetingTimer');
    if (timer) timer.textContent = '00:00:00';
    const inboxBadge = $('#inboxBadge');
    if (inboxBadge) inboxBadge.hidden = true;
  }
}

/** Format elapsed ms as HH:MM:SS (shared by timer tick, draft recovery and loaded view). */
export function formatClock(ms) {
  const diff = Math.max(0, ms || 0);
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function renderClock(ms) {
  const el = $('#meetingTimer');
  const text = formatClock(ms);
  if (el) el.textContent = text;
  const live = $('#recLiveTimer');
  if (live) live.textContent = text;
}

// ===== UX: recording state — live status in the bottom bar =====
// A live-recording block (pulsing dot + big timer + label) sits in the bottom bar,
// and body.is-recording / body.is-paused drive the red / amber bar styling.
// The block is injected here (not in index.html) so the footer markup stays untouched.
function ensureLiveStatus() {
  let el = $('#recLiveStatus');
  if (el) return el;
  const center = document.querySelector('.bottom-bar .bottom-center');
  if (!center) return null;
  el = document.createElement('div');
  el.id = 'recLiveStatus';
  el.className = 'rec-live';
  el.setAttribute('role', 'group'); // not a live region: the timer ticks every second
  el.hidden = true;
  el.innerHTML = '<span class="rec-live-dot" aria-hidden="true"></span>'
    + '<span class="rec-live-timer" id="recLiveTimer">00:00:00</span>'
    + '<span class="rec-live-label" id="recLiveLabel"></span>';
  center.prepend(el);
  return el;
}

function syncLiveRecordingState(phase) {
  const live = phase === 'recording' || (phase === 'paused' && state.source !== 'imported');
  const isRec = live && phase === 'recording';
  const isPaused = live && phase === 'paused';
  document.body.classList.toggle('is-recording', isRec);
  document.body.classList.toggle('is-paused', isPaused);
  const el = ensureLiveStatus();
  if (!el) return;
  el.hidden = !live;
  el.setAttribute('aria-label', t('record.live_aria'));
  const label = $('#recLiveLabel');
  if (label) label.textContent = isPaused ? t('record.live_paused') : t('record.live_recording');
  const timer = $('#recLiveTimer');
  const headerTimer = $('#meetingTimer');
  if (timer && headerTimer) timer.textContent = headerTimer.textContent;
}
