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
const META_PROMPT_KO = `당신은 실시간 음성-AI 분석 앱의 "셋업 어시스턴트"입니다.

사용자가 어떤 상황에서 이 앱을 사용할지 대화를 통해 파악하고,
그 상황에 최적화된 프롬프트 세트를 생성하세요.

## 이 앱이 제공하는 기능
1. **실시간 분석**: 음성이 텍스트로 변환되면, AI가 지정된 프롬프트에 따라 주기적으로 분석합니다.
2. **AI 채팅**: 사용자가 진행 중인 대화에 대해 AI에게 질문할 수 있습니다.
3. **메모**: 사용자가 실시간으로 메모를 남기면 다음 분석에 반영됩니다.

## 당신이 생성해야 하는 것
대화가 충분히 진행되면, 반드시 아래 JSON을 코드블록(\`\`\`json ... \`\`\`)으로 출력하세요:
{
  "name": "프리셋 이름",
  "description": "한 줄 설명",
  "analysisPrompt": "분석 AI에게 줄 프롬프트",
  "chatSystemPrompt": "채팅 AI의 역할 정의",
  "chatPresets": ["추천 질문 1", "추천 질문 2", "추천 질문 3"],
  "memoHint": "메모 입력란에 표시할 가이드 텍스트",
  "context": "이 상황의 배경 설명"
}

## 대화 가이드
1. 먼저 상황을 파악하세요: "어떤 상황에서 사용하실 건가요?"
2. 핵심을 좁혀가세요: 분야, 목표, AI가 집중할 것
3. 2~3번의 대화면 충분합니다. 너무 많이 물어보지 마세요.
4. 프롬프트를 생성한 후, 위 JSON 형식으로 코드블록 안에 출력하세요.

## 프롬프트 작성 원칙
- 분석 프롬프트는 "격차 해소"에 집중: 전문 용어 해설, 놓친 포인트 감지, 구조화
- 채팅 역할은 해당 분야의 "유능한 통역사"
- 추천 질문은 "이 상황에서 사용자가 물어볼 법한 것"
- 메모 가이드는 "이 상황에서 메모해야 할 것"`;

const META_PROMPT_EN = `You are a "Setup Assistant" for a real-time voice-AI analysis app.

Through conversation, figure out what situation the user will use this app in,
and generate an optimized prompt set for that situation.

## What this app provides
1. **Real-time Analysis**: When speech is converted to text, AI periodically analyzes it according to a specified prompt.
2. **AI Chat**: Users can ask AI questions about the ongoing conversation.
3. **Memo**: Users can leave real-time notes that are reflected in the next analysis.

## What you need to generate
Once the conversation has progressed enough, output the following JSON in a code block (\`\`\`json ... \`\`\`):
{
  "name": "Preset name",
  "description": "One-line description",
  "analysisPrompt": "Prompt for the analysis AI",
  "chatSystemPrompt": "Role definition for the chat AI",
  "chatPresets": ["Suggested question 1", "Suggested question 2", "Suggested question 3"],
  "memoHint": "Guide text for the memo input field",
  "context": "Background description of this scenario"
}

## Conversation Guide
1. First understand the situation: "What scenario will you be using this for?"
2. Narrow down the essentials: field, goals, what AI should focus on
3. 2-3 exchanges should be enough. Don't ask too many questions.
4. After generating the prompts, output them in the JSON format above inside a code block.

## Prompt Writing Principles
- Analysis prompt focuses on "bridging gaps": explaining jargon, detecting missed points, structuring
- Chat role is a "capable interpreter" in the relevant field
- Suggested questions are "things the user would likely ask in this situation"
- Memo guide is "what should be noted in this situation"`;

// ===== Scenario Chips =====
const SCENARIO_CHIPS = [
  { ko: '의료 상담', en: 'Medical Consultation' },
  { ko: '법률 상담', en: 'Legal Consultation' },
  { ko: '코드 리뷰', en: 'Code Review' },
  { ko: '강의 수강', en: 'Lecture' },
  { ko: '면접', en: 'Interview' },
  { ko: '브레인스토밍', en: 'Brainstorming' },
  { ko: '고객 상담', en: 'Customer Meeting' },
  { ko: '보이스 메모', en: 'Voice Memo' },
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
  const labels = {
    name: ko ? '프리셋 이름' : 'Preset Name',
    description: ko ? '설명' : 'Description',
    analysisPrompt: ko ? '분석 프롬프트' : 'Analysis Prompt',
    chatSystemPrompt: ko ? '채팅 시스템 프롬프트' : 'Chat System Prompt',
    chatPresets: ko ? '추천 질문' : 'Suggested Questions',
    memoHint: ko ? '메모 가이드' : 'Memo Guide',
    context: ko ? '상황 배경' : 'Context',
  };

  let html = '';

  // Input fields
  ['name', 'description', 'memoHint'].forEach(key => {
    html += `
      <div class="pb-preview-card">
        <label class="pb-preview-label">${labels[key]}</label>
        <input type="text" class="pb-preview-input" data-field="${key}" value="${escapeHtml(generatedConfig[key] || '')}">
      </div>`;
  });

  // Textarea fields
  ['analysisPrompt', 'chatSystemPrompt', 'context'].forEach(key => {
    html += `
      <div class="pb-preview-card">
        <label class="pb-preview-label">${labels[key]}</label>
        <textarea class="pb-preview-textarea" data-field="${key}" rows="4">${escapeHtml(generatedConfig[key] || '')}</textarea>
      </div>`;
  });

  // Chat presets (editable list)
  const presets = generatedConfig.chatPresets || [];
  html += `
    <div class="pb-preview-card">
      <label class="pb-preview-label">${labels.chatPresets}</label>
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
      // Focus the newly added input
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
      ? '네, 셋업 어시스턴트로서 도와드리겠습니다. 어떤 상황에서 이 앱을 사용하실 건가요?'
      : 'Sure, I\'ll help you as a setup assistant. What scenario will you be using this app for?' }] },
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
    ? '안녕하세요! 실시간 음성-AI 분석 앱의 셋업 어시스턴트입니다.\n\n어떤 상황에서 이 앱을 사용하실 건가요? 아래 예시를 선택하거나 직접 설명해주세요.'
    : 'Hello! I\'m the setup assistant for the real-time voice-AI analysis app.\n\nWhat scenario will you be using this app for? Select an example below or describe your situation.'));

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
