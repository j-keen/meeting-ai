// settings.js - Settings panel management (manual save)

import { state, emit, on } from './event-bus.js';
import {
  saveSettings, loadSettings,
  loadContacts, addContact, updateContact, deleteContact,
  loadLocations, addLocation, deleteLocation, updateLocation, findNearestLocation, findNearbyLocations,
  getLocationFrequency, loadLocationGroups, addLocationGroup, deleteLocationGroup,
  loadCorrectionDict, addCorrectionEntry, deleteCorrectionEntry,
  loadTypePrompts, saveTypePrompt, deleteTypePrompt,
  loadCustomTypes, addCustomType, deleteCustomType,
} from './storage.js';
import { getDefaultPrompt, getPromptForType } from './ai.js';
import { t, setLanguage, setAiLanguage, getTypeDefaultPrompt } from './i18n.js';
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

  // Per-type prompt editing
  let _currentEditType = 'general';

  function loadPromptForType(type) {
    _currentEditType = type;
    const prompt = getPromptForType(type);
    $('#textPrompt').value = prompt;
  }

  // Initialize with current meeting preset or general
  loadPromptForType(state.settings.meetingPreset || 'general');
  const typeSelect = $('#selectTypeForPrompt');
  if (typeSelect) {
    typeSelect.value = state.settings.meetingPreset || 'general';
    typeSelect.addEventListener('change', (e) => {
      loadPromptForType(e.target.value);
      const deleteBtn = $('#btnDeleteCustomType');
      if (deleteBtn) {
        deleteBtn.hidden = !e.target.value.startsWith('custom_');
      }
    });
  }

  // Save per-type prompt on change
  $('#textPrompt').addEventListener('change', (e) => {
    const newPrompt = e.target.value;
    saveTypePrompt(_currentEditType, newPrompt);
    // Also update state.settings.customPrompt if editing the current active type
    if (_currentEditType === state.settings.meetingPreset) {
      state.settings.customPrompt = newPrompt;
    }
    markDirty();
  });

  // Reset per-type prompt to default
  $('#btnResetPrompt').addEventListener('click', () => {
    deleteTypePrompt(_currentEditType);
    const def = getTypeDefaultPrompt(_currentEditType);
    $('#textPrompt').value = def;
    if (_currentEditType === state.settings.meetingPreset) {
      state.settings.customPrompt = def;
    }
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



  // Prompt settings shortcut (from AI panel header)
  $('#btnPromptSettings')?.addEventListener('click', () => {
    openSettings();
    // Switch to Prompt tab
    document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.settings-tab-content').forEach(c => c.classList.remove('active'));
    const promptTab = document.querySelector('.settings-tab[data-tab="analysis"]');
    const promptContent = document.querySelector('.settings-tab-content[data-tab="analysis"]');
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

  // ===== Correction Dictionary (modal, immediate save) =====
  initCorrectionDict();

  // ===== Custom Meeting Types =====
  initCustomTypes();
}

// ===== Custom Meeting Types =====

function initCustomTypes() {
  refreshTypeDropdowns();

  const addBtn = $('#btnAddCustomType');
  if (!addBtn) return;

  addBtn.addEventListener('click', () => {
    const panel = $('#customTypeForm');
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      $('#inputCustomTypeName').value = '';
      $('#inputCustomTypeContext').value = '';
      $('#inputCustomTypeGuidance').value = '';
      $('#inputCustomTypePrompt').value = '';
      $('#inputCustomTypeName').focus();
    }
  });

  $('#btnSaveCustomType')?.addEventListener('click', () => {
    const name = $('#inputCustomTypeName').value.trim();
    if (!name) {
      emit('toast', { message: t('settings.custom_type_name_required'), type: 'warning' });
      return;
    }
    const type = addCustomType({
      name,
      context: $('#inputCustomTypeContext').value.trim(),
      guidance: $('#inputCustomTypeGuidance').value.trim(),
      prompt: $('#inputCustomTypePrompt').value.trim(),
    });
    emit('toast', { message: t('settings.custom_type_saved'), type: 'success' });
    $('#customTypeForm').hidden = true;
    refreshTypeDropdowns();
    emit('customTypes:change');
  });

  $('#btnDeleteCustomType')?.addEventListener('click', () => {
    const typeSelect = $('#selectTypeForPrompt');
    const val = typeSelect.value;
    if (!val.startsWith('custom_')) return;
    if (!confirm(t('settings.custom_type_delete_confirm'))) return;
    deleteCustomType(val);
    emit('toast', { message: t('settings.custom_type_deleted'), type: 'success' });
    typeSelect.value = 'general';
    $('#textPrompt').value = getPromptForType('general');
    refreshTypeDropdowns();
    emit('customTypes:change');
  });
}

function refreshTypeDropdowns() {
  const typeSelect = $('#selectTypeForPrompt');
  if (!typeSelect) return;

  // Remove existing custom options
  typeSelect.querySelectorAll('option[data-custom]').forEach(o => o.remove());
  typeSelect.querySelectorAll('optgroup[data-custom]').forEach(o => o.remove());

  const customTypes = loadCustomTypes();
  if (customTypes.length > 0) {
    const group = document.createElement('optgroup');
    group.label = t('settings.custom_types');
    group.dataset.custom = '1';
    customTypes.forEach(ct => {
      const opt = document.createElement('option');
      opt.value = ct.id;
      opt.textContent = '\u2605 ' + ct.name;
      opt.dataset.custom = '1';
      group.appendChild(opt);
    });
    typeSelect.appendChild(group);
  }

  // Show/hide delete button
  const deleteBtn = $('#btnDeleteCustomType');
  if (deleteBtn) {
    deleteBtn.hidden = !typeSelect.value.startsWith('custom_');
  }
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

  // Load per-type prompt for current type
  const typeSelect = $('#selectTypeForPrompt');
  const currentType = typeSelect?.value || s.meetingPreset || 'general';
  $('#textPrompt').value = getPromptForType(currentType);
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
  s.meetingPreset = saved.meetingPreset || 'general';
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
let settingsCameraStream = null;
let contactSearchQuery = '';
let contactSearchField = 'all'; // 'all' | 'name' | 'title' | 'company'
let starFilterActive = false;

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
  $('#btnExportVcf')?.addEventListener('click', exportContactsVcf);
  $('#btnImportContacts')?.addEventListener('click', () => {
    $('#contactsImportFile').click();
  });
  $('#contactsImportFile')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) importContactsFromFile(file);
    e.target.value = '';
  });

  // Add location (shared logic)
  const GPS_TIP_DISMISSED_KEY = 'locationGpsTipDismissed';

  function showGpsTip() {
    const tip = $('#locationGpsTip');
    if (tip) tip.hidden = false;
  }
  function hideGpsTip() {
    const tip = $('#locationGpsTip');
    if (tip) tip.hidden = true;
  }

  // Show/hide GPS tip when checkbox toggled
  $('#chkLocationGps')?.addEventListener('change', (e) => {
    if (e.target.checked && !localStorage.getItem(GPS_TIP_DISMISSED_KEY)) {
      showGpsTip();
    } else {
      hideGpsTip();
    }
  });

  // Dismiss GPS tip permanently
  $('#btnDismissGpsTip')?.addEventListener('click', () => {
    localStorage.setItem(GPS_TIP_DISMISSED_KEY, '1');
    hideGpsTip();
  });

  function finishAddLocation(name, pos) {
    const groupId = $('#selectLocationGroup')?.value || undefined;
    if (pos) {
      // Check for nearby existing locations within 100m
      const nearby = findNearbyLocations(pos.coords.latitude, pos.coords.longitude, 0.1);
      if (nearby.length > 0) {
        const names = nearby.map(n => n.location.name).join(', ');
        const dist = Math.round(nearby[0].distance * 1000);
        emit('toast', { message: t('settings.location_nearby_warn', { names, dist }), type: 'warning', duration: 5000 });
      }
      addLocation({ name, lat: pos.coords.latitude, lng: pos.coords.longitude });
      emit('toast', { message: t('settings.location_gps_saved'), type: 'success' });
    } else {
      addLocation(name);
    }
    if (groupId) updateLocation(name, { group: groupId });
    $('#inputNewLocation').value = '';
    renderDataLocations();
    updateDataBadges();
  }

  function handleAddLocation() {
    const input = $('#inputNewLocation');
    const name = input?.value.trim();
    if (!name) { emit('toast', { message: t('settings.location_name_required'), type: 'warning' }); return; }
    const withGps = $('#chkLocationGps')?.checked;
    if (withGps) {
      const btn = $('#btnAddLocation');
      if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          finishAddLocation(name, pos);
          if (btn) { btn.disabled = false; btn.textContent = t('settings.add'); }
        },
        () => {
          emit('toast', { message: t('settings.location_gps_failed'), type: 'error' });
          if (btn) { btn.disabled = false; btn.textContent = t('settings.add'); }
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      finishAddLocation(name, null);
    }
  }

  // Add button click
  $('#btnAddLocation')?.addEventListener('click', handleAddLocation);

  // Enter key on input
  $('#inputNewLocation')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleAddLocation(); }
  });

  // Manage location groups
  $('#btnManageLocationGroups')?.addEventListener('click', () => {
    const name = prompt(t('settings.location_group_name_prompt'));
    if (name?.trim()) {
      addLocationGroup(name.trim());
      renderDataLocations();
    }
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
  setTextTooltip('#btnOpenLocations', locations.slice(-3).reverse().map(l => typeof l === 'string' ? l : l.name + (l.lat != null ? ' 📍' : '')));
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

function exportContactsVcf() {
  const contacts = loadContacts();
  if (contacts.length === 0) {
    emit('toast', { message: t('settings.no_items'), type: 'warning' });
    return;
  }
  const vcards = contacts.map(c => {
    const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
    lines.push(`FN:${c.name}`);
    if (c.title) lines.push(`TITLE:${c.title}`);
    if (c.company) lines.push(`ORG:${c.company}`);
    if (c.email) lines.push(`EMAIL:${c.email}`);
    if (c.phone) lines.push(`TEL:${c.phone}`);
    lines.push('END:VCARD');
    return lines.join('\r\n');
  });
  const blob = new Blob([vcards.join('\r\n')], { type: 'text/vcard;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `contacts_${new Date().toISOString().slice(0, 10)}.vcf`;
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

let currentLocationGroupFilter = null; // null = all
let currentMapPopupLoc = null;

function renderLocationGroupTabs(groups) {
  const container = $('#locationGroupTabs');
  if (!container) return;
  container.innerHTML = '';

  const allTab = document.createElement('button');
  allTab.className = 'location-group-tab' + (currentLocationGroupFilter === null ? ' active' : '');
  allTab.textContent = t('settings.location_group_all');
  allTab.addEventListener('click', () => { currentLocationGroupFilter = null; renderDataLocations(); });
  container.appendChild(allTab);

  for (const g of groups) {
    const tab = document.createElement('button');
    tab.className = 'location-group-tab' + (currentLocationGroupFilter === g.id ? ' active' : '');
    tab.textContent = g.name;
    tab.addEventListener('click', () => { currentLocationGroupFilter = g.id; renderDataLocations(); });
    tab.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const msg = t('settings.location_group_delete_confirm').replace('{name}', g.name);
      if (confirm(msg)) {
        deleteLocationGroup(g.id);
        if (currentLocationGroupFilter === g.id) currentLocationGroupFilter = null;
        renderDataLocations();
      }
    });
    container.appendChild(tab);
  }

  // Ungrouped tab
  const ungroupedTab = document.createElement('button');
  ungroupedTab.className = 'location-group-tab' + (currentLocationGroupFilter === '__ungrouped' ? ' active' : '');
  ungroupedTab.textContent = t('settings.location_group_ungrouped');
  ungroupedTab.addEventListener('click', () => { currentLocationGroupFilter = '__ungrouped'; renderDataLocations(); });
  container.appendChild(ungroupedTab);
}

function populateGroupSelector(groups, selectEl, selectedGroupId) {
  if (!selectEl) return;
  selectEl.innerHTML = '';
  const noneOpt = document.createElement('option');
  noneOpt.value = '';
  noneOpt.textContent = t('settings.location_group_none');
  selectEl.appendChild(noneOpt);
  for (const g of groups) {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = g.name;
    if (g.id === selectedGroupId) opt.selected = true;
    selectEl.appendChild(opt);
  }
}

function showLocationMapPopup(loc, anchorEl) {
  const popup = $('#locationMapPopup');
  if (!popup) return;
  // Toggle: close if same location
  if (!popup.hidden && currentMapPopupLoc === loc.name) {
    popup.hidden = true;
    currentMapPopupLoc = null;
    return;
  }
  currentMapPopupLoc = loc.name;
  const img = $('#locationMapImg');
  const coords = $('#locationMapCoords');
  const link = $('#locationMapLink');

  const lat = loc.lat, lng = loc.lng;
  img.src = `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=16&size=250x180&markers=${lat},${lng},red-pushpin`;
  img.onerror = () => { img.alt = `${lat.toFixed(4)}, ${lng.toFixed(4)}`; img.style.display = 'none'; };
  img.onload = () => { img.style.display = 'block'; };
  coords.textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  link.href = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;
  link.textContent = t('settings.location_open_map');

  // Position relative to anchor
  const modalBody = popup.parentElement;
  if (anchorEl && modalBody) {
    const anchorRect = anchorEl.getBoundingClientRect();
    const bodyRect = modalBody.getBoundingClientRect();
    popup.style.left = Math.min(anchorRect.left - bodyRect.left, bodyRect.width - 280) + 'px';
    popup.style.top = (anchorRect.bottom - bodyRect.top + 4) + 'px';
  }
  popup.hidden = false;
}

function createLocationItem(loc, freq, groups) {
  const item = document.createElement('div');
  item.className = 'data-list-item';
  const span = document.createElement('span');
  span.style.cssText = 'display:flex;align-items:center;gap:6px;';
  const hasGps = loc.lat != null && loc.lng != null;

  const nameEl = document.createElement('span');
  nameEl.textContent = loc.name;
  span.appendChild(nameEl);

  // GPS map button (separate clickable button)
  if (hasGps) {
    const mapBtn = document.createElement('button');
    mapBtn.className = 'btn btn-xs';
    mapBtn.textContent = '📍';
    mapBtn.title = `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`;
    mapBtn.style.cssText = 'padding:0 2px;min-width:auto;';
    mapBtn.addEventListener('click', () => showLocationMapPopup(loc, mapBtn));
    span.appendChild(mapBtn);

    const distEl = document.createElement('span');
    distEl.className = 'location-distance-badge';
    distEl.dataset.locDistance = loc.name;
    distEl.textContent = '';
    span.appendChild(distEl);
  }

  // Frequency badge
  const count = freq[loc.name] || 0;
  if (count > 0) {
    const badge = document.createElement('span');
    badge.className = 'location-freq-badge';
    badge.textContent = count + t('settings.location_freq_suffix');
    span.appendChild(badge);
  }

  // Group selector
  if (groups.length > 0) {
    const groupSelect = document.createElement('select');
    groupSelect.className = 'location-group-select';
    populateGroupSelector(groups, groupSelect, loc.group);
    groupSelect.addEventListener('change', () => {
      updateLocation(loc.name, { group: groupSelect.value || undefined });
      renderDataLocations();
    });
    span.appendChild(groupSelect);
  }

  const btnGroup = document.createElement('span');
  btnGroup.style.cssText = 'display:flex;gap:4px;';
  const gpsBtn = document.createElement('button');
  gpsBtn.className = 'btn btn-xs';
  gpsBtn.textContent = hasGps ? '📍' : '📌';
  gpsBtn.title = hasGps ? t('settings.location_update_gps') : t('settings.location_add_gps');
  gpsBtn.addEventListener('click', () => {
    gpsBtn.disabled = true;
    gpsBtn.textContent = '⏳';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        addLocation({ name: loc.name, lat: pos.coords.latitude, lng: pos.coords.longitude });
        renderDataLocations();
        emit('toast', { message: t('settings.location_gps_saved'), type: 'success' });
      },
      () => {
        gpsBtn.disabled = false;
        gpsBtn.textContent = hasGps ? '📍' : '📌';
        emit('toast', { message: t('settings.location_gps_failed'), type: 'error' });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
  const delBtn = document.createElement('button');
  delBtn.className = 'btn btn-xs btn-danger';
  delBtn.textContent = '\u00d7';
  delBtn.addEventListener('click', () => {
    deleteLocation(loc.name);
    renderDataLocations();
    updateDataBadges();
  });
  btnGroup.append(gpsBtn, delBtn);
  item.append(span, btnGroup);
  return item;
}

function renderDataLocations() {
  const list = $('#dataLocationsList');
  if (!list) return;
  const locations = loadLocations();
  const freq = getLocationFrequency();
  const groups = loadLocationGroups();
  list.innerHTML = '';

  // Hide map popup on re-render
  const popup = $('#locationMapPopup');
  if (popup) { popup.hidden = true; currentMapPopupLoc = null; }

  // Render group tabs
  renderLocationGroupTabs(groups);
  // Populate add-form group selector
  populateGroupSelector(groups, $('#selectLocationGroup'), null);

  if (locations.length === 0) {
    list.innerHTML = `<p class="text-muted" style="font-size:12px;padding:8px 0;">${t('settings.no_items')}</p>`;
    showNoGpsTip(locations);
    return;
  }

  // Sort by frequency desc, then name asc
  const sorted = [...locations].sort((a, b) => {
    const fa = freq[a.name] || 0, fb = freq[b.name] || 0;
    if (fb !== fa) return fb - fa;
    return a.name.localeCompare(b.name);
  });

  // Filter by group
  let filtered = sorted;
  if (currentLocationGroupFilter === '__ungrouped') {
    filtered = sorted.filter(l => !l.group);
  } else if (currentLocationGroupFilter) {
    filtered = sorted.filter(l => l.group === currentLocationGroupFilter);
  }

  // Render: if "All" tab and groups exist, show grouped with headers
  if (currentLocationGroupFilter === null && groups.length > 0) {
    const groupMap = new Map(groups.map(g => [g.id, g.name]));
    const grouped = new Map();
    const ungrouped = [];
    for (const loc of filtered) {
      if (loc.group && groupMap.has(loc.group)) {
        if (!grouped.has(loc.group)) grouped.set(loc.group, []);
        grouped.get(loc.group).push(loc);
      } else {
        ungrouped.push(loc);
      }
    }
    for (const [gid, locs] of grouped) {
      const header = document.createElement('div');
      header.className = 'location-group-header';
      header.textContent = groupMap.get(gid);
      list.appendChild(header);
      for (const loc of locs) list.appendChild(createLocationItem(loc, freq, groups));
    }
    if (ungrouped.length > 0) {
      if (grouped.size > 0) {
        const header = document.createElement('div');
        header.className = 'location-group-header';
        header.textContent = t('settings.location_group_ungrouped');
        list.appendChild(header);
      }
      for (const loc of ungrouped) list.appendChild(createLocationItem(loc, freq, groups));
    }
  } else {
    for (const loc of filtered) list.appendChild(createLocationItem(loc, freq, groups));
  }

  // Get current position once for distance display
  const gpsLocs = locations.filter(l => l.lat != null && l.lng != null);
  if (gpsLocs.length > 0 && navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        list.querySelectorAll('[data-loc-distance]').forEach(el => {
          const loc = locations.find(l => l.name === el.dataset.locDistance);
          if (!loc || loc.lat == null) return;
          const d = haversineKmLocal(latitude, longitude, loc.lat, loc.lng);
          el.textContent = d < 1 ? `${Math.round(d * 1000)}m` : `${d.toFixed(1)}km`;
        });
      },
      () => {},
      { enableHighAccuracy: true, timeout: 5000 }
    );
  }

  showNoGpsTip(locations);
}

// Local haversine for distance display
function haversineKmLocal(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Show tip when many locations lack GPS
function showNoGpsTip(locations) {
  const tip = $('#locationNoGpsTip');
  if (!tip) return;
  const noGpsCount = locations.filter(l => l.lat == null || l.lng == null).length;
  if (locations.length >= 5 && noGpsCount >= locations.length / 2) {
    tip.textContent = t('settings.location_no_gps_tip');
    tip.hidden = false;
  } else {
    tip.hidden = true;
  }
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

export { refreshTypeDropdowns };
