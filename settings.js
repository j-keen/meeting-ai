// settings.js - Settings panel management (manual save)

import { state, emit, on } from './event-bus.js';
import {
  saveSettings, loadSettings,
  loadContacts, addContact, updateContact, deleteContact,
  loadLocations, addLocation, deleteLocation,
  loadCategories, addCategory, deleteCategory,
  loadCorrectionDict, addCorrectionEntry, deleteCorrectionEntry,
} from './storage.js';
import { getDefaultPrompt } from './ai.js';
import { t, setLanguage, setAiLanguage, getPromptPresets } from './i18n.js';
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

  $('#textPrompt').value = s.customPrompt;
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

function initDataTab() {
  updateDataBadges();

  // --- Contacts Modal ---
  $('#btnOpenContacts')?.addEventListener('click', () => {
    $('#contactsModal').hidden = false;
    contactSearchQuery = '';
    const searchInput = $('#inputContactSearch');
    if (searchInput) searchInput.value = '';
    renderDataParticipants();
    setTimeout(() => $('#inputNewParticipantName')?.focus(), 50);
  });
  $('#btnCloseContacts')?.addEventListener('click', closeContactsModal);
  $('#contactsModal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeContactsModal();
  });
  $('#inputContactSearch')?.addEventListener('input', (e) => {
    contactSearchQuery = e.target.value.trim().toLowerCase();
    renderDataParticipants();
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

  // --- Categories Modal ---
  $('#btnOpenCategories')?.addEventListener('click', () => {
    $('#categoriesModal').hidden = false;
    renderDataCategories();
  });
  $('#btnCloseCategories')?.addEventListener('click', closeCategoriesModal);
  $('#categoriesModal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeCategoriesModal();
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

  // Business card scan
  $('#btnSettingsScanCard')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const popup = $('#settingsPhotoPopup');
    popup.hidden = !popup.hidden;
  });
  $('#btnSettingsPhotoUpload')?.addEventListener('click', () => {
    $('#settingsPhotoPopup').hidden = true;
    $('#settingsImageFileInput').click();
  });
  $('#btnSettingsPhotoCamera')?.addEventListener('click', () => {
    $('#settingsPhotoPopup').hidden = true;
    openSettingsCamera();
  });
  $('#settingsImageFileInput')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      processSettingsOcr(base64);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });
  // Close photo popup on outside click
  document.addEventListener('click', (e) => {
    const popup = $('#settingsPhotoPopup');
    if (popup && !popup.hidden && !e.target.closest('#btnSettingsScanCard') && !popup.contains(e.target)) {
      popup.hidden = true;
    }
  });
  // Camera modal buttons (shared with meeting prep camera modal)
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
    processSettingsOcr(base64);
  });
  $('#btnCameraCancel')?.addEventListener('click', closeSettingsCamera);

  // Drag & Drop business card
  const dropZone = $('#contactDropZone');
  if (dropZone) {
    dropZone.addEventListener('dragenter', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('drag-over'); });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (!file || !file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(',')[1];
        processSettingsOcr(base64);
      };
      reader.readAsDataURL(file);
    });
  }

  // Save card contact
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

  // Add location
  $('#btnAddLocation')?.addEventListener('click', () => {
    const name = $('#inputNewLocation')?.value.trim();
    if (!name) return;
    addLocation(name);
    $('#inputNewLocation').value = '';
    renderDataLocations();
    updateDataBadges();
  });

  // Add category
  $('#btnAddCategory')?.addEventListener('click', () => {
    const name = $('#inputNewCategory')?.value.trim();
    if (!name) return;
    addCategory(name);
    $('#inputNewCategory').value = '';
    renderDataCategories();
    updateDataBadges();
  });

  // Listen for openContactsModal event (from contact groups)
  on('openContactsModal', () => {
    // Make sure settings is open and data tab is active
    openSettings();
    const dataTab = document.querySelector('.settings-tab[data-tab="data"]');
    if (dataTab) dataTab.click();
    setTimeout(() => {
      $('#contactsModal').hidden = false;
      contactSearchQuery = '';
      const searchInput = $('#inputContactSearch');
      if (searchInput) searchInput.value = '';
      renderDataParticipants();
      setTimeout(() => $('#inputNewParticipantName')?.focus(), 50);
    }, 100);
  });
}

function closeContactsModal() {
  $('#contactsModal').hidden = true;
}
function closeLocationsModal() {
  $('#locationsModal').hidden = true;
}
function closeCategoriesModal() {
  $('#categoriesModal').hidden = true;
}

function updateDataBadges() {
  const contacts = loadContacts();
  const locations = loadLocations();
  const categories = loadCategories();

  // Update badge counts
  setBadge('#contactsBadge', contacts.length);
  setBadge('#locationsBadge', locations.length);
  setBadge('#categoriesBadge', categories.length);

  // Update tooltips (recent 3 items preview)
  setContactTooltip('#btnOpenContacts', contacts.slice(-3).reverse());
  setTextTooltip('#btnOpenLocations', locations.slice(-3).reverse());
  setTextTooltip('#btnOpenCategories', categories.slice(-3).reverse());
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

async function processSettingsOcr(base64) {
  const btn = $('#btnSettingsScanCard');
  const origText = btn.innerHTML;
  btn.innerHTML = `&#8987; ${t('prep.scanning')}`;
  btn.disabled = true;

  try {
    const result = await ocrBusinessCard(base64);
    if (result) {
      $('#settingsCardName').value = result.name || '';
      $('#settingsCardTitle').value = result.title || '';
      $('#settingsCardCompany').value = result.company || '';
      $('#settingsCardEmail').value = result.email || '';
      $('#settingsCardPhone').value = result.phone || '';
      $('#settingsCardResult').hidden = false;
    }
  } catch (err) {
    emit('toast', { message: t('prep.scan_failed'), type: 'error' });
    console.error('OCR error:', err);
  } finally {
    btn.innerHTML = origText;
    btn.disabled = false;
  }
}

function renderDataParticipants() {
  const list = $('#dataParticipantsList');
  if (!list) return;
  let contacts = loadContacts();
  list.innerHTML = '';

  // Filter by search
  if (contactSearchQuery) {
    contacts = contacts.filter(c =>
      c.name.toLowerCase().includes(contactSearchQuery) ||
      (c.title || '').toLowerCase().includes(contactSearchQuery) ||
      (c.company || '').toLowerCase().includes(contactSearchQuery)
    );
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
      updateDataBadges();
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
      updateDataBadges();
    });
    list.appendChild(item);
  });
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
}
