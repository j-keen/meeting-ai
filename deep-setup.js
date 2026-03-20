// deep-setup.js - 4-step "경청 준비" (Listen Prep) wizard
// Step 1: Basic Info (datetime, location, attendees) — form
// Step 2: Context (description, reference meetings, files) — form, skippable
// Step 3: AI Setup (focus points via AI chat) — chat
// Step 4: Ready (summary + start)

import { emit } from './event-bus.js';
import { getAiLanguage, t } from './i18n.js';
import { callGeminiStream, isProxyAvailable } from './gemini-api.js';
import { addCustomType, addContact, loadContacts, loadLocations, addLocation, listMeetings, linkMeetings, getMeeting } from './storage.js';
import { showToast } from './ui.js';
import { renderMarkdown } from './chat.js';
import { escapeHtml } from './utils.js';
import { getRoleIntro, getAppFeatureDescription, getJsonSchema, getPromptWritingPrinciples, getToneGuidance } from './prompt-templates.js';

const $ = (sel) => document.querySelector(sel);
const MODEL = 'gemini-2.5-flash';

// ===== State =====
let currentStep = 1;
const TOTAL_STEPS = 4;
let stepHistories = { 3: [] };
let stepResults = { 1: null, 2: null, 3: null };
let isStreaming = false;
let selectedAttendees = [];
let selectedReferences = [];
let attachedFiles = [];
let meetingDescription = '';
let meetingDatetime = '';
let meetingLocation = '';
let allMeetings = [];

// ===== Helpers =====
function isKorean() { return getAiLanguage() === 'ko'; }

function extractJSON(text) {
  const match = text.match(/```json\s*([\s\S]*?)```/);
  if (!match) return null;
  try { return JSON.parse(match[1].trim()); } catch { return null; }
}

function nowDatetimeLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

// ===== Chosung Search =====
const CHOSUNG = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
function getChosung(char) {
  const code = char.charCodeAt(0);
  if (code < 0xAC00 || code > 0xD7A3) return null;
  return CHOSUNG[Math.floor((code - 0xAC00) / 588)];
}
function extractChosung(str) { return [...str].map(ch => getChosung(ch) || ch).join(''); }
function isAllChosung(str) { return [...str].every(ch => CHOSUNG.includes(ch)); }
function matchField(value, query) {
  if (!query || !value) return !query;
  const v = value.toLowerCase();
  const q = query.toLowerCase();
  if (v.includes(q)) return true;
  if (isAllChosung(query)) return extractChosung(value).includes(query);
  return false;
}

function matchContactByName(c, query) {
  if (!query) return true;
  return matchField(c.name, query) || matchField(c.title || '', query) || matchField(c.company || '', query);
}

// ===== Helper: extract last analysis text from a meeting =====
function getLastAnalysisText(meeting) {
  if (!meeting?.analysisHistory?.length) return '';
  const last = meeting.analysisHistory[meeting.analysisHistory.length - 1];
  return last.markdown || last.summary || last.raw || '';
}

// ===== Step 3: AI Prompt =====
function getStep3Prompt(prevResults, isAutoFire) {
  const ko = isKorean();
  const lang = ko ? 'ko' : 'en';
  const ctx = JSON.stringify(prevResults, null, 2);
  const autoFireInstruction = isAutoFire
    ? (ko
      ? `\n\n중요: 사용자가 아무 말 하지 않아도, 위 정보만으로 바로 분석을 시작하세요.
1. 먼저 입력된 정보를 빠르게 읽고 상황을 한 줄로 요약
2. 이 미팅에 맞는 집중 포인트 3~5개를 구체적으로 제안 (참석자 관계, 장소 맥락, 설명 등을 반영)
3. "빼고 싶은 거 있으면 말씀해주세요. 없으면 이대로 바로 세팅할게요!"
4. 바로 설정 JSON을 생성`
      : `\n\nIMPORTANT: Without waiting for user input, immediately analyze the info above.
1. Quickly summarize the situation in one line
2. Suggest 3-5 specific focus points tailored to this meeting (reflect attendee dynamics, location context, description, etc.)
3. Ask "Let me know if you'd like to remove any — otherwise I'll set it up as is!"
4. Generate the setup JSON right away`)
    : '';

  const meetingInfoHeader = ko
    ? '이전 단계에서 사용자가 입력한 미팅 정보:'
    : 'Meeting info from previous steps:';

  return [
    getRoleIntro(lang),
    '',
    meetingInfoHeader,
    ctx,
    autoFireInstruction,
    '',
    getAppFeatureDescription(lang),
    '',
    getJsonSchema(lang),
    '',
    getPromptWritingPrinciples(lang),
    '',
    getToneGuidance(lang),
  ].join('\n');
}

// ===== Chat Render Helpers =====
function getChatContainer() {
  return $('#dsMessages3');
}

function addMessage(role, html) {
  const container = getChatContainer();
  if (!container) return null;
  const msgEl = document.createElement('div');
  msgEl.className = `pb-message pb-message-${role}`;
  const contentEl = document.createElement('div');
  contentEl.className = 'pb-message-content';
  contentEl.innerHTML = html;
  msgEl.appendChild(contentEl);
  container.appendChild(msgEl);
  container.scrollTop = container.scrollHeight;
  return contentEl;
}

function addUserMessage(text) { addMessage('user', escapeHtml(text)); }
function addAiMessage(html) { return addMessage('model', html); }

function showTypingIndicator() {
  const container = getChatContainer();
  if (!container) return null;
  const el = document.createElement('div');
  el.className = 'pb-message pb-message-model pb-typing';
  el.innerHTML = '<div class="pb-message-content"><span class="typing-dots"><span></span><span></span><span></span></span></div>';
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  return el;
}

function renderChips(container, chips, onSelect) {
  if (!container) return;
  container.innerHTML = '';
  const ko = isKorean();
  chips.forEach(chip => {
    const btn = document.createElement('button');
    btn.className = 'pb-chip';
    btn.textContent = typeof chip === 'string' ? chip : (ko ? chip.ko : chip.en);
    btn.addEventListener('click', () => {
      container.style.display = 'none';
      onSelect(btn.textContent);
    });
    container.appendChild(btn);
  });
  container.style.display = '';
}

// ===== Step Navigation =====
function goToStep(n) {
  if (n < 1 || n > TOTAL_STEPS) return;

  // Collect form data when leaving steps
  if (currentStep === 1 && n !== 1) collectStep1Results();
  if (currentStep === 2 && n !== 2) collectStep2Results();

  currentStep = n;

  // Update step indicators
  document.querySelectorAll('#dsSteps .prep-step-dot').forEach(dot => {
    const step = parseInt(dot.dataset.step);
    dot.classList.toggle('active', step === n);
    dot.classList.toggle('completed', step < n);
    dot.disabled = step > n;
  });
  document.querySelectorAll('#dsSteps .prep-step-line').forEach((line, i) => {
    line.classList.toggle('completed', i + 1 < n);
  });

  // Show/hide panels
  document.querySelectorAll('.ds-step-panel').forEach(panel => {
    panel.hidden = parseInt(panel.dataset.step) !== n;
  });

  // Update nav buttons
  const backBtn = $('#btnDsBack');
  const nextBtn = $('#btnDsNext');
  const skipBtn = $('#btnDsSkip');
  if (backBtn) backBtn.hidden = n === 1;
  if (skipBtn) skipBtn.hidden = n !== 2;
  if (nextBtn) {
    nextBtn.hidden = n === TOTAL_STEPS;
    // Step 1: always enabled (datetime auto-filled), Step 2: always (skippable), Step 3: needs AI result
    nextBtn.disabled = (n === 1 || n === 2) ? false : !stepResults[3];
  }

  // Step 3: auto-fire AI on first visit
  if (n === 3 && stepHistories[3].length === 0) {
    // Collect step data before AI call
    collectStep1Results();
    collectStep2Results();

    // Render context card (summary of what AI knows)
    renderContextCard();

    const msgs3 = $('#dsMessages3');
    if (msgs3 && msgs3.children.length === 0) {
      // Auto-fire: AI immediately analyzes input and suggests focus points
      // Added a slight delay so UI transitions smoothly before locking
      setTimeout(() => sendMessage('', true), 300);
    }
  }

  // Step 4: render summary
  if (n === TOTAL_STEPS) {
    renderSummary();
  }
}

// ===== Context Card (Step 3 summary of inputs) =====
function renderContextCard() {
  const card = $('#dsContextCard');
  if (!card) return;

  const ko = isKorean();
  const s1 = stepResults[1] || {};
  const s2 = stepResults[2] || {};

  const items = [];

  if (s1.datetime) {
    items.push(`<span class="ds-ctx-chip">${new Date(s1.datetime).toLocaleString(ko ? 'ko-KR' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>`);
  }
  if (s1.location) {
    items.push(`<span class="ds-ctx-chip">${escapeHtml(s1.location)}</span>`);
  }
  if (s1.attendees?.length) {
    const names = s1.attendees.map(a => a.name + (a.title ? '/' + a.title : '')).join(', ');
    items.push(`<span class="ds-ctx-chip">${escapeHtml(names)}</span>`);
  }
  if (s2.description) {
    items.push(`<span class="ds-ctx-chip">${escapeHtml(s2.description)}</span>`);
  }
  if (s2.references?.length) {
    items.push(`<span class="ds-ctx-chip">${ko ? '참고 미팅' : 'Ref'} ${s2.references.length}${ko ? '개' : ''}</span>`);
  }
  if (s2.files?.length) {
    items.push(`<span class="ds-ctx-chip">${ko ? '첨부' : 'Files'} ${s2.files.length}${ko ? '개' : ''}</span>`);
  }

  if (!items.length) {
    card.hidden = true;
    return;
  }

  card.innerHTML = `<span class="ds-ctx-label">${t('ds.step3_context_card')}</span>${items.join('')}`;
  card.hidden = false;
}

// ===== AI Communication =====
function buildContents(userText, isAutoFire = false) {
  const allResults = {
    step1: stepResults[1],
    step2: stepResults[2],
  };
  const systemPrompt = getStep3Prompt(allResults, isAutoFire);

  if (isAutoFire) {
    // Auto-fire: system prompt only, AI responds immediately
    return [
      { role: 'user', parts: [{ text: systemPrompt }] },
    ];
  }

  const greeting = t('ds.step3_greeting');
  const contents = [
    { role: 'user', parts: [{ text: systemPrompt }] },
    { role: 'model', parts: [{ text: greeting }] },
  ];

  (stepHistories[3] || []).forEach(msg => {
    contents.push({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }],
    });
  });

  if (userText) {
    contents.push({ role: 'user', parts: [{ text: userText }] });
  }

  return contents;
}

async function sendMessage(text, isAutoFire = false) {
  if (isStreaming) return;
  if (!isAutoFire && !text.trim()) return;

  if (!isAutoFire) {
    addUserMessage(text);
    stepHistories[3].push({ role: 'user', text });
  }

  const input = $('#dsInput3');
  if (input) input.value = '';

  const chips = $('#dsChips3');
  if (chips) chips.style.display = 'none';

  if (!isProxyAvailable()) {
    addAiMessage(isKorean()
      ? '<p>API 프록시를 사용할 수 없습니다. 설정을 확인해주세요.</p>'
      : '<p>API proxy is not available. Please check your settings.</p>');
    return;
  }

  isStreaming = true;
  const sendBtn = $('#btnDsSend3');
  if (sendBtn) sendBtn.disabled = true;

  if (isAutoFire) {
    const initko = "✨ 입력하신 정보를 바탕으로 회의 맥락을 분석하고 있습니다... 잠시만 기다려주세요.";
    const initen = "✨ Analyzing meeting context and preparing the session... Please wait a moment.";
    const initMsg = isKorean() ? initko : initen;
    const el = addAiMessage(`<p style="color:var(--text-secondary); font-size:13px; margin:0; padding:4px 0;">${initMsg}</p>`);
    if (el && el.parentElement) {
      el.parentElement.style.background = 'transparent';
      el.parentElement.style.border = 'none';
      el.parentElement.style.boxShadow = 'none';
    }
  }

  const typingEl = showTypingIndicator();

  try {
    const contents = isAutoFire ? buildContents(null, true) : buildContents(text);
    const body = { contents, generationConfig: { temperature: 0.7 } };

    const container = getChatContainer();
    const streamEl = document.createElement('div');
    streamEl.className = 'pb-message pb-message-model';
    const streamContent = document.createElement('div');
    streamContent.className = 'pb-message-content';
    streamEl.appendChild(streamContent);

    if (typingEl) typingEl.remove();
    container.appendChild(streamEl);

    const { text: fullText } = await callGeminiStream(MODEL, body, (chunk, fullSoFar) => {
      streamContent.innerHTML = renderMarkdown(fullSoFar);
      container.scrollTop = container.scrollHeight;
    });

    streamContent.innerHTML = renderMarkdown(fullText);
    container.scrollTop = container.scrollHeight;
    stepHistories[3].push({ role: 'model', text: fullText });

    // Extract JSON result
    const json = extractJSON(fullText);
    if (json) {
      stepResults[3] = json;
      const nextBtn = $('#btnDsNext');
      if (nextBtn) nextBtn.disabled = false;

      // Auto-advance after a short delay
      setTimeout(() => {
        if (currentStep === 3) {
          goToStep(4);
        }
      }, 800);
    }
  } catch (err) {
    if (typingEl?.parentNode) typingEl.remove();
    if (err.name !== 'AbortError') {
      addAiMessage(`<p style="color:var(--danger)">${escapeHtml(err.message)}</p>`);
    }
  } finally {
    isStreaming = false;
    if (sendBtn) sendBtn.disabled = false;
  }
}

// ===== Step 1: Basic Info Form (datetime, location, attendees) =====
function renderStep1Form() {
  const formArea = $('#dsFormArea1');
  if (!formArea) return;

  const ko = isKorean();
  const desc = $('#dsStep1Desc');
  if (desc) desc.textContent = t('ds.step1_desc');

  // Note: innerHTML used with escapeHtml() for all user-sourced data - safe pattern in this codebase
  formArea.innerHTML = `
    <!-- date/time -->
    <div class="ds-form-section">
      <label class="ds-form-label">${t('ds.datetime')}</label>
      <input type="datetime-local" class="ds-input-sm ds-datetime-input" id="dsDatetime" value="${nowDatetimeLocal()}">
    </div>

    <!-- location: input + browsable list -->
    <div class="ds-form-section">
      <label class="ds-form-label">${t('ds.location')}</label>
      <input type="text" class="ds-input-sm" id="dsLocation" placeholder="${t('ds.location_placeholder')}" autocomplete="off">
      <div class="ds-loc-list" id="dsLocationList"></div>
    </div>

    <!-- attendees: badges, search, pool, then register -->
    <div class="ds-form-section">
      <label class="ds-form-label">${t('ds.attendees')}</label>
      <div class="ds-selected-badges" id="dsSelectedBadges"></div>
      <div class="ds-pool-search-wrap">
        <input type="text" class="ds-input-sm" id="dsPoolSearch" placeholder="${ko ? '참석자 검색...' : 'Search contacts...'}" autocomplete="off">
      </div>
      <div class="ds-contact-pool" id="dsContactPool"></div>
      <div class="ds-attendee-register" style="margin-top:8px">
        <input type="text" class="ds-input-sm" id="dsAttendeeName" placeholder="${ko ? '이름' : 'Name'}" autocomplete="off">
        <input type="text" class="ds-input-sm" id="dsAttendeeTitle" placeholder="${ko ? '직급' : 'Title'}" autocomplete="off">
        <input type="text" class="ds-input-sm" id="dsAttendeeCompany" placeholder="${ko ? '회사' : 'Company'}" autocomplete="off">
        <button class="btn btn-sm btn-primary" id="btnDsAddAttendee">${ko ? '등록' : 'Add'}</button>
      </div>
      <div class="ds-autocomplete-dropdown" id="dsAutocomplete" hidden></div>
    </div>
  `;

  renderSelectedBadges();
  renderLocationList('');
  renderContactPool('');
  bindStep1Events();
}

function bindStep1Events() {
  // Location: filter browsable list on input
  const locInput = $('#dsLocation');
  if (locInput) {
    locInput.addEventListener('input', () => {
      renderLocationList(locInput.value.trim());
    });
  }

  // Attendee pool search
  const poolSearch = $('#dsPoolSearch');
  if (poolSearch) {
    poolSearch.addEventListener('input', () => {
      renderContactPool(poolSearch.value.trim());
    });
  }

  // Attendee autocomplete & registration
  bindAttendeeEvents();
}

function renderLocationList(query) {
  const container = $('#dsLocationList');
  if (!container) return;
  const locations = loadLocations();
  const filtered = locations.filter(l => matchField(l.name, query)).slice(0, 50);
  const currentVal = $('#dsLocation')?.value.trim() || '';
  if (!filtered.length) {
    container.innerHTML = `<div class="ds-loc-empty">${isKorean() ? '저장된 장소 없음' : 'No saved locations'}</div>`;
    return;
  }
  // Note: all values passed through escapeHtml for XSS safety
  container.innerHTML = filtered.map(l => {
    const selected = currentVal && l.name === currentVal;
    return `<div class="ds-loc-item${selected ? ' ds-loc-selected' : ''}" data-loc-name="${escapeHtml(l.name)}">`
      + `<span>${escapeHtml(l.name)}</span>`
      + (l.memo ? `<span class="ds-loc-memo">${escapeHtml(l.memo)}</span>` : '')
      + `</div>`;
  }).join('');
  container.querySelectorAll('.ds-loc-item').forEach(item => {
    item.addEventListener('click', () => {
      const locInput = $('#dsLocation');
      if (locInput) locInput.value = item.dataset.locName;
      // Re-render to update selection highlight
      renderLocationList($('#dsLocation')?.value.trim() || '');
    });
  });
}

function bindAttendeeEvents() {
  const nameInput = $('#dsAttendeeName');
  const titleInput = $('#dsAttendeeTitle');
  const companyInput = $('#dsAttendeeCompany');

  function showAcDropdown(matchFn) {
    const dropdown = $('#dsAutocomplete');
    if (!dropdown) return;
    const contacts = loadContacts();
    const selectedIds = new Set(selectedAttendees.map(a => a.id));
    const matches = contacts.filter(c => !selectedIds.has(c.id) && matchFn(c)).slice(0, 8);
    if (!matches.length) { dropdown.hidden = true; return; }
    dropdown.innerHTML = matches.map(c =>
      `<div class="ds-ac-item" data-contact-id="${c.id}"><strong>${escapeHtml(c.name)}</strong>${c.title ? ' <span class="text-muted">' + escapeHtml(c.title) + '</span>' : ''}${c.company ? ' <span class="text-muted">· ' + escapeHtml(c.company) + '</span>' : ''}</div>`
    ).join('');
    dropdown.hidden = false;
    dropdown.querySelectorAll('.ds-ac-item').forEach(item => {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const contact = contacts.find(c => c.id === item.dataset.contactId);
        if (contact) {
          selectedAttendees.push(contact);
          renderSelectedBadges();
          renderContactPool($('#dsPoolSearch')?.value.trim() || '');
          if (nameInput) nameInput.value = '';
          if (titleInput) titleInput.value = '';
          if (companyInput) companyInput.value = '';
          dropdown.hidden = true;
        }
      });
    });
  }

  const hideAc = () => setTimeout(() => { const d = $('#dsAutocomplete'); if (d) d.hidden = true; }, 150);

  if (nameInput) {
    nameInput.addEventListener('input', () => showAcDropdown(c => matchContactByName(c, nameInput.value.trim())));
    nameInput.addEventListener('blur', hideAc);
  }
  if (titleInput) {
    titleInput.addEventListener('input', () => showAcDropdown(c => matchField(c.title || '', titleInput.value.trim())));
    titleInput.addEventListener('blur', hideAc);
  }
  if (companyInput) {
    companyInput.addEventListener('input', () => showAcDropdown(c => matchField(c.company || '', companyInput.value.trim())));
    companyInput.addEventListener('blur', hideAc);
  }

  // Register button
  const addBtn = $('#btnDsAddAttendee');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const name = nameInput?.value.trim();
      if (!name) return;
      const title = titleInput?.value.trim() || '';
      const company = companyInput?.value.trim() || '';
      const contact = addContact({ name, title, company });
      selectedAttendees.push(contact);
      renderSelectedBadges();
      renderContactPool($('#dsPoolSearch')?.value.trim() || '');
      if (nameInput) nameInput.value = '';
      if (titleInput) titleInput.value = '';
      if (companyInput) companyInput.value = '';
      showToast(isKorean() ? `${name} 등록됨` : `${name} added`, 'success');
    });
  }
}

function renderSelectedBadges() {
  const container = $('#dsSelectedBadges');
  if (!container) return;
  if (!selectedAttendees.length) { container.innerHTML = ''; return; }
  container.innerHTML = selectedAttendees.map((a, i) =>
    `<span class="ds-badge">${escapeHtml(a.name)}${a.title ? '/' + escapeHtml(a.title) : ''} <button class="ds-badge-remove" data-idx="${i}">&times;</button></span>`
  ).join('');
  container.querySelectorAll('.ds-badge-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedAttendees.splice(parseInt(btn.dataset.idx), 1);
      renderSelectedBadges();
      renderContactPool($('#dsPoolSearch')?.value.trim() || '');
    });
  });
}

function renderContactPool(query) {
  const container = $('#dsContactPool');
  if (!container) return;
  const contacts = loadContacts();
  const selectedIds = new Set(selectedAttendees.map(a => a.id));
  const available = contacts.filter(c => !selectedIds.has(c.id) && matchContactByName(c, query || ''));
  if (!available.length) {
    container.innerHTML = query
      ? `<div class="ds-loc-empty">${isKorean() ? '검색 결과 없음' : 'No matches'}</div>`
      : '';
    return;
  }
  // Note: all values passed through escapeHtml for XSS safety
  container.innerHTML = available.map(c =>
    `<button class="ds-pool-chip" data-contact-id="${c.id}">${escapeHtml(c.name)}${c.title ? '/' + escapeHtml(c.title) : ''}${c.company ? ' · ' + escapeHtml(c.company) : ''}</button>`
  ).join('');
  container.querySelectorAll('.ds-pool-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const contact = contacts.find(c => c.id === btn.dataset.contactId);
      if (contact && !selectedAttendees.some(a => a.id === contact.id)) {
        selectedAttendees.push(contact);
        renderSelectedBadges();
        renderContactPool($('#dsPoolSearch')?.value.trim() || '');
      }
    });
  });
}

function collectStep1Results() {
  meetingDatetime = $('#dsDatetime')?.value || nowDatetimeLocal();
  meetingLocation = $('#dsLocation')?.value.trim() || '';
  // Save new location to DB if it doesn't exist
  if (meetingLocation) addLocation(meetingLocation);
  stepResults[1] = {
    datetime: meetingDatetime,
    location: meetingLocation,
    attendees: selectedAttendees.map(a => ({ name: a.name, title: a.title, company: a.company })),
  };
}

// ===== Step 2: Context Form (description, reference meetings, files) =====
function renderStep2Form() {
  const formArea = $('#dsFormArea2');
  if (!formArea) return;

  const ko = isKorean();
  allMeetings = listMeetings();

  const desc = $('#dsStep2Desc');
  if (desc) desc.textContent = t('ds.step2_desc');

  formArea.innerHTML = `
    <!-- ① 한줄 설명 -->
    <div class="ds-form-section">
      <label class="ds-form-label">${t('ds.description')}</label>
      <input type="text" class="ds-input-sm" id="dsDescription" placeholder="${t('ds.description_placeholder')}" value="${escapeHtml(meetingDescription)}">
    </div>

    <!-- reference meetings (card UI) -->
    <div class="ds-form-section">
      <label class="ds-form-label">${t('ds.ref_meetings')} <span class="ds-ref-count" id="dsRefCount"></span></label>
      <div class="ds-ref-selected-chips" id="dsRefSelectedChips"></div>
      <div class="ds-ref-box">
        <div class="ds-ref-filters">
          <input type="search" class="ds-input-sm ds-ref-search" id="dsRefSearch" placeholder="${ko ? '검색...' : 'Search...'}">
          <select class="ds-ref-type-filter" id="dsRefTypeFilter">
            <option value="">${ko ? '전체' : 'All'}</option>
            <option value="copilot">Copilot</option>
            <option value="minutes">${ko ? '회의록' : 'Minutes'}</option>
            <option value="learning">${ko ? '학습' : 'Learning'}</option>
          </select>
        </div>
        <div class="ds-ref-list" id="dsRefList"></div>
      </div>
    </div>

    <!-- ③ 파일 첨부 -->
    <div class="ds-form-section">
      <label class="ds-form-label">${t('ds.files')}</label>
      <div class="ds-file-drops">
        <div class="ds-drop-zone" data-category="minutes"><div class="ds-drop-icon">📄</div><div class="ds-drop-label">${ko ? '회의록' : 'Minutes'}</div><div class="ds-drop-hint">.md .txt .doc</div><input type="file" hidden accept=".md,.txt,.doc,.docx,.hwp,.pdf"></div>
        <div class="ds-drop-zone" data-category="data"><div class="ds-drop-icon">📊</div><div class="ds-drop-label">${ko ? '자료' : 'Data'}</div><div class="ds-drop-hint">.csv .xlsx .json</div><input type="file" hidden accept=".csv,.xlsx,.xls,.json,.xml,.yaml,.yml"></div>
        <div class="ds-drop-zone" data-category="memo"><div class="ds-drop-icon">📋</div><div class="ds-drop-label">${ko ? '메모' : 'Memo'}</div><div class="ds-drop-hint">.md .txt .log</div><input type="file" hidden accept=".md,.txt,.log,.rtf"></div>
        <div class="ds-drop-zone" data-category="etc"><div class="ds-drop-icon">📁</div><div class="ds-drop-label">${ko ? '기타' : 'Other'}</div><div class="ds-drop-hint">.py .js .html ...</div><input type="file" hidden accept=".py,.js,.ts,.html,.css,.xml,.log,.yaml,.yml,.txt,.md,.csv,.json"></div>
      </div>
      <div class="ds-file-attached" id="dsFileAttached"></div>
    </div>
  `;

  renderRefList('', '');
  renderRefSelectedChips();
  renderFileAttached();
  bindStep2Events();
}

function renderRefList(query, typeFilter) {
  const container = $('#dsRefList');
  const countEl = $('#dsRefCount');
  if (!container) return;
  const ko = isKorean();
  const q = (query || '').replace(/\s/g, '').toLowerCase();
  const filtered = allMeetings.filter(m => {
    if (q) {
      const title = (m.title || m.id || '').replace(/\s/g, '').toLowerCase();
      if (!title.includes(q)) return false;
    }
    if (typeFilter) {
      const preset = m.preset || 'copilot';
      if (preset !== typeFilter) return false;
    }
    return true;
  });
  // Note: all values passed through escapeHtml for XSS safety
  container.innerHTML = filtered.slice(0, 50).map(m => {
    const checked = selectedReferences.some(r => r.id === m.id);
    const date = m.createdAt ? new Date(m.createdAt).toLocaleDateString() : '';
    const preset = m.preset || 'copilot';
    const participants = (m.participants || []).slice(0, 3).join(', ');
    const truncParticipants = participants.length > 40 ? participants.slice(0, 40) + '...' : participants;
    let summary = '';
    if (m.analysisHistory?.length) {
      const last = m.analysisHistory[m.analysisHistory.length - 1];
      const raw = last.markdown || last.raw || '';
      summary = raw.replace(/[#*_`>|\-\[\]]/g, '').trim().slice(0, 80);
      if (raw.length > 80) summary += '...';
    }
    return `<div class="ds-ref-card${checked ? ' ds-ref-checked' : ''}" data-meeting-id="${m.id}">
      <button class="ds-ref-card-preview-btn" data-preview-id="${m.id}" title="${ko ? '미리보기' : 'Preview'}">&#128065;</button>
      <div class="ds-ref-card-header">
        <span class="ds-ref-card-title">${escapeHtml(m.title || m.id)}</span>
        <span class="ds-ref-card-date">${date}</span>
      </div>
      <div class="ds-ref-card-meta">
        <span class="ds-ref-card-type">${escapeHtml(preset)}</span>
        ${truncParticipants ? `<span class="ds-ref-card-attendees">${escapeHtml(truncParticipants)}</span>` : ''}
      </div>
      ${summary ? `<div class="ds-ref-card-summary">${escapeHtml(summary)}</div>` : ''}
    </div>`;
  }).join('');
  if (!filtered.length) {
    container.innerHTML = `<div class="ds-ref-empty">${ko ? '검색 결과 없음' : 'No results'}</div>`;
  }
  if (countEl) {
    countEl.textContent = selectedReferences.length ? (ko ? `선택됨: ${selectedReferences.length}개` : `Selected: ${selectedReferences.length}`) : '';
  }
  // Card click = toggle selection
  container.querySelectorAll('.ds-ref-card').forEach(card => {
    card.addEventListener('click', (e) => {
      // Ignore if preview button was clicked
      if (e.target.closest('.ds-ref-card-preview-btn')) return;
      const id = card.dataset.meetingId;
      const isSelected = selectedReferences.some(r => r.id === id);
      if (isSelected) {
        selectedReferences = selectedReferences.filter(r => r.id !== id);
      } else {
        const m = allMeetings.find(x => x.id === id);
        if (m) selectedReferences.push(m);
      }
      card.classList.toggle('ds-ref-checked', !isSelected);
      renderRefSelectedChips();
      if (countEl) {
        countEl.textContent = selectedReferences.length ? (ko ? `선택됨: ${selectedReferences.length}개` : `Selected: ${selectedReferences.length}`) : '';
      }
    });
  });
  // Preview button click
  container.querySelectorAll('.ds-ref-card-preview-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openRefViewer(btn.dataset.previewId);
    });
  });
}

function renderRefSelectedChips() {
  const container = $('#dsRefSelectedChips');
  if (!container) return;
  if (!selectedReferences.length) { container.innerHTML = ''; return; }
  // Note: all values passed through escapeHtml for XSS safety
  container.innerHTML = selectedReferences.map(r =>
    `<span class="ds-ref-selected-chip">${escapeHtml(r.title || r.id)} <button data-ref-id="${r.id}">&times;</button></span>`
  ).join('');
  container.querySelectorAll('.ds-ref-selected-chip button').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedReferences = selectedReferences.filter(r => r.id !== btn.dataset.refId);
      renderRefSelectedChips();
      const searchQ = $('#dsRefSearch')?.value || '';
      const typeF = $('#dsRefTypeFilter')?.value || '';
      renderRefList(searchQ, typeF);
    });
  });
}

function openRefViewer(meetingId) {
  const meeting = getMeeting(meetingId);
  if (!meeting) return;
  const ko = isKorean();

  const modal = $('#refQuickViewerModal');
  if (!modal) return;
  $('#refQuickViewerTitle').textContent = meeting.title || 'Untitled';

  // Transcript tab
  const transcriptEl = $('#refQuickViewerTranscript');
  if (meeting.transcript?.length) {
    transcriptEl.innerHTML = meeting.transcript.map(line => {
      const time = line.timestamp ? `<span class="transcript-time">${new Date(line.timestamp).toLocaleTimeString()}</span>` : '';
      return `<div class="transcript-line">${time}${escapeHtml(line.text || '')}</div>`;
    }).join('');
  } else {
    transcriptEl.innerHTML = `<p class="text-muted">${ko ? '녹취록 없음' : 'No transcript'}</p>`;
  }

  // Analysis tab
  const analysisEl = $('#refQuickViewerAnalysis');
  if (meeting.analysisHistory?.length) {
    const last = meeting.analysisHistory[meeting.analysisHistory.length - 1];
    const md = last.markdown || last.raw || '';
    analysisEl.textContent = md;
  } else {
    analysisEl.innerHTML = `<p class="text-muted">${ko ? '분석 없음' : 'No analysis'}</p>`;
  }

  // Reset tabs
  modal.querySelectorAll('.ref-quick-viewer-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === 'transcript');
  });
  transcriptEl.hidden = false;
  analysisEl.hidden = true;

  // Tab switching
  modal.querySelectorAll('.ref-quick-viewer-tab').forEach(tab => {
    tab.onclick = () => {
      modal.querySelectorAll('.ref-quick-viewer-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      transcriptEl.hidden = tab.dataset.tab !== 'transcript';
      analysisEl.hidden = tab.dataset.tab !== 'analysis';
    };
  });

  // Close handlers
  const closeBtn = $('#btnCloseRefQuickViewer');
  if (closeBtn) closeBtn.onclick = () => { modal.hidden = true; };
  modal.onclick = (e) => { if (e.target === modal) modal.hidden = true; };

  modal.hidden = false;
}

async function handleFileAttach(files, category) {
  for (const file of files) {
    if (file.size > 500 * 1024) continue;
    try {
      const content = await file.text();
      attachedFiles.push({ name: file.name, content: content.slice(0, 10000), category });
      renderFileAttached();
    } catch { /* skip */ }
  }
}

function renderFileAttached() {
  const container = $('#dsFileAttached');
  if (!container) return;
  if (!attachedFiles.length) { container.innerHTML = ''; return; }
  const ko = isKorean();
  container.innerHTML = `<div class="ds-form-label" style="margin-bottom:4px">${ko ? '첨부됨' : 'Attached'}:</div>` +
    attachedFiles.map((f, i) =>
      `<span class="ds-file-chip">${escapeHtml(f.name)} <button class="ds-file-remove" data-idx="${i}">&times;</button></span>`
    ).join('');
  container.querySelectorAll('.ds-file-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      attachedFiles.splice(parseInt(btn.dataset.idx), 1);
      renderFileAttached();
    });
  });
  document.querySelectorAll('.ds-drop-zone').forEach(zone => {
    const cat = zone.dataset.category;
    const count = attachedFiles.filter(f => f.category === cat).length;
    zone.classList.toggle('ds-drop-has-file', count > 0);
  });
}

function bindStep2Events() {
  // Reference search + type filter
  const refSearch = $('#dsRefSearch');
  const refTypeFilter = $('#dsRefTypeFilter');
  const getFilters = () => ({
    q: refSearch?.value || '',
    t: refTypeFilter?.value || '',
  });
  if (refSearch) {
    refSearch.addEventListener('input', () => { const f = getFilters(); renderRefList(f.q, f.t); });
  }
  if (refTypeFilter) {
    refTypeFilter.addEventListener('change', () => { const f = getFilters(); renderRefList(f.q, f.t); });
  }

  // File drop zones
  document.querySelectorAll('.ds-drop-zone').forEach(zone => {
    const fileInput = zone.querySelector('input[type="file"]');
    zone.addEventListener('click', () => fileInput?.click());
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('ds-drop-hover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('ds-drop-hover'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('ds-drop-hover');
      handleFileAttach(e.dataTransfer.files, zone.dataset.category);
    });
    if (fileInput) {
      fileInput.addEventListener('change', () => {
        handleFileAttach(fileInput.files, zone.dataset.category);
        fileInput.value = '';
      });
    }
  });
}

function collectStep2Results() {
  meetingDescription = $('#dsDescription')?.value.trim() || '';
  stepResults[2] = {
    description: meetingDescription,
    references: selectedReferences.map(r => ({ id: r.id, title: r.title, analysis: getLastAnalysisText(r) })),
    files: attachedFiles.map(f => ({ name: f.name, category: f.category })),
  };
}

// ===== Step 4: Summary =====
function renderSummary() {
  const container = $('#dsSummary');
  if (!container) return;

  const s1 = stepResults[1] || {};
  const s2 = stepResults[2] || {};
  const s3 = stepResults[3] || {};

  let html = `<div class="ds-summary-card">`;

  // Datetime
  if (s1.datetime) {
    html += `<div class="ds-summary-section">
      <div class="ds-summary-label">${t('ds.summary_datetime')}</div>
      <div class="ds-summary-value">${new Date(s1.datetime).toLocaleString()}</div>
    </div>`;
  }

  // Location
  if (s1.location) {
    html += `<div class="ds-summary-section">
      <div class="ds-summary-label">${t('ds.summary_location')}</div>
      <div class="ds-summary-value">${escapeHtml(s1.location)}</div>
    </div>`;
  }

  // Description
  if (s2.description) {
    html += `<div class="ds-summary-section">
      <div class="ds-summary-label">${t('ds.summary_description')}</div>
      <div class="ds-summary-value">${escapeHtml(s2.description)}</div>
    </div>`;
  }

  // Attendees
  if (s1.attendees?.length) {
    html += `<div class="ds-summary-section">
      <div class="ds-summary-label">${t('ds.summary_attendees')}</div>
      <div class="ds-summary-value">${s1.attendees.map(a => escapeHtml(a.name + (a.title ? '/' + a.title : ''))).join(', ')}</div>
    </div>`;
  }

  // Situation / Summary from AI
  if (s3.summary) {
    html += `<div class="ds-summary-section">
      <div class="ds-summary-label">${t('ds.summary_situation')}</div>
      <div class="ds-summary-value">${escapeHtml(s3.summary)}</div>
    </div>`;
  }

  // Focus Points
  if (s3.focusPoints?.length) {
    html += `<div class="ds-summary-section">
      <div class="ds-summary-label">${t('ds.summary_focus')}</div>
      <ul class="ds-summary-list">${s3.focusPoints.map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul>
    </div>`;
  }

  // Linked reference meetings
  if (selectedReferences.length) {
    html += `<div class="ds-summary-section">
      <div class="ds-summary-label">${t('ds.summary_links')}</div>
      <div class="ds-summary-value">${selectedReferences.map(r => escapeHtml(r.title || r.id)).join(', ')}</div>
    </div>`;
  }

  html += `</div>`;
  container.innerHTML = html;
}

// ===== Modal Control =====
function closeModal() {
  const modal = $('#deepSetupModal');
  if (modal) modal.hidden = true;
  isStreaming = false;
}

function handleStart() {
  // Create bidirectional links for reference meetings
  // We'll emit the meetingId later; for now store reference IDs
  const config = {
    ...(stepResults[3] || {}),
    datetime: meetingDatetime,
    location: meetingLocation,
    description: meetingDescription,
    attendees: selectedAttendees,
    referenceIds: selectedReferences.map(r => r.id),
    referenceAnalysis: selectedReferences.map(r => getLastAnalysisText(r)).filter(Boolean).join('\n\n---\n\n') || null,
    attachedFiles: attachedFiles,
  };
  emit('deepSetup:complete', config);
  closeModal();
}

function handleSavePreset() {
  const s3 = stepResults[3];
  if (!s3) return;
  addCustomType({
    name: s3.name || '',
    description: s3.description || '',
    prompt: s3.analysisPrompt || '',
    chatSystemPrompt: s3.chatSystemPrompt || '',
    chatPresets: s3.chatPresets || [],
    memoHint: s3.memoHint || '',
    context: s3.context || '',
  });
  emit('customTypes:change');
  showToast(t('pb.saved'), 'success');
}

// ===== Open =====
export function openDeepSetup() {
  const modal = $('#deepSetupModal');
  if (!modal) return;

  // Reset
  currentStep = 1;
  stepHistories = { 3: [] };
  stepResults = { 1: null, 2: null, 3: null };
  selectedAttendees = [];
  selectedReferences = [];
  attachedFiles = [];
  meetingDescription = '';
  meetingDatetime = nowDatetimeLocal();
  meetingLocation = '';

  modal.hidden = false;

  // Clear chat area
  const msgs3 = $('#dsMessages3');
  if (msgs3) msgs3.innerHTML = '';

  // Reset summary
  const summary = $('#dsSummary');
  if (summary) summary.innerHTML = '';

  goToStep(1);

  // Render step 1 form (datetime, location, attendees)
  renderStep1Form();

  // Pre-render step 2 form
  renderStep2Form();
}

// ===== Init =====
export function initDeepSetup() {
  // Send button for chat step 3
  const sendBtn = $('#btnDsSend3');
  if (sendBtn) {
    sendBtn.addEventListener('click', () => {
      const input = $('#dsInput3');
      if (input?.value.trim()) sendMessage(input.value.trim());
    });
  }

  const input3 = $('#dsInput3');
  if (input3) {
    input3.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (input3.value.trim()) sendMessage(input3.value.trim());
      }
    });
  }

  // Navigation
  const backBtn = $('#btnDsBack');
  if (backBtn) {
    backBtn.addEventListener('click', () => goToStep(currentStep - 1));
  }

  const nextBtn = $('#btnDsNext');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => goToStep(currentStep + 1));
  }

  // Skip button (Step 2)
  const skipBtn = $('#btnDsSkip');
  if (skipBtn) {
    skipBtn.addEventListener('click', () => {
      collectStep2Results();
      goToStep(3);
    });
  }

  // Step 4 action buttons
  const startBtn = $('#btnDsStart');
  if (startBtn) startBtn.addEventListener('click', handleStart);

  const saveBtn = $('#btnDsSavePreset');
  if (saveBtn) saveBtn.addEventListener('click', handleSavePreset);

  const editBtn = $('#btnDsEdit');
  if (editBtn) editBtn.addEventListener('click', () => goToStep(3));

  // Close
  const modal = $('#deepSetupModal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
    const closeBtn = modal.querySelector('.modal-close, .ds-close');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = $('#deepSetupModal');
      if (modal && !modal.hidden) closeModal();
    }
  });
}
