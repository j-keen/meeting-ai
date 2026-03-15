// chat.js - AI Chat module with Gemini function calling + model selection

import { state, emit } from './event-bus.js';
import { getAiLanguage, t } from './i18n.js';
import { callGemini, callGeminiStream, isProxyAvailable } from './gemini-api.js';
import { getCategoryGuidance } from './category-prompts.js';
import { loadCategories } from './storage.js';

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

function handleSend() {
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

  // Guard 5: confirm before sending large transcripts
  const totalChars = state.transcript.reduce((sum, l) => sum + l.text.length, 0);
  if (totalChars > 80000) {
    if (!confirm(t('guard.chat_large_confirm', { lines: state.transcript.length }))) {
      input.value = text;
      return;
    }
  }

  state.chatHistory.push({ role: 'user', text: fullText, timestamp: Date.now() });
  sendChatMessage(fullText);
}

function getChatModel() {
  return state.settings.chatModel || 'gemini-2.5-flash';
}

async function sendChatMessage(userText) {
  if (!isProxyAvailable()) {
    renderSystemMessage(t('toast.no_api_key'));
    return;
  }

  const model = getChatModel();
  const systemPrompt = buildChatSystemPrompt();
  const contents = buildContents(systemPrompt, userText);

  // Show typing indicator
  const container = $('#chatMessages');
  const typingEl = document.createElement('div');
  typingEl.className = 'chat-message model typing-indicator';
  typingEl.innerHTML = '<div class="chat-message-content"><span class="typing-dots"><span></span><span></span><span></span></span></div>';
  container.appendChild(typingEl);
  container.scrollTop = container.scrollHeight;

  try {
    const body = {
      contents,
      tools: [{ function_declarations: FUNCTION_DECLARATIONS }],
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

    const { text: fullText, parts } = await callGeminiStream(model, body, (chunk, fullSoFar) => {
      streamContent.innerHTML = renderMarkdown(fullSoFar);
      container.scrollTop = container.scrollHeight;
    });

    // Check for function calls in parts
    let hasFunctionCall = false;
    for (const part of parts) {
      if (part.functionCall) {
        hasFunctionCall = true;
        streamEl.remove();
        await handleFunctionCall(part.functionCall);
      }
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
    renderChatMessage('system', t('chat.error') + ': ' + err.message);
  }
}

function buildChatSystemPrompt() {
  const lang = getAiLanguage();

  // Use custom prompt if set, otherwise default
  const customPrompt = state.settings.chatSystemPrompt;
  let prompt = customPrompt
    ? customPrompt
    : lang === 'ko'
      ? `당신은 AI 비서입니다. 현재 회의 맥락이 제공되지만, 어떤 주제든 자유롭게 대화할 수 있습니다.
사용 가능한 도구: add_context (맥락 추가), add_memo (메모 추가), rerun_analysis (재분석 실행)
한국어로 답변하세요.`
      : `You are an AI assistant. Meeting context is provided below, but you can discuss any topic freely.
Available tools: add_context, add_memo, rerun_analysis
Respond in English.`;

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

  if (state.transcript.length > 0) {
    const MAX_CHARS = 100000;
    const lines = state.transcript.map(l => {
      const t = new Date(l.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      return `[${t}] ${l.text}`;
    });
    let text = lines.join('\n');
    if (text.length > MAX_CHARS) {
      // Keep the end (most recent), trim the beginning
      let kept = 0;
      let startIdx = lines.length;
      let charCount = 0;
      for (let i = lines.length - 1; i >= 0; i--) {
        charCount += lines[i].length + 1;
        if (charCount > MAX_CHARS) break;
        startIdx = i;
        kept++;
      }
      const skipped = lines.length - kept;
      text = `[... 이전 ${skipped}줄 생략 ...]\n` + lines.slice(startIdx).join('\n');
    }
    prompt += `\n\n[Full Transcript]\n${text}`;
  }

  if (state.memos?.length > 0) {
    const memoLines = state.memos.map(m => {
      const t = new Date(m.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      return `- [${t}] ${m.text}`;
    });
    prompt += `\n\n[User Memos]\n${memoLines.join('\n')}`;
  }

  if (state.currentAnalysis) {
    prompt += `\n\n[Current Analysis Summary]\n${state.currentAnalysis.summary || 'N/A'}`;
  }

  if (state.userInsights?.length > 0) {
    prompt += `\n\n[User Insights]\n${state.userInsights.map(i => '- ' + i).join('\n')}`;
  }

  if (state.settings.userProfile) {
    prompt += `\n\n[User Profile - one of the meeting participants]\n${state.settings.userProfile}`;
  }

  if (state.settings.meetingContext) {
    prompt += `\n\n[Meeting Context]\n${state.settings.meetingContext}`;
  }

  return prompt;
}

function buildContents(systemPrompt, userText) {
  const contents = [];
  const recentHistory = state.chatHistory.slice(-10);

  if (recentHistory.length > 0) {
    contents.push({
      role: 'user',
      parts: [{ text: systemPrompt + '\n\n---\n\n' + recentHistory[0].text }]
    });
    for (let i = 1; i < recentHistory.length; i++) {
      contents.push({
        role: recentHistory[i].role === 'user' ? 'user' : 'model',
        parts: [{ text: recentHistory[i].text }]
      });
    }
    contents.push({ role: 'user', parts: [{ text: userText }] });
  } else {
    contents.push({
      role: 'user',
      parts: [{ text: systemPrompt + '\n\n---\n\n' + userText }]
    });
  }

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

  // Headers (## and ###)
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Numbered lists
  html = html.replace(/^(\d+)\. (.+)$/gm, '<li data-num>$2</li>');
  html = html.replace(/((?:<li data-num>.*<\/li>\n?)+)/g, '<ol>$1</ol>');

  // Unordered lists
  html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

  // Clean up data-num attributes
  html = html.replace(/ data-num/g, '');

  // Line breaks (but not inside block elements)
  html = html.replace(/\n/g, '<br>');
  // Clean up extra <br> around block elements
  html = html.replace(/<br>\s*(<\/?(?:h[2-4]|pre|ul|ol|li))/g, '$1');
  html = html.replace(/(<\/(?:h[2-4]|pre|ul|ol|li)>)\s*<br>/g, '$1');

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

  // Simpler approach: just count non-system messages before this one
  if (historyIdx >= 0 && historyIdx < state.chatHistory.length) {
    state.chatHistory.splice(historyIdx);
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
    if (msg.text.startsWith('[add_context:') || msg.text.startsWith('[add_memo:') || msg.text === '[rerun_analysis]') return;
    renderChatMessage(msg.role, msg.text);
  });
}
