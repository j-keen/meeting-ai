// quick-start.js - Quick Start UI: preset cards (launcher + builder chips) and the
// confirm sheet (#quickPresetModal). One tap on a card opens the sheet with the
// preset prefilled; "바로 시작" applies it and starts recording — no AI round-trip.

import { state, on, emit } from './event-bus.js';
import { t, getAiLanguage } from './i18n.js';
import { loadCustomTypes, loadSettings } from './storage.js';
import { escapeHtml } from './utils.js';
import { openPromptBuilder } from './prompt-builder.js';
import {
  QUICK_PRESETS, getQuickPreset, localizePreset, customTypeAsPreset, buildQuickPresetConfig,
} from './quick-presets.js';

const $ = (sel) => document.querySelector(sel);
const OVERRIDES_KEY = 'meeting-ai-quick-preset-overrides';

// Lucide-style 24px stroke icons (same drawing style as the launcher's other icons).
const ICONS = {
  lecture: '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  briefcase: '<rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  message: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>',
  bulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
};

function iconSvg(name, cls = 'icon-20') {
  return `<svg class="${cls}" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.star}</svg>`;
}

// ===== Per-preset edits (remembered per viewer; "reset" restores the defaults) =====
function loadOverrides() {
  try { return JSON.parse(localStorage.getItem(OVERRIDES_KEY) || '{}') || {}; } catch { return {}; }
}
function saveOverride(id, value) {
  try {
    const all = loadOverrides();
    if (value) all[id] = value; else delete all[id];
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify(all));
  } catch { /* storage unavailable: edits apply to this session only */ }
}

const sameList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const toLines = (text) => String(text || '').split('\n').map(s => s.trim()).filter(Boolean);

// ===== Preset list =====
/** Built-in presets (localized) followed by the user's saved custom presets. */
export function listQuickPresets() {
  const lang = getAiLanguage();
  const builtIns = QUICK_PRESETS.map(p => localizePreset(p, lang));
  let customs = [];
  try { customs = loadCustomTypes().map(customTypeAsPreset); } catch { customs = []; }
  return [...builtIns, ...customs];
}

function findPreset(id) {
  const lang = getAiLanguage();
  const builtIn = getQuickPreset(id);
  if (builtIn) return localizePreset(builtIn, lang);
  const ct = loadCustomTypes().find(c => c.id === id);
  return ct ? customTypeAsPreset(ct) : null;
}

/**
 * Render preset cards into `container`. Each card opens the confirm sheet;
 * `beforeOpen` runs first (e.g. to close the launcher).
 */
export function renderPresetGrid(container, { beforeOpen } = {}) {
  if (!container) return [];
  const presets = listQuickPresets();
  const overrides = loadOverrides();
  container.innerHTML = '';
  presets.forEach((p, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'qp-card' + (p.builtIn ? '' : ' qp-card-custom');
    btn.dataset.presetId = p.id;
    const badge = i < 9 ? `<span class="qp-card-key" aria-hidden="true">${i + 1}</span>` : '';
    const sub = p.builtIn ? p.description : (p.description || t('launcher.my_preset'));
    btn.innerHTML = `
      <span class="qp-card-icon">${iconSvg(p.icon)}</span>
      <span class="qp-card-text">
        <span class="qp-card-name">${escapeHtml(p.name)}${overrides[p.id] ? ` <span class="qp-card-edited">${escapeHtml(t('qp.edited'))}</span>` : ''}</span>
        <span class="qp-card-desc">${escapeHtml(sub)}</span>
      </span>${badge}`;
    btn.addEventListener('click', () => {
      beforeOpen?.();
      openQuickPresetSheet(p.id);
    });
    container.appendChild(btn);
  });
  return presets;
}

// ===== Confirm sheet =====
let current = null; // { preset, defaults: {focus, questions} }

function fillSheet(preset) {
  const ov = loadOverrides()[preset.id] || null;
  const focus = ov?.focusPoints ?? preset.focusPoints ?? [];
  const questions = ov?.chatPresets ?? preset.chatPresets ?? [];
  $('#qpIcon').innerHTML = iconSvg(preset.icon, 'icon-24');
  $('#qpTitle').textContent = preset.name;
  $('#qpDesc').textContent = preset.summary || preset.description || '';
  const subject = $('#qpSubject');
  subject.value = '';
  subject.placeholder = preset.subjectPlaceholder || '';
  $('#qpFocus').value = focus.join('\n');
  $('#qpFocus').rows = Math.min(5, Math.max(2, focus.length));
  $('#qpQuestions').value = questions.join('\n');
  $('#qpQuestions').rows = Math.min(5, Math.max(2, questions.length));
  $('#qpReset').hidden = !ov;
}

export function openQuickPresetSheet(presetId) {
  const modal = $('#quickPresetModal');
  const preset = findPreset(presetId);
  if (!modal || !preset) return;
  current = { preset };
  fillSheet(preset);
  modal.hidden = false;
  // Primary action takes focus: Enter starts right away (the 2nd tap).
  requestAnimationFrame(() => $('#qpStart')?.focus());
}

function closeSheet() {
  const modal = $('#quickPresetModal');
  if (modal) modal.hidden = true;
  current = null;
}

function readEdits() {
  return {
    subject: $('#qpSubject').value.trim(),
    focusPoints: toLines($('#qpFocus').value),
    chatPresets: toLines($('#qpQuestions').value),
  };
}

/** Remember edits to focus/questions (differing from the defaults) for next time. */
function persistEdits(preset, edits) {
  const same = sameList(edits.focusPoints, preset.focusPoints || [])
    && sameList(edits.chatPresets, preset.chatPresets || []);
  saveOverride(preset.id, same ? null : { focusPoints: edits.focusPoints, chatPresets: edits.chatPresets });
}

function startFromSheet() {
  if (!current) return;
  const { preset } = current;
  const edits = readEdits();
  persistEdits(preset, edits);
  const config = buildQuickPresetConfig(preset, getAiLanguage(), edits);
  closeSheet();
  emit('quickPreset:start', config);
}

function customizeWithAi() {
  if (!current) return;
  const { preset } = current;
  const subject = $('#qpSubject').value.trim();
  closeSheet();
  openPromptBuilder({ prefill: subject ? `${preset.name} — ${subject}` : preset.name });
}

/** Label for the launcher's "current style" line, or '' when the active style isn't a quick preset. */
export function activeQuickPresetName() {
  // settings.js rebuilds state.settings from a key whitelist on load, so fall back to storage.
  let a = state.settings?.activeQuickPreset;
  if (!a) { try { a = loadSettings().activeQuickPreset; } catch { a = null; } }
  if (!a || !a.name) return '';
  return a.prompt === state.settings.customPrompt ? a.name : '';
}

export function initQuickStart() {
  const modal = $('#quickPresetModal');
  if (!modal) return;
  $('#qpStart').addEventListener('click', startFromSheet);
  $('#qpAiCustom').addEventListener('click', customizeWithAi);
  $('#qpCloseBtn').addEventListener('click', closeSheet);
  $('#qpReset').addEventListener('click', () => {
    if (!current) return;
    saveOverride(current.preset.id, null);
    fillSheet(current.preset);
    $('#qpStart')?.focus();
  });
  modal.addEventListener('click', (e) => { if (e.target === modal) closeSheet(); });
  // Enter in the single-line subject field = start (textareas keep Enter for new lines).
  $('#qpSubject').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); startFromSheet(); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeSheet();
  });
  // Builder scenario chips and other entry points open a preset by id.
  on('quickPreset:open', (id) => openQuickPresetSheet(id));
}
