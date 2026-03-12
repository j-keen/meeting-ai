// meeting-prep.js - Meeting preparation wizard (5-step)

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

// ===== Wizard State =====
let currentStep = 1;
const TOTAL_STEPS = 5;
let maxVisitedStep = 1;

// ===== Form State =====
let formConfig = {
  meetingType: 'general',
  agenda: '',
  attendees: [],
  referenceMeetingId: null,
  referenceAnalysis: '',
  attachedFiles: [],
  customPrompt: '',
};

let contacts = [];

// ===== Public API =====
export function initMeetingPrepForm() {
  bindFormEvents();
}

export function openMeetingPrepForm(presetConfig) {
  formConfig = {
    meetingType: 'general',
    agenda: '',
    attendees: [],
    referenceMeetingId: null,
    referenceAnalysis: '',
    attachedFiles: [],
    customPrompt: '',
  };

  contacts = loadContacts();

  if (presetConfig) {
    fillFormFromConfig(presetConfig);
  }

  resetFormUI();
  goToStep(1);
  $('#meetingPrepModal').hidden = false;
}

export function isMeetingPrepActive() {
  const modal = $('#meetingPrepModal');
  return modal ? !modal.hidden : false;
}

// ===== Wizard Navigation =====
function goToStep(step) {
  if (step < 1 || step > TOTAL_STEPS) return;
  currentStep = step;
  if (step > maxVisitedStep) maxVisitedStep = step;

  // Show/hide panels
  document.querySelectorAll('.prep-step-panel').forEach(p => {
    p.classList.toggle('active', parseInt(p.dataset.step) === step);
  });

  // Update step indicator
  document.querySelectorAll('.prep-step-dot').forEach(dot => {
    const s = parseInt(dot.dataset.step);
    const numEl = dot.querySelector('.prep-step-num');
    dot.classList.remove('active', 'completed');
    dot.disabled = s > maxVisitedStep;
    if (s === step) {
      dot.classList.add('active');
      numEl.textContent = s;
    } else if (s < step) {
      dot.classList.add('completed');
      numEl.textContent = '\u2713';
    } else {
      numEl.textContent = s;
    }
  });

  // Update step lines
  document.querySelectorAll('.prep-step-line').forEach((line, i) => {
    line.classList.toggle('completed', (i + 1) < step);
  });

  // Nav buttons
  const backBtn = $('#btnPrepBack');
  const nextBtn = $('#btnPrepNext');
  backBtn.hidden = step === 1;
  nextBtn.hidden = step === TOTAL_STEPS;

  // Load step-specific data
  if (step === 4) {
    loadReferenceStep();
  }
}

// ===== Form Reset =====
function resetFormUI() {
  currentStep = 1;
  maxVisitedStep = 1;

  // Type selection
  document.querySelectorAll('.prep-type-radio').forEach(radio => {
    radio.classList.toggle('selected', radio.dataset.type === formConfig.meetingType);
  });

  // Agenda fields
  fillAgendaFields(formConfig.agenda);

  // Clear participant input & badges
  $('#prepParticipantSearch').value = '';
  $('#prepSelectedBadges').innerHTML = '';
  $('#prepAutocompleteDropdown').hidden = true;

  // Clear file chips
  $('#prepFileChips').innerHTML = '';

  // Reference
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

  // Step indicator clicks
  $('#prepWizardSteps').addEventListener('click', (e) => {
    const dot = e.target.closest('.prep-step-dot');
    if (!dot || dot.disabled) return;
    goToStep(parseInt(dot.dataset.step));
  });

  // Wizard nav
  $('#btnPrepBack').addEventListener('click', () => goToStep(currentStep - 1));
  $('#btnPrepNext').addEventListener('click', () => goToStep(currentStep + 1));

  // Step 1: Meeting type selection — auto-advance
  $('#prepTypeGrid').addEventListener('click', (e) => {
    const radio = e.target.closest('.prep-type-radio');
    if (!radio) return;
    document.querySelectorAll('.prep-type-radio').forEach(r => r.classList.remove('selected'));
    radio.classList.add('selected');
    formConfig.meetingType = radio.dataset.type;
    setTimeout(() => goToStep(2), 250);
  });

  // Step 3: Participant input — spacebar to create badge
  const participantInput = $('#prepParticipantSearch');
  participantInput.addEventListener('keydown', (e) => {
    if (e.key === ' ') {
      const text = e.target.value.trim();
      if (!text) return; // allow normal space if empty
      e.preventDefault();
      addAttendeeFromText(text);
      e.target.value = '';
      hideAutocomplete();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const text = e.target.value.trim();
      if (!text) return;
      // If autocomplete is showing and has a highlighted item, select it
      const highlighted = $('#prepAutocompleteDropdown .prep-autocomplete-item.highlighted');
      if (highlighted) {
        highlighted.click();
      } else {
        addAttendeeFromText(text);
        e.target.value = '';
        hideAutocomplete();
      }
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const dropdown = $('#prepAutocompleteDropdown');
      if (dropdown.hidden) return;
      e.preventDefault();
      navigateAutocomplete(e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === 'Escape') {
      hideAutocomplete();
    }
  });

  // Autocomplete on input
  participantInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    if (query.length > 0) {
      showAutocomplete(query);
    } else {
      hideAutocomplete();
    }
  });

  // Hide autocomplete on blur (with delay for click)
  participantInput.addEventListener('blur', () => {
    setTimeout(() => hideAutocomplete(), 200);
  });

  // Step 4: Reference meeting filters
  $('#refSearchInput').addEventListener('input', renderRefMeetingList);
  $('#refFilterType').addEventListener('change', renderRefMeetingList);
  $('#btnConfirmReference').addEventListener('click', confirmReferenceSelection);
  $('#btnRemoveReference').addEventListener('click', clearReference);

  // Step 5: File drop zone
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

  // Save preset
  $('#btnPrepSavePreset').addEventListener('click', () => {
    const name = prompt(t('prep.preset_name'));
    if (!name) return;
    collectFormConfig();
    saveMeetingPrepPreset({
      name,
      meetingType: formConfig.meetingType,
      agenda: formConfig.agenda,
      attendees: formConfig.attendees,
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

// ===== Participant Input =====
function addAttendeeFromText(text) {
  // Parse "이름/직함" format
  let name, title;
  if (text.includes('/')) {
    const parts = text.split('/');
    name = parts[0].trim();
    title = parts.slice(1).join('/').trim();
  } else {
    name = text;
    title = '';
  }
  if (!name) return;

  // Check if already added
  if (formConfig.attendees.find(a => a.name === name)) return;

  // Check if matches existing contact
  const existing = contacts.find(c => c.name === name);
  if (existing) {
    formConfig.attendees.push({ id: existing.id, name: existing.name, title: title || existing.title || '' });
  } else {
    // Create new contact
    const contact = addContact({ name, title, company: '' });
    contacts.push(contact);
    formConfig.attendees.push({ id: contact.id, name: contact.name, title });
  }

  renderSelectedBadges();
}

function showAutocomplete(query) {
  const dropdown = $('#prepAutocompleteDropdown');
  const filtered = contacts.filter(c =>
    matchChosung(c.name, query) && !formConfig.attendees.find(a => a.id === c.id)
  );

  if (filtered.length === 0) {
    dropdown.hidden = true;
    return;
  }

  dropdown.innerHTML = '';
  filtered.slice(0, 8).forEach(c => {
    const item = document.createElement('div');
    item.className = 'prep-autocomplete-item';
    const label = c.title ? `${escapeHtml(c.name)} · ${escapeHtml(c.title)}` : escapeHtml(c.name);
    const sub = c.company ? `<span class="prep-autocomplete-sub">${escapeHtml(c.company)}</span>` : '';
    item.innerHTML = `<span>${label}</span>${sub}`;
    item.addEventListener('mousedown', (e) => {
      e.preventDefault(); // prevent blur
      formConfig.attendees.push({ id: c.id, name: c.name, title: c.title || '' });
      $('#prepParticipantSearch').value = '';
      hideAutocomplete();
      renderSelectedBadges();
    });
    dropdown.appendChild(item);
  });
  dropdown.hidden = false;
}

function hideAutocomplete() {
  $('#prepAutocompleteDropdown').hidden = true;
}

function navigateAutocomplete(direction) {
  const items = [...document.querySelectorAll('.prep-autocomplete-item')];
  if (!items.length) return;
  const current = items.findIndex(i => i.classList.contains('highlighted'));
  items.forEach(i => i.classList.remove('highlighted'));
  let next = current + direction;
  if (next < 0) next = items.length - 1;
  if (next >= items.length) next = 0;
  items[next].classList.add('highlighted');
}

function renderSelectedBadges() {
  const area = $('#prepSelectedBadges');
  area.innerHTML = '';
  formConfig.attendees.forEach(a => {
    const badge = document.createElement('span');
    badge.className = 'contact-badge';
    const display = a.title ? `${escapeHtml(a.name)} ${escapeHtml(a.title)}` : escapeHtml(a.name);
    badge.innerHTML = `${display} <button class="contact-badge-remove">&times;</button>`;
    badge.querySelector('.contact-badge-remove').addEventListener('click', (e) => {
      e.stopPropagation();
      formConfig.attendees = formConfig.attendees.filter(x => x.id !== a.id);
      renderSelectedBadges();
    });
    area.appendChild(badge);
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
  if (config.customPrompt) formConfig.customPrompt = config.customPrompt;
  if (config.referenceMeetingId) formConfig.referenceMeetingId = config.referenceMeetingId;
  if (config.referenceAnalysis) formConfig.referenceAnalysis = config.referenceAnalysis;
  if (config.attachedFiles) formConfig.attachedFiles = [...config.attachedFiles];
}

// ===== Reference Meeting (Step 4) =====
let refMeetings = [];
let selectedRefId = null;

function loadReferenceStep() {
  refMeetings = listMeetings();
  selectedRefId = null;
  $('#refSearchInput').value = '';
  $('#refFilterType').value = '';
  $('#refMeetingPreview').hidden = true;
  $('#btnConfirmReference').disabled = true;
  renderRefMeetingList();
}

function renderRefMeetingList() {
  const query = $('#refSearchInput').value.trim().toLowerCase();
  const typeFilter = $('#refFilterType').value;

  let filtered = refMeetings;
  if (query) filtered = filtered.filter(m => (m.title || '').toLowerCase().includes(query));
  if (typeFilter) filtered = filtered.filter(m => m.preset === typeFilter);

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
  document.querySelectorAll('.prep-ref-meeting-card').forEach(c => c.classList.remove('selected'));
  document.querySelectorAll('.prep-ref-meeting-card').forEach(c => {
    const title = c.querySelector('.prep-ref-meeting-card-title')?.textContent;
    const meeting = refMeetings.find(m => m.id === id);
    if (meeting && title === (meeting.title || 'Untitled')) c.classList.add('selected');
  });

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

    const chip = $('#prepReferenceChip');
    $('#prepReferenceChipText').textContent = meeting.title || 'Untitled';
    chip.hidden = false;

    const preview = $('#prepReferencePreview');
    preview.textContent = formConfig.referenceAnalysis.slice(0, 500) + (formConfig.referenceAnalysis.length > 500 ? '...' : '');
    preview.hidden = false;

    suggestFollowUpAgenda(formConfig.referenceAnalysis);
  }
}

function clearReference() {
  formConfig.referenceMeetingId = null;
  formConfig.referenceAnalysis = '';
  $('#prepReferenceChip').hidden = true;
  $('#prepReferencePreview').hidden = true;
  $('#prepAgendaSuggestions').hidden = true;
  selectedRefId = null;
  // Re-enable selection
  document.querySelectorAll('.prep-ref-meeting-card').forEach(c => c.classList.remove('selected'));
  $('#btnConfirmReference').disabled = true;
  $('#refMeetingPreview').hidden = true;
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
        // Jump to agenda step
        goToStep(2);
      };
      el.appendChild(chip);
    });
  } catch (err) {
    console.error('Suggestion error:', err);
    el.hidden = true;
  }
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

// ===== Business Card OCR (shared, called from settings) =====
export async function ocrBusinessCard(base64) {
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

  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Failed to parse OCR result');
  }
}

// ===== Helpers =====
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
