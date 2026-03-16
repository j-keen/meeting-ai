// prompt-builder.js - AI conversational prompt builder module

import { emit } from './event-bus.js';
import { getAiLanguage, t } from './i18n.js';
import { callGeminiStream, isProxyAvailable } from './gemini-api.js';
import { addCustomType, loadCustomTypes } from './storage.js';
import { showToast } from './ui.js';
import { renderMarkdown } from './chat.js';
import { escapeHtml } from './utils.js';

const $ = (sel) => document.querySelector(sel);

const MODEL = 'gemini-2.5-flash';

// ===== Internal State =====
let builderHistory = [];   // chat history for the builder conversation
let generatedConfig = null; // the parsed JSON config
let currentView = 'chat';  // 'chat' | 'preview'
let isStreaming = false;

// ===== Meta Prompts =====
const META_PROMPT_KO = `당신은 사용자의 "믿을 수 있는 동료"입니다. 실시간 음성-AI 분석 앱에서 옆자리에 앉아 대화를 함께 듣고 도와주는 역할입니다.

사용자가 지금 들어갈 대화에 대해 간단히 브리핑 받고, 최적의 지원 설정을 만들어주세요.

## 앱이 하는 일
1. **실시간 코파일럿 분석**: 대화를 듣고 AI가 주기적으로 "대화 코치" 역할을 합니다:
   - 🎯 추천 멘트 (지금 말할 문장 3~5개 — 가장 먼저 표시됨)
   - 💡 맥락과 근거 (왜 지금 이걸 해야 하는지)
   - 🔔 귓속말 (긴급 알림 1~3개 — 토스트로 표시됨)
   - 📋 논의 트래커 (확정 ✅ / 미정 ⏳ / 충돌 ⚠️)
   - 📌 아직 안 다룬 주제 (미팅 목적 대비)
   - 💬 메모 대조 (메모에 적었지만 아직 안 나온 것)
2. **AI 채팅**: 대화 중 궁금한 걸 AI에게 바로 물어볼 수 있습니다.
3. **메모**: 실시간 메모를 남기면 다음 분석에 반영됩니다.

## 대화 방식
1. 첫 질문: "오늘 어떤 대화에 들어가세요?"
2. 후속 질문 (1회만): 상황에 맞는 집중 포인트 3~5개를 제안하고, "빼고 싶은 거 있으면 말씀해주세요. 없으면 이대로 바로 세팅할게요!" 라고 물어보세요.
3. **2턴이면 끝.** 바로 설정을 만들어주세요. 길게 끌지 마세요.

## 생성할 JSON
사용자의 답변을 듣고, 반드시 아래 JSON을 코드블록(\`\`\`json ... \`\`\`)으로 출력하세요:
{
  "name": "프리셋 이름",
  "description": "한 줄 설명",
  "summary": "상황 요약 (사용자에게 보여줄 1줄)",
  "focusPoints": ["AI가 집중할 포인트 1", "AI가 집중할 포인트 2", "AI가 집중할 포인트 3"],
  "analysisPrompt": "분석 AI에게 줄 프롬프트",
  "chatSystemPrompt": "채팅 AI의 역할 정의",
  "chatPresets": ["추천 질문 1", "추천 질문 2", "추천 질문 3"],
  "memoHint": "메모 입력란에 표시할 가이드 텍스트",
  "context": "이 상황의 배경 설명"
}

## 프롬프트 작성 원칙
- summary: 사용자의 상황을 한 문장으로 요약 (예: "투자 유치 미팅 — 시리즈A 조건 협상")
- focusPoints: AI가 이 대화에서 특히 잡아줄 것 2~3개 (예: ["밸류에이션 조건 변경 감지", "투자자 우려사항 정리"])
- analysisPrompt: 코파일럿의 "대화 코치" 구조를 기본으로 하되, 이 상황에 맞게 변형. 상단: 🎯 추천 멘트 (지금 말할 문장 3~5개, 대화 톤 미러링), 중단: 💡 맥락과 근거 + 🔔 귓속말, 하단: 📋 논의 트래커 + 📌 빠진 주제 + 💬 메모. 추천 멘트의 관점을 상황에 맞게 커스텀.
- chatSystemPrompt: 해당 분야의 "유능한 동료" 톤
- chatPresets: 이 상황에서 사용자가 대화 중 물어볼 법한 것
- memoHint: 이 상황에서 메모해둘 만한 것

## 톤
- 격식 없이 편하게, 하지만 프로페셔널하게
- "~해드릴게요", "~잡아드릴게요" 스타일
- 불필요한 설명 없이 바로 본론`;

const META_PROMPT_EN = `You are the user's "trusted teammate." In this real-time voice-AI analysis app, you sit beside them, listen to conversations together, and help out.

Get a quick briefing on the conversation they're about to enter, and create the optimal support setup.

## What the app does
1. **Real-time Copilot Analysis**: Listens to conversations and AI acts as a "conversation coach":
   - 🎯 Suggested Lines (3-5 speakable sentences for right now — shown first)
   - 💡 Context & Reasoning (why each suggestion matters now)
   - 🔔 Whisper (1-3 urgent nudges — shown as toast alerts)
   - 📋 Discussion Tracker (Decided ✅ / Pending ⏳ / Conflict ⚠️)
   - 📌 Not Yet Covered (vs. meeting purpose)
   - 💬 Memo Check (memos not yet addressed)
2. **AI Chat**: Users can ask AI questions on the spot during conversations.
3. **Memo**: Real-time notes get reflected in the next analysis.

## Conversation flow
1. First question: "What conversation are you heading into today?"
2. Follow-up (just once): Suggest 3-5 focus points tailored to their situation, then ask "Let me know if you'd like to remove any — otherwise I'll set it up as is!"
3. **Two turns max.** Generate the setup right away. Don't drag it out.

## JSON to generate
After hearing their answers, output this JSON in a code block (\`\`\`json ... \`\`\`):
{
  "name": "Preset name",
  "description": "One-line description",
  "summary": "Situation summary (1 line shown to user)",
  "focusPoints": ["Focus point 1", "Focus point 2", "Focus point 3"],
  "analysisPrompt": "Prompt for the analysis AI",
  "chatSystemPrompt": "Role definition for the chat AI",
  "chatPresets": ["Suggested question 1", "Suggested question 2", "Suggested question 3"],
  "memoHint": "Guide text for the memo input field",
  "context": "Background description of this scenario"
}

## Prompt writing principles
- summary: One-sentence summary of the user's situation (e.g., "Series A negotiation — term sheet review meeting")
- focusPoints: 2-3 things AI should especially watch for (e.g., ["Detect valuation term changes", "Track investor concerns"])
- analysisPrompt: Use the copilot's "conversation coach" structure as base, customized for this situation. Top: 🎯 Suggested Lines (3-5 speakable sentences, tone-mirrored), Middle: 💡 Context & Reasoning + 🔔 Whisper, Bottom: 📋 Discussion Tracker + 📌 Not Covered + 💬 Memo Check. Tailor the suggested lines' perspective to the scenario.
- chatSystemPrompt: "Capable teammate" tone in the relevant field
- chatPresets: Things the user would likely ask mid-conversation
- memoHint: What's worth noting in this situation

## Tone
- Casual but professional
- "I'll watch for that", "I've got you covered" style
- Skip unnecessary explanations, get straight to the point`;

// ===== Scenario Chips =====
const SCENARIO_CHIPS = [
  { ko: '업무 미팅', en: 'Work Meeting' },
  { ko: '상담/컨설팅', en: 'Consultation' },
  { ko: '발표/면접 연습', en: 'Presentation/Interview' },
  { ko: '브레인스토밍', en: 'Brainstorming' },
  { ko: '배움/강의', en: 'Learning/Lecture' },
];

// ===== JSON Extraction =====
function extractJSON(text) {
  const match = text.match(/```json\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim());
  } catch { return null; }
}

// ===== System Prompt =====
function getMetaPrompt() {
  const lang = getAiLanguage();
  return lang === 'ko' ? META_PROMPT_KO : META_PROMPT_EN;
}

function isKorean() {
  return getAiLanguage() === 'ko';
}

// ===== Render Helpers =====
function addMessage(role, html) {
  const container = $('#pbMessages');
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
  const container = $('#pbMessages');
  if (!container) return null;
  const el = document.createElement('div');
  el.className = 'pb-message pb-message-model pb-typing';
  el.innerHTML = '<div class="pb-message-content"><span class="typing-dots"><span></span><span></span><span></span></span></div>';
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  return el;
}

function renderScenarioChips() {
  const container = $('#pbScenarioChips');
  if (!container) return;
  container.innerHTML = '';
  const ko = isKorean();
  SCENARIO_CHIPS.forEach(chip => {
    const btn = document.createElement('button');
    btn.className = 'pb-chip';
    btn.textContent = ko ? chip.ko : chip.en;
    btn.addEventListener('click', () => {
      container.style.display = 'none';
      sendUserMessage(btn.textContent);
    });
    container.appendChild(btn);
  });
  container.style.display = '';
}

// ===== View Switching =====
function switchView(view) {
  currentView = view;
  const chatView = $('#pbChatView');
  const previewView = $('#pbPreviewView');
  if (chatView) chatView.hidden = view !== 'chat';
  if (previewView) previewView.hidden = view !== 'preview';
}

// ===== Preview Rendering =====
function renderPreview() {
  if (!generatedConfig) return;
  const container = $('#pbPreview');
  if (!container) return;

  const ko = isKorean();

  // === Simplified view: summary + focus points ===
  const summary = generatedConfig.summary || generatedConfig.description || '';
  const focusPoints = generatedConfig.focusPoints || [];

  let html = `
    <div class="pb-preview-summary">
      <div class="pb-preview-summary-label">${ko ? '상황' : 'Situation'}</div>
      <div class="pb-preview-summary-text">${escapeHtml(summary)}</div>
    </div>
    <div class="pb-preview-focus">
      <div class="pb-preview-focus-label">${ko ? 'AI가 집중할 포인트' : 'AI Focus Points'}</div>
      <ul class="pb-preview-focus-list">
        ${focusPoints.map(p => `<li>${escapeHtml(p)}</li>`).join('')}
      </ul>
    </div>`;

  // === Advanced settings toggle ===
  const advLabels = {
    name: ko ? '프리셋 이름' : 'Preset Name',
    description: ko ? '설명' : 'Description',
    analysisPrompt: ko ? '분석 프롬프트' : 'Analysis Prompt',
    chatSystemPrompt: ko ? '채팅 시스템 프롬프트' : 'Chat System Prompt',
    chatPresets: ko ? '추천 질문' : 'Suggested Questions',
    memoHint: ko ? '메모 가이드' : 'Memo Guide',
    context: ko ? '상황 배경' : 'Context',
  };

  html += `
    <details class="pb-advanced-toggle">
      <summary class="pb-advanced-summary">${ko ? '고급 설정' : 'Advanced Settings'}</summary>
      <div class="pb-advanced-content">`;

  // Input fields
  ['name', 'description', 'memoHint'].forEach(key => {
    html += `
        <div class="pb-preview-card">
          <label class="pb-preview-label">${advLabels[key]}</label>
          <input type="text" class="pb-preview-input" data-field="${key}" value="${escapeHtml(generatedConfig[key] || '')}">
        </div>`;
  });

  // Textarea fields
  ['analysisPrompt', 'chatSystemPrompt', 'context'].forEach(key => {
    html += `
        <div class="pb-preview-card">
          <label class="pb-preview-label">${advLabels[key]}</label>
          <textarea class="pb-preview-textarea" data-field="${key}" rows="4">${escapeHtml(generatedConfig[key] || '')}</textarea>
        </div>`;
  });

  // Chat presets (editable list)
  const presets = generatedConfig.chatPresets || [];
  html += `
        <div class="pb-preview-card">
          <label class="pb-preview-label">${advLabels.chatPresets}</label>
          <div class="pb-presets-list" id="pbPresetsList">
            ${presets.map((p, i) => `
              <div class="pb-preset-item">
                <input type="text" class="pb-preview-input pb-preset-input" data-preset-idx="${i}" value="${escapeHtml(p)}">
                <button class="pb-preset-remove" data-preset-idx="${i}" title="${ko ? '삭제' : 'Remove'}">&times;</button>
              </div>
            `).join('')}
          </div>
          <button class="pb-preset-add" id="btnPbAddPreset">+ ${ko ? '질문 추가' : 'Add question'}</button>
        </div>`;

  html += `
      </div>
    </details>`;

  container.innerHTML = html;

  // Bind input change handlers
  container.querySelectorAll('.pb-preview-input[data-field], .pb-preview-textarea[data-field]').forEach(el => {
    el.addEventListener('input', () => {
      generatedConfig[el.dataset.field] = el.value;
    });
  });

  // Bind preset input handlers
  container.querySelectorAll('.pb-preset-input').forEach(el => {
    el.addEventListener('input', () => {
      const idx = parseInt(el.dataset.presetIdx);
      generatedConfig.chatPresets[idx] = el.value;
    });
  });

  // Bind preset remove buttons
  container.querySelectorAll('.pb-preset-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.presetIdx);
      generatedConfig.chatPresets.splice(idx, 1);
      renderPreview();
    });
  });

  // Add preset button
  const addBtn = $('#btnPbAddPreset');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      if (!generatedConfig.chatPresets) generatedConfig.chatPresets = [];
      generatedConfig.chatPresets.push('');
      renderPreview();
      const inputs = container.querySelectorAll('.pb-preset-input');
      if (inputs.length) inputs[inputs.length - 1].focus();
    });
  }
}

// ===== AI Communication =====
function buildContents(userText) {
  const contents = [
    { role: 'user', parts: [{ text: getMetaPrompt() }] },
    { role: 'model', parts: [{ text: isKorean()
      ? '오늘 어떤 대화에 들어가세요?\n제가 옆에서 놓치는 거 잡아드릴게요 💪\n\n상황만 간단히 알려주세요!'
      : 'What conversation are you heading into today?\nI\'ll be right beside you, catching what you might miss 💪\n\nJust give me a quick rundown!' }] },
  ];

  builderHistory.forEach(msg => {
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

async function sendUserMessage(text) {
  if (!text.trim() || isStreaming) return;

  addUserMessage(text);
  builderHistory.push({ role: 'user', text });

  // Clear input
  const input = $('#pbInput');
  if (input) input.value = '';

  // Hide scenario chips
  const chips = $('#pbScenarioChips');
  if (chips) chips.style.display = 'none';

  if (!isProxyAvailable()) {
    addAiMessage(isKorean()
      ? '<p>API 프록시를 사용할 수 없습니다. 설정을 확인해주세요.</p>'
      : '<p>API proxy is not available. Please check your settings.</p>');
    return;
  }

  isStreaming = true;
  const sendBtn = $('#btnPbSend');
  if (sendBtn) sendBtn.disabled = true;

  const typingEl = showTypingIndicator();

  try {
    const contents = buildContents(text);
    const body = {
      contents,
      generationConfig: { temperature: 0.7 },
    };

    // Create streaming message element
    const container = $('#pbMessages');
    const streamEl = document.createElement('div');
    streamEl.className = 'pb-message pb-message-model';
    const streamContent = document.createElement('div');
    streamContent.className = 'pb-message-content';
    streamContent.textContent = '';
    streamEl.appendChild(streamContent);

    if (typingEl) typingEl.remove();
    container.appendChild(streamEl);

    const { text: fullText } = await callGeminiStream(MODEL, body, (chunk, fullSoFar) => {
      streamContent.innerHTML = renderMarkdown(fullSoFar);
      container.scrollTop = container.scrollHeight;
    });

    // Final render
    streamContent.innerHTML = renderMarkdown(fullText);
    container.scrollTop = container.scrollHeight;

    builderHistory.push({ role: 'model', text: fullText });

    // Try to extract JSON config
    const config = extractJSON(fullText);
    if (config) {
      generatedConfig = config;
      renderPreview();
      switchView('preview');
    }
  } catch (err) {
    if (typingEl && typingEl.parentNode) typingEl.remove();
    if (err.name !== 'AbortError') {
      addAiMessage(`<p style="color:var(--danger)">${isKorean() ? '오류가 발생했습니다: ' : 'An error occurred: '}${escapeHtml(err.message)}</p>`);
    }
  } finally {
    isStreaming = false;
    if (sendBtn) sendBtn.disabled = false;
  }
}

// ===== Modal Control =====
function closeModal() {
  const modal = $('#promptBuilderModal');
  if (modal) modal.hidden = true;
  isStreaming = false;
}

// ===== Action Handlers =====
function handleSavePreset() {
  if (!generatedConfig) return;

  const config = {
    name: generatedConfig.name || '',
    description: generatedConfig.description || '',
    prompt: generatedConfig.analysisPrompt || '',
    chatSystemPrompt: generatedConfig.chatSystemPrompt || '',
    chatPresets: generatedConfig.chatPresets || [],
    memoHint: generatedConfig.memoHint || '',
    context: generatedConfig.context || '',
  };
  addCustomType(config);
  emit('customTypes:change');
  showToast(t('pb.saved'), 'success');
}

function handleStart() {
  if (!generatedConfig) return;
  emit('promptBuilder:complete', { ...generatedConfig });
  closeModal();
}

// ===== Exported Functions =====
export function openPromptBuilder() {
  const modal = $('#promptBuilderModal');
  if (!modal) return;

  // Reset state
  builderHistory = [];
  generatedConfig = null;
  currentView = 'chat';

  // Show modal
  modal.hidden = false;

  // Clear messages
  const messages = $('#pbMessages');
  if (messages) messages.innerHTML = '';

  // Switch to chat view
  switchView('chat');

  // Show initial AI greeting
  const ko = isKorean();
  addAiMessage(renderMarkdown(ko
    ? '오늘 어떤 대화에 들어가세요?\n제가 옆에서 놓치는 거 잡아드릴게요 💪\n\n상황만 간단히 알려주세요!'
    : 'What conversation are you heading into today?\nI\'ll be right beside you, catching what you might miss 💪\n\nJust give me a quick rundown!'));

  // Render scenario chips
  renderScenarioChips();

  // Focus input
  const input = $('#pbInput');
  if (input) {
    input.value = '';
    setTimeout(() => input.focus(), 100);
  }
}

export function initPromptBuilder() {
  // Send button
  const sendBtn = $('#btnPbSend');
  if (sendBtn) {
    sendBtn.addEventListener('click', () => {
      const input = $('#pbInput');
      if (input && input.value.trim()) {
        sendUserMessage(input.value.trim());
      }
    });
  }

  // Input enter key
  const input = $('#pbInput');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (input.value.trim()) {
          sendUserMessage(input.value.trim());
        }
      }
    });
  }

  // Back to chat button
  const backBtn = $('#btnPbBack');
  if (backBtn) {
    backBtn.addEventListener('click', () => switchView('chat'));
  }

  // Save preset button
  const saveBtn = $('#btnPbSavePreset');
  if (saveBtn) {
    saveBtn.addEventListener('click', handleSavePreset);
  }

  // Start button
  const startBtn = $('#btnPbStart');
  if (startBtn) {
    startBtn.addEventListener('click', handleStart);
  }

  // Close modal - X button
  const modal = $('#promptBuilderModal');
  if (modal) {
    // Click overlay to close
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    // Close button (X)
    const closeBtn = modal.querySelector('.modal-close, .pb-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeModal);
    }
  }

  // ESC key to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = $('#promptBuilderModal');
      if (modal && !modal.hidden) {
        closeModal();
      }
    }
  });
}
