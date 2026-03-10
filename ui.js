// ui.js - DOM rendering, events, drag resizer

import { state, emit, on } from './app.js';
import { t, getDateLocale } from './i18n.js';
import { loadTypoDict } from './storage.js';

const $ = (sel) => document.querySelector(sel);

let interimEl = null;

// ===== Toast System =====
export function showToast(message, type = 'success') {
  const container = $('#toastContainer');
  const tmpl = $('#tmplToast');
  const el = tmpl.content.cloneNode(true).querySelector('.toast');
  el.classList.add(type);
  el.querySelector('.toast-message').textContent = message;
  el.querySelector('.toast-close').addEventListener('click', () => removeToast(el));
  container.appendChild(el);
  setTimeout(() => removeToast(el), 4000);
}

function removeToast(el) {
  el.classList.add('toast-out');
  el.addEventListener('animationend', () => el.remove());
}

// ===== Drag Resizer =====
export function initDragResizer() {
  const main = document.querySelector('.main-content');
  document.querySelectorAll('.drag-resizer').forEach(resizer => {
    const leftId = resizer.dataset.left;
    const rightId = resizer.dataset.right;
    const leftPanel = document.getElementById(leftId);
    const rightPanel = document.getElementById(rightId);
    if (!leftPanel || !rightPanel) return;

    let isDragging = false;

    resizer.addEventListener('pointerdown', (e) => {
      isDragging = true;
      resizer.classList.add('active');
      resizer.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    resizer.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const leftRect = leftPanel.getBoundingClientRect();
      const x = e.clientX - leftRect.left;
      const minLeft = 200;
      const leftWidth = Math.max(minLeft, Math.min(x, leftRect.width + rightPanel.getBoundingClientRect().width - 200));
      const rightWidth = leftRect.width + rightPanel.getBoundingClientRect().width - leftWidth;
      leftPanel.style.flex = `0 0 ${leftWidth}px`;
      rightPanel.style.flex = `0 0 ${rightWidth}px`;
    });

    resizer.addEventListener('pointerup', () => {
      isDragging = false;
      resizer.classList.remove('active');
    });
  });
}

// ===== Mobile Panel Tabs =====
export function initPanelTabs() {
  const tabs = document.querySelectorAll('.panel-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const panelName = tab.dataset.panel;
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('panel-active'));
      const targetPanel = panelName === 'left' ? $('#panelLeft')
        : panelName === 'center' ? $('#panelCenter')
        : $('#panelRight');
      if (targetPanel) targetPanel.classList.add('panel-active');
    });
  });
}

// ===== Typo Dictionary =====
let typoDict = {};

export function refreshTypoDict() {
  typoDict = loadTypoDict();
}

export function applyTypoCorrections(text) {
  if (!typoDict || Object.keys(typoDict).length === 0) return { text, corrections: [] };
  let corrected = text;
  const corrections = [];
  for (const [before, after] of Object.entries(typoDict)) {
    if (corrected.includes(before)) {
      corrected = corrected.split(before).join(after);
      corrections.push({ before, after });
    }
  }
  return { text: corrected, corrections };
}

// Render text with typo highlights (returns HTML string)
function renderTextWithTypoHighlights(text, corrections) {
  if (!corrections || corrections.length === 0) return escapeHtml(text);
  let html = escapeHtml(text);
  for (const { before, after } of corrections) {
    const escaped = escapeHtml(after);
    html = html.split(escaped).join(
      `<span class="typo-corrected" data-original="${escapeHtml(before)}">${escaped}</span>`
    );
  }
  return html;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===== Transcript Rendering =====
function formatTime(timestamp) {
  if (!state.meetingStartTime) return '00:00';
  const diff = timestamp - state.meetingStartTime;
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function addTranscriptLine(line, corrections) {
  const list = $('#transcriptList');
  const empty = $('#transcriptEmpty');
  if (empty) empty.style.display = 'none';
  clearInterim();

  const tmpl = $('#tmplTranscriptLine');
  const el = tmpl.content.cloneNode(true).querySelector('.transcript-line');
  el.dataset.id = line.id;
  el.querySelector('.transcript-time').textContent = formatTime(line.timestamp);

  const textEl = el.querySelector('.transcript-text');
  if (corrections && corrections.length > 0) {
    textEl.innerHTML = renderTextWithTypoHighlights(line.text, corrections);
  } else {
    textEl.textContent = line.text;
  }

  if (line.bookmarked) el.classList.add('bookmarked');

  el.querySelector('[data-action="bookmark"]').title = t('transcript.bookmark_tooltip');
  el.querySelector('[data-action="edit"]').title = t('transcript.edit_tooltip');
  el.querySelector('[data-action="bookmark"]').addEventListener('click', (e) => {
    e.stopPropagation();
    emit('transcript:bookmark', { id: line.id });
  });
  el.querySelector('[data-action="edit"]').addEventListener('click', (e) => {
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
    interimEl.innerHTML = `
      <span class="transcript-time"></span>
      <span class="transcript-text" style="color: var(--text-muted); font-style: italic;"></span>
    `;
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

// ===== Transcript Editing =====
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

// ===== Context Popup =====
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
}

export function removeTranscriptLineUI(id) {
  const el = document.querySelector(`.transcript-line[data-id="${id}"]`);
  if (el) el.remove();
}

// ===== AI Sections =====
function getSectionConfig() {
  return [
    { key: 'summary', icon: '\u{1F4DD}', title: t('card.summary') },
    { key: 'context', icon: '\u{1F4AC}', title: t('card.context') },
    { key: 'openQuestions', icon: '\u{2753}', title: t('card.openQuestions') },
    { key: 'actionItems', icon: '\u{2705}', title: t('card.actionItems') },
    { key: 'suggestions', icon: '\u{1F4A1}', title: t('card.suggestions') },
  ];
}

export function showAnalysisSkeletons() {
  const container = $('#aiSections');
  const empty = $('#aiEmpty');
  if (empty) empty.style.display = 'none';
  container.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const tmpl = $('#tmplSkeletonSection');
    container.appendChild(tmpl.content.cloneNode(true));
  }
}

export function renderAnalysis(analysis) {
  const container = $('#aiSections');
  const empty = $('#aiEmpty');
  if (empty) empty.style.display = 'none';
  container.innerHTML = '';

  getSectionConfig().forEach(({ key, icon, title }) => {
    const tmpl = $('#tmplAiSection');
    const section = tmpl.content.cloneNode(true).querySelector('.ai-section');
    section.dataset.section = key;
    section.querySelector('.ai-section-icon').textContent = icon;
    section.querySelector('.ai-section-label').textContent = title;
    const body = section.querySelector('.ai-section-body');

    if (Array.isArray(analysis[key])) {
      if (analysis[key].length === 0) {
        body.textContent = t('card.no_items');
      } else {
        const ul = document.createElement('ul');
        analysis[key].forEach(item => {
          const li = document.createElement('li');
          li.textContent = item;
          ul.appendChild(li);
        });
        body.appendChild(ul);
      }
    } else {
      body.textContent = analysis[key] || t('card.no_data');
    }

    container.appendChild(section);
  });
}

// ===== Highlights =====
export function renderHighlights(filter = 'all') {
  const list = $('#highlightsList');
  list.innerHTML = '';
  let items = [];
  if (filter === 'all' || filter === 'bookmarks') {
    state.transcript.filter(l => l.bookmarked).forEach(l => items.push({ ...l, type: 'bookmark' }));
  }
  if (filter === 'all' || filter === 'memos') {
    state.memos.forEach(m => items.push({ ...m, type: 'memo' }));
  }
  items.sort((a, b) => a.timestamp - b.timestamp);

  if (items.length === 0) {
    list.innerHTML = `<p class="text-muted" style="text-align:center;padding:20px;">${t('highlights.empty')}</p>`;
    return;
  }

  items.forEach(item => {
    const div = document.createElement('div');
    div.className = 'transcript-line' + (item.type === 'memo' ? ' memo-line' : ' bookmarked');
    div.innerHTML = `
      <span class="transcript-time">${formatTime(item.timestamp)}</span>
      ${item.type === 'memo'
        ? `<span class="memo-badge">MEMO</span>`
        : ``
      }
      <span class="transcript-text${item.type === 'memo' ? ' memo-text' : ''}">${item.text}</span>
    `;
    list.appendChild(div);
  });
}

// ===== Analysis History =====
export function renderAnalysisHistory() {
  const timeline = $('#analysisTimeline');
  timeline.innerHTML = '';
  if (state.analysisHistory.length === 0) {
    timeline.innerHTML = `<p class="text-muted" style="text-align:center;padding:20px;">${t('analysis_history.empty')}</p>`;
    return;
  }
  state.analysisHistory.forEach((analysis, idx) => {
    const item = document.createElement('div');
    item.className = 'analysis-timeline-item';
    const time = new Date(analysis.timestamp).toLocaleTimeString(getDateLocale());
    item.innerHTML = `
      <div class="analysis-timeline-time">#${idx + 1} - ${time}</div>
      <div><strong>${t('card.summary')}:</strong> ${analysis.summary || 'N/A'}</div>
      ${analysis.actionItems?.length ? `<div><strong>${t('card.actionItems')}:</strong><ul>${analysis.actionItems.map(i => `<li>${i}</li>`).join('')}</ul></div>` : ''}
    `;
    timeline.appendChild(item);
  });
}

// ===== History (with tags) =====
export function renderHistoryGrid(meetings, { searchTerm = '', filterType = '', filterTag = '', filterCategory = '', filterRating = '', dateFrom = '', dateTo = '' } = {}) {
  const grid = $('#historyGrid');
  grid.innerHTML = '';
  let filtered = meetings;

  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    filtered = meetings.filter(m => {
      if ((m.title || '').toLowerCase().includes(term)) return true;
      if ((m.preset || '').toLowerCase().includes(term)) return true;
      if ((m.location || '').toLowerCase().includes(term)) return true;
      if (m.transcript?.some(l => l.text?.toLowerCase().includes(term))) return true;
      const lastAnalysis = m.analysisHistory?.[m.analysisHistory.length - 1];
      if (lastAnalysis?.summary?.toLowerCase().includes(term)) return true;
      if (m.chatHistory?.some(c => c.text?.toLowerCase().includes(term))) return true;
      if (m.tags?.some(tag => tag.toLowerCase().includes(term))) return true;
      return false;
    });
  }

  if (filterType) filtered = filtered.filter(m => m.preset === filterType);
  if (filterTag) {
    const tag = filterTag.toLowerCase();
    filtered = filtered.filter(m => m.tags?.some(t => t.toLowerCase().includes(tag)));
  }
  if (filterCategory) {
    filtered = filtered.filter(m => m.categories?.includes(filterCategory));
  }
  if (filterRating) {
    const minRating = parseInt(filterRating);
    filtered = filtered.filter(m => (m.starRating || 0) >= minRating);
  }
  if (dateFrom) {
    const from = new Date(dateFrom).getTime();
    filtered = filtered.filter(m => (m.createdAt || 0) >= from);
  }
  if (dateTo) {
    const to = new Date(dateTo).getTime() + 86400000;
    filtered = filtered.filter(m => (m.createdAt || 0) <= to);
  }

  if (filtered.length === 0) {
    grid.innerHTML = `<p class="text-muted" style="text-align:center;padding:20px;">${t('history.no_meetings')}</p>`;
    return;
  }

  filtered.forEach(meeting => {
    const tmpl = $('#tmplHistoryCard');
    const card = tmpl.content.cloneNode(true).querySelector('.history-card');
    card.dataset.meetingId = meeting.id;
    card.querySelector('.history-card-title').textContent = meeting.title || t('history.untitled');
    card.querySelector('.history-card-date').textContent = new Date(meeting.createdAt).toLocaleDateString(getDateLocale());
    card.querySelector('.history-card-type').textContent = meeting.preset || t('settings.preset_general');
    card.querySelector('.history-card-duration').textContent = meeting.duration || '';
    card.querySelector('.history-card-location').textContent = meeting.location || '';

    // Star rating in meta
    if (meeting.starRating) {
      const ratingEl = document.createElement('span');
      ratingEl.className = 'history-card-rating';
      ratingEl.textContent = '\u2605'.repeat(meeting.starRating);
      card.querySelector('.history-card-meta').appendChild(ratingEl);
    }

    // Participants count
    if (meeting.participants && meeting.participants.length > 0) {
      const pEl = document.createElement('span');
      pEl.className = 'history-card-participants-count';
      pEl.textContent = `\u{1F465} ${meeting.participants.length}`;
      card.querySelector('.history-card-meta').appendChild(pEl);
    }

    // Categories
    if (meeting.categories && meeting.categories.length > 0) {
      const catContainer = document.createElement('div');
      catContainer.className = 'history-card-categories';
      meeting.categories.forEach(cat => {
        const catEl = document.createElement('span');
        catEl.className = 'history-card-category';
        catEl.textContent = cat;
        catContainer.appendChild(catEl);
      });
      card.querySelector('.history-card-meta').after(catContainer);
    }

    // Tags
    const tagsContainer = card.querySelector('.history-card-tags');
    if (meeting.tags && meeting.tags.length > 0) {
      meeting.tags.forEach(tag => {
        const tagEl = document.createElement('span');
        tagEl.className = 'history-tag';
        tagEl.innerHTML = `${tag}<button class="history-tag-remove" data-tag="${tag}">&times;</button>`;
        tagEl.querySelector('.history-tag-remove').addEventListener('click', (e) => {
          e.stopPropagation();
          emit('meeting:removeTag', { id: meeting.id, tag });
        });
        tagsContainer.appendChild(tagEl);
      });
    }
    // Add tag button
    const addTagBtn = document.createElement('button');
    addTagBtn.className = 'history-tag-add';
    addTagBtn.textContent = '+ tag';
    addTagBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tag = prompt('Enter tag:');
      if (tag) emit('meeting:addTag', { id: meeting.id, tag: tag.trim() });
    });
    tagsContainer.appendChild(addTagBtn);

    const lastAnalysis = meeting.analysisHistory?.[meeting.analysisHistory.length - 1];
    const summaryEl = card.querySelector('.history-card-summary');
    if (lastAnalysis?.summary) {
      summaryEl.textContent = lastAnalysis.summary.slice(0, 100) + (lastAnalysis.summary.length > 100 ? '...' : '');
    }

    card.querySelector('[data-action="view"]').addEventListener('click', (e) => {
      e.stopPropagation();
      emit('meeting:view', { id: meeting.id });
    });
    card.querySelector('[data-action="export"]').addEventListener('click', (e) => {
      e.stopPropagation();
      emit('meeting:export', { id: meeting.id });
    });
    card.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
      e.stopPropagation();
      emit('meeting:delete', { id: meeting.id });
    });

    // Card click → open viewer
    card.addEventListener('click', () => {
      emit('meeting:view', { id: meeting.id });
    });

    grid.appendChild(card);
  });
}

// ===== Meeting Viewer =====
export function renderMeetingViewer(meeting) {
  const transcriptContainer = $('#viewerTranscript');
  const timelineContainer = $('#viewerTimeline');
  const analysisContainer = $('#viewerAnalysis');
  const metaContainer = $('#viewerMeta');
  $('#viewerTitle').textContent = meeting.title || t('viewer.title');

  // Render metadata
  metaContainer.innerHTML = '';
  const metaItems = [
    { label: 'Date', value: new Date(meeting.startTime || meeting.createdAt).toLocaleString(getDateLocale()) },
    { label: 'Duration', value: meeting.duration || '' },
    { label: 'Type', value: meeting.preset || 'General' },
    { label: 'Location', value: meeting.location || '' },
  ];
  if (meeting.meetingContext) {
    metaItems.push({ label: 'Context', value: meeting.meetingContext.slice(0, 100) + (meeting.meetingContext.length > 100 ? '...' : '') });
  }
  if (meeting.tags && meeting.tags.length > 0) {
    metaItems.push({ label: 'Tags', value: meeting.tags.join(', ') });
  }
  metaItems.forEach(({ label, value }) => {
    if (!value) return;
    const item = document.createElement('div');
    item.className = 'viewer-meta-item';
    item.innerHTML = `<span class="viewer-meta-label">${label}:</span> ${value}`;
    metaContainer.appendChild(item);
  });

  const transcript = meeting.transcript || [];
  const analyses = meeting.analysisHistory || [];

  // Render transcript with data-index
  transcriptContainer.innerHTML = '';
  transcript.forEach((line, idx) => {
    const div = document.createElement('div');
    div.className = 'transcript-line' + (line.bookmarked ? ' bookmarked' : '');
    div.dataset.index = idx;
    div.innerHTML = `
      <span class="transcript-time" style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);min-width:48px;">${formatTimeFromMs(line.timestamp - (meeting.startTime || 0))}</span>
      <span class="transcript-text">${line.text}</span>
    `;
    transcriptContainer.appendChild(div);
  });

  // Render timeline markers
  timelineContainer.innerHTML = '';
  if (analyses.length > 0) {
    const line = document.createElement('div');
    line.className = 'timeline-line';
    timelineContainer.appendChild(line);

    analyses.forEach((analysis, idx) => {
      const marker = document.createElement('div');
      marker.className = 'timeline-marker';
      marker.title = `#${idx + 1} - ${new Date(analysis.timestamp).toLocaleTimeString(getDateLocale())}`;
      marker.dataset.analysisIdx = idx;

      // Position marker proportionally based on transcriptLength
      const tLen = analysis.transcriptLength || 0;
      const pct = transcript.length > 0 ? Math.min((tLen / transcript.length) * 100, 100) : ((idx + 1) / analyses.length) * 100;
      marker.style.top = `${pct}%`;

      marker.addEventListener('click', () => {
        renderViewerAnalysis(analysisContainer, analysis);
        timelineContainer.querySelectorAll('.timeline-marker').forEach(m => m.classList.remove('active'));
        marker.classList.add('active');
        // Scroll transcript to the corresponding position
        if (tLen > 0) {
          const targetLine = transcriptContainer.querySelector(`[data-index="${Math.max(0, tLen - 1)}"]`);
          if (targetLine) targetLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });

      timelineContainer.appendChild(marker);
    });
  }

  // Render initial analysis (last one)
  const lastAnalysis = analyses[analyses.length - 1];
  if (lastAnalysis) {
    renderViewerAnalysis(analysisContainer, lastAnalysis);
    // Mark last marker as active
    const lastMarker = timelineContainer.querySelector('.timeline-marker:last-of-type');
    if (lastMarker) lastMarker.classList.add('active');
  } else {
    analysisContainer.innerHTML = `<p class="text-muted">${t('viewer.no_analysis')}</p>`;
  }

  // Scroll sync: transcript scroll → find matching analysis
  transcriptContainer.addEventListener('scroll', () => {
    if (analyses.length === 0) return;
    const scrollTop = transcriptContainer.scrollTop;
    const scrollHeight = transcriptContainer.scrollHeight - transcriptContainer.clientHeight;
    if (scrollHeight <= 0) return;

    // Find visible transcript line index
    const lines = transcriptContainer.querySelectorAll('.transcript-line[data-index]');
    let visibleIdx = 0;
    for (const line of lines) {
      if (line.offsetTop >= scrollTop) {
        visibleIdx = parseInt(line.dataset.index) || 0;
        break;
      }
    }

    // Find the analysis that covers this transcript position
    let matchIdx = 0;
    for (let i = 0; i < analyses.length; i++) {
      const tLen = analyses[i].transcriptLength;
      if (tLen != null && visibleIdx < tLen) {
        matchIdx = i;
        break;
      }
      matchIdx = i;
    }

    const markers = timelineContainer.querySelectorAll('.timeline-marker');
    const activeMarker = timelineContainer.querySelector('.timeline-marker.active');
    const newActive = markers[matchIdx];
    if (newActive && newActive !== activeMarker) {
      markers.forEach(m => m.classList.remove('active'));
      newActive.classList.add('active');
      renderViewerAnalysis(analysisContainer, analyses[matchIdx]);
    }
  });
}

function renderViewerAnalysis(container, analysis) {
  container.innerHTML = '';
  getSectionConfig().forEach(({ key, icon, title }) => {
    const section = document.createElement('div');
    section.className = 'ai-section';
    const content = analysis[key];
    let bodyHtml = '';
    if (Array.isArray(content)) {
      bodyHtml = content.length > 0
        ? '<ul>' + content.map(i => `<li>${i}</li>`).join('') + '</ul>'
        : t('card.no_items');
    } else if (typeof content === 'object' && content) {
      bodyHtml = Object.entries(content).map(([k, v]) => `${k}: ${v}`).join('<br>');
    } else {
      bodyHtml = content || t('card.no_data');
    }
    section.innerHTML = `
      <h3 class="ai-section-title"><span class="ai-section-icon">${icon}</span><span class="ai-section-label">${title}</span></h3>
      <div class="ai-section-body">${bodyHtml}</div>
    `;
    container.appendChild(section);
  });
}

function formatTimeFromMs(ms) {
  if (ms < 0) ms = 0;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// ===== Modal Helpers =====
export function initModals() {
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.dataset.close;
      if (modalId) document.getElementById(modalId).hidden = true;
    });
  });
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.hidden = true;
    });
  });
}

// ===== Theme =====
export function toggleTheme() {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  state.settings.theme = next;
  emit('theme:change', { theme: next });
}

// ===== Keyboard Shortcuts =====
export function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay:not([hidden])').forEach(m => m.hidden = true);
      $('#contextPopup').hidden = true;
      const settingsPanel = $('#settingsPanel');
      if (settingsPanel.classList.contains('open')) emit('settings:close');
      return;
    }

    // Ignore shortcuts when typing in inputs
    if (e.target.matches('input, textarea, [contenteditable]')) return;

    if (e.ctrlKey && e.key === 'r') {
      e.preventDefault();
      emit('recording:toggle');
    } else if (e.ctrlKey && e.key === 'm') {
      e.preventDefault();
      $('#memoInput').focus();
    } else if (e.ctrlKey && e.key === 'b') {
      e.preventDefault();
      const last = state.transcript[state.transcript.length - 1];
      if (last) emit('transcript:bookmark', { id: last.id });
    } else if (e.ctrlKey && e.key === 't') {
      e.preventDefault();
      toggleTheme();
    }
  });
}

// ===== Transcript Waiting State =====
export function showTranscriptWaiting() {
  const quickStart = $('#quickStartSection');
  const waiting = $('#transcriptWaiting');
  if (quickStart) quickStart.style.display = 'none';
  if (waiting) waiting.style.display = '';
}

export function hideTranscriptWaiting() {
  const waiting = $('#transcriptWaiting');
  if (waiting) waiting.style.display = 'none';
}

export function resetTranscriptEmpty() {
  const quickStart = $('#quickStartSection');
  const waiting = $('#transcriptWaiting');
  if (quickStart) quickStart.style.display = '';
  if (waiting) waiting.style.display = 'none';
}

// ===== AI Analysis Waiting State =====
export function showAiWaiting(intervalSec) {
  const aiEmpty = $('#aiEmpty');
  if (!aiEmpty) return;
  // Hide existing empty text
  const texts = aiEmpty.querySelectorAll(':scope > p');
  texts.forEach(p => p.style.display = 'none');
  const waiting = $('#aiWaiting');
  if (waiting) {
    waiting.style.display = '';
    const hint = $('#aiWaitingHint');
    if (hint) hint.textContent = t('ai.waiting_hint', { n: intervalSec });
  }
}

export function hideAiWaiting() {
  const waiting = $('#aiWaiting');
  if (waiting) waiting.style.display = 'none';
}

export function resetAiEmpty() {
  const aiEmpty = $('#aiEmpty');
  if (!aiEmpty) return;
  const texts = aiEmpty.querySelectorAll(':scope > p');
  texts.forEach(p => p.style.display = '');
  hideAiWaiting();
}

// Animate the SVG ring over the given duration (ms)
export function startAiWaitingRing(durationMs) {
  const ring = $('#aiWaitingRing');
  if (!ring) return;
  // Reset to full offset (empty ring)
  ring.style.transition = 'none';
  ring.style.strokeDashoffset = '97.4';
  // Force reflow
  ring.getBoundingClientRect();
  // Animate to 0 (full ring)
  ring.style.transition = `stroke-dashoffset ${durationMs}ms linear`;
  ring.style.strokeDashoffset = '0';
}

export function resetAiWaitingRing() {
  const ring = $('#aiWaitingRing');
  if (!ring) return;
  ring.style.transition = 'none';
  ring.style.strokeDashoffset = '97.4';
}

// ===== Chat Waiting State =====
export function showChatWaiting() {
  const chatEmpty = $('#chatEmpty');
  if (!chatEmpty) return;
  // Hide existing empty text
  const texts = chatEmpty.querySelectorAll(':scope > p');
  texts.forEach(p => p.style.display = 'none');
  const waiting = $('#chatWaiting');
  if (waiting) waiting.style.display = '';

  // Render suggestion chips
  const container = $('#chatSuggestions');
  if (container) {
    container.innerHTML = '';
    const suggestions = [
      t('chat.suggestion_1'),
      t('chat.suggestion_2'),
      t('chat.suggestion_3'),
    ];
    suggestions.forEach(text => {
      const chip = document.createElement('button');
      chip.className = 'chat-suggestion-chip';
      chip.textContent = text;
      chip.addEventListener('click', () => {
        const input = $('#chatInput');
        if (input) {
          input.value = text;
          input.focus();
        }
      });
      container.appendChild(chip);
    });
  }
}

export function resetChatEmpty() {
  const chatEmpty = $('#chatEmpty');
  if (!chatEmpty) return;
  const texts = chatEmpty.querySelectorAll(':scope > p');
  texts.forEach(p => p.style.display = '');
  const waiting = $('#chatWaiting');
  if (waiting) waiting.style.display = 'none';
}

