// settings.js - Settings panel management (manual save)

import { state, emit } from './app.js';
import {
  saveSettings, loadSettings,
  listMeetings, getMeeting,
  loadContacts, addContact, deleteContact,
  loadLocations, addLocation, deleteLocation,
  loadCategories, addCategory, deleteCategory,
} from './storage.js';
import { getDefaultPrompt, getPresetContext } from './ai.js';
import { t, setLanguage, setAiLanguage, getPromptPresets } from './i18n.js';
import { callGemini, isProxyAvailable } from './gemini-api.js';


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
  const dot = $('#settingsUnsavedDot');
  if (saveBtn) saveBtn.disabled = !isDirty;
  if (dot) {
    if (isDirty) dot.classList.add('visible');
    else dot.classList.remove('visible');
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

  // Header save button
  $('#btnSettingsSave').addEventListener('click', () => saveAllSettings());

  // Footer reset button
  $('#btnSettingsReset').addEventListener('click', () => resetAllSettings());

  // Unsaved modal buttons
  $('#btnUnsavedSave').addEventListener('click', () => {
    $('#settingsUnsavedModal').hidden = true;
    saveAllSettings();
    closeSettings();
  });
  $('#btnUnsavedDiscard').addEventListener('click', () => {
    $('#settingsUnsavedModal').hidden = true;
    revertSettings();
    closeSettings();
  });
  $('#btnUnsavedCancel').addEventListener('click', () => {
    $('#settingsUnsavedModal').hidden = true;
  });

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

  // STT Engine - show toast when clicking disabled select during recording
  const sttEngineRow = $('#selectSttEngine')?.closest('.settings-engine-row');
  if (sttEngineRow) {
    sttEngineRow.addEventListener('pointerdown', (e) => {
      const sel = $('#selectSttEngine');
      if (sel?.disabled) {
        e.preventDefault();
        import('./ui.js').then(m => m.showToast(t('stt.recording_locked'), 'warning'));
      }
    });
  }

  $('#selectSttEngine').addEventListener('change', (e) => {
    state.settings.sttEngine = e.target.value;
    markDirty();
    // Clear previous test result when engine changes
    const result = $('#sttTestResult');
    if (result) { result.textContent = ''; result.className = 'stt-test-result'; }
  });

  // STT Connection Test
  $('#btnTestStt')?.addEventListener('click', async () => {
    const btn = $('#btnTestStt');
    const result = $('#sttTestResult');
    const engine = state.settings.sttEngine || 'webspeech';

    btn.classList.add('testing');
    btn.textContent = '...';
    result.textContent = '';
    result.className = 'stt-test-result';

    if (engine === 'deepgram') {
      try {
        const resp = await fetch('/api/stt-token');
        if (!resp.ok) throw new Error('API key not configured');
        const data = await resp.json();
        if (!data.key) throw new Error('Empty key');

        // Try WebSocket connection
        const lang = state.settings.language || 'ko';
        const wsUrl = `wss://api.deepgram.com/v1/listen?model=nova-3&language=${lang}&smart_format=true`;
        const ws = new WebSocket(wsUrl, ['token', data.key]);
        const timeout = setTimeout(() => { ws.close(); throw new Error('timeout'); }, 5000);

        await new Promise((resolve, reject) => {
          ws.onopen = () => { clearTimeout(timeout); ws.close(); resolve(); };
          ws.onerror = () => { clearTimeout(timeout); reject(new Error('WebSocket connection failed')); };
          ws.onclose = (e) => {
            clearTimeout(timeout);
            if (e.code !== 1000 && e.code !== 1005) reject(new Error(`Connection closed: ${e.code} ${e.reason}`));
          };
        });

        result.textContent = t('stt.test_success');
        result.className = 'stt-test-result success';
      } catch (err) {
        result.textContent = t('stt.test_fail') + ' ' + (err.message || '');
        result.className = 'stt-test-result error';
      }
    } else {
      // Web Speech — check browser support
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SR) {
        result.textContent = t('stt.test_success');
        result.className = 'stt-test-result success';
      } else {
        result.textContent = t('stt.test_fail_browser');
        result.className = 'stt-test-result error';
      }
    }

    btn.classList.remove('testing');
    btn.textContent = t('stt.test_connection');
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

  // Prompt presets
  function populatePromptPresets() {
    const select = $('#selectPromptPreset');
    const presets = getPromptPresets();
    // Keep only the first option (placeholder)
    while (select.options.length > 1) select.remove(1);
    Object.entries(presets).forEach(([key, { name }]) => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = name;
      select.appendChild(opt);
    });
    // Append custom prompt presets
    const customPromptPresets = state.settings.customPromptPresets || {};
    Object.keys(customPromptPresets).forEach(name => {
      const opt = document.createElement('option');
      opt.value = '__custom__' + name;
      opt.textContent = '\u2605 ' + name;
      select.appendChild(opt);
    });
  }
  populatePromptPresets();

  function updateDeletePresetBtn(key) {
    const btn = $('#btnDeletePromptPreset');
    if (btn) btn.style.display = (key && key.startsWith('__custom__')) ? '' : 'none';
  }

  $('#selectPromptPreset').addEventListener('change', (e) => {
    const key = e.target.value;
    updateDeletePresetBtn(key);
    if (!key) return;
    let promptText;
    if (key.startsWith('__custom__')) {
      const name = key.slice('__custom__'.length);
      promptText = (state.settings.customPromptPresets || {})[name];
    } else {
      const presets = getPromptPresets();
      const preset = presets[key];
      if (!preset) return;
      promptText = preset.prompt || getDefaultPrompt();
    }
    if (promptText) {
      $('#textPrompt').value = promptText;
      state.settings.customPrompt = promptText;
      markDirty();
      highlightField($('#textPrompt'));
    }
  });

  // Save current prompt as custom preset
  $('#btnSavePromptPreset').addEventListener('click', () => {
    const name = prompt(t('preset.name_prompt') || 'Enter preset name:');
    if (!name) return;
    if (!state.settings.customPromptPresets) state.settings.customPromptPresets = {};
    state.settings.customPromptPresets[name] = $('#textPrompt').value;
    markDirty();
    populatePromptPresets();
    $('#selectPromptPreset').value = '__custom__' + name;
    updateDeletePresetBtn('__custom__' + name);
  });

  // Delete custom preset
  $('#btnDeletePromptPreset').addEventListener('click', () => {
    const key = $('#selectPromptPreset').value;
    if (!key || !key.startsWith('__custom__')) return;
    if (!confirm(t('preset.delete_confirm'))) return;
    const name = key.slice('__custom__'.length);
    delete (state.settings.customPromptPresets || {})[name];
    markDirty();
    populatePromptPresets();
    $('#selectPromptPreset').value = '';
    updateDeletePresetBtn('');
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

  // AI Correction
  $('#checkAutoCorrection')?.addEventListener('change', (e) => {
    state.settings.autoCorrection = e.target.checked;
    markDirty();
  });
  $('#inputCorrectionInterval')?.addEventListener('change', (e) => {
    const val = parseInt(e.target.value) || 60;
    state.settings.correctionInterval = val;
    markDirty();
  });

  // User Profile - structured form
  const profileFields = ['profileName', 'profileTitle', 'profileTeam', 'profileInterests', 'profileNotes'];
  profileFields.forEach(id => {
    const el = $(`#${id}`);
    if (el) el.addEventListener('change', () => { syncProfileFromForm(); markDirty(); highlightField(el); });
  });
  $('#profileRole')?.addEventListener('change', () => { syncProfileFromForm(); markDirty(); highlightField($('#profileRole')); });

  // Profile file upload — attachment only (no copy to textarea)
  $('#userProfileFileUpload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      state.settings.profileFileContent = reader.result;
      state.settings.profileFileName = file.name;
      showProfileFileChip(file.name);
      markDirty();
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // View attached file
  $('#btnProfileFileView')?.addEventListener('click', () => {
    const content = state.settings.profileFileContent;
    const name = state.settings.profileFileName;
    if (!content) return;
    $('#profileFileModalTitle').textContent = name || 'File';
    $('#profileFileModalContent').textContent = content;
    $('#profileFileModal').hidden = false;
  });

  // Remove attached file
  $('#btnProfileFileRemove')?.addEventListener('click', () => {
    state.settings.profileFileContent = '';
    state.settings.profileFileName = '';
    $('#profileFileChip').hidden = true;
    markDirty();
  });

  // AI Profile Chat button
  $('#btnProfileAiChat')?.addEventListener('click', () => {
    startProfileAiChat();
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
    sttEngine: s.sttEngine,
    autoAnalysis: s.autoAnalysis,
    analysisInterval: s.analysisInterval,
    tokenStrategy: s.tokenStrategy,
    recentMinutes: s.recentMinutes,
    meetingPreset: s.meetingPreset,
    meetingContext: s.meetingContext,
    customPrompt: s.customPrompt,
    chatSystemPrompt: s.chatSystemPrompt,
    autoCorrection: s.autoCorrection,
    correctionInterval: s.correctionInterval,
    userProfile: s.userProfile,
    profileFields: s.profileFields,
    profileFileContent: s.profileFileContent,
    profileFileName: s.profileFileName,
    slackWebhook: s.slackWebhook,
    customPresets: s.customPresets,
    customPromptPresets: s.customPromptPresets,
    chatPresets: s.chatPresets,
  });
  snapshotSettings();

  // Check animation on save button
  const saveBtn = $('#btnSettingsSave');
  if (saveBtn) {
    const origText = saveBtn.textContent;
    saveBtn.textContent = '\u2713';
    saveBtn.classList.add('saved');
    saveBtn.disabled = true;
    setTimeout(() => {
      saveBtn.textContent = origText;
      saveBtn.classList.remove('saved');
    }, 1200);
  }

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
  s.geminiModel = 'gemini-2.5-flash';
  s.chatModel = 'gemini-2.5-flash';
  s.language = 'ko';
  s.sttEngine = 'webspeech';
  s.autoAnalysis = true;
  s.analysisInterval = 30;
  s.autoCorrection = true;
  s.correctionInterval = 60;
  s.tokenStrategy = 'smart';
  s.recentMinutes = 5;
  s.meetingPreset = 'general';
  s.meetingContext = '';
  s.customPrompt = getDefaultPrompt();
  s.chatSystemPrompt = '';
  s.userProfile = '';
  s.profileFields = { name: '', title: '', team: '', role: 'attendee', interests: '', notes: '' };
  s.profileFileContent = '';
  s.profileFileName = '';
  s.slackWebhook = '';
  s.customPresets = {};
  s.customPromptPresets = {};
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
  $('#selectGeminiModel').value = s.geminiModel;
  $('#selectLanguage').value = s.language;
  $('#selectSttEngine').value = s.sttEngine || 'webspeech';
  $('#checkAutoAnalysis').checked = s.autoAnalysis;
  $('#inputAnalysisInterval').value = s.analysisInterval;
  const checkAutoCorrection = $('#checkAutoCorrection');
  if (checkAutoCorrection) checkAutoCorrection.checked = s.autoCorrection !== false;
  const inputCorrectionInterval = $('#inputCorrectionInterval');
  if (inputCorrectionInterval) inputCorrectionInterval.value = s.correctionInterval || 60;

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
  applyProfileToForm();
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

  s.geminiModel = saved.geminiModel || 'gemini-2.5-flash';
  s.chatModel = saved.chatModel || 'gemini-2.5-flash';
  s.language = saved.language || 'ko';
  s.sttEngine = saved.sttEngine || 'webspeech';
  s.autoAnalysis = saved.autoAnalysis !== false;
  s.analysisInterval = saved.analysisInterval || 30;
  s.autoCorrection = saved.autoCorrection !== false;
  s.correctionInterval = saved.correctionInterval || 60;
  s.tokenStrategy = saved.tokenStrategy || 'smart';
  s.recentMinutes = saved.recentMinutes || 5;
  s.meetingPreset = saved.meetingPreset || 'general';
  s.meetingContext = saved.meetingContext || '';
  s.customPrompt = saved.customPrompt || getDefaultPrompt();
  s.chatSystemPrompt = saved.chatSystemPrompt || '';
  s.profileFields = saved.profileFields || { name: '', title: '', team: '', role: 'attendee', interests: '', notes: '' };
  // Rebuild userProfile from structured fields (or keep legacy string)
  const rebuiltProfile = buildUserProfileString(s.profileFields);
  s.userProfile = rebuiltProfile || saved.userProfile || '';
  s.profileFileContent = saved.profileFileContent || '';
  s.profileFileName = saved.profileFileName || '';
  s.slackWebhook = saved.slackWebhook || '';
  s.theme = saved.theme || 'light';
  s.uiLanguage = saved.uiLanguage || 'auto';
  s.aiLanguage = saved.aiLanguage || 'auto';
  s.customPresets = saved.customPresets || {};
  s.customPromptPresets = saved.customPromptPresets || {};
  s.chatPresets = saved.chatPresets || null;

  applySettingsToForm();

  // Apply theme
  document.documentElement.setAttribute('data-theme', s.theme);
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

// ===== Profile Helpers =====

function syncProfileFromForm() {
  const pf = {
    name: $('#profileName')?.value.trim() || '',
    title: $('#profileTitle')?.value.trim() || '',
    team: $('#profileTeam')?.value.trim() || '',
    role: $('#profileRole')?.value || 'attendee',
    interests: $('#profileInterests')?.value.trim() || '',
    notes: $('#profileNotes')?.value.trim() || '',
  };
  state.settings.profileFields = pf;
  // Build unified userProfile string for AI consumption
  state.settings.userProfile = buildUserProfileString(pf);
}

function buildUserProfileString(pf) {
  const parts = [];
  if (pf.name) parts.push(`Name: ${pf.name}`);
  if (pf.title) parts.push(`Title: ${pf.title}`);
  if (pf.team) parts.push(`Team: ${pf.team}`);
  if (pf.role) parts.push(`Meeting Role: ${pf.role}`);
  if (pf.interests) parts.push(`Interests/Goals: ${pf.interests}`);
  if (pf.notes) parts.push(`Notes: ${pf.notes}`);
  return parts.join('\n');
}

function applyProfileToForm() {
  const pf = state.settings.profileFields || {};
  const el = (id) => $(`#${id}`);
  if (el('profileName')) el('profileName').value = pf.name || '';
  if (el('profileTitle')) el('profileTitle').value = pf.title || '';
  if (el('profileTeam')) el('profileTeam').value = pf.team || '';
  if (el('profileRole')) el('profileRole').value = pf.role || 'attendee';
  if (el('profileInterests')) el('profileInterests').value = pf.interests || '';
  if (el('profileNotes')) el('profileNotes').value = pf.notes || '';

  if (state.settings.profileFileName) {
    showProfileFileChip(state.settings.profileFileName);
  } else {
    $('#profileFileChip').hidden = true;
  }
}

function showProfileFileChip(name) {
  const chip = $('#profileFileChip');
  if (chip) {
    chip.hidden = false;
    $('#profileFileName').textContent = name;
  }
}

// ===== AI Profile Chat =====

let profileChatHistory = [];
let profileChatResult = null;

async function startProfileAiChat() {
  if (!isProxyAvailable()) {
    emit('toast', { message: t('toast.no_api_key'), type: 'error' });
    return;
  }

  profileChatHistory = [];
  profileChatResult = null;
  const msgContainer = $('#profileChatMessages');
  msgContainer.innerHTML = '';
  $('#profileAiChatModal').hidden = false;
  $('#profileChatInput').value = '';

  // Initial AI question
  const lang = state.settings.aiLanguage === 'ko' || (state.settings.aiLanguage === 'auto' && (state.settings.uiLanguage === 'ko' || (state.settings.uiLanguage === 'auto' && navigator.language?.startsWith('ko')))) ? 'ko' : 'en';
  const greeting = lang === 'ko'
    ? '안녕하세요! 프로필을 작성해 드리겠습니다. 먼저 이름을 알려주세요.'
    : "Hi! I'll help you fill out your profile. Let's start with your name.";
  addProfileChatMsg('ai', greeting);
  profileChatHistory.push({ role: 'model', text: greeting });

  // Send button
  const sendBtn = $('#btnProfileChatSend');
  const input = $('#profileChatInput');

  const sendHandler = () => handleProfileChatSend();
  const keyHandler = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleProfileChatSend(); } };

  // Clean up old listeners by cloning
  const newSend = sendBtn.cloneNode(true);
  sendBtn.parentNode.replaceChild(newSend, sendBtn);
  const newInput = input.cloneNode(true);
  input.parentNode.replaceChild(newInput, input);

  newSend.addEventListener('click', sendHandler);
  newInput.addEventListener('keydown', keyHandler);

  // Apply button
  const applyBtn = $('#btnProfileChatApply');
  const newApply = applyBtn.cloneNode(true);
  applyBtn.parentNode.replaceChild(newApply, applyBtn);
  newApply.addEventListener('click', () => applyProfileFromChat());

  // Cancel button
  const cancelBtn = $('#btnProfileChatCancel');
  const newCancel = cancelBtn.cloneNode(true);
  cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
  newCancel.addEventListener('click', () => { $('#profileAiChatModal').hidden = true; });
}

function addProfileChatMsg(role, text) {
  const container = $('#profileChatMessages');
  const div = document.createElement('div');
  div.className = `profile-chat-msg ${role}`;
  div.textContent = text;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

async function handleProfileChatSend() {
  const input = $('#profileChatInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  addProfileChatMsg('user', text);
  profileChatHistory.push({ role: 'user', text });

  // Build prompt for Gemini
  const lang = state.settings.aiLanguage === 'ko' || (state.settings.aiLanguage === 'auto' && (state.settings.uiLanguage === 'ko' || (state.settings.uiLanguage === 'auto' && navigator.language?.startsWith('ko')))) ? 'ko' : 'en';

  const systemPrompt = lang === 'ko'
    ? `당신은 사용자 프로필을 작성하는 친절한 AI 어시스턴트입니다.
대화를 통해 아래 항목을 하나씩 자연스럽게 질문하세요:
- 이름, 직책/직급, 팀/부서, 회의에서의 역할(참석자/진행자/발표자/관찰자), 관심 분야/업무 목표, 기타 메모
이미 답변된 항목은 건너뛰세요. 모든 항목을 수집했다면 "프로필 정보를 모두 수집했습니다! '프로필에 반영' 버튼을 눌러주세요."라고 안내하세요.
마지막 메시지에 반드시 아래 JSON 블록을 포함하세요:
\`\`\`json
{"name":"","title":"","team":"","role":"attendee|facilitator|presenter|observer","interests":"","notes":""}
\`\`\`
한국어로 대화하세요.`
    : `You are a friendly AI assistant that helps users fill out their profile.
Ask about each field naturally through conversation:
- Name, Title/Position, Team/Department, Meeting Role (attendee/facilitator/presenter/observer), Interests/Work Goals, Additional Notes
Skip fields already answered. When all fields are collected, say "I've gathered all your profile info! Click 'Apply to Profile' to save."
In your final message, include this JSON block:
\`\`\`json
{"name":"","title":"","team":"","role":"attendee|facilitator|presenter|observer","interests":"","notes":""}
\`\`\``;

  const contents = [];
  contents.push({
    role: 'user',
    parts: [{ text: systemPrompt + '\n\n---\n\n' + profileChatHistory[0].text }]
  });
  // Skip first model message in history, it was the greeting
  for (let i = 1; i < profileChatHistory.length; i++) {
    contents.push({
      role: profileChatHistory[i].role === 'user' ? 'user' : 'model',
      parts: [{ text: profileChatHistory[i].text }]
    });
  }

  try {
    addProfileChatMsg('system', '...');
    const data = await callGemini('gemini-2.5-flash', {
      contents,
      generationConfig: { temperature: 0.5 }
    });
    // Remove loading indicator
    const msgs = $('#profileChatMessages');
    const lastMsg = msgs.querySelector('.profile-chat-msg.system:last-child');
    if (lastMsg && lastMsg.textContent === '...') lastMsg.remove();

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    addProfileChatMsg('ai', reply);
    profileChatHistory.push({ role: 'model', text: reply });

    // Try to extract JSON from the response
    const jsonMatch = reply.match(/```json\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        profileChatResult = JSON.parse(jsonMatch[1].trim());
      } catch {}
    }
  } catch (err) {
    const msgs = $('#profileChatMessages');
    const lastMsg = msgs.querySelector('.profile-chat-msg.system:last-child');
    if (lastMsg && lastMsg.textContent === '...') lastMsg.remove();
    addProfileChatMsg('system', 'Error: ' + err.message);
  }
}

function applyProfileFromChat() {
  if (!profileChatResult) {
    // Try to extract from last AI message
    const lastAi = profileChatHistory.filter(m => m.role === 'model').pop();
    if (lastAi) {
      const jsonMatch = lastAi.text.match(/```json\s*([\s\S]*?)```/) || lastAi.text.match(/\{[\s\S]*"name"[\s\S]*\}/);
      if (jsonMatch) {
        try {
          profileChatResult = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        } catch {}
      }
    }
  }

  if (profileChatResult) {
    const pf = {
      name: profileChatResult.name || '',
      title: profileChatResult.title || '',
      team: profileChatResult.team || '',
      role: profileChatResult.role || 'attendee',
      interests: profileChatResult.interests || '',
      notes: profileChatResult.notes || '',
    };
    state.settings.profileFields = pf;
    state.settings.userProfile = buildUserProfileString(pf);
    applyProfileToForm();
    markDirty();
    emit('toast', { message: t('settings.profile_applied') || 'Profile updated!', type: 'success' });
  } else {
    emit('toast', { message: t('settings.profile_chat_incomplete') || 'Please complete the conversation first.', type: 'warning' });
  }

  $('#profileAiChatModal').hidden = true;
}

export function syncSttEngineUI(engine) {
  const select = $('#selectSttEngine');
  if (select) select.value = engine;
}

export function openSettings() {
  $('#settingsPanel').classList.add('open');
  $('#settingsOverlay').classList.add('visible');
  $('#settingsPanel').setAttribute('aria-hidden', 'false');
  updatePresetPromptDisplay();
  snapshotSettings();
}

export function tryCloseSettings() {
  if (isDirty) {
    $('#settingsUnsavedModal').hidden = false;
    return;
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
