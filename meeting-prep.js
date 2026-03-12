// meeting-prep.js - Meeting preparation form (Google Forms style)

import { emit } from './app.js';
import {
  loadContacts, addContact, saveMeetingPrepPreset,
  savePreparedMeeting, listMeetings, getMeeting,
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
  // Type selection (radio list)
  const typeRadios = document.querySelectorAll('.prep-type-radio');
  typeRadios.forEach(radio => {
    radio.classList.toggle('selected', radio.dataset.type === formConfig.meetingType);
  });

  // Q&A fields — parse agenda into fields
  fillAgendaFields(formConfig.agenda);
  $('#prepNotesInput').value = formConfig.notes;

  // Clear badges & file chips
  $('#prepSelectedBadges').innerHTML = '';
  $('#prepFileChips').innerHTML = '';
  $('#prepCardResult').hidden = true;
  $('#prepReferencePreview').hidden = true;
  $('#prepReferenceChip').hidden = true;
  $('#prepAgendaSuggestions').hidden = true;

  // Render attendee badges
  renderSelectedBadges();
  renderFileChips();
}

function fillAgendaFields(agenda) {
  if (!agenda) {
    $('#prepAgendaGoal').value = '';
    $('#prepAgendaContext').value = '';
    $('#prepAgendaTopics').value = '';
    $('#prepAgendaOutcomes').value = '';
    return;
  }
  // Try to parse structured format
  const goalMatch = agenda.match(/\[목표\]\s*([\s\S]*?)(?=\[배경\]|\[안건\]|\[기대결과\]|$)/);
  const ctxMatch = agenda.match(/\[배경\]\s*([\s\S]*?)(?=\[목표\]|\[안건\]|\[기대결과\]|$)/);
  const topicsMatch = agenda.match(/\[안건\]\s*([\s\S]*?)(?=\[목표\]|\[배경\]|\[기대결과\]|$)/);
  const outcomesMatch = agenda.match(/\[기대결과\]\s*([\s\S]*?)(?=\[목표\]|\[배경\]|\[안건\]|$)/);

  if (goalMatch || ctxMatch || topicsMatch || outcomesMatch) {
    $('#prepAgendaGoal').value = (goalMatch?.[1] || '').trim();
    $('#prepAgendaContext').value = (ctxMatch?.[1] || '').trim();
    $('#prepAgendaTopics').value = (topicsMatch?.[1] || '').trim();
    $('#prepAgendaOutcomes').value = (outcomesMatch?.[1] || '').trim();
  } else {
    // Unstructured: put everything in topics
    $('#prepAgendaGoal').value = '';
    $('#prepAgendaContext').value = '';
    $('#prepAgendaTopics').value = agenda;
    $('#prepAgendaOutcomes').value = '';
  }
}

// ===== Event Bindings =====
function bindFormEvents() {
  // Close button
  $('#btnClosePrepForm').addEventListener('click', closeForm);

  // Meeting type selection (radio list)
  $('#prepTypeGrid').addEventListener('click', (e) => {
    const radio = e.target.closest('.prep-type-radio');
    if (!radio) return;
    document.querySelectorAll('.prep-type-radio').forEach(r => r.classList.remove('selected'));
    radio.classList.add('selected');
    formConfig.meetingType = radio.dataset.type;
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

  // Photo button — popup toggle
  $('#btnScanCard').addEventListener('click', (e) => {
    e.stopPropagation();
    const popup = $('#prepPhotoPopup');
    popup.hidden = !popup.hidden;
  });
  $('#btnPhotoUpload').addEventListener('click', () => {
    $('#prepPhotoPopup').hidden = true;
    $('#prepImageFileInput').click();
  });
  $('#btnPhotoCamera').addEventListener('click', () => {
    $('#prepPhotoPopup').hidden = true;
    openCameraForCard();
  });
  $('#prepImageFileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      processOcrImage(base64);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });
  // Close photo popup on outside click
  document.addEventListener('click', (e) => {
    const popup = $('#prepPhotoPopup');
    if (popup && !popup.hidden && !e.target.closest('#btnScanCard') && !popup.contains(e.target)) {
      popup.hidden = true;
    }
  });

  // Camera capture
  $('#btnCameraCapture').addEventListener('click', captureCard);
  $('#btnCameraCancel').addEventListener('click', closeCamera);

  // Save card contact
  $('#btnSaveCardContact').addEventListener('click', saveCardContact);

  // Reference meeting — open submodal
  $('#btnOpenRefModal').addEventListener('click', openReferenceSubmodal);
  $('#btnCloseRefSubmodal').addEventListener('click', () => { $('#prepRefSubmodal').hidden = true; });
  $('#btnConfirmReference').addEventListener('click', confirmReferenceSelection);
  $('#btnRemoveReference').addEventListener('click', clearReference);
  // Submodal filters
  $('#refSearchInput').addEventListener('input', renderRefMeetingList);
  $('#refFilterType').addEventListener('change', renderRefMeetingList);
  $('#refFilterDateFrom').addEventListener('change', renderRefMeetingList);
  $('#refFilterDateTo').addEventListener('change', renderRefMeetingList);

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
  const goal = $('#prepAgendaGoal').value.trim();
  const ctx = $('#prepAgendaContext').value.trim();
  const topics = $('#prepAgendaTopics').value.trim();
  const outcomes = $('#prepAgendaOutcomes').value.trim();
  const parts = [];
  if (goal) parts.push(`[목표] ${goal}`);
  if (ctx) parts.push(`[배경] ${ctx}`);
  if (topics) parts.push(`[안건] ${topics}`);
  if (outcomes) parts.push(`[기대결과] ${outcomes}`);
  formConfig.agenda = parts.join('\n');
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

// ===== Reference Meeting Submodal =====
let refMeetings = [];
let selectedRefId = null;

function openReferenceSubmodal() {
  refMeetings = listMeetings();
  selectedRefId = null;
  $('#refSearchInput').value = '';
  $('#refFilterType').value = '';
  $('#refFilterDateFrom').value = '';
  $('#refFilterDateTo').value = '';
  $('#refMeetingPreview').hidden = true;
  $('#btnConfirmReference').disabled = true;
  renderRefMeetingList();
  $('#prepRefSubmodal').hidden = false;
}

function renderRefMeetingList() {
  const query = $('#refSearchInput').value.trim().toLowerCase();
  const typeFilter = $('#refFilterType').value;
  const dateFrom = $('#refFilterDateFrom').value;
  const dateTo = $('#refFilterDateTo').value;

  let filtered = refMeetings;
  if (query) filtered = filtered.filter(m => (m.title || '').toLowerCase().includes(query));
  if (typeFilter) filtered = filtered.filter(m => m.preset === typeFilter);
  if (dateFrom) filtered = filtered.filter(m => new Date(m.createdAt) >= new Date(dateFrom));
  if (dateTo) filtered = filtered.filter(m => new Date(m.createdAt) <= new Date(dateTo + 'T23:59:59'));

  const listEl = $('#refMeetingList');
  listEl.innerHTML = '';
  filtered.slice(0, 30).forEach(m => {
    const card = document.createElement('div');
    card.className = 'prep-ref-meeting-card' + (m.id === selectedRefId ? ' selected' : '');
    const date = new Date(m.createdAt).toLocaleDateString();
    card.innerHTML = `
      <div class="prep-ref-meeting-card-title">${escapeHtml(m.title || 'Untitled')}</div>
      <div class="prep-ref-meeting-card-meta">${date} · ${m.preset || 'general'}</div>
    `;
    card.addEventListener('click', () => selectRefMeeting(m.id));
    listEl.appendChild(card);
  });
  if (filtered.length === 0) {
    listEl.innerHTML = '<p class="text-muted" style="padding:16px;text-align:center;">No meetings found</p>';
  }
}

function selectRefMeeting(id) {
  selectedRefId = id;
  // Highlight card
  document.querySelectorAll('.prep-ref-meeting-card').forEach(c => c.classList.remove('selected'));
  const cards = document.querySelectorAll('.prep-ref-meeting-card');
  cards.forEach(c => {
    const title = c.querySelector('.prep-ref-meeting-card-title')?.textContent;
    const meeting = refMeetings.find(m => m.id === id);
    if (meeting && title === (meeting.title || 'Untitled')) c.classList.add('selected');
  });

  // Show preview
  const meeting = getMeeting(id);
  const previewEl = $('#refMeetingPreview');
  if (meeting && meeting.analysisHistory?.length) {
    const lastAnalysis = meeting.analysisHistory[meeting.analysisHistory.length - 1];
    const md = lastAnalysis.markdown || lastAnalysis.raw || '';
    previewEl.textContent = md.slice(0, 500) + (md.length > 500 ? '...' : '');
    previewEl.hidden = false;
  } else {
    previewEl.textContent = 'No analysis available';
    previewEl.hidden = false;
  }
  $('#btnConfirmReference').disabled = false;
}

function confirmReferenceSelection() {
  if (!selectedRefId) return;
  const meeting = getMeeting(selectedRefId);
  if (meeting && meeting.analysisHistory?.length) {
    const lastAnalysis = meeting.analysisHistory[meeting.analysisHistory.length - 1];
    const md = lastAnalysis.markdown || lastAnalysis.raw || '';
    formConfig.referenceMeetingId = selectedRefId;
    formConfig.referenceAnalysis = md.slice(0, 3000);

    // Show chip
    const chip = $('#prepReferenceChip');
    $('#prepReferenceChipText').textContent = meeting.title || 'Untitled';
    chip.hidden = false;

    // Show preview
    const preview = $('#prepReferencePreview');
    preview.textContent = formConfig.referenceAnalysis.slice(0, 500) + (formConfig.referenceAnalysis.length > 500 ? '...' : '');
    preview.hidden = false;

    // Close submodal
    $('#prepRefSubmodal').hidden = true;

    // Suggest follow-up agenda
    suggestFollowUpAgenda(formConfig.referenceAnalysis);
  }
}

function clearReference() {
  formConfig.referenceMeetingId = null;
  formConfig.referenceAnalysis = '';
  $('#prepReferenceChip').hidden = true;
  $('#prepReferencePreview').hidden = true;
  $('#prepAgendaSuggestions').hidden = true;
}

// ===== Auto Agenda Suggestions =====
async function suggestFollowUpAgenda(analysisText) {
  const el = $('#prepAgendaSuggestions');
  el.hidden = false;
  el.innerHTML = `<span class="text-muted">${t('prep.ref_suggest_loading')}</span>`;

  try {
    const body = {
      contents: [{ role: 'user', parts: [{ text:
        `Based on this meeting analysis, suggest 3-5 follow-up agenda items.
Return JSON: [{"text":"...","field":"goal|topics|outcomes"}]

${analysisText.slice(0, 3000)}`
      }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.3 }
    };

    const res = await callGemini('gemini-2.5-flash-lite', body);
    const text = res.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    let items;
    try { items = JSON.parse(text); } catch { items = []; }

    el.innerHTML = '';
    if (!items.length) { el.hidden = true; return; }

    items.forEach(s => {
      const chip = document.createElement('button');
      chip.className = 'prep-agenda-suggestion-chip';
      chip.textContent = s.text;
      chip.onclick = () => {
        const target = { goal: '#prepAgendaGoal', topics: '#prepAgendaTopics', outcomes: '#prepAgendaOutcomes' }[s.field] || '#prepAgendaTopics';
        const input = $(target);
        input.value = input.value ? input.value + '\n' + s.text : s.text;
        chip.remove();
        if (!el.children.length) el.hidden = true;
      };
      el.appendChild(chip);
    });
  } catch (err) {
    console.error('Suggestion error:', err);
    el.hidden = true;
  }
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
  processOcrImage(base64);
}

async function processOcrImage(base64) {
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
