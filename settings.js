// settings.js - Settings panel management (manual save)

import { state, emit, on } from './event-bus.js';
import {
  saveSettings, loadSettings,
  loadContacts, addContact, updateContact, deleteContact,
  loadLocations, addLocation, deleteLocation, updateLocation,
  getLocationFrequency,
  loadCorrectionDict, addCorrectionEntry, deleteCorrectionEntry,
  loadCustomTypes, addCustomType, deleteCustomType,
} from './storage.js';
import { getDefaultPrompt, getPromptForType } from './ai.js';
import { t, setLanguage, setAiLanguage } from './i18n.js';
import { callGemini, isProxyAvailable } from './gemini-api.js';
import { ocrBusinessCard } from './meeting-prep.js';



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


  // STT language
  $('#selectLanguage').addEventListener('change', (e) => {
    state.settings.language = e.target.value;
    markDirty();
  });

  // Preset cards selection
  initPresetCards();

  // Custom presets list
  initCustomPresets();

  // Refresh custom preset list when changed externally (e.g. prompt builder, deep setup)
  on('customTypes:change', refreshCustomPresetList);

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



  // btnPromptSettings now handled by analysis-style-modal.js

  // Chat model select
  const chatModelSelect = $('#chatModelSelect');
  if (chatModelSelect) {
    chatModelSelect.value = state.settings.chatModel || 'gemini-2.5-flash';
    chatModelSelect.addEventListener('change', (e) => {
      state.settings.chatModel = e.target.value;
      markDirty();
    });
  }

  // ===== Audio Recording =====
  initAudioRecordingSettings();

  // ===== Chat Presets =====
  initChatPresets();

  // ===== Data Tab (immediate save - CRUD operations) =====
  initDataTab();

  // ===== Correction Dictionary (modal, immediate save) =====
  initCorrectionDict();

}

// ===== Preset Cards =====

function initPresetCards() {
  const container = $('#presetCards');
  if (!container) return;

  const currentPreset = state.settings.meetingPreset || 'copilot';

  // Set initial selection
  container.querySelectorAll('.preset-card').forEach(card => {
    card.classList.toggle('selected', card.dataset.preset === currentPreset);
  });

  container.addEventListener('click', (e) => {
    const card = e.target.closest('.preset-card');
    if (!card) return;
    container.querySelectorAll('.preset-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    const preset = card.dataset.preset;
    state.settings.meetingPreset = preset;
    state.settings.customPrompt = getPromptForType(preset);
    markDirty();
  });
}

// ===== Custom Presets =====

function initCustomPresets() {
  refreshCustomPresetList();

  $('#btnAddCustomPreset')?.addEventListener('click', () => {
    emit('openMeetingPrep');
  });
}

function refreshCustomPresetList() {
  const container = $('#customPresetList');
  if (!container) return;

  const customTypes = loadCustomTypes();
  container.innerHTML = '';

  if (customTypes.length === 0) {
    container.innerHTML = `<p class="text-muted" style="font-size:12px;" data-i18n="settings.custom_presets_empty">${t('settings.custom_presets_empty')}</p>`;
    return;
  }

  customTypes.forEach(ct => {
    const item = document.createElement('div');
    item.className = 'custom-preset-item';
    if (state.settings.meetingPreset === ct.id) item.classList.add('active');
    item.dataset.id = ct.id;
    item.innerHTML = `
      <div class="custom-preset-item-info">
        <span class="custom-preset-item-name">${ct.name}</span>
        <span class="custom-preset-item-desc">${ct.context || ct.guidance || ''}</span>
      </div>
      <div class="custom-preset-item-actions">
        <button class="custom-preset-item-select btn btn-sm">${t('settings.preset_custom')}</button>
        <button class="custom-preset-item-delete btn btn-sm btn-icon" title="${t('settings.custom_type_delete') || 'Delete'}">&times;</button>
      </div>
    `;

    // Click item → open detail modal
    item.querySelector('.custom-preset-item-info').addEventListener('click', () => {
      openPresetDetailModal(ct);
    });

    // Delete button
    item.querySelector('.custom-preset-item-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm(t('settings.custom_preset_delete_confirm'))) return;
      deleteCustomType(ct.id);
      if (state.settings.meetingPreset === ct.id) {
        state.settings.meetingPreset = 'copilot';
        state.settings.customPrompt = getPromptForType('copilot');
        document.querySelectorAll('.preset-card').forEach(c => {
          c.classList.toggle('selected', c.dataset.preset === 'copilot');
        });
      }
      emit('toast', { message: t('settings.custom_preset_deleted'), type: 'success' });
      emit('customTypes:change');
    });

    // Select button → activate this preset
    item.querySelector('.custom-preset-item-select').addEventListener('click', (e) => {
      e.stopPropagation();
      state.settings.meetingPreset = ct.id;
      state.settings.customPrompt = getPromptForType(ct.id);

      // Apply extended fields
      if (ct.chatSystemPrompt) state.settings.chatSystemPrompt = ct.chatSystemPrompt;
      if (ct.chatPresets?.length) state.settings.chatPresets = ct.chatPresets;
      if (ct.context) state.settings.meetingContext = ct.context;

      // Deselect built-in preset cards
      document.querySelectorAll('.preset-card').forEach(c => c.classList.remove('selected'));
      markDirty();
      emit('customTypes:change');
    });

    container.appendChild(item);
  });
}

function openPresetDetailModal(ct) {
  // Create modal dynamically
  let modal = $('#presetDetailModal');
  if (modal) modal.remove();

  modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'presetDetailModal';
  modal.innerHTML = `
    <div class="modal" style="max-width:560px;">
      <div class="modal-header">
        <h3>${ct.name}</h3>
        <button class="btn btn-icon" id="btnClosePresetDetail" aria-label="Close">&times;</button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:12px;">
        ${ct.context ? `<p class="text-muted" style="font-size:12px;margin:0;">${ct.context}</p>` : ''}
        <label style="font-size:12px;font-weight:600;">${t('settings.preset_analysis_prompt')}</label>
        <textarea class="settings-textarea" id="presetDetailPrompt" rows="8">${ct.prompt || ''}</textarea>
        <label style="font-size:12px;font-weight:600;">${t('settings.preset_chat_prompt')}</label>
        <textarea class="settings-textarea" id="presetDetailChatPrompt" rows="4">${ct.chatSystemPrompt || ''}</textarea>
        <div style="display:flex;gap:8px;justify-content:space-between;">
          <button class="btn btn-sm btn-danger" id="btnDeletePresetDetail">${t('settings.custom_type_delete') || 'Delete'}</button>
          <button class="btn btn-sm btn-primary" id="btnSavePresetDetail">${t('settings.preset_save_changes')}</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Close
  modal.querySelector('#btnClosePresetDetail').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  // Save
  modal.querySelector('#btnSavePresetDetail').addEventListener('click', () => {
    ct.prompt = modal.querySelector('#presetDetailPrompt').value;
    ct.chatSystemPrompt = modal.querySelector('#presetDetailChatPrompt').value;
    // Update in storage
    deleteCustomType(ct.id);
    addCustomType({ ...ct });
    emit('toast', { message: t('settings.preset_changes_saved'), type: 'success' });
    emit('customTypes:change');
    modal.remove();
  });

  // Delete
  modal.querySelector('#btnDeletePresetDetail').addEventListener('click', () => {
    if (!confirm(t('settings.custom_preset_delete_confirm'))) return;
    deleteCustomType(ct.id);
    if (state.settings.meetingPreset === ct.id) {
      state.settings.meetingPreset = 'copilot';
      state.settings.customPrompt = getPromptForType('copilot');
      document.querySelectorAll('.preset-card').forEach(c => {
        c.classList.toggle('selected', c.dataset.preset === 'copilot');
      });
    }
    emit('toast', { message: t('settings.custom_preset_deleted'), type: 'success' });
    emit('customTypes:change');
    modal.remove();
  });
}

// ===== Save / Revert / Reset =====

function saveAllSettings() {
  const s = state.settings;
  saveSettings({
    uiLanguage: s.uiLanguage,
    aiLanguage: s.aiLanguage,
    chatModel: s.chatModel,
    language: s.language,
    customPrompt: s.customPrompt,
    chatSystemPrompt: s.chatSystemPrompt,
    userProfile: s.userProfile,
    welcomeDismissed: s.welcomeDismissed,
    customPromptPresets: s.customPromptPresets,
    chatPresets: s.chatPresets,
    audioRecording: s.audioRecording,
    audioRetentionDays: s.audioRetentionDays,
    audioAutoDownload: s.audioAutoDownload,
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
  s.autoAnalysis = true;
  s.analysisInterval = 180;
  s.analysisCharThreshold = 1000;
  s.autoCorrection = true;
  s.customPrompt = getDefaultPrompt();
  s.chatSystemPrompt = '';
  s.userProfile = '';
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
  $('#selectLanguage').value = s.language;

  // No per-type prompt editor needed (presets are card-based now)
  // Refresh custom preset list when settings form is opened
  refreshCustomPresetList();
  $('#textChatPrompt').value = s.chatSystemPrompt;

  const chatModelSelect = $('#chatModelSelect');
  if (chatModelSelect) chatModelSelect.value = s.chatModel;

  renderChatPresets();
}

// ===== Helpers =====


function loadSavedSettings() {
  const saved = loadSettings();
  const s = state.settings;

  s.geminiModel = saved.geminiModel || 'gemini-2.5-flash';
  s.chatModel = saved.chatModel || 'gemini-2.5-flash';
  s.language = saved.language || 'ko';
  s.autoAnalysis = true;
  s.analysisInterval = 180;
  s.analysisCharThreshold = 1000;
  s.autoCorrection = true;
  s.meetingPreset = saved.meetingPreset || 'copilot';
  s.meetingContext = saved.meetingContext || '';
  s.customPrompt = saved.customPrompt || getDefaultPrompt();
  s.chatSystemPrompt = saved.chatSystemPrompt || '';
  s.userProfile = saved.userProfile || '';
  s.welcomeDismissed = saved.welcomeDismissed || false;
  s.theme = saved.theme || 'light';
  s.uiLanguage = saved.uiLanguage || 'auto';
  s.aiLanguage = saved.aiLanguage || 'auto';
  s.customPromptPresets = saved.customPromptPresets || {};
  s.chatPresets = saved.chatPresets || null;
  s.audioRecording = saved.audioRecording !== undefined ? saved.audioRecording : true;
  s.audioRetentionDays = saved.audioRetentionDays || 30;
  s.audioAutoDownload = !!saved.audioAutoDownload;

  applySettingsToForm();

  // Apply theme
  document.documentElement.setAttribute('data-theme', s.theme);
}

// ===== Audio Recording Settings =====
function initAudioRecordingSettings() {
  const toggle = $('#checkAudioRecording');
  const retentionRow = $('#audioRetentionRow');
  const retentionSelect = $('#selectAudioRetention');
  const storageInfo = $('#audioStorageInfo');
  const autoDownloadRow = $('#audioAutoDownloadRow');
  const autoDownloadCheck = $('#checkAudioAutoDownload');

  if (!toggle) return;

  // Load saved state
  toggle.checked = !!state.settings.audioRecording;
  if (retentionRow) retentionRow.hidden = !toggle.checked;
  if (autoDownloadRow) autoDownloadRow.hidden = !toggle.checked;
  if (retentionSelect) retentionSelect.value = state.settings.audioRetentionDays || '30';
  if (autoDownloadCheck) autoDownloadCheck.checked = !!state.settings.audioAutoDownload;

  toggle.addEventListener('change', () => {
    state.settings.audioRecording = toggle.checked;
    if (retentionRow) retentionRow.hidden = !toggle.checked;
    if (autoDownloadRow) autoDownloadRow.hidden = !toggle.checked;
    updateAudioStorageInfo(storageInfo);
    markDirty();
  });

  autoDownloadCheck?.addEventListener('change', () => {
    state.settings.audioAutoDownload = autoDownloadCheck.checked;
    markDirty();
  });

  retentionSelect?.addEventListener('change', () => {
    state.settings.audioRetentionDays = parseInt(retentionSelect.value);
    markDirty();
  });

  // Manual delete button
  $('#btnAudioDeleteAll')?.addEventListener('click', async () => {
    if (!confirm(t('settings.audio_delete_confirm'))) return;
    try {
      const { getAudioStorageInfo, deleteRecording } = await import('./audio-recorder.js');
      const info = await getAudioStorageInfo();
      // Delete all by clearing the DB
      const { initAudioDB } = await import('./audio-recorder.js');
      const db = await initAudioDB();
      const tx = db.transaction(['recordings', 'chunks'], 'readwrite');
      tx.objectStore('recordings').clear();
      tx.objectStore('chunks').clear();
      await new Promise(r => { tx.oncomplete = r; });
      updateAudioStorageInfo(storageInfo);
      emit('toast', { message: t('settings.audio_deleted', { n: info.count }), type: 'success' });
    } catch {
      emit('toast', { message: t('settings.audio_delete_error'), type: 'error' });
    }
  });

  // Always update storage info
  updateAudioStorageInfo(storageInfo);
}

async function updateAudioStorageInfo(el) {
  if (!el) return;
  try {
    const { getAudioStorageInfo } = await import('./audio-recorder.js');
    const info = await getAudioStorageInfo();
    const deleteBtn = $('#btnAudioDeleteAll');
    if (info.count > 0) {
      const sizeMB = (info.totalSize / (1024 * 1024)).toFixed(1);
      el.innerHTML = `<span>${t('settings.audio_storage_info', { count: info.count, size: sizeMB })}</span>`;
      el.hidden = false;
      if (deleteBtn) deleteBtn.hidden = false;
    } else {
      el.textContent = t('settings.audio_no_recordings');
      el.hidden = false;
      if (deleteBtn) deleteBtn.hidden = true;
    }
  } catch {
    el.textContent = t('settings.audio_storage_unavailable');
    el.hidden = false;
  }
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
let settingsCameraStream = null;
let contactSearchQuery = '';
let contactSearchField = 'all'; // 'all' | 'name' | 'title' | 'company'
let starFilterActive = false;
let locationSearchQuery = '';

function switchContactsTab(tab) {
  document.querySelectorAll('.contacts-modal-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.contactsTab === tab);
  });
  $('#contactsTabAdd').hidden = tab !== 'add';
  $('#contactsTabSearch').hidden = tab !== 'search';
  renderDataParticipants();
  if (tab === 'add') {
    setTimeout(() => $('#inputNewParticipantName')?.focus(), 50);
  } else {
    setTimeout(() => $('#inputContactSearch')?.focus(), 50);
  }
}

function initDataTab() {
  updateDataBadges();

  // --- Contacts Modal ---
  $('#btnOpenContacts')?.addEventListener('click', () => {
    $('#contactsModal').hidden = false;
    contactSearchQuery = '';
    contactSearchField = 'all';
    starFilterActive = false;
    const searchInput = $('#inputContactSearch');
    if (searchInput) searchInput.value = '';
    const starBtn = $('#btnStarFilter');
    if (starBtn) starBtn.classList.remove('active');
    // Reset search filter UI
    document.querySelectorAll('.search-filter-option').forEach(b => b.classList.remove('active'));
    document.querySelector('.search-filter-option[data-filter="all"]')?.classList.add('active');
    const filterLabel = $('#searchFilterLabel');
    if (filterLabel) filterLabel.textContent = t('settings.search_filter_all');
    switchContactsTab('add');
  });
  $('#btnCloseContacts')?.addEventListener('click', closeContactsModal);
  $('#contactsModal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeContactsModal();
  });

  // Contacts modal tabs
  document.querySelectorAll('.contacts-modal-tab').forEach(btn => {
    btn.addEventListener('click', () => switchContactsTab(btn.dataset.contactsTab));
  });

  // Star filter
  $('#btnStarFilter')?.addEventListener('click', () => {
    starFilterActive = !starFilterActive;
    $('#btnStarFilter').classList.toggle('active', starFilterActive);
    $('#btnStarFilter').innerHTML = starFilterActive ? '&#9733;' : '&#9734;';
    renderDataParticipants();
  });

  $('#inputContactSearch')?.addEventListener('input', (e) => {
    contactSearchQuery = e.target.value.trim().toLowerCase();
    renderDataParticipants();
  });

  // Search filter dropdown
  $('#btnSearchFilter')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const dd = $('#searchFilterDropdown');
    dd.hidden = !dd.hidden;
  });
  document.querySelectorAll('.search-filter-option').forEach(btn => {
    btn.addEventListener('click', () => {
      contactSearchField = btn.dataset.filter;
      document.querySelectorAll('.search-filter-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      $('#searchFilterLabel').textContent = btn.textContent;
      $('#searchFilterDropdown').hidden = true;
      renderDataParticipants();
      $('#inputContactSearch')?.focus();
    });
  });
  document.addEventListener('click', () => {
    const dd = $('#searchFilterDropdown');
    if (dd) dd.hidden = true;
  });

  // --- Locations Modal ---
  $('#btnOpenLocations')?.addEventListener('click', () => {
    $('#locationsModal').hidden = false;
    locationSearchQuery = '';
    const searchInput = $('#inputLocationSearch');
    if (searchInput) searchInput.value = '';
    // Reset to Add tab
    document.querySelectorAll('[data-locations-tab]').forEach(b => b.classList.toggle('active', b.dataset.locationsTab === 'add'));
    $('#locationsTabAdd').hidden = false;
    $('#locationsTabSearch').hidden = true;
    renderDataLocations();
  });
  $('#btnCloseLocations')?.addEventListener('click', closeLocationsModal);
  $('#locationsModal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeLocationsModal();
  });

  // Add participant
  function addParticipantFromForm() {
    const name = $('#inputNewParticipantName')?.value.trim();
    if (!name) return;
    const title = $('#inputNewParticipantTitle')?.value.trim() || '';
    const company = $('#inputNewParticipantCompany')?.value.trim() || '';
    addContact({ name, title, company });
    $('#inputNewParticipantName').value = '';
    $('#inputNewParticipantTitle').value = '';
    $('#inputNewParticipantCompany').value = '';
    renderDataParticipants();
    updateDataBadges();
    $('#inputNewParticipantName').focus();
  }
  $('#btnAddParticipant')?.addEventListener('click', addParticipantFromForm);
  // Enter key to add
  ['#inputNewParticipantName', '#inputNewParticipantTitle', '#inputNewParticipantCompany'].forEach(sel => {
    $(sel)?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addParticipantFromForm(); }
    });
  });

  // --- Card Scan Modal ---
  $('#btnSettingsScanCard')?.addEventListener('click', () => {
    openCardScanModal();
  });
  $('#btnCloseCardScan')?.addEventListener('click', closeCardScanModal);
  $('#cardScanModal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeCardScanModal();
  });

  // Card scan upload & camera
  $('#btnCardScanUpload')?.addEventListener('click', () => {
    $('#cardScanFileInput').click();
  });
  $('#btnCardScanCamera')?.addEventListener('click', () => {
    openSettingsCamera();
  });
  $('#cardScanFileInput')?.addEventListener('change', (e) => {
    const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) addFilesToScanQueue(files);
    e.target.value = '';
  });

  // Also support legacy file input (from add tab)
  $('#settingsImageFileInput')?.addEventListener('change', (e) => {
    const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) {
      openCardScanModal();
      addFilesToScanQueue(files);
    }
    e.target.value = '';
  });

  // Camera modal buttons
  $('#btnCameraCapture')?.addEventListener('click', () => {
    const video = $('#cameraPreview');
    const canvas = $('#cameraCanvas');
    const maxW = 640;
    const scale = Math.min(maxW / video.videoWidth, 1);
    canvas.width = video.videoWidth * scale;
    canvas.height = video.videoHeight * scale;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
    closeSettingsCamera();
    addBase64ToScanQueue(base64, t('prep.photo_camera'));
  });
  $('#btnCameraCancel')?.addEventListener('click', closeSettingsCamera);

  // Drag & Drop in card scan modal
  const dropZone = $('#cardScanDropZone');
  if (dropZone) {
    dropZone.addEventListener('dragenter', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('drag-over'); });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
      if (files.length > 0) addFilesToScanQueue(files);
    });
  }

  // Save card contact (single OCR result)
  $('#btnSettingsSaveCard')?.addEventListener('click', () => {
    const name = $('#settingsCardName').value.trim();
    if (!name) return;
    addContact({
      name,
      title: $('#settingsCardTitle').value.trim(),
      company: $('#settingsCardCompany').value.trim(),
      email: $('#settingsCardEmail').value.trim(),
      phone: $('#settingsCardPhone').value.trim(),
    });
    $('#settingsCardResult').hidden = true;
    renderDataParticipants();
    updateDataBadges();
    emit('toast', { message: t('prep.card_saved'), type: 'success' });
  });

  // Save all scanned cards (review mode)
  $('#cardScanSaveAll')?.addEventListener('click', saveAllScannedCards);

  // --- Export / Import ---
  $('#btnExportCsv')?.addEventListener('click', exportContactsCsv);
  $('#btnImportContacts')?.addEventListener('click', () => {
    $('#contactsImportFile').click();
  });
  $('#contactsImportFile')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) importContactsFromFile(file);
    e.target.value = '';
  });

  // Add location (simple: name + memo)

  function handleAddLocation() {
    const input = $('#inputNewLocation');
    const memoInput = $('#inputNewLocationMemo');
    const name = input?.value.trim();
    if (!name) { emit('toast', { message: t('settings.location_name_required'), type: 'warning' }); return; }
    const memo = memoInput?.value.trim() || '';
    addLocation({ name, memo });
    input.value = '';
    if (memoInput) memoInput.value = '';
    renderDataLocations();
    updateDataBadges();
  }

  // Add button click
  $('#btnAddLocation')?.addEventListener('click', handleAddLocation);

  // Enter key on input
  $('#inputNewLocation')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleAddLocation(); }
  });
  $('#inputNewLocationMemo')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleAddLocation(); }
  });

  // Location tabs
  document.querySelectorAll('[data-locations-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-locations-tab]').forEach(b => b.classList.toggle('active', b === btn));
      $('#locationsTabAdd').hidden = btn.dataset.locationsTab !== 'add';
      $('#locationsTabSearch').hidden = btn.dataset.locationsTab !== 'search';
      renderDataLocations();
      if (btn.dataset.locationsTab === 'search') {
        setTimeout(() => $('#inputLocationSearch')?.focus(), 50);
      }
    });
  });

  // Location search
  $('#inputLocationSearch')?.addEventListener('input', (e) => {
    locationSearchQuery = e.target.value.trim().toLowerCase();
    renderDataLocations();
  });

  // Add category
  // Listen for openContactsModal event (from contact groups)
  on('openContactsModal', () => {
    openSettings();
    const dataTab = document.querySelector('.settings-tab[data-tab="data"]');
    if (dataTab) dataTab.click();
    setTimeout(() => {
      $('#contactsModal').hidden = false;
      contactSearchQuery = '';
      starFilterActive = false;
      const searchInput = $('#inputContactSearch');
      if (searchInput) searchInput.value = '';
      const starBtn = $('#btnStarFilter');
      if (starBtn) starBtn.classList.remove('active');
      switchContactsTab('add');
    }, 100);
  });
}

function closeContactsModal() {
  $('#contactsModal').hidden = true;
}
function closeLocationsModal() {
  $('#locationsModal').hidden = true;
}
function updateDataBadges() {
  const contacts = loadContacts();
  const locations = loadLocations();

  // Update badge counts
  setBadge('#contactsBadge', contacts.length);
  setBadge('#locationsBadge', locations.length);

  // Update tooltips (recent 3 items preview)
  setContactTooltip('#btnOpenContacts', contacts.slice(-3).reverse());
  setTextTooltip('#btnOpenLocations', locations.slice(-3).reverse().map(l => typeof l === 'string' ? l : l.name));
}

function setBadge(selector, count) {
  const badge = $(selector);
  if (!badge) return;
  badge.textContent = count > 0 ? count : '';
  badge.style.display = count > 0 ? '' : 'none';
}

function setContactTooltip(btnSelector, contacts) {
  const btn = $(btnSelector);
  if (!btn) return;
  btn.querySelector('.data-modal-tooltip')?.remove();
  if (contacts.length === 0) return;
  const tooltip = document.createElement('div');
  tooltip.className = 'data-modal-tooltip';
  contacts.forEach(c => {
    const div = document.createElement('div');
    div.className = 'data-modal-tooltip-item';
    const nameSpan = document.createElement('span');
    nameSpan.textContent = c.name;
    div.appendChild(nameSpan);
    const sub = [c.title, c.company].filter(Boolean).join(' · ');
    if (sub) {
      const subSpan = document.createElement('span');
      subSpan.className = 'data-list-item-sub';
      subSpan.textContent = ` ${sub}`;
      div.appendChild(subSpan);
    }
    tooltip.appendChild(div);
  });
  btn.appendChild(tooltip);
}

function setTextTooltip(btnSelector, items) {
  const btn = $(btnSelector);
  if (!btn) return;
  btn.querySelector('.data-modal-tooltip')?.remove();
  if (items.length === 0) return;
  const tooltip = document.createElement('div');
  tooltip.className = 'data-modal-tooltip';
  items.forEach(text => {
    const div = document.createElement('div');
    div.className = 'data-modal-tooltip-item';
    div.textContent = text;
    tooltip.appendChild(div);
  });
  btn.appendChild(tooltip);
}

async function openSettingsCamera() {
  try {
    settingsCameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    });
    const video = $('#cameraPreview');
    video.srcObject = settingsCameraStream;
    $('#cameraModal').hidden = false;
  } catch {
    emit('toast', { message: t('prep.camera_permission'), type: 'error' });
  }
}

function closeSettingsCamera() {
  if (settingsCameraStream) {
    settingsCameraStream.getTracks().forEach(track => track.stop());
    settingsCameraStream = null;
  }
  $('#cameraPreview').srcObject = null;
  $('#cameraModal').hidden = true;
}

// --- Card Scan Modal & Multi-scan Queue (Review Mode) ---
let scanQueue = [];
let scanProcessing = false;

function openCardScanModal() {
  $('#cardScanModal').hidden = false;
  $('#settingsCardResult').hidden = true;
  const reviewPanel = $('#cardScanReviewPanel');
  if (reviewPanel) reviewPanel.hidden = true;
}

function closeCardScanModal() {
  $('#cardScanModal').hidden = true;
}

function addFilesToScanQueue(files) {
  const queueEl = $('#cardScanQueue');
  queueEl.hidden = false;

  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const base64 = dataUrl.split(',')[1];
      const item = { base64, name: file.name, dataUrl, status: 'waiting', result: null };
      scanQueue.push(item);
      renderScanQueue();
      processScanQueue();
    };
    reader.readAsDataURL(file);
  });
}

function addBase64ToScanQueue(base64, label) {
  const queueEl = $('#cardScanQueue');
  queueEl.hidden = false;
  const dataUrl = `data:image/jpeg;base64,${base64}`;
  const item = { base64, name: label || 'Camera', dataUrl, status: 'waiting', result: null };
  scanQueue.push(item);
  renderScanQueue();
  processScanQueue();
}

function renderScanQueue() {
  const queueEl = $('#cardScanQueue');
  if (!queueEl) return;
  queueEl.innerHTML = '';
  scanQueue.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'card-scan-queue-item';
    const img = document.createElement('img');
    img.src = item.dataUrl;
    const nameSpan = document.createElement('span');
    nameSpan.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    nameSpan.textContent = item.name;
    const statusSpan = document.createElement('span');
    statusSpan.className = 'card-scan-queue-status ' + item.status;
    if (item.status === 'waiting') statusSpan.textContent = t('settings.card_queue_waiting');
    else if (item.status === 'processing') statusSpan.textContent = t('settings.card_queue_processing');
    else if (item.status === 'done') statusSpan.textContent = `✓ ${t('settings.card_queue_done')}`;
    else if (item.status === 'saved') statusSpan.textContent = `✓ ${t('settings.card_queue_saved')}`;
    else if (item.status === 'error') statusSpan.textContent = `✗ ${t('settings.card_queue_error')}`;
    row.append(img, nameSpan, statusSpan);
    queueEl.appendChild(row);
  });
}

async function processScanQueue() {
  if (scanProcessing) return;
  scanProcessing = true;

  while (scanQueue.some(item => item.status === 'waiting')) {
    const item = scanQueue.find(item => item.status === 'waiting');
    if (!item) break;
    item.status = 'processing';
    renderScanQueue();

    try {
      const result = await ocrBusinessCard(item.base64);
      if (result && result.name) {
        item.status = 'done';
        item.result = result;
      } else {
        item.status = 'error';
      }
    } catch (err) {
      console.error('OCR error:', err);
      item.status = 'error';
    }
    renderScanQueue();
  }

  scanProcessing = false;

  // Show review panel with all scanned results
  const doneItems = scanQueue.filter(i => i.status === 'done');
  if (doneItems.length > 0) {
    renderScanReviewPanel();
  } else if (scanQueue.length > 0 && scanQueue.every(i => i.status === 'error')) {
    emit('toast', { message: t('prep.scan_failed'), type: 'error' });
    setTimeout(() => {
      scanQueue = [];
      const queueEl = $('#cardScanQueue');
      if (queueEl) { queueEl.innerHTML = ''; queueEl.hidden = true; }
    }, 2000);
  }
}

function renderScanReviewPanel() {
  const panel = $('#cardScanReviewPanel');
  if (!panel) return;
  panel.hidden = false;
  panel.innerHTML = '';

  const doneItems = scanQueue.filter(i => i.status === 'done');

  doneItems.forEach((item, idx) => {
    const card = document.createElement('div');
    card.className = 'card-review-item';
    card.dataset.queueIdx = scanQueue.indexOf(item);

    const thumb = document.createElement('img');
    thumb.src = item.dataUrl;
    thumb.className = 'card-review-thumb';

    const fields = document.createElement('div');
    fields.className = 'card-review-fields';
    const r = item.result;
    const fieldDefs = [
      { key: 'name', placeholder: 'Name', value: r.name || '' },
      { key: 'title', placeholder: 'Title', value: r.title || '' },
      { key: 'company', placeholder: 'Company', value: r.company || '' },
      { key: 'email', placeholder: 'Email', value: r.email || '' },
      { key: 'phone', placeholder: 'Phone', value: r.phone || '' },
    ];
    fieldDefs.forEach(f => {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'settings-input card-review-input';
      input.placeholder = f.placeholder;
      input.value = f.value;
      input.dataset.field = f.key;
      fields.appendChild(input);
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn-xs btn-danger card-review-remove';
    removeBtn.textContent = '\u00d7';
    removeBtn.addEventListener('click', () => {
      const qi = parseInt(card.dataset.queueIdx);
      scanQueue[qi].status = 'error'; // mark as skipped
      card.remove();
      renderScanQueue();
      // If no more cards to review, hide panel
      if (panel.querySelectorAll('.card-review-item').length === 0) {
        panel.hidden = true;
        $('#cardScanSaveAll').hidden = true;
      }
    });

    card.append(thumb, fields, removeBtn);
    panel.appendChild(card);
  });

  // Save All button
  let saveAllBtn = $('#cardScanSaveAll');
  if (!saveAllBtn) return;
  saveAllBtn.hidden = false;
  saveAllBtn.textContent = `${t('settings.card_save_all')} (${doneItems.length})`;
}

function saveAllScannedCards() {
  const panel = $('#cardScanReviewPanel');
  if (!panel) return;
  const cards = panel.querySelectorAll('.card-review-item');
  let savedCount = 0;
  cards.forEach(card => {
    const qi = parseInt(card.dataset.queueIdx);
    const inputs = card.querySelectorAll('.card-review-input');
    const data = {};
    inputs.forEach(inp => { data[inp.dataset.field] = inp.value.trim(); });
    if (!data.name) return;
    addContact(data);
    scanQueue[qi].status = 'saved';
    savedCount++;
  });
  renderScanQueue();
  renderDataParticipants();
  updateDataBadges();
  panel.hidden = true;
  $('#cardScanSaveAll').hidden = true;
  if (savedCount > 0) {
    emit('toast', { message: `${savedCount} ${t('prep.card_saved')}`, type: 'success' });
  }
  // Clear queue after a delay
  setTimeout(() => {
    scanQueue = [];
    const queueEl = $('#cardScanQueue');
    if (queueEl) { queueEl.innerHTML = ''; queueEl.hidden = true; }
  }, 2000);
}

// --- Contacts Export / Import ---
function exportContactsCsv() {
  const contacts = loadContacts();
  if (contacts.length === 0) {
    emit('toast', { message: t('settings.no_items'), type: 'warning' });
    return;
  }
  const headers = ['name', 'title', 'company', 'email', 'phone', 'starred'];
  const csvRows = [headers.join(',')];
  contacts.forEach(c => {
    const row = headers.map(h => {
      const val = (c[h] ?? '').toString();
      // Escape CSV values
      return val.includes(',') || val.includes('"') || val.includes('\n')
        ? `"${val.replace(/"/g, '""')}"` : val;
    });
    csvRows.push(row.join(','));
  });
  const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `contacts_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function importContactsFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const text = reader.result;
    let imported = 0;
    if (file.name.endsWith('.vcf')) {
      // Parse vCard
      const cards = text.split('BEGIN:VCARD').filter(s => s.trim());
      cards.forEach(card => {
        const get = (key) => {
          const m = card.match(new RegExp(`^${key}[;:](.*)$`, 'mi'));
          return m ? m[1].trim() : '';
        };
        const name = get('FN');
        if (!name) return;
        addContact({
          name,
          title: get('TITLE'),
          company: get('ORG'),
          email: get('EMAIL'),
          phone: get('TEL'),
        });
        imported++;
      });
    } else {
      // Parse CSV
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) return;
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^"(.*)"$/, '$1'));
      for (let i = 1; i < lines.length; i++) {
        const values = parseCsvLine(lines[i]);
        const obj = {};
        headers.forEach((h, idx) => { obj[h] = values[idx] || ''; });
        if (!obj.name) return;
        if (obj.starred) obj.starred = obj.starred === 'true';
        addContact(obj);
        imported++;
      }
    }
    renderDataParticipants();
    updateDataBadges();
    if (imported > 0) {
      emit('toast', { message: `${imported} ${t('settings.contacts_imported')}`, type: 'success' });
    }
  };
  reader.readAsText(file);
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { result.push(current); current = ''; }
      else { current += ch; }
    }
  }
  result.push(current);
  return result;
}

function renderDataParticipants() {
  const list = $('#dataParticipantsList');
  if (!list) return;
  let contacts = loadContacts();
  list.innerHTML = '';

  // Filter by starred
  if (starFilterActive) {
    contacts = contacts.filter(c => c.starred);
  }
  // Filter by search
  if (contactSearchQuery) {
    contacts = contacts.filter(c => {
      const q = contactSearchQuery;
      if (contactSearchField === 'name') return c.name.toLowerCase().includes(q);
      if (contactSearchField === 'title') return (c.title || '').toLowerCase().includes(q);
      if (contactSearchField === 'company') return (c.company || '').toLowerCase().includes(q);
      // 'all'
      return c.name.toLowerCase().includes(q) ||
        (c.title || '').toLowerCase().includes(q) ||
        (c.company || '').toLowerCase().includes(q);
    });
  }

  if (contacts.length === 0) {
    list.innerHTML = `<p class="text-muted" style="font-size:12px;padding:8px 0;">${t('settings.no_items')}</p>`;
    return;
  }
  // Sort: starred first, then by name
  contacts.sort((a, b) => {
    if (a.starred && !b.starred) return -1;
    if (!a.starred && b.starred) return 1;
    return 0;
  });
  contacts.forEach(c => {
    const item = document.createElement('div');
    item.className = 'data-list-item';

    // Star toggle button
    const starBtn = document.createElement('button');
    starBtn.className = 'btn-star' + (c.starred ? ' starred' : '');
    starBtn.textContent = c.starred ? '\u2605' : '\u2606';
    starBtn.title = t('settings.toggle_star');
    starBtn.addEventListener('click', () => {
      updateContact(c.id, { starred: !c.starred });
      renderDataParticipants();
    });

    const info = document.createElement('div');
    info.className = 'data-list-item-info';

    // Editable name
    const nameSpan = document.createElement('span');
    nameSpan.textContent = c.name;
    nameSpan.style.cursor = 'text';
    nameSpan.addEventListener('click', () => {
      nameSpan.contentEditable = 'true';
      nameSpan.focus();
    });
    nameSpan.addEventListener('blur', () => {
      nameSpan.contentEditable = 'false';
      const newName = nameSpan.textContent.trim();
      if (newName && newName !== c.name) {
        updateContact(c.id, { name: newName });
        updateDataBadges();
      } else {
        nameSpan.textContent = c.name;
      }
    });
    nameSpan.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); nameSpan.blur(); }
      if (e.key === 'Escape') { nameSpan.textContent = c.name; nameSpan.blur(); }
    });
    info.appendChild(nameSpan);

    // Editable subtitle
    const sub = [c.title, c.company].filter(Boolean).join(' · ');
    const subSpan = document.createElement('span');
    subSpan.className = 'data-list-item-sub';
    subSpan.textContent = sub || t('settings.click_to_edit_detail');
    subSpan.style.cursor = 'text';
    if (!sub) subSpan.style.fontStyle = 'italic';
    subSpan.addEventListener('click', () => {
      // Show as "title · company" editable
      subSpan.textContent = [c.title || '', c.company || ''].join(' · ');
      subSpan.contentEditable = 'true';
      subSpan.style.fontStyle = '';
      subSpan.focus();
    });
    subSpan.addEventListener('blur', () => {
      subSpan.contentEditable = 'false';
      const raw = subSpan.textContent.trim();
      const parts = raw.split('·').map(s => s.trim());
      const newTitle = parts[0] || '';
      const newCompany = parts[1] || '';
      if (newTitle !== (c.title || '') || newCompany !== (c.company || '')) {
        updateContact(c.id, { title: newTitle, company: newCompany });
        updateDataBadges();
      }
      const updated = [newTitle, newCompany].filter(Boolean).join(' · ');
      subSpan.textContent = updated || t('settings.click_to_edit_detail');
      if (!updated) subSpan.style.fontStyle = 'italic';
    });
    subSpan.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); subSpan.blur(); }
      if (e.key === 'Escape') { subSpan.textContent = sub; subSpan.blur(); }
    });
    info.appendChild(subSpan);

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-xs btn-danger';
    delBtn.textContent = '\u00d7';
    item.append(starBtn, info, delBtn);
    delBtn.addEventListener('click', () => {
      deleteContact(c.id);
      renderDataParticipants();
      updateDataBadges();
    });
    list.appendChild(item);
  });
}

function createLocationItem(loc, freq) {
  const item = document.createElement('div');
  item.className = 'data-list-item';

  const infoSpan = document.createElement('span');
  infoSpan.style.cssText = 'display:flex;flex-direction:column;gap:1px;flex:1;min-width:0;';

  const topRow = document.createElement('span');
  topRow.style.cssText = 'display:flex;align-items:center;gap:6px;';

  // Inline-editable name
  const nameEl = document.createElement('span');
  nameEl.textContent = loc.name;
  nameEl.style.cssText = 'cursor:pointer;font-weight:500;';
  nameEl.title = t('settings.click_to_edit');
  nameEl.addEventListener('click', () => {
    const newName = prompt(t('settings.location_edit_name'), loc.name);
    if (newName?.trim() && newName.trim() !== loc.name) {
      updateLocation(loc.name, { name: newName.trim() });
      renderDataLocations();
    }
  });
  topRow.appendChild(nameEl);

  // Frequency badge
  const count = freq[loc.name] || 0;
  if (count > 0) {
    const badge = document.createElement('span');
    badge.className = 'location-freq-badge';
    badge.textContent = count + t('settings.location_freq_suffix');
    topRow.appendChild(badge);
  }

  infoSpan.appendChild(topRow);

  // Memo line (editable)
  const memoEl = document.createElement('span');
  memoEl.className = 'location-memo';
  memoEl.textContent = loc.memo || '';
  if (!loc.memo) {
    memoEl.classList.add('location-memo--empty');
    memoEl.textContent = t('settings.location_add_memo');
  }
  memoEl.addEventListener('click', () => {
    const newMemo = prompt(t('settings.location_edit_memo'), loc.memo || '');
    if (newMemo != null) {
      updateLocation(loc.name, { memo: newMemo.trim() });
      renderDataLocations();
    }
  });
  infoSpan.appendChild(memoEl);

  const delBtn = document.createElement('button');
  delBtn.className = 'btn btn-xs btn-danger';
  delBtn.textContent = '\u00d7';
  delBtn.addEventListener('click', () => {
    deleteLocation(loc.name);
    renderDataLocations();
    updateDataBadges();
  });

  item.append(infoSpan, delBtn);
  return item;
}

function renderDataLocations() {
  const list = $('#dataLocationsList');
  if (!list) return;
  const locations = loadLocations();
  const freq = getLocationFrequency();
  list.innerHTML = '';

  if (locations.length === 0) {
    list.innerHTML = `<p class="text-muted" style="font-size:12px;padding:8px 0;">${t('settings.no_items')}</p>`;
    return;
  }

  // Sort by frequency desc, then name asc
  const sorted = [...locations].sort((a, b) => {
    const fa = freq[a.name] || 0, fb = freq[b.name] || 0;
    if (fb !== fa) return fb - fa;
    return a.name.localeCompare(b.name);
  });

  // Filter by search query
  let filtered = sorted;
  if (locationSearchQuery) {
    const q = locationSearchQuery;
    filtered = sorted.filter(l =>
      l.name.toLowerCase().includes(q) ||
      (l.memo && l.memo.toLowerCase().includes(q))
    );
  }

  if (filtered.length === 0) {
    list.innerHTML = `<p class="text-muted" style="font-size:12px;padding:8px 0;">${t('settings.no_search_results')}</p>`;
    return;
  }

  for (const loc of filtered) list.appendChild(createLocationItem(loc, freq));
}

// ===== Correction Dictionary (Modal) =====
let correctionSearchQuery = '';

function initCorrectionDict() {
  updateCorrectionBadge();

  // Open modal
  $('#btnOpenCorrectionDict')?.addEventListener('click', () => {
    $('#correctionDictModal').hidden = false;
    correctionSearchQuery = '';
    const searchInput = $('#inputCorrectionSearch');
    if (searchInput) searchInput.value = '';
    renderCorrectionDict();
  });

  // Close modal
  $('#btnCloseCorrectionDict')?.addEventListener('click', closeCorrectionModal);
  $('#correctionDictModal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeCorrectionModal();
  });

  // Add entry
  $('#btnAddCorrection')?.addEventListener('click', () => {
    const original = $('#inputCorrectionOriginal')?.value.trim();
    const corrected = $('#inputCorrectionCorrected')?.value.trim();
    if (!original || !corrected || original === corrected) return;
    addCorrectionEntry(original, corrected);
    $('#inputCorrectionOriginal').value = '';
    $('#inputCorrectionCorrected').value = '';
    renderCorrectionDict();
    updateCorrectionBadge();
  });

  // Search
  $('#inputCorrectionSearch')?.addEventListener('input', (e) => {
    correctionSearchQuery = e.target.value.trim().toLowerCase();
    renderCorrectionDict();
  });

  // Export
  $('#btnCorrectionDictExport')?.addEventListener('click', () => {
    const entries = loadCorrectionDict();
    if (entries.length === 0) {
      emit('toast', { message: t('settings.correction_dict_empty_export'), type: 'warning' });
      return;
    }
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `correction-dict-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Import
  $('#btnCorrectionDictImport')?.addEventListener('click', () => {
    $('#correctionDictFileInput')?.click();
  });
  $('#correctionDictFileInput')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!Array.isArray(data)) throw new Error('not array');
        let count = 0;
        data.forEach(entry => {
          if (entry.original && entry.corrected) {
            addCorrectionEntry(entry.original, entry.corrected);
            count++;
          }
        });
        renderCorrectionDict();
        updateCorrectionBadge();
        emit('toast', { message: t('settings.correction_dict_imported').replace('{count}', count), type: 'success' });
      } catch {
        emit('toast', { message: t('settings.correction_dict_import_error'), type: 'error' });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });
}

function closeCorrectionModal() {
  $('#correctionDictModal').hidden = true;
}

function updateCorrectionBadge() {
  const badge = $('#correctionDictBadge');
  if (!badge) return;
  const count = loadCorrectionDict().length;
  badge.textContent = count > 0 ? count : '';
  badge.style.display = count > 0 ? '' : 'none';
}

function renderCorrectionDict() {
  const list = $('#dataCorrectionDictList');
  if (!list) return;
  let entries = loadCorrectionDict();
  list.innerHTML = '';

  // Filter by search
  if (correctionSearchQuery) {
    entries = entries.filter(e =>
      e.original.toLowerCase().includes(correctionSearchQuery) ||
      e.corrected.toLowerCase().includes(correctionSearchQuery)
    );
  }

  if (entries.length === 0) {
    list.innerHTML = `<p class="text-muted" style="font-size:12px;padding:8px 0;">${t('settings.no_items')}</p>`;
    return;
  }
  // Sort by most recently updated
  entries.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  entries.forEach(entry => {
    const item = document.createElement('div');
    item.className = 'data-list-item';
    const info = document.createElement('div');
    info.className = 'data-list-item-info';
    const mainText = document.createElement('span');
    mainText.textContent = `"${entry.original}" → "${entry.corrected}"`;
    info.appendChild(mainText);
    if (entry.count > 1) {
      const countSpan = document.createElement('span');
      countSpan.className = 'data-list-item-sub';
      countSpan.textContent = `×${entry.count}`;
      info.appendChild(countSpan);
    }
    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-xs btn-danger';
    delBtn.textContent = '\u00d7';
    delBtn.addEventListener('click', () => {
      deleteCorrectionEntry(entry.id);
      renderCorrectionDict();
      updateCorrectionBadge();
    });
    item.append(info, delBtn);
    list.appendChild(item);
  });
}

export function openSettings() {
  $('#settingsPanel').classList.add('open');
  $('#settingsOverlay').classList.add('visible');
  $('#settingsPanel').setAttribute('aria-hidden', 'false');
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
  // Close any sub-modals that may have been left open
  ['#contactsModal', '#locationsModal', '#cardScanModal', '#cameraModal', '#correctionDictModal', '#settingsUnsavedModal'].forEach(sel => {
    const el = $(sel);
    if (el) el.hidden = true;
  });
}
