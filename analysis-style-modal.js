// analysis-style-modal.js - Unified analysis style modal
// Combines preset selection, AI prompt adjustment, and analysis history navigation

import { state, emit, on } from './event-bus.js';
import { saveSettings, loadCustomTypes } from './storage.js';
import { getPromptForType } from './ai.js';
import { t, getAiLanguage, getDateLocale } from './i18n.js';
import { openPromptAdjuster } from './prompt-adjuster.js';
import { pushStyleHistory } from './style-history.js';
import { createPresetSaveForm } from './preset-save.js';
import { renderAnalysisInto } from './ui/analysis.js';

const $ = (sel) => document.querySelector(sel);

function isKorean() {
  return getAiLanguage() === 'ko';
}

// ===== Modal Control =====
function closeModal() {
  const modal = $('#analysisStyleModal');
  if (modal) modal.hidden = true;
}

export function openAnalysisStyleModal() {
  const modal = $('#analysisStyleModal');
  if (!modal) return;
  modal.hidden = false;
  renderPresets();
  renderAnalysisHistoryList();
  updateSaveButtonVisibility();
}

// ===== 1. Presets Section =====
function renderPresets() {
  const container = $('#asmPresets');
  if (!container) return;
  container.innerHTML = '';

  const currentPreset = state.settings.meetingPreset || 'copilot';

  // Built-in presets
  const builtIn = [
    { id: 'copilot', label: t('settings.preset_copilot'), desc: t('settings.preset_copilot_desc') },
    { id: 'minutes', label: t('settings.preset_minutes'), desc: t('settings.preset_minutes_desc') },
    { id: 'learning', label: t('settings.preset_learning'), desc: t('settings.preset_learning_desc') },
  ];

  // Built-in preset chips
  const builtInRow = document.createElement('div');
  builtInRow.className = 'asm-preset-row';
  builtIn.forEach(p => {
    const chip = document.createElement('button');
    chip.className = 'asm-preset-chip' + (currentPreset === p.id ? ' active' : '');
    chip.title = p.desc;
    chip.innerHTML = `<span class="asm-preset-check">${currentPreset === p.id ? '✓' : ''}</span>${p.label}`;
    chip.addEventListener('click', () => selectPreset(p.id));
    builtInRow.appendChild(chip);
  });
  container.appendChild(builtInRow);

  // Custom presets
  const customTypes = loadCustomTypes();
  if (customTypes.length > 0) {
    const customLabel = document.createElement('div');
    customLabel.className = 'asm-custom-label';
    customLabel.textContent = isKorean() ? '저장한 스타일' : 'Saved Styles';
    container.appendChild(customLabel);

    const customRow = document.createElement('div');
    customRow.className = 'asm-preset-row asm-preset-row-custom';
    customTypes.forEach(ct => {
      const chip = document.createElement('button');
      chip.className = 'asm-preset-chip asm-preset-custom' + (currentPreset === ct.id ? ' active' : '');
      chip.title = ct.context || ct.guidance || '';
      chip.innerHTML = `<span class="asm-preset-check">${currentPreset === ct.id ? '✓' : ''}</span>${ct.name}`;
      chip.addEventListener('click', () => selectPreset(ct.id));
      customRow.appendChild(chip);
    });
    container.appendChild(customRow);
  }
}

function selectPreset(presetId) {
  // Save current style to history before changing
  pushStyleHistory(state.settings.meetingPreset, state.settings.customPrompt, 'dropdown');

  state.settings.meetingPreset = presetId;
  state.settings.customPrompt = getPromptForType(presetId);
  emit('customPrompt:change');

  // Apply extended custom type fields
  if (presetId.startsWith('custom_')) {
    const customTypes = loadCustomTypes();
    const ct = customTypes.find(c => c.id === presetId);
    if (ct) {
      if (ct.chatSystemPrompt) state.settings.chatSystemPrompt = ct.chatSystemPrompt;
      if (ct.chatPresets?.length) state.settings.chatPresets = ct.chatPresets;
      if (ct.memoHint) {
        const ph = $('#memoPlaceholder');
        if (ph) ph.textContent = ct.memoHint;
      }
      if (ct.context) state.settings.meetingContext = ct.context;
    }
  }

  saveSettings(state.settings);

  // If has transcript, run analysis immediately
  if (state.transcript.length > 0) {
    emit('analysis:rerun');
  }

  closeModal();
}

// ===== Save Style Button =====
function updateSaveButtonVisibility() {
  const btn = $('#asmSaveStyle');
  if (!btn) return;
  const defaultPrompt = getPromptForType(state.settings.meetingPreset);
  const isCustomized = state.settings.customPrompt && state.settings.customPrompt !== defaultPrompt;
  btn.style.display = isCustomized ? '' : 'none';
}

function handleSaveStyle() {
  const promptText = state.settings.customPrompt;
  if (!promptText) return;

  // Show name input inline
  const container = $('#asmSaveFormContainer');
  if (!container) return;
  container.hidden = false;

  createPresetSaveForm(container, promptText, {
    onSaved(newPreset) {
      state.settings.meetingPreset = newPreset.id;
      saveSettings(state.settings);
      emit('customTypes:change');
      container.hidden = true;
      closeModal();
    },
    onCancel() {
      container.hidden = true;
    },
  });
}

// ===== 2. AI Chat Section =====
function handleOpenAiChat() {
  closeModal();
  openPromptAdjuster();
}

// ===== 3. Analysis History Section =====
function renderAnalysisHistoryList() {
  const container = $('#asmHistoryList');
  if (!container) return;
  container.innerHTML = '';

  const history = state.analysisHistory;
  if (!history || history.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'asm-history-empty';
    emptyMsg.textContent = isKorean() ? '아직 분석 결과가 없습니다' : 'No analysis results yet';
    container.appendChild(emptyMsg);
    return;
  }

  // Show most recent first, limit to 20
  const items = [...history].map((a, idx) => ({ analysis: a, originalIdx: idx }));
  items.reverse();
  const limited = items.slice(0, 20);

  limited.forEach(({ analysis, originalIdx }) => {
    const item = document.createElement('div');
    item.className = 'asm-history-item';

    const time = analysis.timestamp
      ? new Date(analysis.timestamp).toLocaleTimeString(getDateLocale(), { hour: '2-digit', minute: '2-digit' })
      : '';

    // Extract preview text
    let preview = '';
    if (analysis.flow) {
      preview = analysis.flow;
    } else if (analysis.markdown) {
      const firstLine = analysis.markdown.split('\n').find(l => l.trim() && !l.startsWith('#'));
      preview = (firstLine || '').slice(0, 60);
    } else if (analysis.summary) {
      preview = (typeof analysis.summary === 'string' ? analysis.summary : '').slice(0, 60);
    }

    const numSpan = document.createElement('span');
    numSpan.className = 'asm-history-num';
    numSpan.textContent = `#${originalIdx + 1}`;

    const timeSpan = document.createElement('span');
    timeSpan.className = 'asm-history-time';
    timeSpan.textContent = time;

    const previewSpan = document.createElement('span');
    previewSpan.className = 'asm-history-preview';
    previewSpan.textContent = preview;

    item.appendChild(numSpan);
    item.appendChild(timeSpan);
    item.appendChild(previewSpan);

    item.addEventListener('click', () => {
      navigateToAnalysis(originalIdx);
      closeModal();
    });

    container.appendChild(item);
  });
}

function navigateToAnalysis(idx) {
  const history = state.analysisHistory;
  if (!history || idx < 0 || idx >= history.length) return;

  const container = $('#aiSections');
  const empty = $('#aiEmpty');
  if (empty) empty.style.display = 'none';

  const analysis = history[idx];
  renderAnalysisInto(container, analysis);
  state.currentAnalysis = analysis;

  // Show copy button
  const copyBtn = $('#btnCopyAnalysis');
  if (copyBtn) copyBtn.style.display = '';
}

// ===== Init =====
export function initAnalysisStyleModal() {
  // Close button
  $('#asmCloseBtn')?.addEventListener('click', closeModal);

  // Overlay click to close
  $('#analysisStyleModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'analysisStyleModal') closeModal();
  });

  // ESC key
  document.addEventListener('keydown', (e) => {
    const modal = $('#analysisStyleModal');
    if (e.key === 'Escape' && modal && !modal.hidden) {
      closeModal();
    }
  });

  // Button to open modal
  $('#btnPromptSettings')?.addEventListener('click', () => {
    openAnalysisStyleModal();
  });

  // AI chat section click
  $('#asmOpenAiChat')?.addEventListener('click', handleOpenAiChat);

  // Save style button
  $('#asmSaveStyle')?.addEventListener('click', handleSaveStyle);

  // Refresh presets when custom types change
  on('customTypes:change', () => {
    const modal = $('#analysisStyleModal');
    if (modal && !modal.hidden) {
      renderPresets();
    }
  });

  on('customPrompt:change', () => {
    updateSaveButtonVisibility();
  });
}
