import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initSettings, openSettings, closeSettings, tryCloseSettings } from '../settings.js';

// ===== Mocks =====

vi.mock('../event-bus.js', () => {
  const listeners = {};
  return {
    state: { settings: {} },
    emit: vi.fn(),
    on: vi.fn((event, fn) => { listeners[event] = fn; return () => {}; }),
  };
});

vi.mock('../storage.js', () => ({
  saveSettings: vi.fn(() => ({ success: true })),
  loadSettings: vi.fn(() => ({})),
  loadContacts: vi.fn(() => []),
  addContact: vi.fn(c => ({ ...c, id: 'test-id' })),
  updateContact: vi.fn(),
  deleteContact: vi.fn(),
  loadLocations: vi.fn(() => []),
  addLocation: vi.fn(),
  deleteLocation: vi.fn(),
  loadTypePrompts: vi.fn(() => ({})),
  saveTypePrompt: vi.fn(),
  deleteTypePrompt: vi.fn(),
  loadCorrectionDict: vi.fn(() => []),
  addCorrectionEntry: vi.fn(),
  deleteCorrectionEntry: vi.fn(),
  findNearbyLocations: vi.fn(() => []),
  findNearestLocation: vi.fn(),
  loadCustomTypes: vi.fn(() => []),
  addCustomType: vi.fn(),
  deleteCustomType: vi.fn(),
}));

vi.mock('../ai.js', () => ({
  getDefaultPrompt: vi.fn(() => 'default prompt'),
  getPromptForType: vi.fn(() => 'default prompt'),
}));

vi.mock('../i18n.js', () => ({
  t: vi.fn(k => k),
  setLanguage: vi.fn(),
  setAiLanguage: vi.fn(),
  getTypeDefaultPrompt: vi.fn(() => 'default prompt'),
}));

vi.mock('../gemini-api.js', () => ({
  callGemini: vi.fn(),
  isProxyAvailable: vi.fn(),
}));

vi.mock('../meeting-prep.js', () => ({
  ocrBusinessCard: vi.fn(),
}));

// ===== DOM Helper =====

function makeEl(tag, id, attrs = {}) {
  const el = document.createElement(tag);
  if (id) el.id = id;
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

function setupSettingsDOM() {
  document.body.textContent = '';

  // Core panel / overlay
  const panel = makeEl('div', 'settingsPanel', { 'aria-hidden': 'true' });
  const overlay = makeEl('div', 'settingsOverlay');
  const btnSettings = makeEl('button', 'btnSettings');
  const btnClose = makeEl('button', 'btnSettingsClose');
  const btnSave = makeEl('button', 'btnSettingsSave');
  btnSave.disabled = true;
  const btnReset = makeEl('button', 'btnSettingsReset');
  const unsavedDot = makeEl('span', 'settingsUnsavedDot');

  // Unsaved modal
  const unsavedModal = makeEl('div', 'settingsUnsavedModal');
  unsavedModal.hidden = true;
  const btnUnsavedSave = makeEl('button', 'btnUnsavedSave');
  const btnUnsavedDiscard = makeEl('button', 'btnUnsavedDiscard');
  const btnUnsavedCancel = makeEl('button', 'btnUnsavedCancel');
  unsavedModal.append(btnUnsavedSave, btnUnsavedDiscard, btnUnsavedCancel);

  // Language selects
  const selUiLang = makeEl('select', 'selectUiLanguage');
  ['auto', 'ko', 'en'].forEach(v => {
    const o = makeEl('option');
    o.value = v;
    o.textContent = v;
    selUiLang.appendChild(o);
  });
  const selAiLang = makeEl('select', 'selectAiLanguage');
  ['auto', 'ko'].forEach(v => {
    const o = makeEl('option');
    o.value = v;
    o.textContent = v;
    selAiLang.appendChild(o);
  });
  const selLang = makeEl('select', 'selectLanguage');
  ['ko', 'en'].forEach(v => {
    const o = makeEl('option');
    o.value = v;
    o.textContent = v;
    selLang.appendChild(o);
  });

  // Per-type prompt selector
  const selTypeForPrompt = makeEl('select', 'selectTypeForPrompt');
  ['general', 'weekly', 'brainstorm', 'sales', '1on1', 'kickoff'].forEach(v => {
    const o = makeEl('option');
    o.value = v;
    o.textContent = v;
    selTypeForPrompt.appendChild(o);
  });

  // Prompt textareas / buttons
  const textPrompt = makeEl('textarea', 'textPrompt');
  const btnResetPrompt = makeEl('button', 'btnResetPrompt');
  const textChatPrompt = makeEl('textarea', 'textChatPrompt');
  const btnResetChatPrompt = makeEl('button', 'btnResetChatPrompt');

  // Chat model
  const chatModelSelect = makeEl('select', 'chatModelSelect');
  const flashOpt = makeEl('option');
  flashOpt.value = 'gemini-2.5-flash';
  flashOpt.textContent = 'Flash';
  chatModelSelect.appendChild(flashOpt);

  // Chat presets
  const chatPresetsList = makeEl('div', 'chatPresetsList');
  const inputNewChatPreset = makeEl('input', 'inputNewChatPreset');
  const btnAddChatPreset = makeEl('button', 'btnAddChatPreset');
  const btnResetChatPresets = makeEl('button', 'btnResetChatPresets');

  // Data badges
  const btnOpenContacts = makeEl('button', 'btnOpenContacts');
  const contactsBadge = makeEl('span', 'contactsBadge');
  const btnOpenLocations = makeEl('button', 'btnOpenLocations');
  const locationsBadge = makeEl('span', 'locationsBadge');
  const btnOpenCategories = makeEl('button', 'btnOpenCategories');
  const categoriesBadge = makeEl('span', 'categoriesBadge');

  // Contacts modal
  const contactsModal = makeEl('div', 'contactsModal');
  contactsModal.hidden = true;
  const btnCloseContacts = makeEl('button', 'btnCloseContacts');
  const inputContactSearch = makeEl('input', 'inputContactSearch');
  const dataParticipantsList = makeEl('div', 'dataParticipantsList');
  const inputNewParticipantName = makeEl('input', 'inputNewParticipantName');
  const inputNewParticipantTitle = makeEl('input', 'inputNewParticipantTitle');
  const inputNewParticipantCompany = makeEl('input', 'inputNewParticipantCompany');
  const btnAddParticipant = makeEl('button', 'btnAddParticipant');
  const btnScanCard = makeEl('button', 'btnSettingsScanCard');
  const settingsPhotoPopup = makeEl('div', 'settingsPhotoPopup');
  settingsPhotoPopup.hidden = true;
  const btnPhotoUpload = makeEl('button', 'btnSettingsPhotoUpload');
  const btnPhotoCamera = makeEl('button', 'btnSettingsPhotoCamera');
  const settingsImageFileInput = makeEl('input', 'settingsImageFileInput');
  settingsImageFileInput.type = 'file';
  const settingsCardResult = makeEl('div', 'settingsCardResult');
  settingsCardResult.hidden = true;
  const settingsCardName = makeEl('input', 'settingsCardName');
  const settingsCardTitle = makeEl('input', 'settingsCardTitle');
  const settingsCardCompany = makeEl('input', 'settingsCardCompany');
  const settingsCardEmail = makeEl('input', 'settingsCardEmail');
  const settingsCardPhone = makeEl('input', 'settingsCardPhone');
  const btnSaveCard = makeEl('button', 'btnSettingsSaveCard');
  settingsCardResult.append(settingsCardName, settingsCardTitle, settingsCardCompany, settingsCardEmail, settingsCardPhone, btnSaveCard);
  contactsModal.append(btnCloseContacts, inputContactSearch, dataParticipantsList,
    inputNewParticipantName, inputNewParticipantTitle, inputNewParticipantCompany,
    btnAddParticipant, btnScanCard, settingsPhotoPopup, btnPhotoUpload, btnPhotoCamera,
    settingsImageFileInput, settingsCardResult);

  // Camera modal
  const cameraModal = makeEl('div', 'cameraModal');
  cameraModal.hidden = true;
  const cameraPreview = makeEl('video', 'cameraPreview');
  const cameraCanvas = makeEl('canvas', 'cameraCanvas');
  const btnCameraCapture = makeEl('button', 'btnCameraCapture');
  const btnCameraCancel = makeEl('button', 'btnCameraCancel');
  cameraModal.append(cameraPreview, cameraCanvas, btnCameraCapture, btnCameraCancel);

  // Locations modal
  const locationsModal = makeEl('div', 'locationsModal');
  locationsModal.hidden = true;
  const btnCloseLocations = makeEl('button', 'btnCloseLocations');
  const dataLocationsList = makeEl('div', 'dataLocationsList');
  const inputNewLocation = makeEl('input', 'inputNewLocation');
  const btnAddLocation = makeEl('button', 'btnAddLocation');
  locationsModal.append(btnCloseLocations, dataLocationsList, inputNewLocation, btnAddLocation);

  // Correction dictionary
  const btnOpenCorrectionDict = makeEl('button', 'btnOpenCorrectionDict');
  const correctionDictBadge = makeEl('span', 'correctionDictBadge');
  const correctionDictModal = makeEl('div', 'correctionDictModal');
  correctionDictModal.hidden = true;
  const btnCloseCorrectionDict = makeEl('button', 'btnCloseCorrectionDict');
  const inputCorrectionSearch = makeEl('input', 'inputCorrectionSearch');
  const inputCorrectionOriginal = makeEl('input', 'inputCorrectionOriginal');
  const inputCorrectionCorrected = makeEl('input', 'inputCorrectionCorrected');
  const btnAddCorrection = makeEl('button', 'btnAddCorrection');
  const dataCorrectionDictList = makeEl('div', 'dataCorrectionDictList');
  const btnCorrectionDictExport = makeEl('button', 'btnCorrectionDictExport');
  const btnCorrectionDictImport = makeEl('button', 'btnCorrectionDictImport');
  const correctionDictFileInput = makeEl('input', 'correctionDictFileInput');
  correctionDictFileInput.type = 'file';
  correctionDictModal.append(
    btnCloseCorrectionDict, inputCorrectionSearch,
    inputCorrectionOriginal, inputCorrectionCorrected,
    btnAddCorrection, dataCorrectionDictList,
    btnCorrectionDictExport, btnCorrectionDictImport, correctionDictFileInput
  );

  document.body.append(
    panel, overlay, btnSettings, btnClose, btnSave, btnReset, unsavedDot,
    unsavedModal,
    selUiLang, selAiLang, selLang,
    selTypeForPrompt,
    textPrompt, btnResetPrompt, textChatPrompt, btnResetChatPrompt,
    chatModelSelect,
    chatPresetsList, inputNewChatPreset, btnAddChatPreset, btnResetChatPresets,
    btnOpenContacts, contactsBadge, btnOpenLocations, locationsBadge,
    contactsModal, cameraModal, locationsModal,
    btnOpenCorrectionDict, correctionDictBadge, correctionDictModal
  );
}

// ===== Tests =====

describe('openSettings', () => {
  beforeEach(() => {
    setupSettingsDOM();
  });

  it('adds "open" class to the settings panel', () => {
    openSettings();
    expect(document.getElementById('settingsPanel').classList.contains('open')).toBe(true);
  });

  it('adds "visible" class to the overlay', () => {
    openSettings();
    expect(document.getElementById('settingsOverlay').classList.contains('visible')).toBe(true);
  });

  it('sets aria-hidden to false on the panel', () => {
    openSettings();
    expect(document.getElementById('settingsPanel').getAttribute('aria-hidden')).toBe('false');
  });
});

describe('closeSettings', () => {
  beforeEach(() => {
    setupSettingsDOM();
  });

  it('removes "open" class from panel', () => {
    const panel = document.getElementById('settingsPanel');
    panel.classList.add('open');
    closeSettings();
    expect(panel.classList.contains('open')).toBe(false);
  });

  it('removes "visible" class from overlay', () => {
    const overlay = document.getElementById('settingsOverlay');
    overlay.classList.add('visible');
    closeSettings();
    expect(overlay.classList.contains('visible')).toBe(false);
  });

  it('sets aria-hidden to true on panel', () => {
    const panel = document.getElementById('settingsPanel');
    panel.setAttribute('aria-hidden', 'false');
    closeSettings();
    expect(panel.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('tryCloseSettings', () => {
  beforeEach(() => {
    setupSettingsDOM();
    // initSettings must be called so change listeners (markDirty) are bound
    initSettings();
  });

  it('closes panel directly when not dirty', () => {
    openSettings();
    closeSettings(); // resets isDirty to false
    openSettings();
    tryCloseSettings();
    expect(document.getElementById('settingsPanel').classList.contains('open')).toBe(false);
  });

  it('shows unsaved modal when settings are dirty', () => {
    openSettings(); // snapshots settings

    // Trigger change on a select — initSettings binds this to markDirty
    const sel = document.getElementById('selectUiLanguage');
    sel.value = 'ko';
    sel.dispatchEvent(new Event('change'));

    tryCloseSettings();

    expect(document.getElementById('settingsUnsavedModal').hidden).toBe(false);
  });

  it('does not close panel when dirty', () => {
    openSettings();

    const sel = document.getElementById('selectUiLanguage');
    sel.value = 'ko';
    sel.dispatchEvent(new Event('change'));

    tryCloseSettings();

    expect(document.getElementById('settingsPanel').classList.contains('open')).toBe(true);
  });
});

describe('initSettings', () => {
  beforeEach(() => {
    setupSettingsDOM();
  });

  it('does not throw with a fully populated DOM', () => {
    expect(() => initSettings()).not.toThrow();
  });

  it('btnSettings click opens the panel', () => {
    initSettings();
    document.getElementById('btnSettings').click();
    expect(document.getElementById('settingsPanel').classList.contains('open')).toBe(true);
  });

  it('btnSettingsClose click calls tryCloseSettings (closes when not dirty)', () => {
    initSettings();
    openSettings();
    document.getElementById('btnSettingsClose').click();
    expect(document.getElementById('settingsPanel').classList.contains('open')).toBe(false);
  });

  it('overlay click calls tryCloseSettings (closes when not dirty)', () => {
    initSettings();
    openSettings();
    document.getElementById('settingsOverlay').click();
    expect(document.getElementById('settingsPanel').classList.contains('open')).toBe(false);
  });

  it('btnUnsavedCancel hides modal without closing panel', () => {
    initSettings();
    openSettings();

    const sel = document.getElementById('selectUiLanguage');
    sel.value = 'ko';
    sel.dispatchEvent(new Event('change'));

    tryCloseSettings();
    expect(document.getElementById('settingsUnsavedModal').hidden).toBe(false);

    document.getElementById('btnUnsavedCancel').click();
    expect(document.getElementById('settingsUnsavedModal').hidden).toBe(true);
    expect(document.getElementById('settingsPanel').classList.contains('open')).toBe(true);
  });

  it('btnUnsavedDiscard closes panel after discarding changes', () => {
    initSettings();
    openSettings();

    const sel = document.getElementById('selectUiLanguage');
    sel.value = 'ko';
    sel.dispatchEvent(new Event('change'));

    tryCloseSettings();
    document.getElementById('btnUnsavedDiscard').click();
    expect(document.getElementById('settingsPanel').classList.contains('open')).toBe(false);
  });

  it('btnResetPrompt restores the default prompt text', () => {
    initSettings();
    const textarea = document.getElementById('textPrompt');
    textarea.value = 'custom prompt text';
    document.getElementById('btnResetPrompt').click();
    expect(textarea.value).toBe('default prompt');
  });

  it('btnResetChatPrompt clears the chat system prompt', () => {
    initSettings();
    const textarea = document.getElementById('textChatPrompt');
    textarea.value = 'some chat system prompt';
    document.getElementById('btnResetChatPrompt').click();
    expect(textarea.value).toBe('');
  });
});
