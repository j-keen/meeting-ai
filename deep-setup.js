// deep-setup.js - 4-step AI-guided "경청 준비" (Listen Prep) wizard

import { emit } from './event-bus.js';
import { getAiLanguage, t } from './i18n.js';
import { callGeminiStream, isProxyAvailable } from './gemini-api.js';
import { addCustomType, loadContacts, listMeetings, getMeeting } from './storage.js';
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
let selectedReference = null;
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

// ===== Step 2: Form-only (contacts + reference + files) =====
function renderStep2Form() {
  const formArea = $('#dsFormArea2');
  if (!formArea) return;

  const ko = isKorean();
  const contacts = loadContacts();

  // Set description text
  const desc = $('#dsStep2Desc');
  if (desc) desc.textContent = t('ds.step2_greeting');

  let html = '';

  // Contacts picker
  if (contacts.length) {
    html += `<div class="ds-form-section">
      <label class="ds-form-label">${ko ? '참석자' : 'Attendees'}</label>
      <div class="ds-contact-chips" id="dsContactChips">`;
    contacts.forEach(c => {
      const selected = selectedAttendees.some(a => a.id === c.id);
      html += `<button class="pb-chip${selected ? ' ds-chip-selected' : ''}" data-contact-id="${c.id}">${escapeHtml(c.name)}${c.title ? '/' + escapeHtml(c.title) : ''}</button>`;
    });
    html += `</div></div>`;
  }

  // Reference session picker
  const meetings = listMeetings();
  if (meetings.length) {
    html += `<div class="ds-form-section">
      <label class="ds-form-label">${ko ? '참고 세션' : 'Reference Session'}</label>
      <select class="settings-select ds-ref-select" id="dsRefSelect">
        <option value="">${ko ? '선택 안함' : 'None'}</option>`;
    meetings.slice(0, 20).forEach(m => {
      html += `<option value="${m.id}">${escapeHtml(m.title || m.id)}</option>`;
    });
    html += `</select></div>`;
  }

  // File attachments
  html += `<div class="ds-form-section">
    <label class="ds-form-label">${ko ? '파일 첨부' : 'Files'}</label>
    <div class="ds-file-area">
      <button class="btn btn-sm btn-outline" id="btnDsFileUpload">📁 ${ko ? '파일 선택' : 'Browse'}</button>
      <input type="file" id="dsFileInput" multiple accept=".txt,.md,.csv,.json,.js,.ts,.py,.html,.css,.xml,.log,.yaml,.yml" hidden>
      <div class="ds-file-chips" id="dsFileChips"></div>
    </div>
  </div>`;

  // Empty state message
  if (!contacts.length && !meetings.length) {
    html += `<p class="ds-form-empty">${ko ? '등록된 인물이나 세션이 없습니다. 파일만 첨부하거나 건너뛰세요.' : 'No contacts or sessions yet. Attach files or skip.'}</p>`;
  }

  formArea.innerHTML = html;

  // Bind contact chips
  formArea.querySelectorAll('#dsContactChips .pb-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.contactId;
      const contact = contacts.find(c => c.id === id);
      if (!contact) return;
      const idx = selectedAttendees.findIndex(a => a.id === id);
      if (idx >= 0) {
        selectedAttendees.splice(idx, 1);
        btn.classList.remove('ds-chip-selected');
      } else {
        selectedAttendees.push(contact);
        btn.classList.add('ds-chip-selected');
      }
    });
  });

  // Bind reference select
  const refSelect = $('#dsRefSelect');
  if (refSelect) {
    refSelect.addEventListener('change', () => {
      selectedReference = refSelect.value ? getMeeting(refSelect.value) : null;
    });
  }

  // Bind file upload
  const fileBtn = $('#btnDsFileUpload');
  const fileInput = $('#dsFileInput');
  if (fileBtn && fileInput) {
    fileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      handleFileAttach(fileInput.files);
      fileInput.value = '';
    });
  }
}

async function handleFileAttach(files) {
  for (const file of files) {
    if (file.size > 500 * 1024) continue;
    try {
      const content = await file.text();
      attachedFiles.push({ name: file.name, content: content.slice(0, 10000) });
      renderFileChips();
    } catch { /* skip unreadable */ }
  }
}

function renderFileChips() {
  const container = $('#dsFileChips');
  if (!container) return;
  container.innerHTML = attachedFiles.map((f, i) =>
    `<span class="ds-file-chip">${escapeHtml(f.name)} <button class="ds-file-remove" data-idx="${i}">&times;</button></span>`
  ).join('');
  container.querySelectorAll('.ds-file-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      attachedFiles.splice(parseInt(btn.dataset.idx), 1);
      renderFileChips();
    });
  });
}

function collectStep2Results() {
  stepResults[2] = {
    attendees: selectedAttendees.map(a => ({ name: a.name, title: a.title, company: a.company })),
    reference: selectedReference ? { title: selectedReference.title, analysis: selectedReference.analysis } : null,
    files: attachedFiles.map(f => ({ name: f.name })),
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
    referenceAnalysis: selectedReference?.analysis || null,
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
  selectedReference = null;
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
