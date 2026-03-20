// prompt-builder.js - AI conversational prompt builder module

import { emit } from './event-bus.js';
import { getAiLanguage, t } from './i18n.js';
import { callGeminiStream, isProxyAvailable } from './gemini-api.js';
import { addCustomType, loadCustomTypes } from './storage.js';
import { showToast } from './ui.js';
import { renderMarkdown } from './chat.js';
import { escapeHtml } from './utils.js';
import { getRoleIntro, getAppFeatureDescription, getJsonSchema, getPromptWritingPrinciples, getToneGuidance } from './prompt-templates.js';

const $ = (sel) => document.querySelector(sel);

const MODEL = 'gemini-2.5-flash';

// ===== Internal State =====
let builderHistory = [];   // chat history for the builder conversation
let generatedConfig = null; // the parsed JSON config
let currentView = 'chat';  // 'chat' | 'preview'
let isStreaming = false;

// ===== Conversation Flow (prompt-builder specific) =====
function getConversationFlow(lang) {
  return lang === 'ko'
    ? `## 대화 방식
1. 첫 질문: "오늘 어떤 대화에 들어가세요?"
2. 후속 질문 (1회만): 상황에 맞는 집중 포인트 3~5개를 제안하고, "빼고 싶은 거 있으면 말씀해주세요. 없으면 이대로 바로 세팅할게요!" 라고 물어보세요.
3. **2턴이면 끝.** 바로 설정을 만들어주세요. 길게 끌지 마세요.`
    : `## Conversation flow
1. First question: "What conversation are you heading into today?"
2. Follow-up (just once): Suggest 3-5 focus points tailored to their situation, then ask "Let me know if you'd like to remove any — otherwise I'll set it up as is!"
3. **Two turns max.** Generate the setup right away. Don't drag it out.`;
}

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
  const briefing = lang === 'ko'
    ? '사용자가 지금 들어갈 대화에 대해 간단히 브리핑 받고, 최적의 지원 설정을 만들어주세요.'
    : 'Get a quick briefing on the conversation they\'re about to enter, and create the optimal support setup.';
  return [
    getRoleIntro(lang),
    '',
    briefing,
    '',
    getAppFeatureDescription(lang),
    '',
    getConversationFlow(lang),
    '',
    getJsonSchema(lang),
    '',
    getPromptWritingPrinciples(lang),
    '',
    getToneGuidance(lang),
  ].join('\n');
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
      <summary class="pb-advanced-summary">${ko ? '프리셋 상세' : 'Preset Details'}</summary>
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

  // Auto-scroll when advanced settings is toggled open
  const detailsEl = container.querySelector('.pb-advanced-toggle');
  if (detailsEl) {
    detailsEl.addEventListener('toggle', () => {
      if (detailsEl.open) {
        requestAnimationFrame(() => {
          detailsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
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
