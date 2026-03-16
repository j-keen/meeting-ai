// deep-setup.js - 4-step AI-guided "경청 준비" (Listen Prep) wizard

import { emit } from './event-bus.js';
import { getAiLanguage, t } from './i18n.js';
import { callGeminiStream, isProxyAvailable } from './gemini-api.js';
import { addCustomType, addContact, loadContacts, listMeetings, getMeeting } from './storage.js';
import { showToast } from './ui.js';
import { renderMarkdown } from './chat.js';
import { escapeHtml } from './utils.js';

const $ = (sel) => document.querySelector(sel);
const MODEL = 'gemini-2.5-flash';

// ===== State =====
let currentStep = 1;
const TOTAL_STEPS = 4;
let stepHistories = { 1: [], 3: [] };
let stepResults = { 1: null, 2: null, 3: null };
let isStreaming = false;
let selectedAttendees = [];
let attachedFiles = [];

// ===== Scenario Chips =====
const SCENARIO_CHIPS = [
  { ko: '업무 미팅', en: 'Work Meeting' },
  { ko: '상담/컨설팅', en: 'Consultation' },
  { ko: '발표/면접 연습', en: 'Presentation/Interview' },
  { ko: '브레인스토밍', en: 'Brainstorming' },
  { ko: '배움/강의', en: 'Learning/Lecture' },
];

// ===== Helpers =====
function isKorean() { return getAiLanguage() === 'ko'; }

function extractJSON(text) {
  const match = text.match(/```json\s*([\s\S]*?)```/);
  if (!match) return null;
  try { return JSON.parse(match[1].trim()); } catch { return null; }
}

// ===== Step Meta Prompts =====
function getStep1Prompt() {
  const ko = isKorean();
  return ko
    ? `사용자가 어떤 대화/상황에 들어가는지 이해하세요. 사용자가 자유롭게 설명할 수 있도록 편안한 톤으로 대화하세요.

사용자가 짧게 답하면 (예: "미팅") 자연스럽게 후속 질문 1개를 해서 상황을 좀 더 파악하세요.
사용자가 충분히 설명했으면 바로 JSON을 출력하세요. 최대 2턴.

반드시 아래 JSON을 코드블록(\`\`\`json ... \`\`\`)으로 출력:
{ "situation": "상황을 구체적으로 요약", "type": "상황 유형" }

톤: "~해드릴게요" 스타일, 편하지만 프로페셔널하게.`
    : `Understand what conversation/situation the user is entering. Be conversational and warm.

If the user gives a short answer (e.g., "a meeting"), ask one natural follow-up to learn more.
If they explain enough, output JSON right away. 2 turns max.

Output this JSON in a code block (\`\`\`json ... \`\`\`):
{ "situation": "specific situation summary", "type": "situation type" }

Tone: casual but professional, like a trusted colleague.`;
}

function getStep3Prompt(prevResults) {
  const ko = isKorean();
  const ctx = JSON.stringify(prevResults, null, 2);
  return ko
    ? `당신은 사용자의 "믿을 수 있는 동료"입니다. 실시간 음성-AI 분석 앱에서 옆자리에 앉아 대화를 함께 듣고 도와주는 역할입니다.

이전 단계 결과:
${ctx}

사용자에게 "제가 특히 집중해서 잡아드릴 것"을 물어보고, 답변을 듣고 최적의 설정을 만들어주세요.

## 앱이 하는 일
1. **실시간 코파일럿 분석**: 대화를 듣고 AI가 주기적으로 인사이트를 정리
2. **AI 채팅**: 대화 중 궁금한 걸 AI에게 바로 질문
3. **메모**: 실시간 메모를 남기면 다음 분석에 반영

1턴이면 끝. 바로 설정 JSON을 만들어주세요.

## 생성할 JSON
\`\`\`json
{
  "name": "프리셋 이름",
  "description": "한 줄 설명",
  "summary": "상황 요약 1줄",
  "focusPoints": ["집중 포인트 1", "집중 포인트 2", "집중 포인트 3"],
  "analysisPrompt": "분석 AI 프롬프트",
  "chatSystemPrompt": "채팅 AI 역할 정의",
  "chatPresets": ["추천 질문 1", "추천 질문 2", "추천 질문 3"],
  "memoHint": "메모 가이드 텍스트",
  "context": "상황 배경 설명"
}
\`\`\`

톤: 격식 없이 편하게, 하지만 프로페셔널하게.`
    : `You are the user's "trusted teammate." In this real-time voice-AI analysis app, you sit beside them and help out.

Previous step results:
${ctx}

Ask the user what they want you to especially focus on, then create the optimal setup.

## What the app does
1. **Real-time Copilot Analysis**: Listens and surfaces insights periodically
2. **AI Chat**: Ask AI questions on the spot
3. **Memo**: Real-time notes reflected in next analysis

One turn max. Generate the setup JSON right away.

## JSON to generate
\`\`\`json
{
  "name": "Preset name",
  "description": "One-line description",
  "summary": "Situation summary (1 line)",
  "focusPoints": ["Focus point 1", "Focus point 2", "Focus point 3"],
  "analysisPrompt": "Prompt for analysis AI",
  "chatSystemPrompt": "Role definition for chat AI",
  "chatPresets": ["Suggested question 1", "Suggested question 2", "Suggested question 3"],
  "memoHint": "Guide text for memo input",
  "context": "Background description"
}
\`\`\`

Tone: casual but professional.`;
}

// ===== Render Helpers =====
function getChatContainer() {
  return $(`#dsMessages${currentStep}`);
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

function addUserMessage(text) {
  addMessage('user', escapeHtml(text));
}

function addAiMessage(html) {
  return addMessage('model', html);
}

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

  // Collect step 2 data when leaving it
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
  if (backBtn) backBtn.hidden = n === 1;
  if (nextBtn) {
    nextBtn.hidden = n === TOTAL_STEPS;
    // Step 2 is always skippable; others need results
    nextBtn.disabled = (n === 2) ? false : !stepResults[n];
  }

  // Step 3: show greeting if first visit
  if (n === 3 && stepHistories[3].length === 0) {
    const msgs3 = $('#dsMessages3');
    if (msgs3 && msgs3.children.length === 0) {
      const el = document.createElement('div');
      el.className = 'pb-message pb-message-model';
      el.innerHTML = `<div class="pb-message-content">${renderMarkdown(t('ds.step3_greeting'))}</div>`;
      msgs3.appendChild(el);

      const chips3 = $('#dsChips3');
      if (chips3) {
        renderChips(chips3, [
          { ko: '모순되는 말 잡아줘', en: 'Catch contradictions' },
          { ko: '핵심 용어 정리해줘', en: 'Organize key terms' },
          { ko: '발표 구조 분석해줘', en: 'Analyze structure' },
        ], (text) => sendMessage(text));
      }
    }
  }

  // Step 4: render summary
  if (n === TOTAL_STEPS) {
    renderSummary();
  }
}

// ===== AI Communication =====
function buildContents(step, userText) {
  let systemPrompt;
  if (step === 1) systemPrompt = getStep1Prompt();
  else if (step === 3) systemPrompt = getStep3Prompt({ step1: stepResults[1], step2: stepResults[2] });

  const greeting = t(`ds.step${step}_greeting`);
  const contents = [
    { role: 'user', parts: [{ text: systemPrompt }] },
    { role: 'model', parts: [{ text: greeting }] },
  ];

  (stepHistories[step] || []).forEach(msg => {
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

async function sendMessage(text) {
  if (!text.trim() || isStreaming) return;
  const step = currentStep;

  addUserMessage(text);
  if (!stepHistories[step]) stepHistories[step] = [];
  stepHistories[step].push({ role: 'user', text });

  const input = $(`#dsInput${step}`);
  if (input) input.value = '';

  // Hide chips
  const chips = $(`#dsChips${step}`);
  if (chips) chips.style.display = 'none';

  if (!isProxyAvailable()) {
    addAiMessage(isKorean()
      ? '<p>API 프록시를 사용할 수 없습니다. 설정을 확인해주세요.</p>'
      : '<p>API proxy is not available. Please check your settings.</p>');
    return;
  }

  isStreaming = true;
  const sendBtn = $(`#btnDsSend${step}`);
  if (sendBtn) sendBtn.disabled = true;

  const typingEl = showTypingIndicator();

  try {
    const contents = buildContents(step, text);
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
    stepHistories[step].push({ role: 'model', text: fullText });

    // Extract JSON result
    const json = extractJSON(fullText);
    if (json) {
      stepResults[step] = json;
      const nextBtn = $('#btnDsNext');
      if (nextBtn) nextBtn.disabled = false;

      // Auto-advance after a short delay
      setTimeout(() => {
        if (currentStep === step && step < TOTAL_STEPS) {
          goToStep(step + 1);
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

// Name field searches across all fields (이름 칸에서 직급/회사도 검색)
function matchContactByName(c, query) {
  if (!query) return true;
  return matchField(c.name, query) || matchField(c.title || '', query) || matchField(c.company || '', query);
}

let allMeetings = [];
let selectedReferences = [];

// ===== Step 2: Form-only (contacts + reference + files) =====
function renderStep2Form() {
  const formArea = $('#dsFormArea2');
  if (!formArea) return;

  const ko = isKorean();
  allMeetings = listMeetings();

  const desc = $('#dsStep2Desc');
  if (desc) desc.textContent = t('ds.step2_greeting');

  formArea.innerHTML = `
    <!-- ① 참석자 -->
    <div class="ds-form-section">
      <label class="ds-form-label">${ko ? '참석자' : 'Attendees'}</label>
      <div class="ds-attendee-register">
        <input type="text" class="ds-input-sm" id="dsAttendeeName" placeholder="${ko ? '이름' : 'Name'}" autocomplete="off">
        <input type="text" class="ds-input-sm" id="dsAttendeeTitle" placeholder="${ko ? '직급' : 'Title'}" autocomplete="off">
        <input type="text" class="ds-input-sm" id="dsAttendeeCompany" placeholder="${ko ? '회사' : 'Company'}" autocomplete="off">
        <button class="btn btn-sm btn-primary" id="btnDsAddAttendee">${ko ? '등록' : 'Add'}</button>
      </div>
      <div class="ds-autocomplete-dropdown" id="dsAutocomplete" hidden></div>
      <div class="ds-selected-badges" id="dsSelectedBadges"></div>
      <div class="ds-contact-pool" id="dsContactPool"></div>
    </div>

    <!-- ② 참고할 이전 미팅 -->
    <div class="ds-form-section">
      <label class="ds-form-label">${ko ? '참고할 이전 미팅' : 'Reference Meetings'} <span class="ds-ref-count" id="dsRefCount"></span></label>
      <div class="ds-ref-box">
        <input type="search" class="ds-input-sm ds-ref-search" id="dsRefSearch" placeholder="${ko ? '검색...' : 'Search...'}">
        <div class="ds-ref-list" id="dsRefList"></div>
      </div>
    </div>

    <!-- ③ 파일 첨부 -->
    <div class="ds-form-section">
      <label class="ds-form-label">${ko ? '파일 첨부' : 'Files'}</label>
      <div class="ds-file-drops">
        <div class="ds-drop-zone" data-category="minutes"><div class="ds-drop-icon">📄</div><div class="ds-drop-label">${ko ? '회의록' : 'Minutes'}</div><div class="ds-drop-hint">.md .txt .doc</div><input type="file" hidden accept=".md,.txt,.doc,.docx,.hwp,.pdf"></div>
        <div class="ds-drop-zone" data-category="data"><div class="ds-drop-icon">📊</div><div class="ds-drop-label">${ko ? '자료' : 'Data'}</div><div class="ds-drop-hint">.csv .xlsx .json</div><input type="file" hidden accept=".csv,.xlsx,.xls,.json,.xml,.yaml,.yml"></div>
        <div class="ds-drop-zone" data-category="memo"><div class="ds-drop-icon">📋</div><div class="ds-drop-label">${ko ? '메모' : 'Memo'}</div><div class="ds-drop-hint">.md .txt .log</div><input type="file" hidden accept=".md,.txt,.log,.rtf"></div>
        <div class="ds-drop-zone" data-category="etc"><div class="ds-drop-icon">📁</div><div class="ds-drop-label">${ko ? '기타' : 'Other'}</div><div class="ds-drop-hint">.py .js .html ...</div><input type="file" hidden accept=".py,.js,.ts,.html,.css,.xml,.log,.yaml,.yml,.txt,.md,.csv,.json"></div>
      </div>
      <div class="ds-file-attached" id="dsFileAttached"></div>
    </div>
  `;

  renderContactPool();
  renderSelectedBadges();
  renderRefList('');
  renderFileAttached();
  bindStep2Events();
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
      renderContactPool();
    });
  });
}

function renderContactPool() {
  const container = $('#dsContactPool');
  if (!container) return;
  const contacts = loadContacts();
  const selectedIds = new Set(selectedAttendees.map(a => a.id));
  const available = contacts.filter(c => !selectedIds.has(c.id));
  if (!available.length) { container.innerHTML = ''; return; }
  container.innerHTML = available.map(c =>
    `<button class="ds-pool-chip" data-contact-id="${c.id}">${escapeHtml(c.name)}${c.title ? '/' + escapeHtml(c.title) : ''}${c.company ? ' · ' + escapeHtml(c.company) : ''}</button>`
  ).join('');
  container.querySelectorAll('.ds-pool-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const contact = contacts.find(c => c.id === btn.dataset.contactId);
      if (contact && !selectedAttendees.some(a => a.id === contact.id)) {
        selectedAttendees.push(contact);
        renderSelectedBadges();
        renderContactPool();
      }
    });
  });
}

function showAutocomplete(query) {
  const dropdown = $('#dsAutocomplete');
  if (!dropdown || !query) { if (dropdown) dropdown.hidden = true; return; }
  const contacts = loadContacts();
  const selectedIds = new Set(selectedAttendees.map(a => a.id));
  const matches = contacts.filter(c => !selectedIds.has(c.id) && matchContactByName(c, query)).slice(0, 8);
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
        renderContactPool();
        $('#dsAttendeeName').value = '';
        $('#dsAttendeeTitle').value = '';
        $('#dsAttendeeCompany').value = '';
        dropdown.hidden = true;
      }
    });
  });
}

function renderRefList(query) {
  const container = $('#dsRefList');
  const countEl = $('#dsRefCount');
  if (!container) return;
  const q = (query || '').replace(/\s/g, '').toLowerCase();
  const filtered = allMeetings.filter(m => {
    if (!q) return true;
    const title = (m.title || m.id || '').replace(/\s/g, '').toLowerCase();
    return title.includes(q);
  });
  container.innerHTML = filtered.slice(0, 50).map(m => {
    const checked = selectedReferences.some(r => r.id === m.id);
    const date = m.createdAt ? new Date(m.createdAt).toLocaleDateString() : '';
    return `<label class="ds-ref-item${checked ? ' ds-ref-checked' : ''}">
      <input type="checkbox" value="${m.id}" ${checked ? 'checked' : ''}>
      <span class="ds-ref-title">${escapeHtml(m.title || m.id)}</span>
      <span class="ds-ref-date">${date}</span>
    </label>`;
  }).join('');
  if (!filtered.length) {
    container.innerHTML = `<div class="ds-ref-empty">${isKorean() ? '검색 결과 없음' : 'No results'}</div>`;
  }
  if (countEl) {
    countEl.textContent = selectedReferences.length ? (isKorean() ? `선택됨: ${selectedReferences.length}개` : `Selected: ${selectedReferences.length}`) : '';
  }
  container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const id = cb.value;
      if (cb.checked) {
        const m = allMeetings.find(x => x.id === id);
        if (m && !selectedReferences.some(r => r.id === id)) selectedReferences.push(m);
      } else {
        selectedReferences = selectedReferences.filter(r => r.id !== id);
      }
      cb.closest('.ds-ref-item').classList.toggle('ds-ref-checked', cb.checked);
      if (countEl) {
        countEl.textContent = selectedReferences.length ? (isKorean() ? `선택됨: ${selectedReferences.length}개` : `Selected: ${selectedReferences.length}`) : '';
      }
    });
  });
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
  // Update drop zone indicators
  document.querySelectorAll('.ds-drop-zone').forEach(zone => {
    const cat = zone.dataset.category;
    const count = attachedFiles.filter(f => f.category === cat).length;
    zone.classList.toggle('ds-drop-has-file', count > 0);
  });
}

function bindStep2Events() {
  // Autocomplete on name input
  const nameInput = $('#dsAttendeeName');
  const titleInput = $('#dsAttendeeTitle');
  const companyInput = $('#dsAttendeeCompany');

  if (nameInput) {
    nameInput.addEventListener('input', () => showAutocomplete(nameInput.value.trim()));
    nameInput.addEventListener('blur', () => setTimeout(() => { const d = $('#dsAutocomplete'); if (d) d.hidden = true; }, 150));
    // Title field: autocomplete only by title
    titleInput.addEventListener('input', () => {
      const q = titleInput.value.trim();
      const dropdown = $('#dsAutocomplete');
      if (!q) { if (dropdown) dropdown.hidden = true; return; }
      const contacts = loadContacts();
      const selectedIds = new Set(selectedAttendees.map(a => a.id));
      const matches = contacts.filter(c => !selectedIds.has(c.id) && matchField(c.title || '', q)).slice(0, 8);
      if (!matches.length) { if (dropdown) dropdown.hidden = true; return; }
      dropdown.innerHTML = matches.map(c =>
        `<div class="ds-ac-item" data-contact-id="${c.id}"><strong>${escapeHtml(c.name)}</strong>${c.title ? ' <span class="text-muted">' + escapeHtml(c.title) + '</span>' : ''}${c.company ? ' <span class="text-muted">· ' + escapeHtml(c.company) + '</span>' : ''}</div>`
      ).join('');
      dropdown.hidden = false;
      dropdown.querySelectorAll('.ds-ac-item').forEach(item => {
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          const contact = contacts.find(c => c.id === item.dataset.contactId);
          if (contact) { selectedAttendees.push(contact); renderSelectedBadges(); renderContactPool(); nameInput.value = ''; titleInput.value = ''; companyInput.value = ''; dropdown.hidden = true; }
        });
      });
    });
    titleInput.addEventListener('blur', () => setTimeout(() => { const d = $('#dsAutocomplete'); if (d) d.hidden = true; }, 150));
    // Company field: autocomplete only by company
    companyInput.addEventListener('input', () => {
      const q = companyInput.value.trim();
      const dropdown = $('#dsAutocomplete');
      if (!q) { if (dropdown) dropdown.hidden = true; return; }
      const contacts = loadContacts();
      const selectedIds = new Set(selectedAttendees.map(a => a.id));
      const matches = contacts.filter(c => !selectedIds.has(c.id) && matchField(c.company || '', q)).slice(0, 8);
      if (!matches.length) { if (dropdown) dropdown.hidden = true; return; }
      dropdown.innerHTML = matches.map(c =>
        `<div class="ds-ac-item" data-contact-id="${c.id}"><strong>${escapeHtml(c.name)}</strong>${c.title ? ' <span class="text-muted">' + escapeHtml(c.title) + '</span>' : ''}${c.company ? ' <span class="text-muted">· ' + escapeHtml(c.company) + '</span>' : ''}</div>`
      ).join('');
      dropdown.hidden = false;
      dropdown.querySelectorAll('.ds-ac-item').forEach(item => {
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          const contact = contacts.find(c => c.id === item.dataset.contactId);
          if (contact) { selectedAttendees.push(contact); renderSelectedBadges(); renderContactPool(); nameInput.value = ''; titleInput.value = ''; companyInput.value = ''; dropdown.hidden = true; }
        });
      });
    });
    companyInput.addEventListener('blur', () => setTimeout(() => { const d = $('#dsAutocomplete'); if (d) d.hidden = true; }, 150));
  }

  // Register button
  const addBtn = $('#btnDsAddAttendee');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const name = $('#dsAttendeeName')?.value.trim();
      if (!name) return;
      const title = $('#dsAttendeeTitle')?.value.trim() || '';
      const company = $('#dsAttendeeCompany')?.value.trim() || '';
      // Save to storage (인물 DB)
      const contact = addContact({ name, title, company });
      selectedAttendees.push(contact);
      renderSelectedBadges();
      renderContactPool();
      if ($('#dsAttendeeName')) $('#dsAttendeeName').value = '';
      if ($('#dsAttendeeTitle')) $('#dsAttendeeTitle').value = '';
      if ($('#dsAttendeeCompany')) $('#dsAttendeeCompany').value = '';
      showToast(isKorean() ? `${name} 등록됨` : `${name} added`, 'success');
    });
  }

  // Reference search
  const refSearch = $('#dsRefSearch');
  if (refSearch) {
    refSearch.addEventListener('input', () => renderRefList(refSearch.value));
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
  stepResults[2] = {
    attendees: selectedAttendees.map(a => ({ name: a.name, title: a.title, company: a.company })),
    references: selectedReferences.map(r => ({ id: r.id, title: r.title, analysis: r.analysis })),
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

  // Situation
  html += `<div class="ds-summary-section">
    <div class="ds-summary-label">${t('ds.summary_situation')}</div>
    <div class="ds-summary-value">${escapeHtml(s1.situation || s3.summary || '-')}</div>
  </div>`;

  // Attendees
  if (s2.attendees?.length) {
    html += `<div class="ds-summary-section">
      <div class="ds-summary-label">${t('ds.summary_attendees')}</div>
      <div class="ds-summary-value">${s2.attendees.map(a => escapeHtml(a.name + (a.title ? '/' + a.title : ''))).join(', ')}</div>
    </div>`;
  }

  // Focus Points
  if (s3.focusPoints?.length) {
    html += `<div class="ds-summary-section">
      <div class="ds-summary-label">${t('ds.summary_focus')}</div>
      <ul class="ds-summary-list">${s3.focusPoints.map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul>
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
  const config = {
    ...(stepResults[3] || {}),
    attendees: selectedAttendees,
    referenceAnalysis: selectedReferences.map(r => r.analysis || '').filter(Boolean).join('\n\n---\n\n') || null,
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
  stepHistories = { 1: [], 3: [] };
  stepResults = { 1: null, 2: null, 3: null };
  selectedAttendees = [];
  selectedReferences = [];
  attachedFiles = [];

  modal.hidden = false;

  // Clear chat areas
  [1, 3].forEach(s => {
    const msgs = $(`#dsMessages${s}`);
    if (msgs) msgs.innerHTML = '';
  });

  // Reset summary
  const summary = $('#dsSummary');
  if (summary) summary.innerHTML = '';

  goToStep(1);

  // Show step 1 greeting + chips
  addAiMessage(renderMarkdown(t('ds.step1_greeting')));
  const chips1 = $('#dsChips1');
  renderChips(chips1, SCENARIO_CHIPS, (text) => sendMessage(text));

  // Render step 2 form
  renderStep2Form();

  // Focus input
  const input = $('#dsInput1');
  if (input) {
    input.value = '';
    setTimeout(() => input.focus(), 100);
  }
}

// ===== Init =====
export function initDeepSetup() {
  // Send buttons for chat steps (1 and 3)
  [1, 3].forEach(step => {
    const sendBtn = $(`#btnDsSend${step}`);
    if (sendBtn) {
      sendBtn.addEventListener('click', () => {
        const input = $(`#dsInput${step}`);
        if (input?.value.trim()) sendMessage(input.value.trim());
      });
    }

    const input = $(`#dsInput${step}`);
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (input.value.trim()) sendMessage(input.value.trim());
        }
      });
    }
  });

  // Navigation
  const backBtn = $('#btnDsBack');
  if (backBtn) {
    backBtn.addEventListener('click', () => goToStep(currentStep - 1));
  }

  const nextBtn = $('#btnDsNext');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => goToStep(currentStep + 1));
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
