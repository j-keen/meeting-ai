// meeting-prep.js - Meeting preparation form (Google Forms style)

import { emit } from './app.js';
import {
  loadContacts, addContact, loadMeetingPrepPresets, saveMeetingPrepPreset,
  deleteMeetingPrepPreset, savePreparedMeeting, listMeetings, getMeeting,
} from './storage.js';
import { callGemini } from './gemini-api.js';
import { t } from './i18n.js';
import { showToast } from './ui.js';

const $ = (sel) => document.querySelector(sel);

// ===== Chosung (Korean initial consonant) Search =====
const CHOSUNG = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

function getChosung(char) {
  const code = char.charCodeAt(0);
  if (code < 0xAC00 || code > 0xD7A3) return null;
  return CHOSUNG[Math.floor((code - 0xAC00) / 588)];
}

function extractChosung(str) {
  return [...str].map(ch => getChosung(ch) || ch).join('');
}

function isAllChosung(str) {
  return [...str].every(ch => CHOSUNG.includes(ch));
}

function matchChosung(name, query) {
  if (!query) return true;
  const lower = name.toLowerCase();
  const lowerQ = query.toLowerCase();
  if (lower.includes(lowerQ)) return true;
  if (isAllChosung(query)) {
    const nameChosung = extractChosung(name);
    return nameChosung.includes(query);
  }
  return false;
}

// ===== Form State =====
let formConfig = {
  meetingType: 'general',
  agenda: '',
  attendees: [],
  referenceMeetingId: null,
  referenceAnalysis: '',
  attachedFiles: [],
  notes: '',
  customPrompt: '',
};

let contacts = [];
let cameraStream = null;

// ===== Public API =====
export function initMeetingPrepForm() {
  bindFormEvents();
}

export function openMeetingPrepForm(presetConfig) {
  // Reset form
  formConfig = {
    meetingType: 'general',
    agenda: '',
    attendees: [],
    referenceMeetingId: null,
    referenceAnalysis: '',
    attachedFiles: [],
    notes: '',
    customPrompt: '',
  };

  // Load contacts
  contacts = loadContacts();

  // If preset provided, prefill
  if (presetConfig) {
    fillFormFromConfig(presetConfig);
  }

  // Reset UI
  resetFormUI();

  // Populate presets dropdown
  populatePresetDropdown();

  // Populate reference meetings dropdown
  populateReferenceDropdown();

  // Render contacts
  renderContactList('');

  // Show modal
  $('#meetingPrepModal').hidden = false;
}

export function isMeetingPrepActive() {
  const modal = $('#meetingPrepModal');
  return modal ? !modal.hidden : false;
}

// ===== Form Reset =====
function resetFormUI() {
  // Type selection
  const typeCards = document.querySelectorAll('.prep-type-card');
  typeCards.forEach(card => {
    card.classList.toggle('selected', card.dataset.type === formConfig.meetingType);
  });

  // Text fields
  $('#prepAgendaInput').value = formConfig.agenda;
  $('#prepNotesInput').value = formConfig.notes;

  // Clear badges & file chips
  $('#prepSelectedBadges').innerHTML = '';
  $('#prepFileChips').innerHTML = '';
  $('#prepCardResult').hidden = true;
  $('#prepReferencePreview').hidden = true;
  $('#prepReferenceSelect').value = '';

  // Render attendee badges
  renderSelectedBadges();
  renderFileChips();
}

// ===== Event Bindings =====
function bindFormEvents() {
  // Close button
  $('#btnClosePrepForm').addEventListener('click', closeForm);

  // Meeting type selection
  $('#prepTypeGrid').addEventListener('click', (e) => {
    const card = e.target.closest('.prep-type-card');
    if (!card) return;
    document.querySelectorAll('.prep-type-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    formConfig.meetingType = card.dataset.type;
  });

  // Participant search
  $('#prepParticipantSearch').addEventListener('input', (e) => {
    renderContactList(e.target.value);
  });

  // Participant search - Enter to add manual name
  $('#prepParticipantSearch').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const name = e.target.value.trim();
      if (!name) return;
      if (!formConfig.attendees.find(a => a.name === name)) {
        const contact = addContact({ name, company: '' });
        formConfig.attendees.push({ id: contact.id, name: contact.name });
        contacts.push(contact);
      }
      e.target.value = '';
      renderContactList('');
      renderSelectedBadges();
    }
  });

  // Scan card button
  $('#btnScanCard').addEventListener('click', openCameraForCard);

  // Camera capture
  $('#btnCameraCapture').addEventListener('click', captureCard);
  $('#btnCameraCancel').addEventListener('click', closeCamera);

  // Save card contact
  $('#btnSaveCardContact').addEventListener('click', saveCardContact);

  // Reference meeting selection
  $('#prepReferenceSelect').addEventListener('change', (e) => {
    const id = e.target.value;
    if (!id) {
      formConfig.referenceMeetingId = null;
      formConfig.referenceAnalysis = '';
      $('#prepReferencePreview').hidden = true;
      return;
    }
    const meeting = getMeeting(id);
    if (meeting && meeting.analysisHistory?.length) {
      const lastAnalysis = meeting.analysisHistory[meeting.analysisHistory.length - 1];
      const md = lastAnalysis.markdown || lastAnalysis.raw || '';
      formConfig.referenceMeetingId = id;
      formConfig.referenceAnalysis = md.slice(0, 3000);
      const preview = $('#prepReferencePreview');
      preview.textContent = formConfig.referenceAnalysis.slice(0, 500) + (formConfig.referenceAnalysis.length > 500 ? '...' : '');
      preview.hidden = false;
    }
  });

  // File drop zone
  const dropZone = $('#prepFileDrop');
  const fileInput = $('#prepFileInput');

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    handleFiles(e.dataTransfer.files);
  });
  fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
    fileInput.value = '';
  });

  // Preset dropdown
  $('#prepPresetSelect').addEventListener('change', (e) => {
    const idx = parseInt(e.target.value);
    if (isNaN(idx)) {
      $('#btnDeletePrepPreset').style.display = 'none';
      return;
    }
    const presets = loadMeetingPrepPresets();
    if (presets[idx]) {
      fillFormFromConfig(presets[idx]);
      resetFormUI();
      renderContactList('');
      $('#btnDeletePrepPreset').style.display = '';
    }
  });

  // Delete preset
  $('#btnDeletePrepPreset').addEventListener('click', () => {
    const idx = parseInt($('#prepPresetSelect').value);
    if (isNaN(idx)) return;
    deleteMeetingPrepPreset(idx);
    populatePresetDropdown();
    showToast(t('prep.preset_saved'), 'success');
  });

  // Save preset button
  $('#btnPrepSavePreset').addEventListener('click', () => {
    const name = prompt(t('prep.preset_name'));
    if (!name) return;
    collectFormConfig();
    saveMeetingPrepPreset({
      name,
      meetingType: formConfig.meetingType,
      agenda: formConfig.agenda,
      attendees: formConfig.attendees,
      notes: formConfig.notes,
      customPrompt: formConfig.customPrompt,
    });
    populatePresetDropdown();
    showToast(t('prep.preset_saved'), 'success');
  });

  // Save for later
  $('#btnPrepSaveForLater').addEventListener('click', () => {
    collectFormConfig();
    savePreparedMeeting(formConfig);
    showToast(t('prep.prepared_saved'), 'success');
    closeForm();
  });

  // Start meeting
  $('#btnPrepStart').addEventListener('click', () => {
    collectFormConfig();
    closeForm();
    emit('meetingPrep:complete', { ...formConfig });
  });

  // Close on overlay click
  $('#meetingPrepModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeForm();
  });
}

// ===== Collect form values =====
function collectFormConfig() {
  formConfig.agenda = $('#prepAgendaInput').value.trim();
  formConfig.notes = $('#prepNotesInput').value.trim();
  // meetingType and attendees are already tracked via events
}

// ===== Close Form =====
function closeForm() {
  $('#meetingPrepModal').hidden = true;
}

// ===== Fill Form from Config =====
function fillFormFromConfig(config) {
  if (config.meetingType) formConfig.meetingType = config.meetingType;
  if (config.agenda) formConfig.agenda = config.agenda;
  if (config.attendees) formConfig.attendees = [...config.attendees];
  if (config.notes) formConfig.notes = config.notes;
  if (config.customPrompt) formConfig.customPrompt = config.customPrompt;
  if (config.referenceMeetingId) formConfig.referenceMeetingId = config.referenceMeetingId;
  if (config.referenceAnalysis) formConfig.referenceAnalysis = config.referenceAnalysis;
  if (config.attachedFiles) formConfig.attachedFiles = [...config.attachedFiles];
}

// ===== Preset Dropdown =====
function populatePresetDropdown() {
  const select = $('#prepPresetSelect');
  const presets = loadMeetingPrepPresets();
  select.innerHTML = `<option value="">${t('prep.select_preset')}</option>`;
  presets.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = p.name || `${p.meetingType || 'Preset'} ${p.agenda ? '- ' + p.agenda.slice(0, 20) : ''}`;
    select.appendChild(opt);
  });
  $('#btnDeletePrepPreset').style.display = 'none';
}

// ===== Reference Meeting Dropdown =====
function populateReferenceDropdown() {
  const select = $('#prepReferenceSelect');
  const meetings = listMeetings();
  select.innerHTML = '<option value="">--</option>';
  meetings.slice(0, 20).forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    const date = new Date(m.createdAt).toLocaleDateString();
    opt.textContent = `${m.title || 'Untitled'} (${date})`;
    select.appendChild(opt);
  });
}

// ===== Contact List =====
function renderContactList(query) {
  const listEl = $('#prepContactList');
  listEl.innerHTML = '';
  const filtered = contacts.filter(c => matchChosung(c.name, query));
  filtered.forEach(c => {
    const card = document.createElement('div');
    card.className = 'contact-card' + (formConfig.attendees.find(a => a.id === c.id) ? ' selected' : '');
    card.innerHTML = `<span class="contact-card-name">${escapeHtml(c.name)}</span>` +
      (c.company ? `<span class="contact-card-company">${escapeHtml(c.company)}</span>` : '');
    card.addEventListener('click', () => {
      toggleAttendee(c);
      renderContactList(query);
      renderSelectedBadges();
    });
    listEl.appendChild(card);
  });
}

function toggleAttendee(contact) {
  const idx = formConfig.attendees.findIndex(a => a.id === contact.id);
  if (idx >= 0) {
    formConfig.attendees.splice(idx, 1);
  } else {
    formConfig.attendees.push({ id: contact.id, name: contact.name });
  }
}

function renderSelectedBadges() {
  const area = $('#prepSelectedBadges');
  area.innerHTML = '';
  formConfig.attendees.forEach(a => {
    const badge = document.createElement('span');
    badge.className = 'contact-badge';
    badge.innerHTML = `${escapeHtml(a.name)} <button class="contact-badge-remove">&times;</button>`;
    badge.querySelector('.contact-badge-remove').addEventListener('click', (e) => {
      e.stopPropagation();
      formConfig.attendees = formConfig.attendees.filter(x => x.name !== a.name);
      renderContactList($('#prepParticipantSearch').value);
      renderSelectedBadges();
    });
    area.appendChild(badge);
  });
}

// ===== File Handling =====
function handleFiles(fileList) {
  const MAX_FILES = 5;
  const MAX_SIZE = 100 * 1024;
  const files = Array.from(fileList);

  for (const file of files) {
    if (formConfig.attachedFiles.length >= MAX_FILES) {
      showToast('Max 5 files', 'warning');
      break;
    }
    if (file.size > MAX_SIZE) {
      showToast(`${file.name}: too large (max 100KB)`, 'warning');
      continue;
    }
    const reader = new FileReader();
    reader.onload = () => {
      formConfig.attachedFiles.push({ name: file.name, content: reader.result, size: file.size });
      renderFileChips();
    };
    reader.readAsText(file);
  }
}

function renderFileChips() {
  const container = $('#prepFileChips');
  container.innerHTML = '';
  formConfig.attachedFiles.forEach((f, i) => {
    const chip = document.createElement('span');
    chip.className = 'prep-file-chip';
    chip.innerHTML = `${escapeHtml(f.name)} <button class="prep-file-chip-remove" data-idx="${i}">&times;</button>`;
    chip.querySelector('.prep-file-chip-remove').addEventListener('click', () => {
      formConfig.attachedFiles.splice(i, 1);
      renderFileChips();
    });
    container.appendChild(chip);
  });
}

// ===== Camera / Business Card OCR =====
async function openCameraForCard() {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    });
    const video = $('#cameraPreview');
    video.srcObject = cameraStream;
    $('#cameraModal').hidden = false;
  } catch (err) {
    showToast(t('prep.camera_permission'), 'error');
  }
}

function closeCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
  $('#cameraPreview').srcObject = null;
  $('#cameraModal').hidden = true;
}

async function captureCard() {
  const video = $('#cameraPreview');
  const canvas = $('#cameraCanvas');

  // Resize to 640px max width
  const maxW = 640;
  const scale = Math.min(maxW / video.videoWidth, 1);
  canvas.width = video.videoWidth * scale;
  canvas.height = video.videoHeight * scale;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const base64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];

  closeCamera();

  // Show scanning state
  const scanBtn = $('#btnScanCard');
  const origText = scanBtn.innerHTML;
  scanBtn.innerHTML = `&#8987; ${t('prep.scanning')}`;
  scanBtn.disabled = true;

  try {
    const result = await ocrBusinessCard(base64);
    if (result) {
      $('#prepCardName').value = result.name || '';
      $('#prepCardCompany').value = result.company || '';
      $('#prepCardTitle').value = result.title || '';
      $('#prepCardEmail').value = result.email || '';
      $('#prepCardPhone').value = result.phone || '';
      $('#prepCardResult').hidden = false;
    }
  } catch (err) {
    showToast(t('prep.scan_failed'), 'error');
    console.error('OCR error:', err);
  } finally {
    scanBtn.innerHTML = origText;
    scanBtn.disabled = false;
  }
}

async function ocrBusinessCard(base64) {
  const body = {
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: base64 } },
        { text: 'Extract business card info. Return ONLY valid JSON:\n{"name":"","company":"","title":"","email":"","phone":""}\nIf a field is not found, leave it as empty string.' }
      ]
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
    }
  };

  const response = await callGemini('gemini-2.5-flash-lite', body);
  const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';

  // Multi-stage JSON parse
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Failed to parse OCR result');
  }
}

function saveCardContact() {
  const name = $('#prepCardName').value.trim();
  if (!name) return;

  const contactData = {
    name,
    company: $('#prepCardCompany').value.trim(),
    title: $('#prepCardTitle').value.trim(),
    email: $('#prepCardEmail').value.trim(),
    phone: $('#prepCardPhone').value.trim(),
  };

  const contact = addContact(contactData);
  contacts.push(contact);

  // Add to attendees
  if (!formConfig.attendees.find(a => a.name === contact.name)) {
    formConfig.attendees.push({ id: contact.id, name: contact.name });
  }

  renderContactList($('#prepParticipantSearch').value);
  renderSelectedBadges();
  $('#prepCardResult').hidden = true;
  showToast(t('prep.card_saved'), 'success');
}

// ===== Helpers =====
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
