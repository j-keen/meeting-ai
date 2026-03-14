// ui/transcript.js - Transcript rendering, editing, bookmarks

import { state, emit } from '../event-bus.js';
import { t } from '../i18n.js';

const $ = (sel) => document.querySelector(sel);

let interimEl = null;

function formatTime(timestamp) {
  if (!state.meetingStartTime) return '00:00';
  const diff = timestamp - state.meetingStartTime;
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function addTranscriptLine(line) {
  const list = $('#transcriptList');
  const empty = $('#transcriptEmpty');
  if (empty) empty.style.display = 'none';
  clearInterim();

  const tmpl = $('#tmplTranscriptLine');
  const el = tmpl.content.cloneNode(true).querySelector('.transcript-line');
  el.dataset.id = line.id;
  el.querySelector('.transcript-time').textContent = formatTime(line.timestamp);

  const textEl = el.querySelector('.transcript-text');
  textEl.textContent = line.text;

  if (line.bookmarked) el.classList.add('bookmarked');
  el.querySelector('[data-action="bookmark"]').title = t('transcript.bookmark_tooltip');
  el.querySelector('[data-action="delete"]').title = t('transcript.delete_tooltip');
  el.querySelector('[data-action="bookmark"]').addEventListener('click', (e) => {
    e.stopPropagation();
    emit('transcript:bookmark', { id: line.id });
  });
  el.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
    e.stopPropagation();
    emit('transcript:delete', { id: line.id });
  });

  textEl.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    editTranscriptLine(line.id);
  });

  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showContextPopup(e, line.id);
  });

  list.appendChild(el);
  autoScroll(list);
}

export function showInterim(text) {
  const list = $('#transcriptList');
  const empty = $('#transcriptEmpty');
  if (empty) empty.style.display = 'none';

  if (!interimEl) {
    interimEl = document.createElement('div');
    interimEl.className = 'transcript-line interim';
    const timeSpan = document.createElement('span');
    timeSpan.className = 'transcript-time';
    const textSpan = document.createElement('span');
    textSpan.className = 'transcript-text';
    textSpan.style.cssText = 'color: var(--text-muted); font-style: italic;';
    interimEl.appendChild(timeSpan);
    interimEl.appendChild(textSpan);
    list.appendChild(interimEl);
  }
  interimEl.querySelector('.transcript-time').textContent = formatTime(Date.now());
  interimEl.querySelector('.transcript-text').textContent = text;
  autoScroll(list);
}

export function clearInterim() {
  if (interimEl) { interimEl.remove(); interimEl = null; }
}

export function addMemoLine(memo) {
  const list = $('#transcriptList');
  const empty = $('#transcriptEmpty');
  if (empty) empty.style.display = 'none';

  const tmpl = $('#tmplMemoLine');
  const el = tmpl.content.cloneNode(true).querySelector('.transcript-line');
  el.dataset.id = memo.id;
  el.querySelector('.transcript-time').textContent = formatTime(memo.timestamp);
  el.querySelector('.transcript-text').textContent = memo.text;

  el.querySelector('.transcript-text').addEventListener('dblclick', (e) => {
    e.stopPropagation();
    editMemoLine(memo.id);
  });

  // Memo edit/delete buttons
  const editBtn = el.querySelector('[data-action="edit-memo"]');
  const deleteBtn = el.querySelector('[data-action="delete-memo"]');

  if (editBtn) {
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      editMemoLine(memo.id);
    });
  }
  if (deleteBtn) {
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      emit('memo:delete', { id: memo.id });
    });
  }

  list.appendChild(el);
  autoScroll(list);
}

function editMemoLine(id) {
  const memo = state.memos.find(m => m.id === id);
  if (!memo) return;
  const el = document.querySelector(`.transcript-line[data-id="${id}"]`);
  if (!el) return;

  const textEl = el.querySelector('.transcript-text');
  const original = memo.text;
  textEl.contentEditable = true;
  textEl.focus();

  const finish = () => {
    textEl.contentEditable = false;
    const newText = textEl.textContent.trim();
    if (newText && newText !== original) {
      memo.text = newText;
      emit('memo:edit', { id, text: newText });
    } else {
      textEl.textContent = original;
    }
  };

  textEl.addEventListener('blur', finish, { once: true });
  textEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); textEl.blur(); }
    if (e.key === 'Escape') { textEl.textContent = original; textEl.blur(); }
  });
}

function autoScroll(container) {
  const threshold = 100;
  const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
  if (isNearBottom) container.scrollTop = container.scrollHeight;
}

function editTranscriptLine(id) {
  const line = state.transcript.find(l => l.id === id);
  if (!line) return;
  const el = document.querySelector(`.transcript-line[data-id="${id}"]`);
  if (!el) return;

  const textEl = el.querySelector('.transcript-text');
  const original = line.text;
  textEl.textContent = original; // Clear any HTML highlights for editing
  textEl.contentEditable = true;
  textEl.focus();

  const finish = () => {
    textEl.contentEditable = false;
    const newText = textEl.textContent.trim();
    if (newText && newText !== original) {
      line.text = newText;
      emit('transcript:edit', { id, text: newText, original });
    } else {
      textEl.textContent = original;
    }
  };

  textEl.addEventListener('blur', finish, { once: true });
  textEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); textEl.blur(); }
    if (e.key === 'Escape') { textEl.textContent = original; textEl.blur(); }
  });
}

function showContextPopup(e, lineId) {
  const popup = $('#contextPopup');
  popup.hidden = false;
  popup.style.left = e.clientX + 'px';
  popup.style.top = e.clientY + 'px';
  popup.dataset.lineId = lineId;

  const close = (ev) => {
    if (!popup.contains(ev.target)) {
      popup.hidden = true;
      document.removeEventListener('click', close);
    }
  };
  setTimeout(() => document.addEventListener('click', close), 0);
}

export function initContextPopup() {
  const popup = $('#contextPopup');
  popup.addEventListener('click', (e) => {
    const action = e.target.dataset.action;
    const lineId = popup.dataset.lineId;
    popup.hidden = true;

    if (action === 'editText') {
      editTranscriptLine(lineId);
    } else if (action === 'bookmark') {
      emit('transcript:bookmark', { id: lineId });
    } else if (action === 'delete') {
      emit('transcript:delete', { id: lineId });
    }
  });
}

export function updateTranscriptLineUI(id) {
  const line = state.transcript.find(l => l.id === id);
  if (!line) return;
  const el = document.querySelector(`.transcript-line[data-id="${id}"]`);
  if (!el) return;

  el.querySelector('.transcript-text').textContent = line.text;
  el.classList.toggle('bookmarked', !!line.bookmarked);
  el.classList.toggle('ai-corrected', !!line.originalText);
}

export function removeTranscriptLineUI(id) {
  const el = document.querySelector(`.transcript-line[data-id="${id}"]`);
  if (el) el.remove();
}

export function showTranscriptConnecting() {
  const placeholder = $('#transcriptEmptyPlaceholder');
  const waiting = $('#transcriptWaiting');
  if (placeholder) placeholder.style.display = 'none';
  if (waiting) {
    waiting.style.display = '';
    waiting.classList.add('connecting');
    const label = $('#transcriptWaitingLabel');
    const text = $('#transcriptWaitingText');
    const hint = $('#transcriptWaitingHint');
    if (label) label.textContent = '';
    if (text) text.textContent = t('transcript.connecting');
    if (hint) hint.textContent = t('transcript.connecting_hint');
  }
}

export function showTranscriptWaiting() {
  const placeholder = $('#transcriptEmptyPlaceholder');
  const waiting = $('#transcriptWaiting');
  if (placeholder) placeholder.style.display = 'none';
  if (waiting) {
    waiting.style.display = '';
    waiting.classList.remove('connecting');
    const label = $('#transcriptWaitingLabel');
    const text = $('#transcriptWaitingText');
    const hint = $('#transcriptWaitingHint');
    if (label) label.textContent = 'REC';
    if (text) text.textContent = t('transcript.waiting');
    if (hint) hint.textContent = t('transcript.waiting_hint');
  }
}

export function hideTranscriptWaiting() {
  const waiting = $('#transcriptWaiting');
  if (waiting) waiting.style.display = 'none';
}

export function resetTranscriptEmpty() {
  const placeholder = $('#transcriptEmptyPlaceholder');
  const waiting = $('#transcriptWaiting');
  if (placeholder) placeholder.style.display = '';
  if (waiting) waiting.style.display = 'none';
}
