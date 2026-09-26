// doc-generator.js - AI document generator module (prompt-builder pattern)

import { state, emit } from './event-bus.js';
import { modelFor } from './models.js';
import { getAiLanguage, t } from './i18n.js';
import { callGeminiGuarded, UsageLimitError, isAiAvailable } from './gemini-api.js';
import { saveMeeting } from './storage.js';
import { showToast } from './ui.js';
import { renderMarkdown } from './chat.js';
import { escapeHtml } from './utils.js';
import { downloadFile } from './export-md.js';
import { exportPDF, exportWord } from './export-doc.js';

const $ = (sel) => document.querySelector(sel);

// Documents are a deliverable: use the model the user picked in settings.
const docModel = () => modelFor('docs');
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

// Context budget (chars). The heavy model reads this on every turn of the document chat.
const CTX_TRANSCRIPT_MAX = 30000; // most recent part of the transcript
const CTX_ANALYSIS_MAX = 8000;
const CTX_MINUTES_MAX = 15000;
const CTX_CHAT_MAX = 3000;       // side-chat is only included when short

function tail(text, max) {
  if (text.length <= max) return text;
  return '[…]\n' + text.slice(text.length - max);
}

function head(text, max) {
  if (text.length <= max) return text;
  return text.slice(0, max) + '\n[…]';
}

export function getSystemPrompt(context = buildMeetingContext(), ko = isKorean()) {
  if (ko) {
    return `당신은 비즈니스 문서 작성 전문가입니다. 아래 미팅 데이터만 근거로 사용자가 요청한 문서를 작성합니다.

## 규칙
1. 첫 요청에 바로 초안을 쓰세요. 정보가 부족하면 문서 안에 [확인 필요: …] 표시를 넣고 계속 쓰세요. 질문으로 턴을 끝내지 마세요.
2. 문서는 마크다운으로, 반드시 아래 마커 사이에만:
${DOC_START}
# 제목
(본문)
${DOC_END}
마커 밖에는 한두 문장의 안내만.
3. 수정 요청 시 전체 문서를 마커 포함해 다시 출력하세요.
4. 미팅 데이터에 없는 수치·날짜·약속·이름을 만들지 마세요. 필요하면 [확인 필요]로 남기세요.
5. 표·LaTeX·수평선 대신 제목과 목록을 쓰세요.
6. 톤: 전문적이되 읽기 쉽게, 장황하지 않게. 한국어로 쓰세요.

## 미팅 데이터
${context}`;
  }

  return `You are a business document writer. Write the document the user asks for using ONLY the meeting data below.

## Rules
1. Draft on the first request. If information is missing, insert [TO CONFIRM: …] inside the document and keep writing; never end a turn with only questions.
2. The document is Markdown and must sit between these markers only:
${DOC_START}
# Title
(body)
${DOC_END}
Outside the markers, at most one or two sentences of guidance.
3. On a revision request, output the whole document again with markers.
4. Never invent numbers, dates, commitments or names that are not in the meeting data; leave [TO CONFIRM] instead.
5. Use headings and lists, not tables, LaTeX or horizontal rules.
6. Tone: professional, readable, not verbose. Write in English.

## Meeting data
${context}`;
}

export function buildMeetingContext(src = targetMeeting || state) {
  const parts = [];

  // Transcript (most recent part)
  const transcript = src.transcript || [];
  if (transcript.length > 0) {
    const lines = transcript.map(l => l.text).join('\n');
    parts.push(`[Transcript]\n${tail(lines, CTX_TRANSCRIPT_MAX)}`);
  }

  // Analysis
  const analysisHistory = src.analysisHistory || [];
  if (analysisHistory.length > 0) {
    const latest = analysisHistory[analysisHistory.length - 1];
    if (latest.markdown) {
      parts.push(`[Analysis]\n${head(latest.markdown, CTX_ANALYSIS_MAX)}`);
    } else if (latest.summary) {
      parts.push(`[Analysis Summary]\n${head(String(latest.summary), CTX_ANALYSIS_MAX)}`);
    }
  }

  // Memos
  const memos = src.memos || [];
  if (memos.length > 0) {
    const memoText = memos.map(m => m.text).join('\n');
    parts.push(`[Memos]\n${memoText}`);
  }

  // Side-chat: only when short (tool bookkeeping lines dropped)
  const chatHist = (src.chatHistory || []).filter(c => !/^\[(?:add_context|add_memo):|^\[rerun_analysis\]$/.test(c.text || ''));
  if (chatHist.length > 0) {
    const chatText = chatHist.map(c => `${c.role}: ${c.text || c.content || ''}`).join('\n');
    if (chatText.length <= CTX_CHAT_MAX) parts.push(`[Chat]\n${chatText}`);
  }

  // Minutes
  if (src.minutesVersions?.length > 0) {
    const latest = src.minutesVersions[src.minutesVersions.length - 1];
    if (latest.content) {
      parts.push(`[Minutes]\n${head(latest.content, CTX_MINUTES_MAX)}`);
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
/**
 * System prompt (rules + meeting data) as the system role, then the conversation. The greeting
 * shown in the UI is not replayed as a model turn, and chatHistory already ends with the new
 * user message (sendUserMessage pushes it first), so it is not appended again.
 */
function buildRequest() {
  const contents = chatHistory.map(msg => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.text }],
  }));
  return { systemInstruction: { parts: [{ text: getSystemPrompt() }] }, contents };
}

async function sendUserMessage(text) {
  if (!text.trim() || isStreaming) return;

  addUserMessage(text);
  chatHistory.push({ role: 'user', text });

  const input = $('#dgInput');
  if (input) input.value = '';

  const chips = $('#dgChips');
  if (chips) chips.style.display = 'none';

  if (!isAiAvailable()) {
    addAiMessage(t('toast.ai_unavailable'));
    return;
  }

  isStreaming = true;
  const sendBtn = $('#btnDgSend');
  if (sendBtn) sendBtn.disabled = true;

  const typingEl = showTypingIndicator();

  try {
    const body = {
      ...buildRequest(),
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

    const { text: fullText } = await callGeminiGuarded(docModel(), body, {
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
