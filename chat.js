// chat.js - AI chat panel with function calling (add_memo / add_context / rerun_analysis)

import { state, emit } from './event-bus.js';
import { modelFor } from './models.js';
import { getAiLanguage, t } from './i18n.js';
import { callGeminiGuarded, UsageLimitError, isAiAvailable } from './gemini-api.js';
import { getCategoryGuidance } from './category-prompts.js';
import { loadCategories, loadSettings, saveSettings } from './storage.js';

const $ = (sel) => document.querySelector(sel);

const ALLOWED_EXTENSIONS = new Set([
  '.txt','.md','.csv','.json','.js','.ts','.py','.html','.css',
  '.xml','.log','.yaml','.yml','.toml','.ini','.cfg','.env','.sh','.bat'
]);

function isAllowedFile(file) {
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext);
}

const FUNCTION_DECLARATIONS = [
  {
    name: 'add_context',
    description: 'Add user insight or context to enhance future analysis.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The context/insight to add' }
      },
      required: ['text']
    }
  },
  {
    name: 'add_memo',
    description: 'Add a memo note to the meeting transcript.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The memo text to add' }
      },
      required: ['text']
    }
  },
  {
    name: 'rerun_analysis',
    description: 'Re-run the AI analysis with accumulated context and insights.',
    parameters: {
      type: 'object',
      properties: {},
    }
  }
];

/** What each tool actually did, fed back to the model so its reply does not overclaim. */
const TOOL_RESULTS = {
  add_context: 'saved; applies from the next analysis',
  add_memo: 'memo saved to the session',
  rerun_analysis: 'analysis re-run started; the new result appears in the analysis panel in a few seconds (not available to you yet)',
};

let attachedFileContent = null;
let attachedFileName = null;
let chatInputHandler = null;

const CHAT_DRAFT_KEY = 'chat_draft';

function autoResizeChat(el) {
  el.style.height = 'auto';
  const panel = document.getElementById('panelRight');
  const maxH = panel ? panel.offsetHeight * 0.5 : 200;
  if (el.scrollHeight > maxH) {
    el.style.height = maxH + 'px';
    el.style.overflowY = 'auto';
  } else {
    el.style.height = el.scrollHeight + 'px';
    el.style.overflowY = 'hidden';
  }
}

export function initChat() {
  const sendBtn = $('#btnChatSend');
  const input = $('#chatInput');
  const fileInput = $('#chatFileInput');

  sendBtn.addEventListener('click', () => handleSend());

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  input.addEventListener('input', () => {
    autoResizeChat(input);
    const v = input.value;
    if (v.trim()) localStorage.setItem(CHAT_DRAFT_KEY, v);
    else localStorage.removeItem(CHAT_DRAFT_KEY);
  });

  // Restore chat draft
  const savedDraft = localStorage.getItem(CHAT_DRAFT_KEY);
  if (savedDraft) { input.value = savedDraft; autoResizeChat(input); }

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!isAllowedFile(file)) {
      emit('toast', { message: t('chat.file_unsupported'), type: 'warning' });
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      attachedFileContent = reader.result;
      attachedFileName = file.name;
      renderSystemMessage(t('chat.file_attached', { name: file.name }));
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // Drag & drop on chat input area
  const chatInputWrap = document.querySelector('.chat-input-wrap');
  chatInputWrap.addEventListener('dragover', (e) => {
    e.preventDefault();
    chatInputWrap.classList.add('drag-over');
  });
  chatInputWrap.addEventListener('dragleave', () => {
    chatInputWrap.classList.remove('drag-over');
  });
  chatInputWrap.addEventListener('drop', (e) => {
    e.preventDefault();
    chatInputWrap.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (!isAllowedFile(file)) {
      emit('toast', { message: t('chat.file_unsupported'), type: 'warning' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      attachedFileContent = reader.result;
      attachedFileName = file.name;
      renderSystemMessage(t('chat.file_attached', { name: file.name }));
    };
    reader.readAsText(file);
  });
}

export function setChatInputHandler(fn) {
  chatInputHandler = fn;
}

export function clearChat() {
  const container = $('#chatMessages');
  container.innerHTML = '';
  const empty = $('#chatEmpty');
  if (empty) empty.style.display = '';
}

export function renderChatMessageWithButtons(role, text, buttons) {
  const container = $('#chatMessages');
  const empty = $('#chatEmpty');
  if (empty) empty.style.display = 'none';

  const tmpl = $('#tmplChatMessage');
  const el = tmpl.content.cloneNode(true).querySelector('.chat-message');
  el.classList.add(role);
  const content = el.querySelector('.chat-message-content');
  if (role === 'model') {
    content.innerHTML = renderMarkdown(text);
  } else {
    content.textContent = text;
  }

  if (buttons && buttons.length > 0) {
    const btnWrap = document.createElement('div');
    btnWrap.className = 'prep-quick-buttons';
    buttons.forEach(({ label, value, primary }) => {
      const btn = document.createElement('button');
      btn.className = 'prep-quick-btn' + (primary ? ' selected' : '');
      btn.textContent = label;
      btn.addEventListener('click', () => {
        if (typeof value === 'function') {
          value();
        } else if (chatInputHandler) {
          chatInputHandler(value || label);
        }
      });
      btnWrap.appendChild(btn);
    });
    content.appendChild(btnWrap);
  }

  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  return el;
}

async function handleSend() {
  const input = $('#chatInput');
  const text = input.value.trim();
  if (!text) return;

  // If meeting prep mode is active, route input to prep handler
  if (chatInputHandler) {
    input.value = '';
    localStorage.removeItem(CHAT_DRAFT_KEY);
    autoResizeChat(input);
    chatInputHandler(text);
    return;
  }

  let displayText = text;
  if (attachedFileName) displayText += `\n[${attachedFileName}]`;

  input.value = '';
  localStorage.removeItem(CHAT_DRAFT_KEY);
  autoResizeChat(input);
  renderChatMessage('user', displayText);

  const fullText = attachedFileContent
    ? text + '\n\n[Attached file: ' + attachedFileName + ']\n' + attachedFileContent
    : text;

  attachedFileContent = null;
  attachedFileName = null;

  // No large-transcript confirm: the chat context is capped (CHAT_TRANSCRIPT_MAX_CHARS),
  // so a long session no longer means a huge request.
  state.chatHistory.push({ role: 'user', text: fullText, timestamp: Date.now() });
  sendChatMessage(fullText);
}

function getChatModel() {
  return modelFor('chat'); // light tier; the old per-chat model picker is gone
}

async function sendChatMessage(userText) {
  if (!isAiAvailable()) {
    renderSystemMessage(t('toast.ai_unavailable'));
    return;
  }

  const model = getChatModel();
  const systemInstruction = { parts: [{ text: buildChatSystemPrompt() }] };
  const contents = buildContents(userText);
  const tools = [{ function_declarations: FUNCTION_DECLARATIONS }];

  // Show typing indicator
  const container = $('#chatMessages');
  const typingEl = document.createElement('div');
  typingEl.className = 'chat-message model typing-indicator';
  typingEl.innerHTML = '<div class="chat-message-content"><span class="typing-dots"><span></span><span></span><span></span></span></div>';
  container.appendChild(typingEl);
  container.scrollTop = container.scrollHeight;

  try {
    const body = {
      systemInstruction,
      contents,
      tools,
      generationConfig: { temperature: 0.5 }
    };

    // Create streaming message element
    const empty = $('#chatEmpty');
    if (empty) empty.style.display = 'none';
    const tmpl = $('#tmplChatMessage');
    const streamEl = tmpl.content.cloneNode(true).querySelector('.chat-message');
    streamEl.classList.add('model');
    const streamContent = streamEl.querySelector('.chat-message-content');
    streamContent.textContent = '';

    typingEl.remove();
    container.appendChild(streamEl);

    let { text: fullText, parts } = await callGeminiGuarded(model, body, {
      category: 'chat',
      onStream: (chunk, fullSoFar) => {
        streamContent.innerHTML = renderMarkdown(fullSoFar);
        container.scrollTop = container.scrollHeight;
      },
    });

    // Check for function calls in parts
    let hasFunctionCall = false;
    const calls = (parts || []).filter(p => p.functionCall);
    for (const part of calls) {
      hasFunctionCall = true;
      await handleFunctionCall(part.functionCall);
    }

    // The model chose a tool instead of answering (OpenAI tool calls usually carry no text).
    // Feed the tool results back and ask for the actual answer, so the user never gets
    // only "[memo added]" as a reply. Tools stay declared (the provider needs them to read
    // the earlier tool_calls) but calling is disabled, so this turn can only answer in text.
    if (hasFunctionCall && !fullText.trim()) {
      const followUp = [
        ...contents,
        { role: 'model', parts: calls },
        {
          role: 'user',
          parts: [
            ...calls.map(c => ({ functionResponse: { name: c.functionCall.name, ...(c.functionCall.id ? { id: c.functionCall.id } : {}), response: { result: TOOL_RESULTS[c.functionCall.name] || 'ok' } } })),
            { text: t('chat.answer_after_tool') },
          ],
        },
      ];
      streamContent.textContent = '';
      const second = await callGeminiGuarded(model, {
        systemInstruction,
        contents: followUp,
        tools,
        toolConfig: { functionCallingConfig: { mode: 'NONE' } },
        generationConfig: { temperature: 0.5 },
      }, {
        category: 'chat',
        onStream: (chunk, fullSoFar) => {
          streamContent.innerHTML = renderMarkdown(fullSoFar);
          container.scrollTop = container.scrollHeight;
        },
      });
      fullText = second.text || '';
      parts = second.parts || [];
    }

    if (fullText) {
      // Finalize the streamed message
      streamEl.dataset.text = fullText;
      streamContent.innerHTML = renderMarkdown(fullText);

      // Add action buttons
      const actions = streamEl.querySelector('.chat-message-actions');
      const btn = document.createElement('button');
      btn.textContent = '↻';
      btn.title = t('chat.regenerate');
      btn.addEventListener('click', () => handleRegenerate(streamEl));
      actions.appendChild(btn);

      state.chatHistory.push({ role: 'model', text: fullText, timestamp: Date.now() });
    } else if (!hasFunctionCall) {
      streamEl.remove();
      throw new Error('No response from AI');
    }
  } catch (err) {
    typingEl.remove();
    // Drop the empty streaming bubble left by a request that failed before any text.
    const last = container.lastElementChild;
    if (last?.classList.contains('model') && !last.querySelector('.chat-message-content')?.textContent.trim()) last.remove();
    renderChatMessage('system', t('chat.error') + ': ' + err.message);
  }
}

/** Transcript budget for chat context: the most recent ~30k chars (about 15k tokens), not the whole session. */
const CHAT_TRANSCRIPT_MAX_CHARS = 30000;
/** Latest analysis is a full markdown note; cap it so it can't dominate the context. */
const CHAT_ANALYSIS_MAX_CHARS = 6000;
/** Chat turns re-sent as conversation history. */
const CHAT_HISTORY_TURNS = 10;

const DEFAULT_CHAT_PROMPT = {
  ko: `당신은 회의·강의 중 옆에서 돕는 AI 비서입니다. 아래에 현재 세션의 트랜스크립트, 메모, 최신 분석이 있습니다.
- 질문에는 먼저 결론 한 줄, 그다음 근거. 트랜스크립트에 근거할 때는 시각([HH:MM])을 붙이세요.
- 트랜스크립트에 없는 내용은 "트랜스크립트에는 없지만"이라고 밝히고 답하세요.
- 짧게. 목록은 5개 이내. 사용자가 더 요구하면 그때 늘리세요.
- 수식은 LaTeX 없이 일반 텍스트로 쓰고, 표 대신 목록을 쓰세요.
- 화자 구분이 없으므로 발언자를 단정하지 마세요.
- 한국어로 답하세요.`,
  en: `You are an AI assistant helping during a meeting or lecture. The current session's transcript, memos and latest analysis follow.
- Answer with the conclusion first, then evidence. When citing the transcript, add the time ([HH:MM]).
- If something is not in the transcript, say so ("not in the transcript, but...") before answering.
- Keep it short; lists of at most 5 items unless asked for more.
- Write formulas as plain text (no LaTeX) and use lists instead of tables.
- There is no speaker attribution; do not assert who said what.
- Respond in English.`,
};

const CHAT_TOOL_RULES = {
  ko: `도구: add_memo(메모 저장), add_context(분석 맥락 추가), rerun_analysis(재분석). 사용자가 명시적으로 "메모해줘 / 맥락에 추가해줘 / 다시 분석해줘"라고 할 때만 호출하세요. 평범한 질문에는 도구 없이 텍스트로 답하세요. 도구를 쓴 뒤에는 한 문장으로 한 일만 알리세요. rerun_analysis는 재분석을 "시작"만 하므로 "재분석을 시작했어요"라고 하고 결과를 아는 척하지 마세요.`,
  en: `Tools: add_memo (save a memo), add_context (add context for the analysis), rerun_analysis (re-run the analysis). Call them only when the user explicitly asks to take a memo, add context, or re-analyze. Answer ordinary questions in text without tools. After using a tool, say in one sentence what you did. rerun_analysis only starts a re-run: say it has started and do not claim to know the result.`,
};

function hhmm(ts) {
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/** Keep the most recent lines that fit in maxChars; note how many earlier lines were dropped. */
export function capTranscriptLines(lines, maxChars, lang = 'ko') {
  const text = lines.join('\n');
  if (text.length <= maxChars) return text;
  let startIdx = lines.length;
  let charCount = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    charCount += lines[i].length + 1;
    if (charCount > maxChars) break;
    startIdx = i;
  }
  const note = lang === 'ko' ? `[... 앞부분 ${startIdx}줄 생략 ...]` : `[... ${startIdx} earlier lines omitted ...]`;
  return note + '\n' + lines.slice(startIdx).join('\n');
}

export function buildChatSystemPrompt() {
  const lang = getAiLanguage();
  const L = lang === 'ko' ? 'ko' : 'en';

  // Use custom prompt if set, otherwise default
  const customPrompt = state.settings.chatSystemPrompt;
  let prompt = customPrompt ? customPrompt : DEFAULT_CHAT_PROMPT[L];
  // Tools are always sent with the request, so the rule for using them always applies.
  prompt += '\n\n' + CHAT_TOOL_RULES[L];

  // Inject category-specific persona and name handling rules
  if (state.categories && state.categories.length > 0) {
    const cats = loadCategories();
    const hints = {};
    for (const cat of cats) {
      const name = cat.name || cat;
      if (cat.hint && state.categories.includes(name)) {
        hints[name] = cat.hint;
      }
    }
    const guidance = getCategoryGuidance(state.categories, lang, hints);
    if (guidance.nameRules) {
      prompt += '\n\n' + guidance.nameRules;
    }
    if (guidance.chat) {
      prompt += '\n\n' + guidance.chat;
    }
  }

  if (state.settings.meetingContext) {
    prompt += `\n\n[Meeting Context]\n${state.settings.meetingContext}`;
  }

  if (state.settings.userProfile) {
    prompt += `\n\n[User Profile - one of the meeting participants]\n${state.settings.userProfile}`;
  }

  if (state.transcript.length > 0) {
    const lines = state.transcript.map(l => `[${hhmm(l.timestamp)}] ${l.text}`);
    prompt += `\n\n[Full Transcript]\n${capTranscriptLines(lines, CHAT_TRANSCRIPT_MAX_CHARS, L)}`;
  }

  if (state.memos?.length > 0) {
    const memoLines = state.memos.map(m => `- [${hhmm(m.timestamp)}] ${m.text}`);
    prompt += `\n\n[User Memos]\n${memoLines.join('\n')}`;
  }

  if (state.currentAnalysis) {
    const summary = String(state.currentAnalysis.summary || 'N/A');
    prompt += `\n\n[Current Analysis Summary]\n${summary.length > CHAT_ANALYSIS_MAX_CHARS ? summary.slice(0, CHAT_ANALYSIS_MAX_CHARS) + '\n…' : summary}`;
  }

  if (state.userInsights?.length > 0) {
    prompt += `\n\n[User Insights]\n${state.userInsights.map(i => '- ' + i).join('\n')}`;
  }

  return prompt;
}

/** Tool bookkeeping entries ("[add_memo: …]") live in chatHistory but are not conversation turns. */
function isToolMarker(text) {
  return typeof text === 'string' && (text.startsWith('[add_context:') || text.startsWith('[add_memo:') || text === '[rerun_analysis]');
}

/**
 * Conversation turns for the request. chatHistory already ends with the current user
 * message (handleSend / regenerate push it first), so it is not appended a second time.
 */
export function buildContents(userText, history = state.chatHistory) {
  const turns = (history || []).filter(m => !isToolMarker(m.text)).slice(-CHAT_HISTORY_TURNS);
  const contents = turns.map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] }));
  const last = contents[contents.length - 1];
  if (!last || last.role !== 'user' || last.parts[0].text !== userText) {
    contents.push({ role: 'user', parts: [{ text: userText }] });
  }
  // Start on a user turn (Gemini requires it; harmless for OpenAI).
  while (contents.length > 1 && contents[0].role !== 'user') contents.shift();
  return contents;
}

async function handleFunctionCall(fc) {
  const { name, args } = fc;

  if (name === 'add_context') {
    const text = args?.text || '';
    if (!state.userInsights) state.userInsights = [];
    state.userInsights.push(text);
    renderSystemMessage(t('chat.context_added'));
    state.chatHistory.push({ role: 'model', text: `[add_context: ${text}]`, timestamp: Date.now() });
  } else if (name === 'add_memo') {
    const text = args?.text || '';
    emit('memo:fromChat', { text });
    renderSystemMessage(t('chat.memo_added'));
    state.chatHistory.push({ role: 'model', text: `[add_memo: ${text}]`, timestamp: Date.now() });
  } else if (name === 'rerun_analysis') {
    renderSystemMessage(t('chat.rerunning_analysis'));
    state.chatHistory.push({ role: 'model', text: '[rerun_analysis]', timestamp: Date.now() });
    emit('analysis:rerun');
  }
}

// ===== Markdown Renderer =====
export function renderMarkdown(text) {
  // HTML escape first (XSS prevention)
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks (```)
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code>${code.trim()}</code></pre>`;
  });

  // Inline code (`)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headers (#, ##, ###, ####)
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  // Documents (doc generator) start with a "# Title" line; .dg-preview-content styles h1.
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Numbered lists
  html = html.replace(/^[ \t]*(\d+)\. (.+)$/gm, '<li data-num>$2</li>');
  html = html.replace(/((?:<li data-num>.*<\/li>\n?)+)/g, '<ol>$1</ol>');

  // Unordered lists
  // Indented (nested) bullets are flattened into the same list rather than shown as literal "- ".
  html = html.replace(/^[ \t]*[-*] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

  // Clean up data-num attributes
  html = html.replace(/ data-num/g, '');

  // Line breaks (but not inside block elements)
  html = html.replace(/\n/g, '<br>');
  // Clean up extra <br> around block elements
  html = html.replace(/<br>\s*(<\/?(?:h[1-4]|pre|ul|ol|li))/g, '$1');
  html = html.replace(/(<\/(?:h[1-4]|pre|ul|ol|li)>)\s*<br>/g, '$1');

  return html;
}

export function renderChatMessage(role, text) {
  const container = $('#chatMessages');
  const empty = $('#chatEmpty');
  if (empty) empty.style.display = 'none';

  const tmpl = $('#tmplChatMessage');
  const el = tmpl.content.cloneNode(true).querySelector('.chat-message');
  el.classList.add(role);
  el.dataset.text = text;
  const content = el.querySelector('.chat-message-content');
  if (role === 'model') {
    content.innerHTML = renderMarkdown(text);
  } else {
    content.textContent = text;
  }

  // Add action buttons
  const actions = el.querySelector('.chat-message-actions');
  if (role === 'model') {
    const btn = document.createElement('button');
    btn.textContent = '↻';
    btn.title = t('chat.regenerate');
    btn.addEventListener('click', () => handleRegenerate(el));
    actions.appendChild(btn);
  } else if (role === 'user') {
    const btn = document.createElement('button');
    btn.textContent = '✎';
    btn.title = t('chat.edit');
    btn.addEventListener('click', () => handleEdit(el));
    actions.appendChild(btn);
  }

  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

function handleRegenerate(messageEl) {
  // Don't regenerate if already waiting for response
  if ($('.typing-indicator')) return;

  // Find last user message text from chatHistory
  let lastUserText = null;
  for (let i = state.chatHistory.length - 1; i >= 0; i--) {
    if (state.chatHistory[i].role === 'user') {
      lastUserText = state.chatHistory[i].text;
      break;
    }
  }
  if (!lastUserText) return;

  // Remove last model entry from chatHistory
  for (let i = state.chatHistory.length - 1; i >= 0; i--) {
    if (state.chatHistory[i].role === 'model') {
      state.chatHistory.splice(i, 1);
      break;
    }
  }

  // Remove DOM element
  messageEl.remove();

  // Re-send
  sendChatMessage(lastUserText);
}

function handleEdit(messageEl) {
  const originalText = messageEl.dataset.text;

  // Find index in chatHistory by matching timestamp approach — remove this and all after
  const allMessages = Array.from($('#chatMessages').querySelectorAll('.chat-message'));
  const idx = allMessages.indexOf(messageEl);

  // Remove from chatHistory: find corresponding entry and remove it + everything after
  // Count user/model messages up to this element to find chatHistory index
  let historyIdx = -1;
  let userCount = 0;
  let modelCount = 0;
  for (let i = 0; i < allMessages.length; i++) {
    const msg = allMessages[i];
    if (msg.classList.contains('system')) continue;
    if (i === idx) {
      historyIdx = userCount + modelCount;
      break;
    }
    if (msg.classList.contains('user')) userCount++;
    else if (msg.classList.contains('model')) modelCount++;
  }

  // historyIdx counts rendered turns; tool markers sit in chatHistory without a bubble,
  // so map the turn count onto the real chatHistory index.
  if (historyIdx >= 0) {
    let seen = 0;
    let realIdx = -1;
    for (let i = 0; i < state.chatHistory.length; i++) {
      if (isToolMarker(state.chatHistory[i].text)) continue;
      if (seen === historyIdx) { realIdx = i; break; }
      seen++;
    }
    if (realIdx >= 0) state.chatHistory.splice(realIdx);
  }

  // Remove this message and all after from DOM
  for (let i = allMessages.length - 1; i >= idx; i--) {
    allMessages[i].remove();
  }

  // Show empty state if no messages left
  const container = $('#chatMessages');
  if (!container.querySelector('.chat-message')) {
    const empty = $('#chatEmpty');
    if (empty) empty.style.display = '';
  }

  // Put text back in input
  const input = $('#chatInput');
  input.value = originalText;
  input.focus();
}

function renderSystemMessage(text) {
  renderChatMessage('system', text);
}

export function loadChatHistory() {
  if (!state.chatHistory || state.chatHistory.length === 0) return;
  state.chatHistory.forEach(msg => {
    if (isToolMarker(msg.text)) return;
    renderChatMessage(msg.role, msg.text);
  });
}

// ===== FAQ (Frequently Asked Questions) =====

const FAQ_KEY = 'faqItems';
let faqActiveIdx = -1;
let faqFiltered = [];

function loadFaqItems() {
  const saved = loadSettings();
  return saved[FAQ_KEY] || [];
}

function saveFaqItems(items) {
  saveSettings({ [FAQ_KEY]: items });
}

function getSortedFaq(items) {
  // Favorites first, then insertion order
  const favs = items.filter(i => i.fav);
  const rest = items.filter(i => !i.fav);
  return [...favs, ...rest];
}

export function initFaq() {
  const btn = $('#btnFaq');
  const popover = $('#faqPopover');
  const search = $('#faqSearch');
  const addInput = $('#faqAddInput');
  const addBtn = $('#btnFaqAdd');
  if (!btn || !popover) return;

  // Toggle FAQ dropdown
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    popover.hidden = !popover.hidden;
    if (!popover.hidden) {
      search.value = '';
      faqActiveIdx = -1;
      renderFaqList();
      setTimeout(() => search.focus(), 0);
    }
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!popover.hidden && !popover.contains(e.target) && e.target !== btn) {
      popover.hidden = true;
    }
  });

  // Search input
  search.addEventListener('input', () => {
    faqActiveIdx = -1;
    renderFaqList(search.value.trim());
  });

  // Keyboard navigation in search
  search.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (faqFiltered.length > 0) {
        faqActiveIdx = Math.min(faqActiveIdx + 1, faqFiltered.length - 1);
        updateFaqActive();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (faqFiltered.length > 0) {
        faqActiveIdx = Math.max(faqActiveIdx - 1, 0);
        updateFaqActive();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (faqActiveIdx >= 0 && faqActiveIdx < faqFiltered.length) {
        useFaqItem(faqFiltered[faqActiveIdx]);
      }
    } else if (e.key === 'Escape') {
      popover.hidden = true;
    }
  });

  // Add new FAQ
  function addNewFaq() {
    const text = addInput.value.trim();
    if (!text) return;
    const items = loadFaqItems();
    items.push({ id: Date.now().toString(), text, fav: false });
    saveFaqItems(items);
    addInput.value = '';
    // If dropdown is open, refresh it
    if (!popover.hidden) {
      renderFaqList(search.value.trim());
    }
  }

  addBtn.addEventListener('click', addNewFaq);
  addInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addNewFaq();
    }
  });
}

function renderFaqList(query = '') {
  const list = $('#faqList');
  if (!list) return;
  list.innerHTML = '';

  const items = loadFaqItems();
  const sorted = getSortedFaq(items);
  const q = query.toLowerCase();
  faqFiltered = q ? sorted.filter(i => i.text.toLowerCase().includes(q)) : sorted;

  if (items.length === 0) {
    list.innerHTML = `<div class="faq-empty">${t('chat.faq_empty')}</div>`;
    return;
  }
  if (faqFiltered.length === 0) {
    list.innerHTML = `<div class="faq-empty">${t('chat.faq_no_match')}</div>`;
    return;
  }

  faqFiltered.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'faq-item' + (idx === faqActiveIdx ? ' faq-active' : '');
    row.dataset.idx = idx;

    const favBtn = document.createElement('button');
    favBtn.className = 'faq-item-fav' + (item.fav ? ' favorited' : '');
    favBtn.textContent = item.fav ? '★' : '☆';
    favBtn.title = item.fav ? 'Unfavorite' : 'Favorite';
    favBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFaqFav(item.id);
    });

    const textSpan = document.createElement('span');
    textSpan.className = 'faq-item-text';
    textSpan.textContent = item.text;

    const actions = document.createElement('div');
    actions.className = 'faq-item-actions';

    const editBtn = document.createElement('button');
    editBtn.textContent = '✎';
    editBtn.title = 'Edit';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      startEditFaq(row, item);
    });

    const delBtn = document.createElement('button');
    delBtn.textContent = '✕';
    delBtn.title = 'Delete';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteFaqItem(item.id);
    });

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    row.appendChild(favBtn);
    row.appendChild(textSpan);
    row.appendChild(actions);

    row.addEventListener('click', () => useFaqItem(item));

    list.appendChild(row);
  });
}

function updateFaqActive() {
  const list = $('#faqList');
  if (!list) return;
  list.querySelectorAll('.faq-item').forEach((el, i) => {
    el.classList.toggle('faq-active', i === faqActiveIdx);
  });
  // Scroll active into view
  const active = list.querySelector('.faq-active');
  if (active) active.scrollIntoView({ block: 'nearest' });
}

function useFaqItem(item) {
  const popover = $('#faqPopover');
  popover.hidden = true;

  // Directly send the FAQ question
  const input = $('#chatInput');
  input.value = item.text;
  // Trigger handleSend
  input.dispatchEvent(new Event('input'));
  const sendBtn = $('#btnChatSend');
  sendBtn.click();
}

function toggleFaqFav(id) {
  const items = loadFaqItems();
  const item = items.find(i => i.id === id);
  if (item) {
    item.fav = !item.fav;
    saveFaqItems(items);
    const query = $('#faqSearch')?.value.trim() || '';
    renderFaqList(query);
  }
}

function deleteFaqItem(id) {
  const items = loadFaqItems().filter(i => i.id !== id);
  saveFaqItems(items);
  const query = $('#faqSearch')?.value.trim() || '';
  faqActiveIdx = -1;
  renderFaqList(query);
}

function startEditFaq(row, item) {
  const textSpan = row.querySelector('.faq-item-text');
  const actionsDiv = row.querySelector('.faq-item-actions');
  actionsDiv.style.display = 'none';

  const editInput = document.createElement('input');
  editInput.className = 'faq-item-edit';
  editInput.value = item.text;
  textSpan.replaceWith(editInput);
  editInput.focus();
  editInput.select();

  function finishEdit() {
    const newText = editInput.value.trim();
    if (newText && newText !== item.text) {
      const items = loadFaqItems();
      const target = items.find(i => i.id === item.id);
      if (target) {
        target.text = newText;
        saveFaqItems(items);
      }
    }
    const query = $('#faqSearch')?.value.trim() || '';
    renderFaqList(query);
  }

  editInput.addEventListener('blur', finishEdit);
  editInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      editInput.blur();
    } else if (e.key === 'Escape') {
      editInput.value = item.text; // revert
      editInput.blur();
    }
  });
}
