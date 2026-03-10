// settings.js - Settings panel management

import { state, emit } from './app.js';
import {
  saveSettings, loadSettings, saveApiKey, getApiKey,
  listMeetings, getMeeting,
  loadTypoDict, resetTypoDict,
} from './storage.js';
import { getDefaultPrompt, getPresetContext } from './ai.js';
import { t, setLanguage, setAiLanguage } from './i18n.js';


const $ = (sel) => document.querySelector(sel);

export function initSettings() {
  const panel = $('#settingsPanel');
  const overlay = $('#settingsOverlay');

  // Open/close
  $('#btnSettings').addEventListener('click', () => openSettings());
  $('#btnSettingsClose').addEventListener('click', () => closeSettings());
  overlay.addEventListener('click', () => closeSettings());

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
    saveSetting('uiLanguage', e.target.value);
    setLanguage(e.target.value);
    emit('language:change');
  });

  // AI Language
  $('#selectAiLanguage').addEventListener('change', (e) => {
    state.settings.aiLanguage = e.target.value;
    saveSetting('aiLanguage', e.target.value);
    setAiLanguage(e.target.value);
  });

  // API keys
  $('#inputGeminiKey').addEventListener('change', (e) => {
    saveApiKey('gemini', e.target.value);
    state.settings.geminiKey = e.target.value;
  });

  // Gemini Model (Analysis)
  $('#selectGeminiModel').addEventListener('change', (e) => {
    state.settings.geminiModel = e.target.value;
    saveSetting('geminiModel', e.target.value);
  });

  // STT language
  $('#selectLanguage').addEventListener('change', (e) => {
    state.settings.language = e.target.value;
    saveSetting('language', e.target.value);
  });

  // Auto Analysis toggle
  $('#checkAutoAnalysis').addEventListener('change', (e) => {
    state.settings.autoAnalysis = e.target.checked;
    saveSetting('autoAnalysis', e.target.checked);
  });

  // Analysis Interval (number input)
  $('#inputAnalysisInterval').addEventListener('change', (e) => {
    const val = parseInt(e.target.value) || 30;
    state.settings.analysisInterval = val;
    saveSetting('analysisInterval', val);
  });

  // Token strategy (radio cards)
  document.querySelectorAll('input[name="tokenStrategy"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      state.settings.tokenStrategy = e.target.value;
      saveSetting('tokenStrategy', e.target.value);
    });
  });

  // Recent minutes - inline number inputs in strategy cards
  document.querySelectorAll('.settings-number-sm[data-strategy]').forEach(input => {
    input.addEventListener('change', (e) => {
      const val = parseInt(e.target.value) || 5;
      state.settings.recentMinutes = val;
      saveSetting('recentMinutes', val);
      // Sync both inputs
      document.querySelectorAll('.settings-number-sm[data-strategy]').forEach(inp => {
        inp.value = val;
      });
    });
  });

  // Meeting preset (in Prompt tab)
  $('#selectMeetingPreset').addEventListener('change', (e) => {
    state.settings.meetingPreset = e.target.value;
    saveSetting('meetingPreset', e.target.value);
    updatePresetPromptDisplay();
    if (e.target.value !== 'custom') {
      const ctx = getPresetContext(e.target.value);
      $('#textMeetingContext').value = ctx;
      state.settings.meetingContext = ctx;
      saveSetting('meetingContext', ctx);
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
    saveSetting('customPresets', state.settings.customPresets);
    addPresetOption(name);
    $('#selectMeetingPreset').value = name;
    state.settings.meetingPreset = name;
    saveSetting('meetingPreset', name);
    presetEditor.hidden = true;
    updatePresetPromptDisplay();
  });

  $('#btnResetPresetPrompt').addEventListener('click', () => {
    const currentPreset = state.settings.meetingPreset || 'general';
    const defaultCtx = getPresetContext(currentPreset);
    $('#textPresetPrompt').value = defaultCtx;
    if (state.settings.customPresets?.[currentPreset]) {
      delete state.settings.customPresets[currentPreset];
      saveSetting('customPresets', state.settings.customPresets);
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
    saveSetting('meetingContext', e.target.value);
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
      saveSetting('meetingContext', state.settings.meetingContext);
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
      saveSetting('meetingContext', text);
    };
    reader.readAsText(file);
  });

  // Prompt
  $('#textPrompt').addEventListener('change', (e) => {
    state.settings.customPrompt = e.target.value;
    saveSetting('customPrompt', e.target.value);
  });
  $('#btnResetPrompt').addEventListener('click', () => {
    const def = getDefaultPrompt();
    $('#textPrompt').value = def;
    state.settings.customPrompt = def;
    saveSetting('customPrompt', def);
  });

  // Chat System Prompt
  $('#textChatPrompt').addEventListener('change', (e) => {
    state.settings.chatSystemPrompt = e.target.value;
    saveSetting('chatSystemPrompt', e.target.value);
  });
  $('#btnResetChatPrompt').addEventListener('click', () => {
    $('#textChatPrompt').value = '';
    state.settings.chatSystemPrompt = '';
    saveSetting('chatSystemPrompt', '');
  });

  // Typo Dictionary
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
    saveSetting('slackWebhook', e.target.value);
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
      saveSetting('chatModel', e.target.value);
    });
  }
}

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

  // Apply to inputs
  $('#selectUiLanguage').value = s.uiLanguage;
  $('#selectAiLanguage').value = s.aiLanguage;
  $('#inputGeminiKey').value = s.geminiKey;
  $('#selectGeminiModel').value = s.geminiModel;
  $('#selectLanguage').value = s.language;
  $('#checkAutoAnalysis').checked = s.autoAnalysis;
  $('#inputAnalysisInterval').value = s.analysisInterval;

  // Set token strategy radio
  const strategyRadio = document.querySelector(`input[name="tokenStrategy"][value="${s.tokenStrategy}"]`);
  if (strategyRadio) strategyRadio.checked = true;

  // Set recent minutes in strategy card inputs
  document.querySelectorAll('.settings-number-sm[data-strategy]').forEach(inp => {
    inp.value = s.recentMinutes;
  });

  // Load custom presets into select
  const select = $('#selectMeetingPreset');
  Object.keys(s.customPresets).forEach(name => {
    addPresetOption(name);
  });
  select.value = s.meetingPreset;

  // Sync quick start preset
  const qs = $('#selectQuickPreset');
  if (qs) qs.value = s.meetingPreset;

  $('#textMeetingContext').value = s.meetingContext;
  $('#textPrompt').value = s.customPrompt;
  $('#textChatPrompt').value = s.chatSystemPrompt;
  $('#inputSlackWebhook').value = s.slackWebhook;

  // Chat model
  const chatModelSelect = $('#chatModelSelect');
  if (chatModelSelect) chatModelSelect.value = s.chatModel;

  // Apply theme
  document.documentElement.setAttribute('data-theme', s.theme);
}

function saveSetting(key, value) {
  const obj = {};
  obj[key] = value;
  saveSettings(obj);
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
    item.innerHTML = `
      <span class="typo-dict-before">${before}</span>
      <span class="typo-dict-arrow">&rarr;</span>
      <span class="typo-dict-after">${after}</span>
      <button class="btn btn-xs btn-danger" data-before="${before}" style="margin-left:auto;">&times;</button>
    `;
    item.querySelector('button').addEventListener('click', () => {
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

export function openSettings() {
  $('#settingsPanel').classList.add('open');
  $('#settingsOverlay').classList.add('visible');
  $('#settingsPanel').setAttribute('aria-hidden', 'false');
  updateTypoDictCount();
  updatePresetPromptDisplay();
}

export function closeSettings() {
  $('#settingsPanel').classList.remove('open');
  $('#settingsOverlay').classList.remove('visible');
  $('#settingsPanel').setAttribute('aria-hidden', 'true');
}
