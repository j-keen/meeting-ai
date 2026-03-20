// doc-generator.js - AI document generator module (prompt-builder pattern)

import { state, emit } from './event-bus.js';
import { getAiLanguage, t } from './i18n.js';
import { callGeminiGuarded, UsageLimitError, isProxyAvailable } from './gemini-api.js';
import { saveMeeting } from './storage.js';
import { showToast } from './ui.js';
import { renderMarkdown } from './chat.js';
import { escapeHtml } from './utils.js';
import { downloadFile } from './export-md.js';
import { exportPDF, exportWord } from './export-doc.js';

const $ = (sel) => document.querySelector(sel);

const MODEL = 'gemini-2.5-flash';
const DOC_START = '---DOCUMENT_START---';
const DOC_END = '---DOCUMENT_END---';

// ===== Internal State =====
let chatHistory = [];
let currentDocument = null; // { title, content }
let currentView = 'chat';
let isStreaming = false;
let targetMeeting = null; // null = active session, object = history viewer

// ===== Chips =====
const DOC_CHIPS = [
  { ko: '이메일', en: 'Email' },
  { ko: '제안서', en: 'Proposal' },
  { ko: '보고서', en: 'Report' },
  { ko: '액션리스트', en: 'Action List' },
  { ko: '요약 메일', en: 'Summary Email' },
  { ko: '후속 메일', en: 'Follow-up Email' },
];

// ===== Helpers =====
function isKorean() {
  return getAiLanguage() === 'ko';
}

function getSystemPrompt() {
  const context = buildMeetingContext();
  const ko = isKorean();

  if (ko) {
    return `당신은 비즈니스 문서 작성 전문가입니다. 사용자의 미팅 데이터를 바탕으로 요청된 문서를 작성합니다.

## 미팅 컨텍스트
${context}

## 규칙
1. 사용자가 요청한 형식의 문서를 마크다운으로 작성하세요.
2. 문서를 출력할 때 반드시 아래 마커로 감싸세요:
${DOC_START}
(마크다운 문서 내용)
${DOC_END}
3. 대화 2~3턴 이내에 문서를 완성하세요. 필요한 정보가 부족하면 간단히 물어보세요.
4. 수정 요청 시 전체 문서를 마커 포함하여 다시 출력하세요.
5. 문서의 첫 줄은 # 제목으로 시작하세요.
6. 톤: 전문적이되 읽기 쉽게, 불필요한 장황함 없이.`;
  }

  return `You are a business document writing expert. You create documents based on the user's meeting data.

## Meeting Context
${context}

## Rules
1. Write the requested document in markdown format.
2. Always wrap the document output with these markers:
${DOC_START}
(markdown document content)
${DOC_END}
3. Complete the document within 2-3 conversation turns. If info is missing, ask briefly.
4. When revision is requested, output the full document again with markers.
5. Start the document with a # heading.
6. Tone: professional yet readable, no unnecessary verbosity.`;
}

function buildMeetingContext() {
  const src = targetMeeting || state;
  const parts = [];

  // Transcript
  const transcript = src.transcript || [];
  if (transcript.length > 0) {
    const lines = transcript.map(l => l.text).join('\n');
    parts.push(`[Transcript]\n${lines}`);
  }

  // Analysis
  const analysisHistory = src.analysisHistory || [];
  if (analysisHistory.length > 0) {
    const latest = analysisHistory[analysisHistory.length - 1];
    if (latest.markdown) {
      parts.push(`[Analysis]\n${latest.markdown}`);
    } else if (latest.summary) {
      parts.push(`[Analysis Summary]\n${latest.summary}`);
    }
  }

  // Memos
  const memos = src.memos || [];
  if (memos.length > 0) {
    const memoText = memos.map(m => m.text).join('\n');
    parts.push(`[Memos]\n${memoText}`);
  }

  // Chat history
  const chatHist = src.chatHistory || [];
  if (chatHist.length > 0) {
    const chatText = chatHist.map(c => `${c.role}: ${c.text || c.content || ''}`).join('\n');
    parts.push(`[Chat]\n${chatText}`);
  }

  // Minutes
  if (src.minutesVersions?.length > 0) {
    const latest = src.minutesVersions[src.minutesVersions.length - 1];
    if (latest.content) {
      parts.push(`[Minutes]\n${latest.content}`);
    }
  }

  // Meeting metadata
  const meta = [];
  if (src.meetingTitle || src.title) meta.push(`Title: ${src.meetingTitle || src.title}`);
  if (src.meetingLocation || src.location) meta.push(`Location: ${src.meetingLocation || src.location}`);
  if (src.participants?.length) meta.push(`Participants: ${src.participants.map(p => typeof p === 'string' ? p : p.name).join(', ')}`);
  if (src.tags?.length) meta.push(`Tags: ${src.tags.join(', ')}`);
  if (meta.length) parts.unshift(`[Meeting Info]\n${meta.join('\n')}`);

  return parts.join('\n\n') || (isKorean() ? '미팅 데이터 없음' : 'No meeting data');
}

// ===== Document Extraction =====
function extractDocument(text) {
  const startIdx = text.indexOf(DOC_START);
  const endIdx = text.indexOf(DOC_END);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return null;

  const content = text.substring(startIdx + DOC_START.length, endIdx).trim();
  if (!content) return null;

  // Extract title from first H1
  const titleMatch = content.match(/^#\s+(.+)/m);
  const title = titleMatch ? titleMatch[1].trim() : (isKorean() ? '문서' : 'Document');

  return { title, content };
}

// ===== Render Helpers =====
function addMessage(role, html) {
  const container = $('#dgMessages');
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
  const container = $('#dgMessages');
  if (!container) return null;
  const el = document.createElement('div');
  el.className = 'pb-message pb-message-model pb-typing';
  el.innerHTML = '<div class="pb-message-content"><span class="typing-dots"><span></span><span></span><span></span></span></div>';
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  return el;
}

function renderChips() {
  const container = $('#dgChips');
  if (!container) return;
  container.innerHTML = '';
  const ko = isKorean();
  DOC_CHIPS.forEach(chip => {
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
  const chatView = $('#dgChatView');
  const previewView = $('#dgPreviewView');
  if (chatView) chatView.hidden = view !== 'chat';
  if (previewView) previewView.hidden = view !== 'preview';
}

// ===== Preview Rendering =====
function renderPreview() {
  if (!currentDocument) return;
  const container = $('#dgPreviewContent');
  if (!container) return;
  container.innerHTML = renderMarkdown(currentDocument.content);
}

// ===== AI Communication =====
function buildContents(userText) {
  const systemPrompt = getSystemPrompt();
  const ko = isKorean();
  const greeting = t('dg.greeting');

  const contents = [
    { role: 'user', parts: [{ text: systemPrompt }] },
    { role: 'model', parts: [{ text: greeting }] },
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

  const input = $('#dgInput');
  if (input) input.value = '';

  const chips = $('#dgChips');
  if (chips) chips.style.display = 'none';

  if (!isProxyAvailable()) {
    addAiMessage(t('dg.no_api'));
    return;
  }

  isStreaming = true;
  const sendBtn = $('#btnDgSend');
  if (sendBtn) sendBtn.disabled = true;

  const typingEl = showTypingIndicator();

  try {
    const contents = buildContents(text);
    const body = {
      contents,
      generationConfig: { temperature: 0.7 },
    };

    const container = $('#dgMessages');
    const streamEl = document.createElement('div');
    streamEl.className = 'pb-message pb-message-model';
    const streamContent = document.createElement('div');
    streamContent.className = 'pb-message-content';
    streamContent.textContent = '';
    streamEl.appendChild(streamContent);

    if (typingEl) typingEl.remove();
    container.appendChild(streamEl);

    const { text: fullText } = await callGeminiGuarded(MODEL, body, {
      category: 'docgen',
      onStream: (chunk, fullSoFar) => {
        // Strip document markers for display in chat
        const displayText = fullSoFar.replace(DOC_START, '').replace(DOC_END, '');
        streamContent.innerHTML = renderMarkdown(displayText);
        container.scrollTop = container.scrollHeight;
      },
    });

    // Final render in chat (strip markers)
    const displayText = fullText.replace(DOC_START, '').replace(DOC_END, '');
    streamContent.innerHTML = renderMarkdown(displayText);
    container.scrollTop = container.scrollHeight;

    chatHistory.push({ role: 'model', text: fullText });

    // Try to extract document
    const doc = extractDocument(fullText);
    if (doc) {
      currentDocument = doc;
      renderPreview();
      switchView('preview');
    }
  } catch (err) {
    if (typingEl && typingEl.parentNode) typingEl.remove();
    if (err.name !== 'AbortError') {
      addAiMessage(`<p style="color:var(--danger)">${escapeHtml(err.message)}</p>`);
    }
  } finally {
    isStreaming = false;
    if (sendBtn) sendBtn.disabled = false;
  }
}

// ===== Export Handlers =====
function handleCopy() {
  if (!currentDocument) return;
  navigator.clipboard.writeText(currentDocument.content).then(() => {
    showToast(t('dg.copied'), 'success');
  });
}

function handleDownloadMd() {
  if (!currentDocument) return;
  downloadFile(currentDocument.content, `${currentDocument.title}.md`, 'text/markdown');
}

async function handleDownloadDocx() {
  if (!currentDocument) return;
  try { await exportWord(currentDocument.content, `${currentDocument.title}.docx`); }
  catch (e) { showToast(e.message, 'error'); }
}

async function handleDownloadPdf() {
  if (!currentDocument) return;
  try { await exportPDF(currentDocument.content, `${currentDocument.title}.pdf`); }
  catch (e) { showToast(e.message, 'error'); }
}

// ===== Save =====
function handleSave() {
  if (!currentDocument) return;

  const doc = {
    id: 'doc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    title: currentDocument.title,
    content: currentDocument.content,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  if (targetMeeting) {
    // History viewer: save to the target meeting
    if (!targetMeeting.documents) targetMeeting.documents = [];
    targetMeeting.documents.push(doc);
    saveMeeting(targetMeeting);
  } else {
    // Active session: save to state
    state.documents.push(doc);
  }

  showToast(t('dg.saved'), 'success');
}

// ===== New Document =====
function handleNewDoc() {
  chatHistory = [];
  currentDocument = null;
  currentView = 'chat';
  switchView('chat');

  const messages = $('#dgMessages');
  if (messages) messages.innerHTML = '';

  addAiMessage(renderMarkdown(t('dg.greeting')));
  renderChips();

  const input = $('#dgInput');
  if (input) {
    input.value = '';
    setTimeout(() => input.focus(), 100);
  }
}

// ===== Modal Control =====
function closeModal() {
  const modal = $('#docGeneratorModal');
  if (modal) modal.hidden = true;
  isStreaming = false;
}

// ===== Exported Functions =====
export function openDocGenerator(meeting) {
  const modal = $('#docGeneratorModal');
  if (!modal) return;

  // Set target
  targetMeeting = meeting || null;

  // Check if there's any meeting data
  const src = targetMeeting || state;
  const hasData = (src.transcript?.length > 0) || (src.memos?.length > 0) ||
    (src.chatHistory?.length > 0) || (src.analysisHistory?.length > 0);
  if (!hasData) {
    showToast(t('dg.no_meeting'), 'warning');
    return;
  }

  // Reset state
  chatHistory = [];
  currentDocument = null;
  currentView = 'chat';

  // Show modal
  modal.hidden = false;

  // Clear messages
  const messages = $('#dgMessages');
  if (messages) messages.innerHTML = '';

  switchView('chat');

  // Show initial AI greeting
  addAiMessage(renderMarkdown(t('dg.greeting')));

  // Render chips
  renderChips();

  // Focus input
  const input = $('#dgInput');
  if (input) {
    input.value = '';
    setTimeout(() => input.focus(), 100);
  }
}

export function initDocGenerator() {
  // Send button
  const sendBtn = $('#btnDgSend');
  if (sendBtn) {
    sendBtn.addEventListener('click', () => {
      const input = $('#dgInput');
      if (input && input.value.trim()) {
        sendUserMessage(input.value.trim());
      }
    });
  }

  // Input enter key
  const input = $('#dgInput');
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

  // Back to chat
  const backBtn = $('#btnDgBack');
  if (backBtn) {
    backBtn.addEventListener('click', () => switchView('chat'));
  }

  // New document
  const newDocBtn = $('#btnDgNewDoc');
  if (newDocBtn) {
    newDocBtn.addEventListener('click', handleNewDoc);
  }

  // Export buttons
  $('#btnDgCopy')?.addEventListener('click', handleCopy);
  $('#btnDgDownloadMd')?.addEventListener('click', handleDownloadMd);
  $('#btnDgDownloadDocx')?.addEventListener('click', handleDownloadDocx);
  $('#btnDgDownloadPdf')?.addEventListener('click', handleDownloadPdf);
  $('#btnDgSave')?.addEventListener('click', handleSave);

  // Close modal
  const modal = $('#docGeneratorModal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    const closeBtn = modal.querySelector('.modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeModal);
    }
  }

  // ESC key to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = $('#docGeneratorModal');
      if (modal && !modal.hidden) {
        closeModal();
      }
    }
  });
}
