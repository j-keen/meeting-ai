// import-transcript.js - Import transcript from text paste or audio upload (P-4 + P-6)

import { emit } from './event-bus.js';
import { t } from './i18n.js';
import { showToast } from './ui.js';

const $ = (sel) => document.querySelector(sel);

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ===== Text Parsing =====
export function parseImportedText(raw) {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const tsPattern = /^\[?(\d{1,2}):(\d{2})(?::(\d{2}))?\]?\s*[-–]?\s*/;
  const result = [];

  lines.forEach((line, idx) => {
    const match = line.match(tsPattern);
    let timestamp;
    let text;

    if (match) {
      const hours = match[3] !== undefined ? parseInt(match[1]) : 0;
      const mins = match[3] !== undefined ? parseInt(match[2]) : parseInt(match[1]);
      const secs = match[3] !== undefined ? parseInt(match[3]) : parseInt(match[2]);
      timestamp = (hours * 3600 + mins * 60 + secs) * 1000;
      text = line.slice(match[0].length).trim();
    } else {
      timestamp = idx * 1000;
      text = line;
    }

    if (!text) return;

    result.push({
      id: generateId(),
      text,
      timestamp,
      bookmarked: false,
    });
  });

  return result;
}

// ===== Tab Switching =====
function switchTab(tabName) {
  document.querySelectorAll('.import-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  $('#importTabText').hidden = tabName !== 'text';
  $('#importTabAudio').hidden = tabName !== 'audio';
}

// ===== Stats =====
function updateStats(text) {
  const statsEl = $('#importStats');
  if (!statsEl) return;
  if (!text.trim()) {
    statsEl.textContent = '';
    return;
  }
  const lines = text.split('\n').filter(l => l.trim()).length;
  const chars = text.length;
  statsEl.textContent = t('import.stats', { lines, chars });
}

// ===== Audio Upload =====
const MAX_FILE_SIZE = 4.5 * 1024 * 1024; // 4.5MB
let selectedFile = null;

function handleFileSelect(file) {
  if (!file) return;
  if (file.size > MAX_FILE_SIZE) {
    showToast(t('import.file_too_large'), 'error');
    return;
  }
  selectedFile = file;
  const infoEl = $('#importFileInfo');
  infoEl.hidden = false;
  const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
  infoEl.textContent = `${file.name} (${sizeMB} MB)`;
  $('#btnAudioTranscribe').disabled = false;
}

function setupDropzone() {
  const dropzone = $('#importDropzone');
  const fileInput = $('#importFileInput');
  if (!dropzone || !fileInput) return;

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragenter', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFileSelect(file);
    e.target.value = '';
  });
}

async function transcribeAudio() {
  if (!selectedFile) return;

  const progress = $('#importProgress');
  progress.hidden = false;
  $('#btnAudioTranscribe').disabled = true;
  $('#btnAudioCancel').disabled = true;

  try {
    const lang = $('#importAudioLang').value || 'ko';
    const resp = await fetch(`/api/transcribe?language=${lang}`, {
      method: 'POST',
      body: selectedFile,
      headers: { 'Content-Type': selectedFile.type || 'audio/mpeg' },
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${resp.status}`);
    }

    const data = await resp.json();
    if (!data.lines || data.lines.length === 0) {
      showToast(t('import.no_speech'), 'warning');
      return;
    }

    const transcript = data.lines.map(line => ({
      id: generateId(),
      text: line.text,
      timestamp: Math.round(line.start * 1000),
      bookmarked: false,
    }));

    closeImportModal();
    emit('import:complete', { transcript, type: 'uploaded' });
    showToast(t('import.upload_success', { lines: transcript.length }), 'success');
  } catch (err) {
    showToast(t('import.transcribe_error') + ': ' + err.message, 'error');
  } finally {
    progress.hidden = true;
    $('#btnAudioTranscribe').disabled = false;
    $('#btnAudioCancel').disabled = false;
  }
}

// ===== Modal =====
export function openImportModal() {
  const modal = $('#importModal');
  if (!modal) return;
  modal.hidden = false;
  // Reset state
  const textarea = $('#importTextarea');
  if (textarea) textarea.value = '';
  $('#importStats').textContent = '';
  selectedFile = null;
  const infoEl = $('#importFileInfo');
  if (infoEl) infoEl.hidden = true;
  const progress = $('#importProgress');
  if (progress) progress.hidden = true;
  $('#btnAudioTranscribe').disabled = true;
  switchTab('text');
  setTimeout(() => textarea?.focus(), 100);
}

function closeImportModal() {
  const modal = $('#importModal');
  if (modal) modal.hidden = true;
  selectedFile = null;
}

// ===== Init =====
export function initImportTranscript() {
  // Tab switching
  document.querySelectorAll('.import-tab').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Text import
  const textarea = $('#importTextarea');
  textarea?.addEventListener('input', () => updateStats(textarea.value));

  $('#btnImportConfirm')?.addEventListener('click', () => {
    const raw = $('#importTextarea')?.value?.trim();
    if (!raw) {
      showToast(t('import.empty_text'), 'warning');
      return;
    }
    const transcript = parseImportedText(raw);
    if (transcript.length === 0) {
      showToast(t('import.empty_text'), 'warning');
      return;
    }
    closeImportModal();
    emit('import:complete', { transcript, type: 'imported' });
    showToast(t('import.text_success', { lines: transcript.length }), 'success');
  });

  $('#btnImportCancel')?.addEventListener('click', closeImportModal);

  // Audio upload
  setupDropzone();
  $('#btnAudioTranscribe')?.addEventListener('click', transcribeAudio);
  $('#btnAudioCancel')?.addEventListener('click', closeImportModal);

  // Close button
  $('#importCloseBtn')?.addEventListener('click', closeImportModal);

  // Overlay click to close
  $('#importModal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeImportModal();
  });
}
