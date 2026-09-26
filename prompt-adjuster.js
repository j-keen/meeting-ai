// prompt-adjuster.js - Conversational prompt adjustment module

import { state, emit } from './event-bus.js';
import { modelFor } from './models.js';
import { getAiLanguage, t } from './i18n.js';
import { callGeminiGuarded, UsageLimitError, isAiAvailable } from './gemini-api.js';
import { getPromptForType } from './ai.js';
import { showToast } from './ui.js';
import { renderMarkdown } from './chat.js';
import { escapeHtml } from './utils.js';
import { saveSettings } from './storage.js';
import { createPresetSaveForm } from './preset-save.js';
import { pushStyleHistory } from './style-history.js';

const $ = (sel) => document.querySelector(sel);

const MODEL = modelFor('prompt_adjuster');

// ===== Internal State =====
let chatHistory = [];
let isStreaming = false;
let lastExtractedPrompt = null;

// ===== Meta Prompts =====
// The analysis output is parsed by the app: ai.js extractHeadline reads the first bullet under
// the `## 🎯` heading, extractWhispers strips the `## 🔔 귓속말` / `## 🔔 Whisper` section into
// toasts. The editor must keep those (when the prompt has them) or the live panel breaks.
const META_PROMPT_KO = `당신은 분석 스타일 변경 도우미입니다. 사용자가 현재 쓰는 회의/강의 분석 프롬프트를 보여주면, 요청한 부분만 고쳐서 돌려줍니다.

## 규칙
1. 요청된 부분만 바꾸고 나머지 문장은 그대로 두세요.
2. 절대 바꾸거나 지우지 말 것 (현재 프롬프트에 있다면): \`## 🎯\`로 시작하는 첫 섹션 제목과 그 위치(첫 섹션), \`## 🔔 귓속말\` 제목과 "각 50자 이내·없으면 생략" 규칙, 추천 줄의 \`- 🔍 "문장"\` 형식, 마지막 "반드시 한국어" 규칙. 이것들은 앱이 파싱합니다. "더 간결하게"·"핵심만" 요청에도 이 섹션들은 남기고 다른 섹션을 줄이세요.
3. 섹션을 줄이거나 늘릴 때도 \`## \` 제목 형식을 유지하고, 표·LaTeX·수평선(---)을 요구하지 마세요.
4. 수정된 전체 프롬프트를 \`\`\`prompt … \`\`\` 코드블록 하나로 출력하고, 그 위에 무엇을 바꿨는지 1~2문장.
5. 질문하지 말고 바로 수정하세요. 요청이 모호하면 가장 보수적인 변경을 하세요.

## 톤
친근하고 짧게. "~로 바꿨어요!" 스타일.`;

const META_PROMPT_EN = `You are an analysis-style editor. The user shows the meeting/lecture analysis prompt they use now; return it with only the requested change.

## Rules
1. Change only what was asked; leave every other sentence as is.
2. Never change or remove (when the current prompt has them): the first section heading starting with \`## 🎯\` and its position as the first section, the \`## 🔔 Whisper\` heading and its "under 50 chars / omit if none" rule, the \`- 🔍 "sentence"\` line format, and the final "MUST be in English" rule. The app parses these. For "more concise" or "key points only" requests, keep these sections and trim the others.
3. When adding or removing sections keep the \`## \` heading style; never ask for tables, LaTeX or horizontal rules (---).
4. Output the full modified prompt in one \`\`\`prompt … \`\`\` code block, preceded by 1-2 sentences saying what changed.
5. Do not ask questions; make the most conservative edit if the request is ambiguous.

## Tone
Friendly and brief. "Done — changed X!" style.`;

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

/**
 * Pull the edited prompt out of the reply. Models label the fence ```prompt as asked, but
 * also ```markdown / ```md / ```text or leave it bare; take the longest fenced block.
 */
export function extractPrompt(text) {
  if (!text) return null;
  let best = null;
  for (const m of text.matchAll(/```(?:prompt|markdown|md|text)?[ \t]*\r?\n([\s\S]*?)```/g)) {
    const body = m[1].trim();
    if (body && (!best || body.length > best.length)) best = body;
  }
  return best;
}

/**
 * Headings the app parses that the original had but the edit lost ('🎯' / '🔔').
 * @returns {string[]}
 */
export function lostParsedHeadings(original, edited) {
  const lost = [];
  if (/^##\s*🎯/m.test(original) && !/^##\s*🎯/m.test(edited)) lost.push('🎯');
  if (/^## 🔔\s*(?:Whisper|귓속말)/m.test(original) && !/^## 🔔\s*(?:Whisper|귓속말)/m.test(edited)) lost.push('🔔');
  return lost;
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
  // Save current style to history before applying
  pushStyleHistory(state.settings.meetingPreset, state.settings.customPrompt, 'adjuster');
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
/**
 * Meta prompt as the system role; the prompt being edited as the first user turn; then the
 * conversation. chatHistory already ends with the new user message (sendUserMessage pushes it
 * first), so it is not appended again.
 */
function buildRequest() {
  const metaPrompt = isKorean() ? META_PROMPT_KO : META_PROMPT_EN;
  const currentPrompt = getCurrentPrompt();
  const label = isKorean() ? '현재 프롬프트' : 'Current prompt';

  const contents = [
    { role: 'user', parts: [{ text: `${label}:\n\`\`\`prompt\n${currentPrompt}\n\`\`\`` }] },
  ];
  chatHistory.forEach((msg, i) => {
    const role = msg.role === 'user' ? 'user' : 'model';
    // Merge the first request into the turn that carries the prompt (keeps user/model alternation).
    if (i === 0 && role === 'user') contents[0].parts.push({ text: msg.text });
    else contents.push({ role, parts: [{ text: msg.text }] });
  });

  return { systemInstruction: { parts: [{ text: metaPrompt }] }, contents };
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

  if (!isAiAvailable()) {
    addAiMessage(`<p>${t('toast.ai_unavailable')}</p>`);
    return;
  }

  isStreaming = true;
  const sendBtn = $('#paSendBtn');
  if (sendBtn) sendBtn.disabled = true;

  const typingEl = showTypingIndicator();

  try {
    const body = {
      ...buildRequest(),
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

    const { text: fullText } = await callGeminiGuarded(MODEL, body, {
      category: 'prompt_adj',
      onStream: (chunk, fullSoFar) => {
        streamContent.innerHTML = renderMarkdown(fullSoFar);
        container.scrollTop = container.scrollHeight;
      },
    });

    streamContent.innerHTML = renderMarkdown(fullText);
    container.scrollTop = container.scrollHeight;

    chatHistory.push({ role: 'model', text: fullText });

    // Try to extract prompt
    const extracted = extractPrompt(fullText);
    if (extracted) {
      lastExtractedPrompt = extracted;
      renderActionButtons(extracted);
      // The live panel parses these headings; warn before the user applies a prompt without them.
      if (lostParsedHeadings(getCurrentPrompt(), extracted).length) {
        showToast(isKorean() ? '주의: 수정본에 🎯/🔔 섹션이 없어 실시간 요약·귓속말이 표시되지 않을 수 있어요.' : 'Heads up: the edit dropped the 🎯/🔔 section, so the live headline or whispers may stop showing.', 'warning');
      }
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
