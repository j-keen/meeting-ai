// launcher.js - Launcher Modal
//
// Fastest paths first: "바로 녹음 시작" (no preset) | tap a preset card → confirm
// sheet → "바로 시작". The AI builder and meeting prep are secondary links.

import { state, emit } from './event-bus.js';
import { t } from './i18n.js';
import { loadMeetingPrepPresets, loadPreparedMeeting, deletePreparedMeeting } from './storage.js';
import { showTranscriptIdle, showAiIdle, showChatIdle } from './ui.js';
import { openMeetingPrepForm } from './meeting-prep.js';
import { openPromptBuilder } from './prompt-builder.js';
import { openDeepSetup } from './deep-setup.js';
import { renderPresetGrid, activeQuickPresetName } from './quick-start.js';
import { escapeHtml } from './utils.js';

const $ = (sel) => document.querySelector(sel);

// ===== Launcher Modal =====
export function showLauncherModal() {
  const modal = $('#launcherModal');
  if (!modal) return;

  modal.hidden = false;
  modal.querySelector('.launcher-preset-list')?.remove();

  const close = (showIdle) => {
    modal.hidden = true;
    document.removeEventListener('keydown', keyHandler);
    if (showIdle && !state.isRecording) {
      showTranscriptIdle();
      showAiIdle();
      showChatIdle();
    }
  };

  // Primary action: start recording immediately — reuses the same
  // 'recording:toggle' event the main #btnRecord button emits, so the
  // actual start-recording logic lives in one place (app.js).
  $('#btnLauncherRecord').onclick = () => {
    close();
    emit('recording:toggle');
  };

  // Which style "바로 녹음 시작" will use (set by the last quick preset).
  const styleLine = $('#launcherCurrentStyle');
  if (styleLine) {
    const name = activeQuickPresetName();
    styleLine.textContent = name ? t('launcher.current_style', { name }) : '';
    styleLine.hidden = !name;
  }

  // Quick Start presets: built-in + saved custom presets → confirm sheet.
  const presetCards = renderPresetGrid($('#launcherPresetGrid'), { beforeOpen: () => close() });

  // Secondary: conversational AI builder (custom situations)
  $('#btnLauncherQuickStart').onclick = () => {
    close();
    openPromptBuilder();
  };

  // Secondary: Deep Setup (회의 사전 준비)
  $('#btnLauncherDeepSetup').onclick = () => {
    close();
    openDeepSetup();
  };

  // Secondary: saved meeting-prep presets / prepared meeting (only when any exist)
  const prepPresets = loadMeetingPrepPresets();
  const prepared = loadPreparedMeeting();
  const prepBtn = $('#btnLauncherPreset');
  prepBtn.hidden = !(prepPresets.length > 0 || prepared);
  prepBtn.onclick = () => showPrepList(prepPresets, prepared, close);

  $('#launcherCloseBtn').onclick = () => close(true);

  // Keyboard: 1-9 open the matching preset card, Enter records, ESC closes.
  const keyHandler = (e) => {
    if (modal.hidden) return;
    if (e.target.matches('input, textarea, [contenteditable]')) return;
    if (/^[1-9]$/.test(e.key)) {
      const card = $('#launcherPresetGrid')?.children[Number(e.key) - 1];
      if (card && presetCards.length) { e.preventDefault(); card.click(); }
    }
    else if (e.key === 'Enter') {
      // Let a focused control (card, close button, preset row) handle its own Enter.
      if (e.target.closest?.('button, a[href], select, summary, [role="button"], [tabindex]:not(.modal-overlay)')) return;
      e.preventDefault(); $('#btnLauncherRecord').click();
    }
    else if (e.key === 'Escape') { close(true); }
  };
  document.addEventListener('keydown', keyHandler);
}

function resolveTypeLabel(typeId) {
  const builtIn = { copilot: t('settings.preset_copilot'), minutes: t('settings.preset_minutes'), learning: t('settings.preset_learning') };
  if (builtIn[typeId]) return builtIn[typeId];
  return typeId ? typeId.charAt(0).toUpperCase() + typeId.slice(1) : null;
}

/** Inline list (below the secondary row) of the prepared meeting + saved meeting-prep presets. */
function showPrepList(presets, prepared, closeFn) {
  const modal = $('#launcherModal');
  const existing = modal.querySelector('.launcher-preset-list');
  if (existing) { existing.remove(); return; }

  const list = document.createElement('div');
  list.className = 'launcher-preset-list';

  const addItem = (html, onPick, extraClass = '') => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'launcher-preset-item' + extraClass;
    item.innerHTML = html;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      list.remove();
      closeFn();
      onPick();
    });
    list.appendChild(item);
  };

  // Prepared session at top (if exists)
  if (prepared) {
    const typeLabel = resolveTypeLabel(prepared.meetingType || 'copilot');
    const nParticipants = prepared.attendees?.length || 0;
    addItem(
      `<span>📌 ${escapeHtml(t('prep.prepared_meeting'))}${nParticipants ? ' · ' + t('prep.n_participants', { n: nParticipants }) : ''}</span>${typeLabel ? `<span class="launcher-preset-item-type">${escapeHtml(typeLabel)}</span>` : ''}`,
      () => { deletePreparedMeeting(); emit('meetingPrep:complete', prepared); },
      ' launcher-preset-prepared',
    );
  }

  // Saved meeting-prep presets
  if (presets.length > 0) {
    const header = document.createElement('div');
    header.className = 'launcher-preset-section';
    header.textContent = t('prep.title') || 'Meeting Prep';
    list.appendChild(header);
  }
  presets.forEach((p, i) => {
    const name = p.name || `Preset ${i + 1}`;
    const typeLabel = p.meetingType ? resolveTypeLabel(p.meetingType) : null;
    const typeBadge = typeLabel ? `<span class="launcher-preset-item-type">${escapeHtml(typeLabel)}</span>` : '';
    addItem(`<span>${escapeHtml(name)}</span>${typeBadge}`, () => openMeetingPrepForm(p));
  });

  $('#btnLauncherPreset').closest('.launcher-more-row').after(list);
}
