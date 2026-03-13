// meeting-prep.js - Meeting preparation wizard (5-step)

import { emit } from './event-bus.js';
import {
  loadContacts, addContact, updateContact, saveMeetingPrepPreset,
  savePreparedMeeting, listMeetings, getMeeting,
  loadGroups, addGroup, updateGroup, deleteGroup,
} from './storage.js';
import { callGemini } from './gemini-api.js';
import { t } from './i18n.js';
import { showToast } from './ui.js';
import { escapeHtml } from './utils.js';

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
let groups = [];
let activeGroupFilter = '__all__';
let editingGroupId = null;
let cameraStream = null;

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
  groups = loadGroups();

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
  if (step === 3) {
    contacts = loadContacts();
    groups = loadGroups();
    renderGroupTabs();
    renderContactList();
    renderSelectedBadges();
    renderRecentAttendees();
  } else if (step === 4) {
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

  // Clear participant UI
  $('#prepSelectedBadges').innerHTML = '';
  $('#prepContactSearch').value = '';
  $('#prepAddPanel').hidden = true;
  $('#prepOcrPanel').hidden = true;
  $('#prepGroupManage').hidden = true;
  activeGroupFilter = '__all__';
  editingGroupId = null;
  stopCamera();

  // Clear file chips
  $('#prepFileChips').innerHTML = '';

  // Reference
  $('#prepReferencePreview').hidden = true;
  $('#prepReferenceChip').hidden = true;
  $('#prepAgendaSuggestions').hidden = true;

  // Render step 3
  renderGroupTabs();
  renderContactList();
  renderSelectedBadges();
  renderRecentAttendees();
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

  // Step 3: Contact search filter
  $('#prepContactSearch').addEventListener('input', () => renderContactList());

  // Step 3: Group tabs
  $('#prepGroupTabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.prep-group-tab');
    if (!tab || tab.id === 'btnAddGroup') return;
    activeGroupFilter = tab.dataset.group;
    renderGroupTabs();
    renderContactList();
  });
  // Long-press / right-click on group tab to manage
  $('#prepGroupTabs').addEventListener('contextmenu', (e) => {
    const tab = e.target.closest('.prep-group-tab');
    if (!tab || tab.dataset.group === '__all__' || tab.id === 'btnAddGroup') return;
    e.preventDefault();
    openGroupManage(tab.dataset.group);
  });

  // Add group button
  $('#btnAddGroup').addEventListener('click', () => openGroupManage(null));

  // Group select all
  $('#btnGroupSelectAll').addEventListener('click', selectAllInGroup);

  // Add attendee button
  $('#btnAddAttendee').addEventListener('click', () => {
    $('#prepAddPanel').hidden = false;
    $('#prepOcrPanel').hidden = true;
    $('#prepGroupManage').hidden = true;
    updateGroupSelect();
    $('#prepNewContactInput').focus();
  });
  $('#btnCloseAddPanel').addEventListener('click', () => { $('#prepAddPanel').hidden = true; });

  // New contact input — Enter to add
  $('#prepNewContactInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const text = e.target.value.trim();
      if (!text) return;
      addAttendeeFromText(text);
      e.target.value = '';
    }
  });

  // OCR button
  $('#btnOcrAttendee').addEventListener('click', () => {
    $('#prepOcrPanel').hidden = false;
    $('#prepAddPanel').hidden = true;
    $('#prepGroupManage').hidden = true;
    $('#prepOcrResult').hidden = true;
    $('#prepOcrCameraWrap').hidden = true;
    $('#prepOcrLoading').hidden = true;
  });
  $('#btnCloseOcrPanel').addEventListener('click', () => {
    $('#prepOcrPanel').hidden = true;
    stopCamera();
  });

  // OCR upload
  $('#btnOcrUpload').addEventListener('click', () => $('#prepOcrFileInput').click());
  $('#prepOcrFileInput').addEventListener('change', (e) => {
    if (e.target.files[0]) processOcrImage(e.target.files[0]);
    e.target.value = '';
  });

  // OCR camera
  $('#btnOcrCamera').addEventListener('click', startCamera);
  $('#btnOcrCapture').addEventListener('click', capturePhoto);
  $('#btnOcrConfirm').addEventListener('click', confirmOcrResult);
  $('#btnOcrRetry').addEventListener('click', () => {
    $('#prepOcrResult').hidden = true;
  });

  // Group management
  $('#btnCloseGroupManage').addEventListener('click', () => { $('#prepGroupManage').hidden = true; });
  $('#btnSaveGroup').addEventListener('click', saveGroupFromPanel);
  $('#btnDeleteGroup').addEventListener('click', deleteGroupFromPanel);
  $('#btnAddContactFromGroup')?.addEventListener('click', () => {
    emit('openContactsModal');
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

// ===== Participant Input (v2) =====
function addAttendeeFromText(text) {
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
  if (formConfig.attendees.find(a => a.name === name)) return;

  const existing = contacts.find(c => c.name === name);
  let contact;
  if (existing) {
    contact = existing;
    if (title && !existing.title) updateContact(existing.id, { title });
  } else {
    contact = addContact({ name, title, company: '' });
    contacts.push(contact);
  }

  // Assign to group if selected
  const groupSelect = $('#prepNewContactGroup');
  if (groupSelect && groupSelect.value) {
    const grp = groups.find(g => g.id === groupSelect.value);
    if (grp && !grp.contactIds.includes(contact.id)) {
      grp.contactIds.push(contact.id);
      updateGroup(grp.id, { contactIds: grp.contactIds });
    }
  }

  formConfig.attendees.push({ id: contact.id, name: contact.name, title: title || contact.title || '' });
  renderSelectedBadges();
  renderContactList();
  showToast(t('prep.contact_added'), 'success');
}

function toggleAttendee(contactId) {
  const idx = formConfig.attendees.findIndex(a => a.id === contactId);
  if (idx >= 0) {
    formConfig.attendees.splice(idx, 1);
  } else {
    const c = contacts.find(c => c.id === contactId);
    if (c) formConfig.attendees.push({ id: c.id, name: c.name, title: c.title || '' });
  }
  renderSelectedBadges();
  renderContactList();
}

function selectAllInGroup() {
  const filtered = getFilteredContacts();
  let allSelected = filtered.every(c => formConfig.attendees.find(a => a.id === c.id));
  if (allSelected) {
    // Deselect all in this group
    const ids = new Set(filtered.map(c => c.id));
    formConfig.attendees = formConfig.attendees.filter(a => !ids.has(a.id));
  } else {
    filtered.forEach(c => {
      if (!formConfig.attendees.find(a => a.id === c.id)) {
        formConfig.attendees.push({ id: c.id, name: c.name, title: c.title || '' });
      }
    });
  }
  renderSelectedBadges();
  renderContactList();
}

function getFilteredContacts() {
  const query = ($('#prepContactSearch')?.value || '').trim();
  let list = contacts;
  if (activeGroupFilter !== '__all__') {
    const grp = groups.find(g => g.id === activeGroupFilter);
    if (grp) {
      const idSet = new Set(grp.contactIds);
      list = list.filter(c => idSet.has(c.id));
    }
  }
  if (query) {
    list = list.filter(c => matchChosung(c.name, query));
  }
  return list;
}

function renderContactList() {
  const container = $('#prepContactListV2');
  container.setAttribute('data-empty', t('prep.no_contacts'));
  const filtered = getFilteredContacts();
  container.innerHTML = '';
  filtered.forEach(c => {
    const isChecked = !!formConfig.attendees.find(a => a.id === c.id);
    const item = document.createElement('div');
    item.className = 'prep-contact-item' + (isChecked ? ' checked' : '');
    const contactGroups = groups.filter(g => g.contactIds.includes(c.id));
    const groupDots = contactGroups.map(g =>
      `<span class="prep-contact-group-dot">${escapeHtml(g.name)}</span>`
    ).join('');
    item.innerHTML = `
      <input type="checkbox" ${isChecked ? 'checked' : ''}>
      <div class="prep-contact-info">
        <span class="prep-contact-name">${escapeHtml(c.name)}</span>
        ${c.title ? `<span class="prep-contact-title">${escapeHtml(c.title)}</span>` : ''}
      </div>
      <div class="prep-contact-groups">${groupDots}</div>
    `;
    item.addEventListener('click', (e) => {
      if (e.target.tagName === 'INPUT') return;
      toggleAttendee(c.id);
    });
    item.querySelector('input').addEventListener('change', () => toggleAttendee(c.id));
    container.appendChild(item);
  });
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
      renderContactList();
    });
    area.appendChild(badge);
  });
}

function renderGroupTabs() {
  const container = $('#prepGroupTabs');
  const addBtn = $('#btnAddGroup');
  // Remove old dynamic tabs
  container.querySelectorAll('.prep-group-tab:not([data-group="__all__"]):not(#btnAddGroup)').forEach(el => el.remove());
  // Set active state on "all" tab
  container.querySelector('[data-group="__all__"]').classList.toggle('active', activeGroupFilter === '__all__');
  // Insert group tabs before the add button
  groups.forEach(g => {
    const tab = document.createElement('button');
    tab.className = 'prep-group-tab' + (activeGroupFilter === g.id ? ' active' : '');
    tab.dataset.group = g.id;
    tab.textContent = g.name;
    container.insertBefore(tab, addBtn);
  });
}

function renderRecentAttendees() {
  const meetings = listMeetings().slice(0, 5);
  const recentIds = new Map(); // id -> count
  meetings.forEach(m => {
    const attendees = m.prepConfig?.attendees || m.attendees || [];
    attendees.forEach(a => {
      if (a.id) recentIds.set(a.id, (recentIds.get(a.id) || 0) + 1);
    });
  });

  const recentContacts = [...recentIds.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id]) => contacts.find(c => c.id === id))
    .filter(Boolean);

  const container = $('#prepRecentAttendees');
  const list = $('#prepRecentList');

  if (recentContacts.length === 0) {
    container.hidden = true;
    return;
  }
  container.hidden = false;
  list.innerHTML = '';
  recentContacts.forEach(c => {
    const chip = document.createElement('button');
    chip.className = 'prep-recent-chip';
    chip.textContent = c.name;
    if (formConfig.attendees.find(a => a.id === c.id)) {
      chip.style.opacity = '0.4';
      chip.style.pointerEvents = 'none';
    }
    chip.addEventListener('click', () => {
      if (!formConfig.attendees.find(a => a.id === c.id)) {
        formConfig.attendees.push({ id: c.id, name: c.name, title: c.title || '' });
        renderSelectedBadges();
        renderContactList();
        renderRecentAttendees();
      }
    });
    list.appendChild(chip);
  });
}

function updateGroupSelect() {
  const select = $('#prepNewContactGroup');
  select.innerHTML = `<option value="">${t('prep.no_group')}</option>`;
  groups.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = g.name;
    select.appendChild(opt);
  });
}

// ===== Group Management =====
function openGroupManage(groupId) {
  editingGroupId = groupId;
  const panel = $('#prepGroupManage');
  panel.hidden = false;
  $('#prepAddPanel').hidden = true;
  $('#prepOcrPanel').hidden = true;

  const nameInput = $('#prepGroupNameInput');
  const deleteBtn = $('#btnDeleteGroup');
  const memberList = $('#prepGroupMemberList');

  if (groupId) {
    const grp = groups.find(g => g.id === groupId);
    nameInput.value = grp ? grp.name : '';
    deleteBtn.hidden = false;
  } else {
    nameInput.value = '';
    deleteBtn.hidden = true;
  }

  // Render contact checkboxes for group membership
  memberList.innerHTML = '';
  contacts.forEach(c => {
    const grp = groupId ? groups.find(g => g.id === groupId) : null;
    const isMember = grp ? grp.contactIds.includes(c.id) : false;
    const item = document.createElement('div');
    item.className = 'prep-contact-item' + (isMember ? ' checked' : '');
    item.innerHTML = `
      <input type="checkbox" data-contact-id="${c.id}" ${isMember ? 'checked' : ''}>
      <div class="prep-contact-info">
        <span class="prep-contact-name">${escapeHtml(c.name)}</span>
        ${c.title ? `<span class="prep-contact-title">${escapeHtml(c.title)}</span>` : ''}
      </div>
    `;
    item.addEventListener('click', (e) => {
      if (e.target.tagName === 'INPUT') return;
      const cb = item.querySelector('input');
      cb.checked = !cb.checked;
      item.classList.toggle('checked', cb.checked);
    });
    item.querySelector('input').addEventListener('change', (e) => {
      item.classList.toggle('checked', e.target.checked);
    });
    memberList.appendChild(item);
  });

  nameInput.focus();
}

function saveGroupFromPanel() {
  const name = $('#prepGroupNameInput').value.trim();
  if (!name) return;

  const memberCheckboxes = $('#prepGroupMemberList').querySelectorAll('input[type="checkbox"]');
  const contactIds = [...memberCheckboxes].filter(cb => cb.checked).map(cb => cb.dataset.contactId);

  if (editingGroupId) {
    updateGroup(editingGroupId, { name, contactIds });
    const idx = groups.findIndex(g => g.id === editingGroupId);
    if (idx >= 0) groups[idx] = { ...groups[idx], name, contactIds };
    showToast(t('prep.group_saved'), 'success');
  } else {
    const grp = addGroup(name);
    grp.contactIds = contactIds;
    updateGroup(grp.id, { contactIds });
    groups.push(grp);
    showToast(t('prep.group_created'), 'success');
  }

  $('#prepGroupManage').hidden = true;
  editingGroupId = null;
  renderGroupTabs();
  renderContactList();
  updateGroupSelect();
}

function deleteGroupFromPanel() {
  if (!editingGroupId) return;
  deleteGroup(editingGroupId);
  groups = groups.filter(g => g.id !== editingGroupId);
  if (activeGroupFilter === editingGroupId) activeGroupFilter = '__all__';
  editingGroupId = null;
  $('#prepGroupManage').hidden = true;
  showToast(t('prep.group_deleted'), 'success');
  renderGroupTabs();
  renderContactList();
  updateGroupSelect();
}

// ===== OCR =====
async function processOcrImage(file) {
  $('#prepOcrLoading').hidden = false;
  $('#prepOcrResult').hidden = true;

  try {
    const base64 = await fileToBase64(file);
    const result = await ocrBusinessCard(base64);
    showOcrResult(result);
  } catch (err) {
    console.error('OCR error:', err);
    showToast(t('prep.scan_failed'), 'error');
  } finally {
    $('#prepOcrLoading').hidden = true;
  }
}

function showOcrResult(data) {
  const fields = $('#prepOcrResultFields');
  fields.innerHTML = '';
  const fieldDefs = [
    { key: 'name', label: 'Name' },
    { key: 'title', label: 'Title' },
    { key: 'company', label: 'Company' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
  ];
  fieldDefs.forEach(f => {
    fields.innerHTML += `
      <label>${f.label}</label>
      <input type="text" data-field="${f.key}" value="${escapeHtml(data[f.key] || '')}">
    `;
  });
  $('#prepOcrResult').hidden = false;
}

function confirmOcrResult() {
  const inputs = $('#prepOcrResultFields').querySelectorAll('input');
  const data = {};
  inputs.forEach(inp => { data[inp.dataset.field] = inp.value.trim(); });

  if (!data.name) return;

  // Add as contact & attendee
  const existing = contacts.find(c => c.name === data.name);
  let contact;
  if (existing) {
    updateContact(existing.id, { title: data.title, company: data.company });
    contact = { ...existing, ...data };
  } else {
    contact = addContact({ name: data.name, title: data.title, company: data.company });
    contacts.push(contact);
  }

  if (!formConfig.attendees.find(a => a.id === contact.id)) {
    formConfig.attendees.push({ id: contact.id, name: contact.name, title: data.title || '' });
  }

  showToast(t('prep.card_saved'), 'success');
  $('#prepOcrResult').hidden = true;
  renderSelectedBadges();
  renderContactList();
  renderRecentAttendees();
}

async function startCamera() {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const video = $('#prepOcrVideo');
    video.srcObject = cameraStream;
    $('#prepOcrCameraWrap').hidden = false;
  } catch {
    showToast(t('prep.camera_permission'), 'error');
  }
}

function capturePhoto() {
  const video = $('#prepOcrVideo');
  const canvas = $('#prepOcrCanvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  stopCamera();
  canvas.toBlob(blob => {
    if (blob) processOcrImage(blob);
  }, 'image/jpeg', 0.85);
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(tr => tr.stop());
    cameraStream = null;
  }
  const wrap = $('#prepOcrCameraWrap');
  if (wrap) wrap.hidden = true;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      resolve(result.split(',')[1]); // strip data URL prefix
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
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
  stopCamera();
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

