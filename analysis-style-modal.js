// analysis-style-modal.js - Analysis style change modal (3-card menu)
// Links to: preset selection, AI prompt adjustment, analysis history

import { state, emit, on } from './event-bus.js';
import { saveSettings, loadCustomTypes } from './storage.js';
import { getPromptForType } from './ai.js';
import { t, getDateLocale } from './i18n.js';
import { openPromptAdjuster } from './prompt-adjuster.js';
import { pushStyleHistory } from './style-history.js';
import { createPresetSaveForm } from './preset-save.js';
import { renderAnalysis } from './ui/analysis.js';

const $ = (sel) => document.querySelector(sel);

// ===== Main Modal =====
function closeMain() {
  const modal = $('#analysisStyleModal');
  if (modal) modal.hidden = true;
}

function openMain() {
  const modal = $('#analysisStyleModal');
  if (!modal) return;
  modal.hidden = false;
}

// ===== 1. Presets Sub-modal =====
function openPresetsModal() {
  closeMain();
  const modal = $('#asmPresetsModal');
  if (!modal) return;
  modal.hidden = false;
  renderPresets();
  updateSaveButtonVisibility();
}

function closePresetsModal() {
  const modal = $('#asmPresetsModal');
  if (modal) modal.hidden = true;
}

function renderPresets() {
  const container = $('#asmPresets');
  if (!container) return;
  container.innerHTML = '';
  container.className = 'asm-presets-layout'; // new grid layout

  const currentPreset = state.settings.meetingPreset || 'copilot';

  const createCard = (p, isCustom) => {
    const btn = document.createElement('button');
    btn.className = `btn asm-preset-card ${currentPreset === p.id ? 'active' : ''} ${isCustom ? 'custom' : ''}`;
    
    let icon = isCustom ? '🔖' : '';
    if (!isCustom) {
      if (p.id === 'copilot') icon = '🎯';
      else if (p.id === 'minutes') icon = '📋';
      else if (p.id === 'learning') icon = '📚';
    }

    const label = p.label || p.name;
    const desc = p.desc || p.context || p.guidance || '';

    btn.innerHTML = `
      <div class="asm-preset-card-icon">${icon}</div>
      <div class="asm-preset-card-text">
        <span class="asm-preset-card-title">${label}</span>
        <span class="asm-preset-card-desc" title="${desc.replace(/"/g, '&quot;')}">${desc.substring(0, 60)}${desc.length > 60 ? '...' : ''}</span>
      </div>
      <div class="asm-preset-card-check">${currentPreset === p.id ? '✓' : ''}</div>
    `;
    btn.addEventListener('click', () => selectPreset(p.id));
    return btn;
  };

  // Built-in presets
  const builtIn = [
    { id: 'copilot', label: t('settings.preset_copilot'), desc: t('settings.preset_copilot_desc') },
    { id: 'minutes', label: t('settings.preset_minutes'), desc: t('settings.preset_minutes_desc') },
    { id: 'learning', label: t('settings.preset_learning'), desc: t('settings.preset_learning_desc') },
  ];

  const sectionBuiltIn = document.createElement('div');
  sectionBuiltIn.className = 'asm-preset-section';
  sectionBuiltIn.innerHTML = `<div class="asm-preset-section-title">${t('asm.builtin_styles') || 'Built-in Styles'}</div>`;
  
  const gridBuiltIn = document.createElement('div');
  gridBuiltIn.className = 'asm-preset-cards';
  builtIn.forEach(p => gridBuiltIn.appendChild(createCard(p, false)));
  sectionBuiltIn.appendChild(gridBuiltIn);
  container.appendChild(sectionBuiltIn);

  // Custom presets
  const customTypes = loadCustomTypes();
  if (customTypes.length > 0) {
    const sectionCustom = document.createElement('div');
    sectionCustom.className = 'asm-preset-section';
    sectionCustom.innerHTML = `<div class="asm-preset-section-title">${t('asm.saved_styles') || 'Saved Styles'}</div>`;
    
    const gridCustom = document.createElement('div');
    gridCustom.className = 'asm-preset-cards';
    
    customTypes.forEach(ct => {
      const card = createCard(ct, true);
      
      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-icon asm-preset-del';
      delBtn.innerHTML = '&times;';
      delBtn.title = 'Delete';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(t('asm.confirm_delete') || '정말 이 분석 스타일을 삭제하시겠습니까?')) {
          let allCustom = loadCustomTypes();
          allCustom = allCustom.filter(c => c.id !== ct.id);
          localStorage.setItem('meetingAI_customTypes', JSON.stringify(allCustom));
          if (state.settings.meetingPreset === ct.id) {
             selectPreset('copilot'); // fallback
          }
          emit('customTypes:change');
        }
      });
      card.appendChild(delBtn);
      
      gridCustom.appendChild(card);
    });
    sectionCustom.appendChild(gridCustom);
    container.appendChild(sectionCustom);
  }
}

function selectPreset(presetId) {
  pushStyleHistory(state.settings.meetingPreset, state.settings.customPrompt, 'dropdown');

  state.settings.meetingPreset = presetId;
  state.settings.customPrompt = getPromptForType(presetId);
  emit('customPrompt:change');

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

  if (state.transcript.length > 0) {
    emit('analysis:rerun');
  }

  closePresetsModal();
}

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

  const modal = $('#asmSaveModal');
  const container = $('#asmSaveFormContainer');
  if (!modal || !container) return;

  modal.hidden = false;
  container.innerHTML = '';

  createPresetSaveForm(container, promptText, {
    onSaved(newPreset) {
      state.settings.meetingPreset = newPreset.id;
      saveSettings(state.settings);
      emit('customTypes:change');
      modal.hidden = true;
    },
    onCancel() {
      modal.hidden = true;
    },
  });
}

// ===== 2. AI Chat =====
function handleOpenAiChat() {
  closeMain();
  openPromptAdjuster();
}

// ===== 3. History Sub-modal =====
function openHistoryModal() {
  closeMain();
  const modal = $('#asmHistoryModal');
  if (!modal) return;
  modal.hidden = false;
  renderAnalysisHistoryList();
}

function closeHistoryModal() {
  const modal = $('#asmHistoryModal');
  if (modal) modal.hidden = true;
}

function renderAnalysisHistoryList() {
  const container = $('#asmHistoryList');
  if (!container) return;
  container.innerHTML = '';

  const history = state.analysisHistory;
  if (!history || history.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'asm-history-empty';
    emptyMsg.textContent = t('asm.history_empty');
    container.appendChild(emptyMsg);
    return;
  }

  const items = [...history].map((a, idx) => ({ analysis: a, originalIdx: idx }));
  items.reverse();
  const limited = items.slice(0, 20);

  limited.forEach(({ analysis, originalIdx }) => {
    const item = document.createElement('div');
    item.className = 'asm-history-item';

    const time = analysis.timestamp
      ? new Date(analysis.timestamp).toLocaleTimeString(getDateLocale(), { hour: '2-digit', minute: '2-digit' })
      : '';

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
      closeHistoryModal();
    });

    container.appendChild(item);
  });
}

function navigateToAnalysis(idx) {
  const history = state.analysisHistory;
  if (!history || idx < 0 || idx >= history.length) return;
  renderAnalysis(history[idx]);
}

// ===== Init =====
export function initAnalysisStyleModal() {
  // Main modal
  $('#asmCloseBtn')?.addEventListener('click', closeMain);
  $('#analysisStyleModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'analysisStyleModal') closeMain();
  });

  // Open main modal
  $('#btnPromptSettings')?.addEventListener('click', openMain);

  // 3 card buttons
  $('#asmOpenPresets')?.addEventListener('click', openPresetsModal);
  $('#asmOpenAiChat')?.addEventListener('click', handleOpenAiChat);
  $('#asmOpenHistory')?.addEventListener('click', openHistoryModal);

  // Presets sub-modal
  $('#asmPresetsCloseBtn')?.addEventListener('click', closePresetsModal);
  $('#asmPresetsModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'asmPresetsModal') closePresetsModal();
  });
  
  // Save Style button (now in panel header)
  $('#asmSaveStyle')?.addEventListener('click', handleSaveStyle);
  
  // Save Modal (new)
  $('#asmSaveCloseBtn')?.addEventListener('click', () => {
    const m = $('#asmSaveModal');
    if (m) m.hidden = true;
  });
  $('#asmSaveModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'asmSaveModal') e.target.hidden = true;
  });

  // History sub-modal
  $('#asmHistoryCloseBtn')?.addEventListener('click', closeHistoryModal);
  $('#asmHistoryModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'asmHistoryModal') closeHistoryModal();
  });

  // ESC key — close any open modal
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#asmHistoryModal')?.hidden) { closeHistoryModal(); return; }
    if (!$('#asmPresetsModal')?.hidden) { closePresetsModal(); return; }
    if (!$('#asmSaveModal')?.hidden) { $('#asmSaveModal').hidden = true; return; }
    if (!$('#analysisStyleModal')?.hidden) { closeMain(); }
  });

  // Refresh presets on change
  on('customTypes:change', () => {
    if ($('#asmPresetsModal') && !$('#asmPresetsModal').hidden) renderPresets();
  });

  on('customPrompt:change', updateSaveButtonVisibility);
}
