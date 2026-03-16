// style-history.js - Analysis style history & restore module

import { state, emit } from './event-bus.js';
import { saveSettings } from './storage.js';
import { getPromptForType } from './ai.js';
import { showToast } from './ui.js';
import { t, getAiLanguage } from './i18n.js';

const $ = (sel) => document.querySelector(sel);
const STORAGE_KEY = 'meeting-ai-style-history';
const MAX_HISTORY = 200;

// ===== Storage =====
function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

function saveHistory(history) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
}

// ===== Public: push to history =====
export function pushStyleHistory(presetId, customPrompt, source = 'manual') {
  const history = loadHistory();
  const label = getPresetLabel(presetId);
  history.unshift({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    presetId,
    label,
    prompt: customPrompt || getPromptForType(presetId || 'copilot'),
    source,
    timestamp: Date.now(),
  });
  saveHistory(history);
  updateBadge();
}

function getPresetLabel(presetId) {
  if (!presetId) return 'Custom';
  const opt = $(`#selectAnalysisStyle option[value="${presetId}"]`);
  if (opt) return opt.textContent;
  if (presetId.startsWith('custom_')) return presetId.replace('custom_', '');
  return presetId.charAt(0).toUpperCase() + presetId.slice(1);
}

// ===== Badge =====
function updateBadge() {
  const btn = $('#btnStyleHistory');
  if (!btn) return;
  const count = loadHistory().length;
  let badge = btn.querySelector('.sh-badge');
  if (count > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'sh-badge';
      btn.appendChild(badge);
    }
    badge.textContent = count;
  } else if (badge) {
    badge.remove();
  }
}

// ===== Modal =====
function formatTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return time;
  const month = d.getMonth() + 1;
  const day = d.getDate();
  return `${month}/${day} ${time}`;
}

function sourceIcon(source) {
  switch (source) {
    case 'dropdown': return '📋';
    case 'adjuster': return '🎯';
    case 'prep': return '📝';
    case 'builder': return '🔧';
    default: return '📋';
  }
}

function truncatePrompt(text, len = 80) {
  if (!text) return '';
  const oneLine = text.replace(/\n/g, ' ').trim();
  return oneLine.length > len ? oneLine.slice(0, len) + '…' : oneLine;
}

export function openStyleHistory() {
  const modal = $('#styleHistoryModal');
  if (!modal) return;
  modal.hidden = false;
  renderHistoryList();
}

function closeModal() {
  const modal = $('#styleHistoryModal');
  if (modal) modal.hidden = true;
}

function renderHistoryList() {
  const container = $('#shList');
  if (!container) return;

  const history = loadHistory();
  const ko = getAiLanguage() === 'ko';

  if (history.length === 0) {
    container.innerHTML = `<div class="sh-empty">${t('sh.empty')}</div>`;
    renderCurrentPrompt();
    return;
  }

  renderCurrentPrompt();

  const listEl = document.createElement('div');
  listEl.className = 'sh-history-list';

  history.forEach((entry, idx) => {
    const item = document.createElement('div');
    item.className = 'sh-item';
    item.innerHTML = `
      <div class="sh-item-header">
        <span class="sh-item-icon">${sourceIcon(entry.source)}</span>
        <span class="sh-item-label">${entry.label || 'Custom'}</span>
        <span class="sh-item-time">${formatTime(entry.timestamp)}</span>
      </div>
      <div class="sh-item-preview">${truncatePrompt(entry.prompt)}</div>
      <div class="sh-item-actions">
        <button class="btn btn-sm btn-primary sh-restore-btn" data-idx="${idx}">${t('sh.restore')}</button>
        <button class="btn btn-sm btn-outline sh-restore-reanalyze-btn" data-idx="${idx}">${t('sh.restore_reanalyze')}</button>
        <button class="btn btn-sm sh-view-btn" data-idx="${idx}" title="${t('sh.view')}">${ko ? '보기' : 'View'}</button>
        <button class="btn btn-sm sh-delete-btn" data-idx="${idx}" title="${t('sh.delete')}">✕</button>
      </div>
    `;
    listEl.appendChild(item);
  });

  // Clear existing list
  const existingList = container.querySelector('.sh-history-list');
  if (existingList) existingList.remove();
  container.appendChild(listEl);

  // Clear all button
  let clearRow = container.querySelector('.sh-clear-row');
  if (!clearRow) {
    clearRow = document.createElement('div');
    clearRow.className = 'sh-clear-row';
    container.appendChild(clearRow);
  }
  clearRow.innerHTML = `<button class="btn btn-sm sh-clear-all-btn">${t('sh.clear_all')}</button>`;
  clearRow.querySelector('.sh-clear-all-btn').addEventListener('click', () => {
    if (confirm(ko ? '모든 이력을 삭제하시겠습니까?' : 'Clear all history?')) {
      saveHistory([]);
      updateBadge();
      renderHistoryList();
    }
  });

  // Event delegation
  listEl.addEventListener('click', (e) => {
    const restoreBtn = e.target.closest('.sh-restore-btn');
    const restoreReanalyzeBtn = e.target.closest('.sh-restore-reanalyze-btn');
    const viewBtn = e.target.closest('.sh-view-btn');
    const deleteBtn = e.target.closest('.sh-delete-btn');

    if (restoreBtn) {
      restoreEntry(parseInt(restoreBtn.dataset.idx), false);
    } else if (restoreReanalyzeBtn) {
      restoreEntry(parseInt(restoreReanalyzeBtn.dataset.idx), true);
    } else if (viewBtn) {
      viewEntry(parseInt(viewBtn.dataset.idx));
    } else if (deleteBtn) {
      deleteEntry(parseInt(deleteBtn.dataset.idx));
    }
  });
}

function renderCurrentPrompt() {
  const container = $('#shCurrentPrompt');
  if (!container) return;
  const currentPrompt = state.settings.customPrompt || getPromptForType(state.settings.meetingPreset || 'copilot');
  const presetLabel = getPresetLabel(state.settings.meetingPreset);
  container.innerHTML = `
    <div class="sh-current-header">
      <span class="sh-current-label">${t('sh.current')}</span>
      <span class="sh-current-preset">${presetLabel}</span>
    </div>
    <div class="sh-current-text">${truncatePrompt(currentPrompt, 150)}</div>
    <button class="btn btn-sm sh-view-current-btn">${t('sh.view_full')}</button>
  `;
  container.querySelector('.sh-view-current-btn').addEventListener('click', () => {
    showPromptDetail(currentPrompt, presetLabel, t('sh.current'));
  });
}

function showPromptDetail(prompt, label, title) {
  const container = $('#shDetail');
  const list = $('#shList');
  if (!container || !list) return;

  list.style.display = 'none';
  container.style.display = '';
  container.innerHTML = `
    <div class="sh-detail-header">
      <button class="btn btn-sm sh-back-btn">← ${t('sh.back')}</button>
      <span class="sh-detail-title">${title}: ${label}</span>
    </div>
    <pre class="sh-detail-prompt">${escapeHtml(prompt)}</pre>
  `;
  container.querySelector('.sh-back-btn').addEventListener('click', () => {
    container.style.display = 'none';
    list.style.display = '';
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function restoreEntry(idx, reanalyze) {
  const history = loadHistory();
  const entry = history[idx];
  if (!entry) return;

  // Push current state to history before restoring
  pushStyleHistory(
    state.settings.meetingPreset,
    state.settings.customPrompt,
    'restore'
  );

  state.settings.customPrompt = entry.prompt;
  if (entry.presetId) {
    state.settings.meetingPreset = entry.presetId;
    const select = $('#selectAnalysisStyle');
    if (select) select.value = entry.presetId;
  }
  emit('customPrompt:change');
  saveSettings(state.settings);

  const ko = getAiLanguage() === 'ko';
  showToast(ko ? `"${entry.label}" 스타일로 복원했습니다` : `Restored to "${entry.label}" style`, 'success');
  closeModal();

  if (reanalyze) {
    showToast(t('pa.reanalyzing'), 'info');
    emit('promptAdjuster:reanalyze');
  }
}

function viewEntry(idx) {
  const history = loadHistory();
  const entry = history[idx];
  if (!entry) return;
  showPromptDetail(entry.prompt, entry.label, formatTime(entry.timestamp));
}

function deleteEntry(idx) {
  const history = loadHistory();
  history.splice(idx, 1);
  saveHistory(history);
  updateBadge();
  renderHistoryList();
}

// ===== Init =====
export function initStyleHistory() {
  // Close button
  $('#shCloseBtn')?.addEventListener('click', closeModal);

  // Overlay click
  $('#styleHistoryModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'styleHistoryModal') closeModal();
  });

  // History button
  $('#btnStyleHistory')?.addEventListener('click', () => {
    openStyleHistory();
  });

  // Update badge on load
  updateBadge();
}
