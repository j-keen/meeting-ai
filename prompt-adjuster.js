// prompt-adjuster.js - Conversational prompt adjustment module

import { state, emit } from './event-bus.js';
import { getAiLanguage, t } from './i18n.js';
import { callGeminiStream, isProxyAvailable } from './gemini-api.js';
import { getPromptForType } from './ai.js';
import { showToast } from './ui.js';
import { renderMarkdown } from './chat.js';
import { escapeHtml } from './utils.js';
import { saveSettings } from './storage.js';
import { createPresetSaveForm } from './preset-save.js';

const $ = (sel) => document.querySelector(sel);

const MODEL = 'gemini-2.5-flash';

// ===== Internal State =====
let chatHistory = [];
let isStreaming = false;
let lastExtractedPrompt = null;

// ===== Meta Prompts =====
const META_PROMPT_KO = `당신은 분석 스타일 변경 도우미입니다.

## 역할
사용자가 현재 사용 중인 회의 분석 프롬프트를 보여주면, 사용자가 원하는 스타일로 수정합니다.

## 규칙
1. 사용자의 요청을 듣고 프롬프트를 수정하세요
2. 수정된 전체 프롬프트를 \`\`\`prompt ... \`\`\` 코드블록으로 출력하세요
3. 변경한 부분을 간단히 설명하세요 (1-2문장)
4. 프롬프트의 전체 구조는 유지하되, 요청된 부분만 변경하세요
5. 최대 2턴 내에 완료하세요. 질문하지 말고 바로 수정하세요.

## 톤
- 친근하고 자연스럽게
- "~해봤어요!", "~바꿔드렸어요!" 스타일`;

const META_PROMPT_EN = `You are an analysis style change assistant.

## Role
The user shows their current meeting analysis prompt, and you modify it to match their preferred style.

## Rules
1. Listen to the user's request and modify the prompt
2. Output the full modified prompt in a \`\`\`prompt ... \`\`\` code block
3. Briefly explain what you changed (1-2 sentences)
4. Preserve the overall structure, only change what's requested
5. Complete within 2 turns max. Don't ask questions, just modify.

## Tone
- Friendly and conversational
- "Done!", "Here you go!" style`;

// ===== Suggestion Chips =====
const SUGGESTION_CHIPS = [
  { ko: '액션 아이템 강화', en: 'More action items' },
  { ko: '감정 분석 추가', en: 'Add sentiment analysis' },
  { ko: '더 간결하게', en: 'More concise' },
  { ko: '핵심만 요약', en: 'Key points only' },
  { ko: '의사결정 추적', en: 'Track decisions' },
];

// ===== Helpers =====
function isKorean() {
  return getAiLanguage() === 'ko';
}

function getCurrentPrompt() {
  return state.settings.customPrompt || getPromptForType(state.settings.analysisPreset || 'copilot');
}

function extractPrompt(text) {
  const match = text.match(/```prompt\s*([\s\S]*?)```/);
  return match ? match[1].trim() : null;
}

// ===== Render Helpers =====
function addMessage(role, html) {
  const container = $('#paMessages');
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
  const container = $('#paMessages');
  if (!container) return null;
  const el = document.createElement('div');
  el.className = 'pb-message pb-message-model pb-typing';
  el.innerHTML = '<div class="pb-message-content"><span class="typing-dots"><span></span><span></span><span></span></span></div>';
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  return el;
}

function renderChips() {
  const container = $('#paChips');
  if (!container) return;
  container.innerHTML = '';
  const ko = isKorean();
  SUGGESTION_CHIPS.forEach(chip => {
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

function renderActionButtons(promptText) {
  const container = $('#paMessages');
  if (!container) return;

  const ko = isKorean();
  const actionsEl = document.createElement('div');
  actionsEl.className = 'pa-actions';
  actionsEl.innerHTML = `
    <button class="btn btn-primary btn-sm pa-apply-btn" data-action="apply">${ko ? '✓ 적용하고 닫기' : '✓ Apply & Close'}</button>
    <button class="btn btn-outline btn-sm pa-apply-btn" data-action="reanalyze">${ko ? '✓ 적용 + 재분석' : '✓ Apply & Re-analyze'}</button>
    <button class="btn btn-outline btn-sm pa-apply-btn" data-action="savePreset">💾 ${ko ? '프리셋 저장' : 'Save as Preset'}</button>
  `;

  actionsEl.querySelector('[data-action="apply"]').addEventListener('click', () => {
    applyPrompt(promptText, false);
  });
  actionsEl.querySelector('[data-action="reanalyze"]').addEventListener('click', () => {
    applyPrompt(promptText, true);
  });
  actionsEl.querySelector('[data-action="savePreset"]').addEventListener('click', () => {
    // Create form container below actions
    let formContainer = container.querySelector('.pa-preset-form-container');
    if (!formContainer) {
      formContainer = document.createElement('div');
      formContainer.className = 'pa-preset-form-container';
      container.appendChild(formContainer);
    }
    createPresetSaveForm(formContainer, promptText, {
      onSaved(newPreset) {
        applyPrompt(promptText, false);
        state.settings.meetingPreset = newPreset.id;
        saveSettings(state.settings);
      },
      onCancel() {
        formContainer.remove();
      },
    });
    formContainer.scrollIntoView({ behavior: 'smooth' });
  });

  container.appendChild(actionsEl);
  container.scrollTop = container.scrollHeight;
}

function applyPrompt(promptText, reanalyze) {
  state.settings.customPrompt = promptText;
  emit('customPrompt:change');
  saveSettings(state.settings);
  showToast(t('pa.saved'), 'success');
  closeModal();

  if (reanalyze) {
    showToast(t('pa.reanalyzing'), 'info');
    emit('promptAdjuster:reanalyze');
  }
}

// ===== AI Communication =====
function buildContents(userText) {
  const metaPrompt = isKorean() ? META_PROMPT_KO : META_PROMPT_EN;
  const currentPrompt = getCurrentPrompt();

  const contents = [
    { role: 'user', parts: [{ text: `${metaPrompt}\n\n---\n\n현재 프롬프트 / Current prompt:\n\`\`\`\n${currentPrompt}\n\`\`\`` }] },
    { role: 'model', parts: [{ text: isKorean()
      ? '네, 어떤 부분이 마음에 안 드시나요? 자유롭게 말씀해주세요!'
      : 'Sure! What would you like to change? Just tell me!' }] },
  ];

  chatHistory.forEach(msg => {
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
  chatHistory.push({ role: 'user', text });

  const input = $('#paInput');
  if (input) input.value = '';

  const chips = $('#paChips');
  if (chips) chips.style.display = 'none';

  // Remove previous action buttons
  document.querySelectorAll('.pa-actions').forEach(el => el.remove());

  if (!isProxyAvailable()) {
    addAiMessage(isKorean()
      ? '<p>API 프록시를 사용할 수 없습니다. 설정을 확인해주세요.</p>'
      : '<p>API proxy is not available. Please check your settings.</p>');
    return;
  }

  isStreaming = true;
  const sendBtn = $('#paSendBtn');
  if (sendBtn) sendBtn.disabled = true;

  const typingEl = showTypingIndicator();

  try {
    const contents = buildContents(text);
    const body = {
      contents,
      generationConfig: { temperature: 0.7 },
    };

    const container = $('#paMessages');
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

    streamContent.innerHTML = renderMarkdown(fullText);
    container.scrollTop = container.scrollHeight;

    chatHistory.push({ role: 'model', text: fullText });

    // Try to extract prompt
    const extracted = extractPrompt(fullText);
    if (extracted) {
      lastExtractedPrompt = extracted;
      renderActionButtons(extracted);
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
  const modal = $('#promptAdjusterModal');
  if (modal) modal.hidden = true;
  isStreaming = false;
}

export function openPromptAdjuster() {
  const modal = $('#promptAdjusterModal');
  if (!modal) return;

  // Reset state
  chatHistory = [];
  lastExtractedPrompt = null;

  modal.hidden = false;

  // Clear messages
  const messages = $('#paMessages');
  if (messages) messages.innerHTML = '';

  // Show greeting
  addAiMessage(renderMarkdown(t('pa.greeting')));

  // Render chips
  renderChips();

  // Focus input
  const input = $('#paInput');
  if (input) setTimeout(() => input.focus(), 100);
}

// ===== Init =====
export function initPromptAdjuster() {
  // Close button
  $('#paCloseBtn')?.addEventListener('click', closeModal);

  // Overlay click
  $('#promptAdjusterModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'promptAdjusterModal') closeModal();
  });

  // ESC key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#promptAdjusterModal')?.hidden) {
      closeModal();
    }
  });

  // Send button
  $('#paSendBtn')?.addEventListener('click', () => {
    const input = $('#paInput');
    if (input) sendUserMessage(input.value);
  });

  // Enter to send
  $('#paInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendUserMessage(e.target.value);
    }
  });

}
