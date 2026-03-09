// meeting-prep.js - Meeting preparation chatbot flow

import { emit } from './app.js';
import { renderChatMessage, renderChatMessageWithButtons, clearChat, setChatInputHandler } from './chat.js';
import { loadContacts, addContact, loadMeetingPrepPresets, saveMeetingPrepPreset } from './storage.js';
import { t } from './i18n.js';

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
  // Regular substring match
  if (lower.includes(lowerQ)) return true;
  // Chosung match (only if query is all chosung characters)
  if (isAllChosung(query)) {
    const nameChosung = extractChosung(name);
    return nameChosung.includes(query);
  }
  return false;
}

// ===== State =====
let active = false;
let currentStep = null;
let config = {
  meetingType: 'general',
  agenda: '',
  timeLimit: 0,
  attendees: [],
  customPrompt: '',
  meetingContext: '',
};

const STEPS = ['type', 'agenda', 'time', 'attendees', 'prompt', 'standby'];

const MEETING_TYPES = [
  { key: 'general', icon: '&#128196;' },
  { key: 'weekly', icon: '&#128197;' },
  { key: 'brainstorm', icon: '&#128161;' },
  { key: 'sales', icon: '&#129309;' },
  { key: '1on1', icon: '&#128101;' },
  { key: 'kickoff', icon: '&#127937;' },
];

const TIME_OPTIONS = [
  { label: '15', value: 15 },
  { label: '30', value: 30 },
  { label: '45', value: 45 },
  { label: '60', value: 60 },
  { label: '90', value: 90 },
];

// ===== Public API =====
export function startMeetingPrep(presetConfig) {
  active = true;
  config = {
    meetingType: 'general',
    agenda: '',
    timeLimit: 0,
    attendees: [],
    customPrompt: '',
    meetingContext: '',
  };

  // If preset provided, apply it
  if (presetConfig) {
    Object.assign(config, presetConfig);
  }

  // Clear chat and start the flow
  clearChat();
  setChatInputHandler(handleInput);

  // Activate chat panel on mobile
  activateChatPanel();

  // Check for saved presets
  const presets = loadMeetingPrepPresets();
  if (presets.length > 0 && !presetConfig) {
    showPresetSelection(presets);
  } else {
    goToStep('type');
  }
}

export function isMeetingPrepActive() {
  return active;
}

function endPrep() {
  active = false;
  currentStep = null;
  setChatInputHandler(null);
}

// ===== Step Navigation =====
function goToStep(step) {
  currentStep = step;
  switch (step) {
    case 'type': renderTypeStep(); break;
    case 'agenda': renderAgendaStep(); break;
    case 'time': renderTimeStep(); break;
    case 'attendees': renderAttendeesStep(); break;
    case 'prompt': renderPromptStep(); break;
    case 'standby': renderStandbyStep(); break;
  }
}

function nextStep() {
  const idx = STEPS.indexOf(currentStep);
  if (idx < STEPS.length - 1) {
    goToStep(STEPS[idx + 1]);
  }
}

// ===== Input Handler =====
function handleInput(text) {
  // Show user message
  renderChatMessage('user', text);

  switch (currentStep) {
    case 'type':
      config.meetingType = text;
      nextStep();
      break;
    case 'agenda':
      config.agenda = text;
      nextStep();
      break;
    case 'time':
      config.timeLimit = parseTime(text);
      nextStep();
      break;
    case 'attendees':
      // Parse comma-separated names
      const names = text.split(',').map(n => n.trim()).filter(Boolean);
      names.forEach(name => {
        if (!config.attendees.find(a => a.name === name)) {
          config.attendees.push({ name, id: null });
        }
      });
      nextStep();
      break;
    case 'prompt':
      config.customPrompt = text;
      nextStep();
      break;
  }
}

function parseTime(text) {
  const num = parseInt(text);
  if (!isNaN(num) && num > 0) return num;
  return 0;
}

// ===== Preset Selection =====
function showPresetSelection(presets) {
  const buttons = presets.map((p, i) => ({
    label: `${p.meetingType || 'Preset'} ${p.agenda ? '- ' + p.agenda.slice(0, 20) : ''}`,
    value: () => {
      Object.assign(config, p);
      renderChatMessage('user', t('prep.load_preset') + ': ' + (p.meetingType || 'Preset'));
      goToStep('standby');
    }
  }));
  buttons.push({
    label: '+ ' + t('prep.type_general'),
    value: () => goToStep('type'),
  });

  renderChatMessageWithButtons('model', t('prep.load_preset'), buttons);
}

// ===== Step Renderers =====
function renderTypeStep() {
  const buttons = MEETING_TYPES.map(mt => ({
    label: t('prep.type_' + mt.key),
    value: () => {
      config.meetingType = mt.key;
      renderChatMessage('user', t('prep.type_' + mt.key));
      nextStep();
    }
  }));

  renderChatMessageWithButtons('model', t('prep.step_type'), buttons);
  updatePlaceholder(t('prep.or_type'));
}

function renderAgendaStep() {
  const buttons = [
    { label: t('prep.skip'), value: () => { config.agenda = ''; renderChatMessage('user', t('prep.skip')); nextStep(); } },
  ];

  renderChatMessageWithButtons('model', t('prep.step_agenda'), buttons);
  updatePlaceholder(t('prep.or_type'));
}

function renderTimeStep() {
  const buttons = TIME_OPTIONS.map(opt => ({
    label: t('prep.minutes', { n: opt.value }),
    value: () => {
      config.timeLimit = opt.value;
      renderChatMessage('user', t('prep.minutes', { n: opt.value }));
      nextStep();
    }
  }));
  buttons.push({
    label: t('prep.no_limit'),
    value: () => {
      config.timeLimit = 0;
      renderChatMessage('user', t('prep.no_limit'));
      nextStep();
    }
  });

  renderChatMessageWithButtons('model', t('prep.step_time'), buttons);
  updatePlaceholder(t('prep.or_type'));
}

function renderAttendeesStep() {
  const contacts = loadContacts();
  const container = $('#chatMessages');
  const empty = $('#chatEmpty');
  if (empty) empty.style.display = 'none';

  // Create message element
  const tmpl = $('#tmplChatMessage');
  const el = tmpl.content.cloneNode(true).querySelector('.chat-message');
  el.classList.add('model');
  const content = el.querySelector('.chat-message-content');
  content.textContent = t('prep.step_attendees');

  // Contact picker UI
  const picker = document.createElement('div');
  picker.className = 'contact-picker';

  // Selected badges area
  const selectedArea = document.createElement('div');
  selectedArea.className = 'contact-picker-selected';
  picker.appendChild(selectedArea);

  // Search input
  const searchInput = document.createElement('input');
  searchInput.className = 'contact-picker-search';
  searchInput.placeholder = t('contacts.search');
  picker.appendChild(searchInput);

  // Contact list
  const listEl = document.createElement('div');
  listEl.className = 'contact-picker-list';
  picker.appendChild(listEl);

  // Manual name input row
  const inputRow = document.createElement('div');
  inputRow.className = 'contact-picker-input-row';
  const nameInput = document.createElement('input');
  nameInput.placeholder = t('prep.type_names');
  inputRow.appendChild(nameInput);
  picker.appendChild(inputRow);

  // Confirm button
  const btnWrap = document.createElement('div');
  btnWrap.className = 'prep-quick-buttons';
  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'prep-quick-btn selected';
  confirmBtn.textContent = t('prep.confirm_attendees');
  btnWrap.appendChild(confirmBtn);
  const skipBtn = document.createElement('button');
  skipBtn.className = 'prep-quick-btn';
  skipBtn.textContent = t('prep.skip');
  btnWrap.appendChild(skipBtn);
  picker.appendChild(btnWrap);

  content.appendChild(picker);
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;

  // Render contact list
  function renderContacts(query) {
    listEl.innerHTML = '';
    const filtered = contacts.filter(c => matchChosung(c.name, query));
    filtered.forEach(c => {
      const card = document.createElement('div');
      card.className = 'contact-card' + (config.attendees.find(a => a.id === c.id) ? ' selected' : '');
      card.innerHTML = `<span class="contact-card-name">${escapeHtml(c.name)}</span>` +
        (c.company ? `<span class="contact-card-company">${escapeHtml(c.company)}</span>` : '');
      card.addEventListener('click', () => {
        toggleAttendee(c);
        renderContacts(searchInput.value);
        renderSelectedBadges();
      });
      listEl.appendChild(card);
    });
  }

  function toggleAttendee(contact) {
    const idx = config.attendees.findIndex(a => a.id === contact.id);
    if (idx >= 0) {
      config.attendees.splice(idx, 1);
    } else {
      config.attendees.push({ id: contact.id, name: contact.name });
    }
  }

  function renderSelectedBadges() {
    selectedArea.innerHTML = '';
    config.attendees.forEach(a => {
      const badge = document.createElement('span');
      badge.className = 'contact-badge';
      badge.innerHTML = `${escapeHtml(a.name)} <button class="contact-badge-remove">&times;</button>`;
      badge.querySelector('.contact-badge-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        config.attendees = config.attendees.filter(x => x.name !== a.name);
        renderContacts(searchInput.value);
        renderSelectedBadges();
      });
      selectedArea.appendChild(badge);
    });
  }

  searchInput.addEventListener('input', () => renderContacts(searchInput.value));

  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const names = nameInput.value.split(',').map(n => n.trim()).filter(Boolean);
      names.forEach(name => {
        if (!config.attendees.find(a => a.name === name)) {
          // Add as new contact too
          const contact = addContact({ name, company: '' });
          config.attendees.push({ id: contact.id, name: contact.name });
          contacts.push(contact);
        }
      });
      nameInput.value = '';
      renderContacts(searchInput.value);
      renderSelectedBadges();
    }
  });

  confirmBtn.addEventListener('click', () => {
    // Also process manual input if any
    const manualNames = nameInput.value.split(',').map(n => n.trim()).filter(Boolean);
    manualNames.forEach(name => {
      if (!config.attendees.find(a => a.name === name)) {
        const contact = addContact({ name, company: '' });
        config.attendees.push({ id: contact.id, name: contact.name });
      }
    });
    const display = config.attendees.map(a => a.name).join(', ') || t('prep.skip');
    renderChatMessage('user', display);
    nextStep();
  });

  skipBtn.addEventListener('click', () => {
    renderChatMessage('user', t('prep.skip'));
    nextStep();
  });

  renderContacts('');
  renderSelectedBadges();
  updatePlaceholder(t('prep.type_names'));
}

function renderPromptStep() {
  const buttons = [
    {
      label: t('prep.use_default'),
      value: () => {
        config.customPrompt = '';
        renderChatMessage('user', t('prep.use_default'));
        nextStep();
      }
    },
  ];

  renderChatMessageWithButtons('model', t('prep.step_prompt'), buttons);
  updatePlaceholder(t('prep.or_type'));
}

function renderStandbyStep() {
  const container = $('#chatMessages');
  const empty = $('#chatEmpty');
  if (empty) empty.style.display = 'none';

  // Create standby card
  const tmpl = $('#tmplChatMessage');
  const el = tmpl.content.cloneNode(true).querySelector('.chat-message');
  el.classList.add('model');
  const content = el.querySelector('.chat-message-content');

  const typeLabel = MEETING_TYPES.find(mt => mt.key === config.meetingType)
    ? t('prep.type_' + config.meetingType)
    : config.meetingType;
  const timeLabel = config.timeLimit > 0 ? t('prep.minutes', { n: config.timeLimit }) : t('prep.no_limit');
  const attendeesLabel = config.attendees.length > 0
    ? config.attendees.map(a => a.name).join(', ')
    : '-';
  const promptLabel = config.customPrompt || t('prep.use_default');

  content.innerHTML = `
    <div class="prep-standby">
      <div class="prep-standby-title">${escapeHtml(t('prep.step_standby'))}</div>
      <div class="prep-standby-row">
        <span class="prep-standby-label">${escapeHtml(t('prep.summary_type'))}</span>
        <span class="prep-standby-value">${escapeHtml(typeLabel)}</span>
      </div>
      <div class="prep-standby-row">
        <span class="prep-standby-label">${escapeHtml(t('prep.summary_agenda'))}</span>
        <span class="prep-standby-value">${escapeHtml(config.agenda || '-')}</span>
      </div>
      <div class="prep-standby-row">
        <span class="prep-standby-label">${escapeHtml(t('prep.summary_time'))}</span>
        <span class="prep-standby-value">${escapeHtml(timeLabel)}</span>
      </div>
      <div class="prep-standby-row">
        <span class="prep-standby-label">${escapeHtml(t('prep.summary_attendees'))}</span>
        <span class="prep-standby-value">${escapeHtml(attendeesLabel)}</span>
      </div>
      <div class="prep-standby-row">
        <span class="prep-standby-label">${escapeHtml(t('prep.summary_prompt'))}</span>
        <span class="prep-standby-value">${escapeHtml(promptLabel.slice(0, 80))}</span>
      </div>
      <div class="prep-standby-actions" id="prepStandbyActions"></div>
    </div>
  `;

  container.appendChild(el);
  container.scrollTop = container.scrollHeight;

  // Add action buttons
  const actionsEl = el.querySelector('#prepStandbyActions');

  const startBtn = document.createElement('button');
  startBtn.className = 'btn btn-primary';
  startBtn.textContent = t('prep.start_meeting');
  startBtn.addEventListener('click', () => completeMeetingPrep());
  actionsEl.appendChild(startBtn);

  const savePresetBtn = document.createElement('button');
  savePresetBtn.className = 'btn btn-sm';
  savePresetBtn.textContent = t('prep.save_preset');
  savePresetBtn.addEventListener('click', () => saveCurrentPreset());
  actionsEl.appendChild(savePresetBtn);

  const editBtn = document.createElement('button');
  editBtn.className = 'btn btn-sm';
  editBtn.textContent = t('prep.edit_settings');
  editBtn.addEventListener('click', () => {
    clearChat();
    goToStep('type');
  });
  actionsEl.appendChild(editBtn);
}

// ===== Actions =====
function completeMeetingPrep() {
  endPrep();
  emit('meetingPrep:complete', { ...config });
}

function saveCurrentPreset() {
  const name = prompt(t('prep.preset_name'));
  if (!name) return;
  saveMeetingPrepPreset({
    name,
    meetingType: config.meetingType,
    agenda: config.agenda,
    timeLimit: config.timeLimit,
    attendees: config.attendees,
    customPrompt: config.customPrompt,
    meetingContext: config.meetingContext,
  });
  renderChatMessage('system', t('prep.preset_saved'));
}

// ===== Helpers =====
function activateChatPanel() {
  // On mobile, switch to chat panel
  const tabs = document.querySelectorAll('.panel-tab');
  const panels = document.querySelectorAll('.panel');
  tabs.forEach(tab => {
    if (tab.dataset.panel === 'right') {
      tab.classList.add('active');
      tabs.forEach(t => { if (t !== tab) t.classList.remove('active'); });
    }
  });
  panels.forEach(p => {
    if (p.id === 'panelRight') {
      p.classList.add('panel-active');
    } else {
      p.classList.remove('panel-active');
    }
  });
}

function updatePlaceholder(text) {
  const input = $('#chatInput');
  if (input) input.placeholder = text;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
