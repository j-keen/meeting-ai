// launcher.js - Launcher Modal

import { state, emit } from './event-bus.js';
import { t } from './i18n.js';
import { saveSettings, loadMeetingPrepPresets, loadPreparedMeeting, deletePreparedMeeting, loadCustomTypes } from './storage.js';
import { showToast, showTranscriptIdle, showAiIdle, showChatIdle } from './ui.js';
import { openMeetingPrepForm } from './meeting-prep.js';
import { openPromptBuilder } from './prompt-builder.js';
import { openDeepSetup } from './deep-setup.js';
import { escapeHtml } from './utils.js';

const $ = (sel) => document.querySelector(sel);

// ===== Launcher Modal =====
export function showLauncherModal() {
  const modal = $('#launcherModal');
  if (!modal) return;


  modal.hidden = false;

  const close = (showIdle) => {
    modal.hidden = true;
    document.removeEventListener('keydown', keyHandler);
    if (showIdle && !state.isRecording) {
      showTranscriptIdle();
      showAiIdle();
      showChatIdle();
    }
  };

  // Card 1: Quick Start (opens prompt builder)
  $('#btnLauncherQuickStart').onclick = () => {
    close();
    openPromptBuilder();
  };

  // Card 2: Deep Setup (경청 준비)
  $('#btnLauncherDeepSetup').onclick = () => {
    close();
    openDeepSetup();
  };

  // Card 3: Preset
  const presets = loadMeetingPrepPresets();
  const prepared = loadPreparedMeeting();
  const customTypes = loadCustomTypes();
  const hasPresets = presets.length > 0 || prepared || customTypes.length > 0;
  const presetCard = $('#btnLauncherPreset');
  const presetHint = presetCard.querySelector('.launcher-card-hint');
  if (!hasPresets) {
    presetCard.classList.add('launcher-card-disabled');
    presetCard.disabled = true;
    if (presetHint) presetHint.hidden = false;
  } else {
    presetCard.classList.remove('launcher-card-disabled');
    presetCard.disabled = false;
    if (presetHint) presetHint.hidden = true;
  }
  presetCard.onclick = () => {
    if (!hasPresets) return;
    showPresetDropdown(presets, prepared, customTypes, close);
  };

  $('#launcherCloseBtn').onclick = () => close(true);

  // Keyboard shortcuts: 1, 2, 3, ESC
  const keyHandler = (e) => {
    if (modal.hidden) return;
    if (e.target.matches('input, textarea, [contenteditable]')) return;
    if (e.key === '1') { e.preventDefault(); $('#btnLauncherQuickStart').click(); }
    else if (e.key === '2') { e.preventDefault(); $('#btnLauncherDeepSetup').click(); }
    else if (e.key === '3') { e.preventDefault(); $('#btnLauncherPreset').click(); }
    else if (e.key === 'Escape') { close(true); }
  };
  document.addEventListener('keydown', keyHandler);
}

function showPresetDropdown(presets, prepared, customTypes, closeFn) {
  // Remove existing dropdown
  const existing = document.querySelector('.launcher-preset-list');
  if (existing) { existing.remove(); return; }

  const card = $('#btnLauncherPreset');
  card.style.position = 'relative';
  const list = document.createElement('div');
  list.className = 'launcher-preset-list';

  // Prepared session at top (if exists)
  if (prepared) {
    const item = document.createElement('div');
    item.className = 'launcher-preset-item launcher-preset-prepared';
    const typeLabel = prepared.meetingType || 'copilot';
    const nParticipants = prepared.attendees?.length || 0;
    item.innerHTML = `<span>📌 ${escapeHtml(t('prep.prepared_meeting'))}${nParticipants ? ' · ' + t('prep.n_participants', { n: nParticipants }) : ''}</span><span class="launcher-preset-item-type">${typeLabel}</span>`;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      list.remove();
      closeFn();
      deletePreparedMeeting();
      emit('meetingPrep:complete', prepared);
    });
    list.appendChild(item);
  }

  // Custom type presets
  customTypes.forEach((ct) => {
    const item = document.createElement('div');
    item.className = 'launcher-preset-item';
    const name = ct.label || ct.name || ct.id;
    item.innerHTML = `<span>${escapeHtml(name)}</span><span class="launcher-preset-item-type">${escapeHtml(ct.id)}</span>`;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      list.remove();
      closeFn();
      state.settings.meetingPreset = ct.id;
      saveSettings(state.settings);
      emit('startRecording');
    });
    list.appendChild(item);
  });

  // Regular presets (meeting prep)
  presets.forEach((p, i) => {
    const item = document.createElement('div');
    item.className = 'launcher-preset-item';
    const name = p.name || `Preset ${i + 1}`;
    const typeBadge = p.meetingType ? `<span class="launcher-preset-item-type">${p.meetingType}</span>` : '';
    item.innerHTML = `<span>${escapeHtml(name)}</span>${typeBadge}`;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      list.remove();
      closeFn();
      openMeetingPrepForm(p);
    });
    list.appendChild(item);
  });
  card.appendChild(list);

  // Close on outside click
  const outsideHandler = (e) => {
    if (!list.contains(e.target) && e.target !== card) {
      list.remove();
      document.removeEventListener('click', outsideHandler);
    }
  };
  setTimeout(() => document.addEventListener('click', outsideHandler), 0);
}
