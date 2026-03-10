// settings.js - Settings panel management (manual save)

import { state, emit } from './app.js';
import {
  saveSettings, loadSettings, saveApiKey, getApiKey,
  listMeetings, getMeeting,
  loadTypoDict, resetTypoDict,
  loadContacts, addContact, deleteContact,
  loadLocations, addLocation, deleteLocation,
  loadCategories, addCategory, deleteCategory,
} from './storage.js';
import { getDefaultPrompt, getPresetContext } from './ai.js';
import { t, setLanguage, setAiLanguage } from './i18n.js';


const $ = (sel) => document.querySelector(sel);

// ===== Dirty state tracking =====
let settingsSnapshot = null;
let isDirty = false;

function snapshotSettings() {
  settingsSnapshot = JSON.parse(JSON.stringify(state.settings));
  isDirty = false;
  updateDirtyUI();
  clearAllHighlights();
}

function markDirty() {
  isDirty = true;
  updateDirtyUI();
}

function updateDirtyUI() {
  const saveBtn = $('#btnSettingsSave');
  const unsavedText = $('#settingsUnsavedText');
  if (saveBtn) saveBtn.disabled = !isDirty;
  if (unsavedText) {
    if (isDirty) unsavedText.classList.add('visible');
    else unsavedText.classList.remove('visible');
  }
}

function highlightField(el) {
  const container = el.closest('.settings-label')
    || el.closest('.settings-inline-row')
    || el.closest('.strategy-card')
    || el.closest('.settings-section');
  if (container) container.classList.add('settings-changed');
}

function clearAllHighlights() {
  document.querySelectorAll('.settings-changed').forEach(el => el.classList.remove('settings-changed'));
}

export function initSettings() {
  const panel = $('#settingsPanel');
  const overlay = $('#settingsOverlay');

  // Open/close
  $('#btnSettings').addEventListener('click', () => openSettings());
  $('#btnSettingsClose').addEventListener('click', () => tryCloseSettings());
  overlay.addEventListener('click', () => tryCloseSettings());

  // Footer buttons
  $('#btnSettingsSave').addEventListener('click', () => saveAllSettings());
  $('#btnSettingsCancel').addEventListener('click', () => tryCloseSettings());
  $('#btnSettingsReset').addEventListener('click', () => resetAllSettings());

  // Highlight changed fields via event delegation
  panel.addEventListener('change', (e) => highlightField(e.target));

  // Ctrl+S to save settings
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 's' && panel.classList.contains('open')) {
      e.preventDefault();
      if (isDirty) saveAllSettings();
    }
  });

  // Load saved values
  loadSavedSettings();

  // Settings tab switching
  document.querySelectorAll('.settings-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.settings-tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const content = document.querySelector(`.settings-tab-content[data-tab="${tab.dataset.tab}"]`);
      if (content) content.classList.add('active');
    });
  });

  // UI Language
  $('#selectUiLanguage').addEventListener('change', (e) => {
    state.settings.uiLanguage = e.target.value;
    setLanguage(e.target.value);
    emit('language:change');
    markDirty();
  });

  // AI Language
  $('#selectAiLanguage').addEventListener('change', (e) => {
    state.settings.aiLanguage = e.target.value;
    setAiLanguage(e.target.value);
    markDirty();
  });

  // API keys
  $('#inputGeminiKey').addEventListener('change', (e) => {
    state.settings.geminiKey = e.target.value;
    markDirty();
  });

  // Gemini Model (Analysis)
  $('#selectGeminiModel').addEventListener('change', (e) => {
    state.settings.geminiModel = e.target.value;
    markDirty();
  });

  // STT language
  $('#selectLanguage').addEventListener('change', (e) => {
    state.settings.language = e.target.value;
    markDirty();
  });

  // Auto Analysis toggle
  $('#checkAutoAnalysis').addEventListener('change', (e) => {
    state.settings.autoAnalysis = e.target.checked;
    markDirty();
  });

  // Analysis Interval (number input)
  $('#inputAnalysisInterval').addEventListener('change', (e) => {
    const val = parseInt(e.target.value) || 30;
    state.settings.analysisInterval = val;
    markDirty();
  });

  // Token strategy (radio cards)
  document.querySelectorAll('input[name="tokenStrategy"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      state.settings.tokenStrategy = e.target.value;
      markDirty();
    });
  });

  // Recent minutes - inline number inputs in strategy cards
  document.querySelectorAll('.settings-number-sm[data-strategy]').forEach(input => {
    input.addEventListener('change', (e) => {
      const val = parseInt(e.target.value) || 5;
      state.settings.recentMinutes = val;
      markDirty();
      // Sync both inputs
      document.querySelectorAll('.settings-number-sm[data-strategy]').forEach(inp => {
        inp.value = val;
      });
    });
  });

  // Meeting preset (in Prompt tab)
  $('#selectMeetingPreset').addEventListener('change', (e) => {
    state.settings.meetingPreset = e.target.value;
    markDirty();
    updatePresetPromptDisplay();
    if (e.target.value !== 'custom') {
      const ctx = getPresetContext(e.target.value);
      $('#textMeetingContext').value = ctx;
      state.settings.meetingContext = ctx;
    }
    // Sync quick start selector
    const qs = $('#selectQuickPreset');
    if (qs) qs.value = e.target.value;
  });

  // Preset prompt display - always show current prompt
  updatePresetPromptDisplay();

  // Edit preset prompt inline
  const btnEditInline = $('#btnEditPresetInline');
  const presetEditor = $('#presetPromptEditor');
  btnEditInline.addEventListener('click', () => {
    const isHidden = presetEditor.hidden;
    presetEditor.hidden = !isHidden;
    if (!isHidden) return;
    const currentPreset = state.settings.meetingPreset || 'general';
    const customPresets = state.settings.customPresets || {};
    const promptText = customPresets[currentPreset] || getPresetContext(currentPreset);
    $('#textPresetPrompt').value = promptText;
  });

  $('#btnSaveAsPreset').addEventListener('click', () => {
    const name = prompt(t('preset.name_prompt') || 'Enter preset name:');
    if (!name) return;
    const promptText = $('#textPresetPrompt').value;
    if (!state.settings.customPresets) state.settings.customPresets = {};
    state.settings.customPresets[name] = promptText;
    markDirty();
    highlightField($('#selectMeetingPreset'));
    addPresetOption(name);
    $('#selectMeetingPreset').value = name;
    state.settings.meetingPreset = name;
    presetEditor.hidden = true;
    updatePresetPromptDisplay();
  });

  $('#btnResetPresetPrompt').addEventListener('click', () => {
    const currentPreset = state.settings.meetingPreset || 'general';
    const defaultCtx = getPresetContext(currentPreset);
    $('#textPresetPrompt').value = defaultCtx;
    if (state.settings.customPresets?.[currentPreset]) {
      delete state.settings.customPresets[currentPreset];
      markDirty();
      highlightField($('#textPresetPrompt'));
    }
    updatePresetPromptDisplay();
  });

  // Meeting context source tabs
  document.querySelectorAll('.context-source-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.context-source-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.context-source-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const content = document.querySelector(`.context-source-content[data-ctx="${tab.dataset.ctx}"]`);
      if (content) content.classList.add('active');
      if (tab.dataset.ctx === 'previous') populatePreviousMeetings();
    });
  });

  // Meeting context (manual)
  $('#textMeetingContext').addEventListener('change', (e) => {
    state.settings.meetingContext = e.target.value;
    markDirty();
  });

  // Previous meeting context
  $('#selectPreviousMeeting').addEventListener('change', (e) => {
    const meetingId = e.target.value;
    const preview = $('#previousMeetingPreview');
    if (!meetingId) { preview.textContent = ''; return; }
    const meeting = getMeeting(meetingId);
    if (meeting) {
      const lastAnalysis = meeting.analysisHistory?.[meeting.analysisHistory.length - 1];
      const summary = lastAnalysis?.summary || t('viewer.no_analysis');
      preview.textContent = summary;
      state.settings.meetingContext = `[Previous Meeting: ${meeting.title || 'Untitled'}]\n${summary}`;
      $('#textMeetingContext').value = state.settings.meetingContext;
      markDirty();
      highlightField($('#textMeetingContext'));
    }
  });

  // File context upload
  $('#fileContextUpload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result;
      $('#fileContextPreview').textContent = text.slice(0, 500) + (text.length > 500 ? '...' : '');
      state.settings.meetingContext = text;
      $('#textMeetingContext').value = text;
      markDirty();
      highlightField($('#textMeetingContext'));
    };
    reader.readAsText(file);
  });

  // Prompt
  $('#textPrompt').addEventListener('change', (e) => {
    state.settings.customPrompt = e.target.value;
    markDirty();
  });
  $('#btnResetPrompt').addEventListener('click', () => {
    const def = getDefaultPrompt();
    $('#textPrompt').value = def;
    state.settings.customPrompt = def;
    markDirty();
    highlightField($('#textPrompt'));
  });

  // Chat System Prompt
  $('#textChatPrompt').addEventListener('change', (e) => {
    state.settings.chatSystemPrompt = e.target.value;
    markDirty();
  });
  $('#btnResetChatPrompt').addEventListener('click', () => {
    $('#textChatPrompt').value = '';
    state.settings.chatSystemPrompt = '';
    markDirty();
    highlightField($('#textChatPrompt'));
  });

  // Typo Dictionary (immediate save - CRUD operation, not settings)
  updateTypoDictCount();
  $('#btnResetTypoDict').addEventListener('click', () => {
    if (confirm(t('confirm.reset_typo_dict') || 'Reset typo dictionary?')) {
      resetTypoDict();
      updateTypoDictCount();
      emit('toast', { message: 'Typo dictionary reset', type: 'success' });
    }
  });

  $('#btnViewTypoDict').addEventListener('click', () => {
    renderTypoDictModal();
    $('#typoDictModal').hidden = false;
  });

  // Slack webhook
  $('#inputSlackWebhook').addEventListener('change', (e) => {
    state.settings.slackWebhook = e.target.value;
    markDirty();
  });

  // Prompt settings shortcut (from AI panel header)
  $('#btnPromptSettings')?.addEventListener('click', () => {
    openSettings();
    // Switch to Prompt tab
    document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.settings-tab-content').forEach(c => c.classList.remove('active'));
    const promptTab = document.querySelector('.settings-tab[data-tab="prompt"]');
    const promptContent = document.querySelector('.settings-tab-content[data-tab="prompt"]');
    if (promptTab) promptTab.classList.add('active');
    if (promptContent) promptContent.classList.add('active');
  });

  // Chat model select
  const chatModelSelect = $('#chatModelSelect');
  if (chatModelSelect) {
    chatModelSelect.value = state.settings.chatModel || 'gemini-2.5-flash';
    chatModelSelect.addEventListener('change', (e) => {
      state.settings.chatModel = e.target.value;
      markDirty();
    });
  }

  // ===== Chat Presets =====
  initChatPresets();

  // ===== Data Tab (immediate save - CRUD operations) =====
  initDataTab();
}

// ===== Save / Revert / Reset =====

function saveAllSettings() {
  const s = state.settings;
  saveSettings({
    uiLanguage: s.uiLanguage,
    aiLanguage: s.aiLanguage,
    geminiModel: s.geminiModel,
    chatModel: s.chatModel,
    language: s.language,
    autoAnalysis: s.autoAnalysis,
    analysisInterval: s.analysisInterval,
    tokenStrategy: s.tokenStrategy,
    recentMinutes: s.recentMinutes,
    meetingPreset: s.meetingPreset,
    meetingContext: s.meetingContext,
    customPrompt: s.customPrompt,
    chatSystemPrompt: s.chatSystemPrompt,
    slackWebhook: s.slackWebhook,
    customPresets: s.customPresets,
    chatPresets: s.chatPresets,
  });
  saveApiKey('gemini', s.geminiKey);
  snapshotSettings();
  emit('toast', { message: t('settings.saved'), type: 'success' });
}

function revertSettings() {
  if (!settingsSnapshot) return;
  const langChanged = state.settings.uiLanguage !== settingsSnapshot.uiLanguage;
  const aiLangChanged = state.settings.aiLanguage !== settingsSnapshot.aiLanguage;

  // Restore state from snapshot
  Object.assign(state.settings, JSON.parse(JSON.stringify(settingsSnapshot)));

  // Re-apply form inputs
  applySettingsToForm();

  // Re-apply side effects if changed
  if (langChanged) {
    setLanguage(state.settings.uiLanguage);
    emit('language:change');
  }
  if (aiLangChanged) {
    setAiLanguage(state.settings.aiLanguage);
  }

  isDirty = false;
  updateDirtyUI();
  clearAllHighlights();
}

function resetAllSettings() {
  if (!confirm(t('settings.reset_confirm'))) return;

  const s = state.settings;
  s.uiLanguage = 'auto';
  s.aiLanguage = 'auto';
  s.geminiKey = '';
  s.geminiModel = 'gemini-2.5-flash';
  s.chatModel = 'gemini-2.5-flash';
  s.language = 'ko';
  s.autoAnalysis = true;
  s.analysisInterval = 30;
  s.tokenStrategy = 'smart';
  s.recentMinutes = 5;
  s.meetingPreset = 'general';
  s.meetingContext = '';
  s.customPrompt = getDefaultPrompt();
  s.chatSystemPrompt = '';
  s.slackWebhook = '';
  s.customPresets = {};
  s.chatPresets = null;

  // Apply to form
  applySettingsToForm();

  // Apply side effects
  setLanguage('auto');
  setAiLanguage('auto');
  emit('language:change');

  markDirty();
  emit('toast', { message: t('settings.reset_done'), type: 'success' });
}

function applySettingsToForm() {
  const s = state.settings;
  $('#selectUiLanguage').value = s.uiLanguage;
  $('#selectAiLanguage').value = s.aiLanguage;
  $('#inputGeminiKey').value = s.geminiKey || '';
  $('#selectGeminiModel').value = s.geminiModel;
  $('#selectLanguage').value = s.language;
  $('#checkAutoAnalysis').checked = s.autoAnalysis;
  $('#inputAnalysisInterval').value = s.analysisInterval;

  const strategyRadio = document.querySelector(`input[name="tokenStrategy"][value="${s.tokenStrategy}"]`);
  if (strategyRadio) strategyRadio.checked = true;

  document.querySelectorAll('.settings-number-sm[data-strategy]').forEach(inp => {
    inp.value = s.recentMinutes;
  });

  const select = $('#selectMeetingPreset');
  Object.keys(s.customPresets || {}).forEach(name => addPresetOption(name));
  select.value = s.meetingPreset;

  const qs = $('#selectQuickPreset');
  if (qs) qs.value = s.meetingPreset;

  $('#textMeetingContext').value = s.meetingContext;
  $('#textPrompt').value = s.customPrompt;
  $('#textChatPrompt').value = s.chatSystemPrompt;
  $('#inputSlackWebhook').value = s.slackWebhook;

  const chatModelSelect = $('#chatModelSelect');
  if (chatModelSelect) chatModelSelect.value = s.chatModel;

  renderChatPresets();
  updatePresetPromptDisplay();
}

// ===== Helpers =====

function addPresetOption(name) {
  const select = $('#selectMeetingPreset');
  if (![...select.options].some(o => o.value === name)) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    select.insertBefore(option, select.querySelector('[value="custom"]'));
  }
}

function updatePresetPromptDisplay() {
  const currentPreset = state.settings.meetingPreset || 'general';
  const customPresets = state.settings.customPresets || {};
  const promptText = customPresets[currentPreset] || getPresetContext(currentPreset);
  const display = $('#presetPromptText');
  if (display) display.textContent = promptText || '(No prompt configured)';
}

function populatePreviousMeetings() {
  const select = $('#selectPreviousMeeting');
  const meetings = listMeetings();
  while (select.options.length > 1) select.remove(1);
  meetings.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.title || t('history.untitled');
    select.appendChild(opt);
  });
}

function loadSavedSettings() {
  const saved = loadSettings();
  const s = state.settings;

  s.geminiKey = getApiKey('gemini');
  s.geminiModel = saved.geminiModel || 'gemini-2.5-flash';
  s.chatModel = saved.chatModel || 'gemini-2.5-flash';
  s.language = saved.language || 'ko';
  s.autoAnalysis = saved.autoAnalysis !== false;
  s.analysisInterval = saved.analysisInterval || 30;
  s.tokenStrategy = saved.tokenStrategy || 'smart';
  s.recentMinutes = saved.recentMinutes || 5;
  s.meetingPreset = saved.meetingPreset || 'general';
  s.meetingContext = saved.meetingContext || '';
  s.customPrompt = saved.customPrompt || getDefaultPrompt();
  s.chatSystemPrompt = saved.chatSystemPrompt || '';
  s.slackWebhook = saved.slackWebhook || '';
  s.theme = saved.theme || 'light';
  s.uiLanguage = saved.uiLanguage || 'auto';
  s.aiLanguage = saved.aiLanguage || 'auto';
  s.customPresets = saved.customPresets || {};
  s.chatPresets = saved.chatPresets || null;

  applySettingsToForm();

  // Apply theme
  document.documentElement.setAttribute('data-theme', s.theme);
}

export function updateTypoDictCount() {
  const dict = loadTypoDict();
  const count = Object.keys(dict).length;
  const el = $('#typoDictCount');
  if (el) el.textContent = count;
}

function renderTypoDictModal() {
  const dict = loadTypoDict();
  const list = $('#typoDictList');
  list.innerHTML = '';

  const entries = Object.entries(dict);
  if (entries.length === 0) {
    list.innerHTML = '<p class="text-muted" style="text-align:center;padding:20px;">No corrections yet</p>';
    return;
  }

  entries.forEach(([before, after]) => {
    const item = document.createElement('div');
    item.className = 'typo-dict-item';
    const beforeSpan = document.createElement('span');
    beforeSpan.className = 'typo-dict-before';
    beforeSpan.textContent = before;
    const arrowSpan = document.createElement('span');
    arrowSpan.className = 'typo-dict-arrow';
    arrowSpan.innerHTML = '&rarr;';
    const afterSpan = document.createElement('span');
    afterSpan.className = 'typo-dict-after';
    afterSpan.textContent = after;
    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-xs btn-danger';
    delBtn.style.marginLeft = 'auto';
    delBtn.textContent = '\u00d7';
    item.append(beforeSpan, arrowSpan, afterSpan, delBtn);
    delBtn.addEventListener('click', () => {
      delete dict[before];
      const { saveTypoDict } = require('./storage.js');
      // Inline delete
      import('./storage.js').then(mod => {
        mod.saveTypoDict(dict);
        updateTypoDictCount();
        renderTypoDictModal();
      });
    });
    list.appendChild(item);
  });
}

// ===== Chat Presets =====
function getDefaultChatPresets() {
  return [
    t('chat.suggestion_1'),
    t('chat.suggestion_2'),
    t('chat.suggestion_3'),
  ];
}

function initChatPresets() {
  renderChatPresets();

  $('#btnAddChatPreset')?.addEventListener('click', () => {
    const input = $('#inputNewChatPreset');
    const text = input?.value.trim();
    if (!text) return;
    if (!state.settings.chatPresets) state.settings.chatPresets = getDefaultChatPresets();
    state.settings.chatPresets.push(text);
    markDirty();
    highlightField($('#chatPresetsList'));
    input.value = '';
    renderChatPresets();
  });

  $('#btnResetChatPresets')?.addEventListener('click', () => {
    state.settings.chatPresets = getDefaultChatPresets();
    markDirty();
    highlightField($('#chatPresetsList'));
    renderChatPresets();
  });
}

function renderChatPresets() {
  const list = $('#chatPresetsList');
  if (!list) return;
  const presets = state.settings.chatPresets || getDefaultChatPresets();
  list.innerHTML = '';
  presets.forEach((text, idx) => {
    const item = document.createElement('div');
    item.className = 'chat-preset-item';

    const span = document.createElement('span');
    span.className = 'preset-text';
    span.textContent = text;
    span.contentEditable = false;

    // Edit on click
    span.addEventListener('click', () => {
      span.contentEditable = true;
      span.focus();
    });
    span.addEventListener('blur', () => {
      span.contentEditable = false;
      const newText = span.textContent.trim();
      if (newText && newText !== text) {
        if (!state.settings.chatPresets) state.settings.chatPresets = getDefaultChatPresets();
        state.settings.chatPresets[idx] = newText;
        markDirty();
        highlightField($('#chatPresetsList'));
      } else if (!newText) {
        span.textContent = text;
      }
    });
    span.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); span.blur(); }
      if (e.key === 'Escape') { span.textContent = text; span.blur(); }
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-xs btn-danger';
    delBtn.textContent = '\u00d7';
    delBtn.addEventListener('click', () => {
      if (!state.settings.chatPresets) state.settings.chatPresets = getDefaultChatPresets();
      state.settings.chatPresets.splice(idx, 1);
      markDirty();
      highlightField($('#chatPresetsList'));
      renderChatPresets();
    });

    item.append(span, delBtn);
    list.appendChild(item);
  });
}

// ===== Data Tab (Participants, Locations, Categories) =====
function initDataTab() {
  renderDataParticipants();
  renderDataLocations();
  renderDataCategories();

  // Add participant
  $('#btnAddParticipant')?.addEventListener('click', () => {
    const name = $('#inputNewParticipantName')?.value.trim();
    if (!name) return;
    const company = $('#inputNewParticipantCompany')?.value.trim() || '';
    addContact({ name, company });
    $('#inputNewParticipantName').value = '';
    $('#inputNewParticipantCompany').value = '';
    renderDataParticipants();
  });

  // Add location
  $('#btnAddLocation')?.addEventListener('click', () => {
    const name = $('#inputNewLocation')?.value.trim();
    if (!name) return;
    addLocation(name);
    $('#inputNewLocation').value = '';
    renderDataLocations();
  });

  // Add category
  $('#btnAddCategory')?.addEventListener('click', () => {
    const name = $('#inputNewCategory')?.value.trim();
    if (!name) return;
    addCategory(name);
    $('#inputNewCategory').value = '';
    renderDataCategories();
  });
}

function renderDataParticipants() {
  const list = $('#dataParticipantsList');
  if (!list) return;
  const contacts = loadContacts();
  list.innerHTML = '';
  if (contacts.length === 0) {
    list.innerHTML = `<p class="text-muted" style="font-size:12px;padding:8px 0;">${t('settings.no_items')}</p>`;
    return;
  }
  contacts.forEach(c => {
    const item = document.createElement('div');
    item.className = 'data-list-item';
    const info = document.createElement('div');
    info.className = 'data-list-item-info';
    const nameSpan = document.createElement('span');
    nameSpan.textContent = c.name;
    info.appendChild(nameSpan);
    if (c.company) {
      const compSpan = document.createElement('span');
      compSpan.className = 'data-list-item-sub';
      compSpan.textContent = c.company;
      info.appendChild(compSpan);
    }
    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-xs btn-danger';
    delBtn.textContent = '\u00d7';
    item.append(info, delBtn);
    item.querySelector('button').addEventListener('click', () => {
      deleteContact(c.id);
      renderDataParticipants();
    });
    list.appendChild(item);
  });
}

function renderDataLocations() {
  const list = $('#dataLocationsList');
  if (!list) return;
  const locations = loadLocations();
  list.innerHTML = '';
  if (locations.length === 0) {
    list.innerHTML = `<p class="text-muted" style="font-size:12px;padding:8px 0;">${t('settings.no_items')}</p>`;
    return;
  }
  locations.forEach(loc => {
    const item = document.createElement('div');
    item.className = 'data-list-item';
    const span = document.createElement('span');
    span.textContent = loc;
    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-xs btn-danger';
    delBtn.textContent = '\u00d7';
    item.append(span, delBtn);
    delBtn.addEventListener('click', () => {
      deleteLocation(loc);
      renderDataLocations();
    });
    list.appendChild(item);
  });
}

function renderDataCategories() {
  const list = $('#dataCategoriesList');
  if (!list) return;
  const categories = loadCategories();
  list.innerHTML = '';
  if (categories.length === 0) {
    list.innerHTML = `<p class="text-muted" style="font-size:12px;padding:8px 0;">${t('settings.no_items')}</p>`;
    return;
  }
  categories.forEach(cat => {
    const item = document.createElement('div');
    item.className = 'data-list-item';
    const span = document.createElement('span');
    span.textContent = cat;
    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-xs btn-danger';
    delBtn.textContent = '\u00d7';
    item.append(span, delBtn);
    delBtn.addEventListener('click', () => {
      deleteCategory(cat);
      renderDataCategories();
    });
    list.appendChild(item);
  });
}

export function openSettings() {
  $('#settingsPanel').classList.add('open');
  $('#settingsOverlay').classList.add('visible');
  $('#settingsPanel').setAttribute('aria-hidden', 'false');
  updateTypoDictCount();
  updatePresetPromptDisplay();
  snapshotSettings();
}

export function tryCloseSettings() {
  if (isDirty) {
    if (!confirm(t('settings.unsaved_warning'))) return;
    revertSettings();
  }
  closeSettings();
}

export function closeSettings() {
  $('#settingsPanel').classList.remove('open');
  $('#settingsOverlay').classList.remove('visible');
  $('#settingsPanel').setAttribute('aria-hidden', 'true');
  isDirty = false;
  updateDirtyUI();
}
