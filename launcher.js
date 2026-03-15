// launcher.js - Launcher Modal

import { state, emit } from './event-bus.js';
import { t } from './i18n.js';
import { saveSettings, loadMeetingPrepPresets, loadPreparedMeeting, deletePreparedMeeting } from './storage.js';
import { showToast } from './ui.js';
import { openMeetingPrepForm } from './meeting-prep.js';
import { openPromptBuilder } from './prompt-builder.js';
import { escapeHtml } from './utils.js';

const $ = (sel) => document.querySelector(sel);

// ===== Launcher Modal =====
export function showLauncherModal() {
  const modal = $('#launcherModal');
  if (!modal) return;

  // Show welcome section for first visit
  const welcome = $('#launcherWelcome');
  if (welcome) welcome.hidden = !!state.settings.welcomeDismissed;

  modal.hidden = false;

  const close = () => {
    modal.hidden = true;
    if (!state.settings.welcomeDismissed) {
      state.settings.welcomeDismissed = true;
      saveSettings(state.settings);
    }
    document.removeEventListener('keydown', keyHandler);
  };

  // Card click handlers
  $('#btnLauncherQuickStart').onclick = async () => {
    close();
    state.settings.meetingPreset = 'copilot';
    emit('recording:toggle');
  };

  $('#btnLauncherAiSetup').onclick = () => {
    close();
    openPromptBuilder();
  };

  $('#btnLauncherMeetingPrep').onclick = () => {
    close();
    openMeetingPrepForm();
  };

  // Card 3: Preset
  const presets = loadMeetingPrepPresets();
  const presetCard = $('#btnLauncherPreset');
  const presetHint = presetCard.querySelector('.launcher-card-hint');
  if (!presets.length) {
    presetCard.classList.add('launcher-card-disabled');
    presetCard.disabled = true;
    if (presetHint) presetHint.hidden = false;
  } else {
    presetCard.classList.remove('launcher-card-disabled');
    presetCard.disabled = false;
    if (presetHint) presetHint.hidden = true;
  }
  presetCard.onclick = () => {
    if (!presets.length) return;
    showPresetDropdown(presets, close);
  };

  // 4th card: Prepared meeting (if exists)
  const existingPrepCard = document.querySelector('.launcher-card-prepared');
  if (existingPrepCard) existingPrepCard.remove();

  const prepared = loadPreparedMeeting();
  if (prepared) {
    const grid = document.querySelector('.launcher-actions-grid');
    const card = document.createElement('button');
    card.className = 'launcher-card launcher-card-prepared';
    card.id = 'btnLauncherPrepared';
    const typeLabel = prepared.meetingType || 'copilot';
    const nParticipants = prepared.attendees?.length || 0;
    card.innerHTML = `
      <span class="launcher-card-badge">5</span>
      <span class="launcher-card-icon">&#128204;</span>
      <span class="launcher-card-label">${t('prep.prepared_meeting')}</span>
      <span class="launcher-card-desc">${typeLabel}${nParticipants ? ' \u00b7 ' + t('prep.n_participants', { n: nParticipants }) : ''}</span>
    `;
    card.onclick = async () => {
      close();
      deletePreparedMeeting();
      emit('meetingPrep:complete', prepared);
    };
    grid.appendChild(card);
  }

  $('#launcherCloseBtn').onclick = close;

  // Keyboard shortcuts: 1, 2, 3, 4, 5, ESC
  const keyHandler = (e) => {
    if (modal.hidden) return;
    if (e.target.matches('input, textarea, [contenteditable]')) return;
    if (e.key === '1') { e.preventDefault(); $('#btnLauncherQuickStart').click(); }
    else if (e.key === '2') { e.preventDefault(); $('#btnLauncherAiSetup').click(); }
    else if (e.key === '3') { e.preventDefault(); $('#btnLauncherMeetingPrep').click(); }
    else if (e.key === '4') { e.preventDefault(); $('#btnLauncherPreset').click(); }
    else if (e.key === '5') {
      e.preventDefault();
      const prepBtn = $('#btnLauncherPrepared');
      if (prepBtn) prepBtn.click();
    }
    else if (e.key === 'Escape') { close(); }
  };
  document.addEventListener('keydown', keyHandler);
}

function showPresetDropdown(presets, closeFn) {
  // Remove existing dropdown
  const existing = document.querySelector('.launcher-preset-list');
  if (existing) { existing.remove(); return; }

  const card = $('#btnLauncherPreset');
  card.style.position = 'relative';
  const list = document.createElement('div');
  list.className = 'launcher-preset-list';
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
