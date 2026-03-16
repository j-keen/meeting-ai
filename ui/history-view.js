// ui/history-view.js - History grid and meeting viewer
// NOTE: innerHTML usage is intentional for rendering trusted application-generated content,
// matching the original ui.js implementation.

import { state, emit } from '../event-bus.js';
import { t, getDateLocale } from '../i18n.js';
import { renderMarkdown } from '../chat.js';

const $ = (sel) => document.querySelector(sel);

let viewerAbortController = null;
let viewerMeetingList = [];
let viewerCurrentIndex = -1;

function getSectionConfig() {
  return [
    { key: 'summary', icon: '\u{1F4DD}', title: t('card.summary') },
    { key: 'context', icon: '\u{1F4AC}', title: t('card.context') },
    { key: 'openQuestions', icon: '\u{2753}', title: t('card.openQuestions') },
    { key: 'actionItems', icon: '\u{2705}', title: t('card.actionItems') },
    { key: 'suggestions', icon: '\u{1F4A1}', title: t('card.suggestions') },
  ];
}

// Check if analysis uses the new markdown format
function isMarkdownAnalysis(analysis) {
  return !!(analysis && analysis.markdown);
}

// Parse markdown into blocks for block-level editing
function parseMarkdownBlocks(markdown) {
  const lines = markdown.split('\n');
  const blocks = [];
  let currentBlock = null;

  const flushBlock = () => {
    if (currentBlock) {
      currentBlock.raw = currentBlock.raw.replace(/\n+$/, '');
      if (currentBlock.raw) blocks.push(currentBlock);
      currentBlock = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block
    if (line.startsWith('```')) {
      flushBlock();
      let codeRaw = line + '\n';
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeRaw += lines[i] + '\n';
        i++;
      }
      if (i < lines.length) codeRaw += lines[i];
      blocks.push({ type: 'code', raw: codeRaw });
      continue;
    }

    // Heading
    if (/^#{2,4}\s/.test(line)) {
      flushBlock();
      blocks.push({ type: 'heading', raw: line });
      continue;
    }

    // List item (unordered or ordered)
    if (/^[-*]\s/.test(line) || /^\d+\.\s/.test(line)) {
      const isOrdered = /^\d+\.\s/.test(line);
      const listType = isOrdered ? 'ol' : 'ul';
      if (currentBlock && currentBlock.type === listType) {
        currentBlock.raw += '\n' + line;
      } else {
        flushBlock();
        currentBlock = { type: listType, raw: line };
      }
      continue;
    }

    // Empty line
    if (!line.trim()) {
      flushBlock();
      continue;
    }

    // Paragraph (merge consecutive non-empty lines)
    if (currentBlock && currentBlock.type === 'paragraph') {
      currentBlock.raw += '\n' + line;
    } else {
      flushBlock();
      currentBlock = { type: 'paragraph', raw: line };
    }
  }
  flushBlock();
  return blocks;
}

// Render markdown analysis with block-level editing support (read-only for viewer)
function renderMarkdownAnalysis(container, analysis) {
  container.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'ai-markdown-content';

  const blocks = parseMarkdownBlocks(analysis.markdown);

  blocks.forEach((block, index) => {
    const blockEl = document.createElement('div');
    blockEl.className = 'ai-block';
    blockEl.dataset.blockIndex = index;
    blockEl.innerHTML = renderMarkdown(block.raw);
    div.appendChild(blockEl);
  });

  container.appendChild(div);
}

export function scrollToTranscriptLine(id) {
  const el = document.querySelector(`#transcriptList .transcript-line[data-id="${id}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('inbox-flash');
  el.addEventListener('animationend', () => el.classList.remove('inbox-flash'), { once: true });
}

export function renderInboxPreview() {
  const container = $('#inboxPreviewItems');
  container.innerHTML = '';
  let items = [];
  state.transcript.filter(l => l.bookmarked).forEach(l => items.push({ ...l, type: 'bookmark' }));
  state.memos.forEach(m => items.push({ ...m, type: 'memo' }));
  items.sort((a, b) => b.timestamp - a.timestamp);
  items = items.slice(0, 3);

  if (items.length === 0) return false;

  items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'inbox-preview-item';

    const icon = document.createElement('span');
    icon.className = 'inbox-preview-icon';
    icon.textContent = item.type === 'memo' ? '📝' : '🔖';
    row.appendChild(icon);

    const text = document.createElement('span');
    text.className = 'inbox-preview-text';
    text.textContent = item.text.length > 40 ? item.text.slice(0, 40) + '...' : item.text;
    row.appendChild(text);

    const time = document.createElement('span');
    time.className = 'inbox-preview-time';
    time.textContent = formatTime(item.timestamp);
    row.appendChild(time);

    row.addEventListener('click', () => {
      $('#inboxPreviewDropdown').hidden = true;
      scrollToTranscriptLine(item.id);
    });

    container.appendChild(row);
  });

  return true;
}

export function renderHighlights(filter = 'all', searchTerm = '') {
  const list = $('#highlightsList');
  list.innerHTML = '';
  const countEl = $('#inboxSearchCount');
  let items = [];
  if (filter === 'all' || filter === 'bookmarks') {
    state.transcript.filter(l => l.bookmarked).forEach(l => items.push({ ...l, type: 'bookmark' }));
  }
  if (filter === 'all' || filter === 'memos') {
    state.memos.forEach(m => items.push({ ...m, type: 'memo' }));
  }
  items.sort((a, b) => a.timestamp - b.timestamp);

  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    items = items.filter(item => item.text.toLowerCase().includes(term));
  }

  if (countEl) {
    if (items.length === 0 && searchTerm) {
      countEl.textContent = t('highlights.no_results');
    } else if (items.length > 0) {
      countEl.textContent = t('highlights.item_count', { n: items.length });
    } else {
      countEl.textContent = '';
    }
  }

  if (items.length === 0 && !searchTerm) {
    const guide = document.createElement('div');
    guide.className = 'inbox-empty-guide';
    guide.innerHTML = `
      <div class="inbox-empty-icon">📥</div>
      <div class="inbox-empty-title">${t('highlights.empty')}</div>
      <div class="inbox-empty-desc">${t('highlights.empty_guide')}</div>
      <div class="inbox-shortcut-list">
        <span class="inbox-shortcut-item"><kbd>Ctrl+B</kbd> ${t('highlights.bookmarks')}</span>
        <span class="inbox-shortcut-item"><kbd>Ctrl+M</kbd> ${t('highlights.memos')}</span>
      </div>
    `;
    list.appendChild(guide);
    return;
  }

  if (items.length === 0 && searchTerm) {
    const noResults = document.createElement('div');
    noResults.className = 'inbox-empty-guide';
    noResults.style.padding = '20px';
    const noResText = document.createElement('div');
    noResText.className = 'inbox-empty-title';
    noResText.textContent = t('highlights.no_results');
    noResults.appendChild(noResText);
    list.appendChild(noResults);
    return;
  }

  items.forEach(item => {
    const div = document.createElement('div');
    div.className = 'transcript-line' + (item.type === 'memo' ? ' memo-line' : ' bookmarked');

    const timeSpan = document.createElement('span');
    timeSpan.className = 'transcript-time';
    timeSpan.textContent = formatTime(item.timestamp);
    div.appendChild(timeSpan);

    if (item.type === 'memo') {
      const badge = document.createElement('span');
      badge.className = 'memo-badge';
      badge.textContent = t('viewer.memo_badge');
      div.appendChild(badge);
    }

    const textSpan = document.createElement('span');
    textSpan.className = 'transcript-text' + (item.type === 'memo' ? ' memo-text' : '');
    textSpan.textContent = item.text;
    div.appendChild(textSpan);

    const jumpBtn = document.createElement('button');
    jumpBtn.className = 'inbox-jump-btn';
    jumpBtn.textContent = '📍';
    jumpBtn.title = t('highlights.jump');
    jumpBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      $('#highlightsModal').hidden = true;
      scrollToTranscriptLine(item.id);
    });
    div.appendChild(jumpBtn);

    list.appendChild(div);
  });
}

function formatTime(timestamp) {
  if (!state.meetingStartTime) return '00:00';
  const diff = timestamp - state.meetingStartTime;
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatTimeFromMs(ms) {
  if (ms < 0) ms = 0;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function renderHistoryGrid(meetings, { searchTerm = '', filterType = '', filterTag = '', filterRating = '', dateFrom = '', dateTo = '' } = {}) {
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

  // Store filtered list for viewer navigation
  viewerMeetingList = filtered.map(m => m.id);

  if (filtered.length === 0) {
    const p = document.createElement('p');
    p.className = 'text-muted';
    p.style.cssText = 'text-align:center;padding:20px;';
    p.textContent = t('history.no_meetings');
    grid.appendChild(p);
    return;
  }

  filtered.forEach(meeting => {
    const tmpl = $('#tmplHistoryCard');
    const card = tmpl.content.cloneNode(true).querySelector('.history-card');
    card.dataset.meetingId = meeting.id;
    card.querySelector('.history-card-title').textContent = meeting.title || t('history.untitled');
    card.querySelector('.history-card-date').textContent = new Date(meeting.createdAt).toLocaleDateString(getDateLocale());
    card.querySelector('.history-card-type').textContent = meeting.preset || t('settings.preset_copilot');
    card.querySelector('.history-card-duration').textContent = meeting.duration || '';
    card.querySelector('.history-card-location').textContent = meeting.location || '';

    // Interrupted badge
    if (meeting.interrupted) {
      const badge = document.createElement('span');
      badge.className = 'history-card-interrupted';
      badge.textContent = t('history.interrupted');
      card.querySelector('.history-card-meta').appendChild(badge);
    }

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

        const tagText = document.createTextNode(tag);
        tagEl.appendChild(tagText);

        const removeBtn = document.createElement('button');
        removeBtn.className = 'history-tag-remove';
        removeBtn.dataset.tag = tag;
        removeBtn.textContent = '\u00D7';
        removeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          emit('meeting:removeTag', { id: meeting.id, tag });
        });
        tagEl.appendChild(removeBtn);

        tagsContainer.appendChild(tagEl);
      });
    }
    // Add tag button
    const addTagBtn = document.createElement('button');
    addTagBtn.className = 'history-tag-add';
    addTagBtn.textContent = t('history.add_tag');
    addTagBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tag = prompt(t('history.enter_tag'));
      if (tag) emit('meeting:addTag', { id: meeting.id, tag: tag.trim() });
    });
    tagsContainer.appendChild(addTagBtn);

    // Apply i18n to template-cloned buttons
    card.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });

    const lastAnalysis = meeting.analysisHistory?.[meeting.analysisHistory.length - 1];
    const summaryEl = card.querySelector('.history-card-summary');
    if (lastAnalysis?.summary) {
      summaryEl.textContent = lastAnalysis.summary.slice(0, 100) + (lastAnalysis.summary.length > 100 ? '...' : '');
    }

    card.querySelector('[data-action="load"]').addEventListener('click', (e) => {
      e.stopPropagation();
      emit('meeting:load', { id: meeting.id });
    });
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

    // Card click -> open viewer
    card.addEventListener('click', () => {
      emit('meeting:view', { id: meeting.id });
    });

    grid.appendChild(card);
  });
}

export function renderMeetingViewer(meeting) {
  // Abort previous listeners
  if (viewerAbortController) viewerAbortController.abort();
  viewerAbortController = new AbortController();

  const transcriptContainer = $('#viewerTranscript');
  const timelineContainer = $('#viewerTimeline');
  const analysisContainer = $('#viewerAnalysis');
  const metaContainer = $('#viewerMeta');
  $('#viewerTitle').textContent = meeting.title || t('viewer.title');

  // Render badges (date + type)
  const badgesEl = $('#viewerBadges');
  if (badgesEl) {
    badgesEl.innerHTML = '';
    const dateBadge = document.createElement('span');
    dateBadge.className = 'viewer-badge viewer-badge-date';
    dateBadge.textContent = new Date(meeting.startTime || meeting.createdAt).toLocaleDateString(getDateLocale());
    badgesEl.appendChild(dateBadge);

    const typeBadge = document.createElement('span');
    typeBadge.className = 'viewer-badge viewer-badge-type';
    typeBadge.textContent = meeting.preset || t('settings.preset_copilot');
    badgesEl.appendChild(typeBadge);
  }

  // Navigation (prev/next)
  viewerCurrentIndex = viewerMeetingList.indexOf(meeting.id);
  const btnPrev = $('#btnViewerPrev');
  const btnNext = $('#btnViewerNext');
  if (btnPrev) {
    btnPrev.disabled = viewerCurrentIndex <= 0;
    btnPrev.title = t('viewer.prev');
    btnPrev.onclick = () => {
      if (viewerCurrentIndex > 0) {
        emit('meeting:view', { id: viewerMeetingList[viewerCurrentIndex - 1] });
      }
    };
  }
  if (btnNext) {
    btnNext.disabled = viewerCurrentIndex < 0 || viewerCurrentIndex >= viewerMeetingList.length - 1;
    btnNext.title = t('viewer.next');
    btnNext.onclick = () => {
      if (viewerCurrentIndex < viewerMeetingList.length - 1) {
        emit('meeting:view', { id: viewerMeetingList[viewerCurrentIndex + 1] });
      }
    };
  }

  // Back to list button
  const btnBack = $('#btnViewerBack');
  if (btnBack) {
    btnBack.textContent = t('viewer.back_to_list');
    btnBack.onclick = () => {
      $('#viewerModal').hidden = true;
      $('#historyModal').hidden = false;
    };
  }

  // Keyboard: ArrowLeft/Right for navigation
  document.addEventListener('keydown', (e) => {
    if ($('#viewerModal').hidden) return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    if (e.key === 'ArrowLeft' && viewerCurrentIndex > 0) {
      emit('meeting:view', { id: viewerMeetingList[viewerCurrentIndex - 1] });
    } else if (e.key === 'ArrowRight' && viewerCurrentIndex < viewerMeetingList.length - 1) {
      emit('meeting:view', { id: viewerMeetingList[viewerCurrentIndex + 1] });
    }
  }, { signal: viewerAbortController.signal });

  // Render metadata
  metaContainer.innerHTML = '';
  const metaItems = [
    { label: t('viewer.meta_date'), value: new Date(meeting.startTime || meeting.createdAt).toLocaleString(getDateLocale()) },
    { label: t('viewer.meta_duration'), value: meeting.duration || '' },
    { label: t('viewer.meta_type'), value: meeting.preset || t('settings.preset_copilot') },
    { label: t('viewer.meta_location'), value: meeting.location || '' },
  ];
  if (meeting.meetingContext) {
    metaItems.push({ label: t('viewer.meta_context'), value: meeting.meetingContext.slice(0, 100) + (meeting.meetingContext.length > 100 ? '...' : '') });
  }
  if (meeting.tags && meeting.tags.length > 0) {
    metaItems.push({ label: t('viewer.meta_tags'), value: meeting.tags.join(', ') });
  }
  if (meeting.updatedAt && meeting.updatedAt !== meeting.createdAt) {
    metaItems.push({ label: t('end_meeting.last_modified'), value: new Date(meeting.updatedAt).toLocaleString(getDateLocale()) });
  }
  metaItems.forEach(({ label, value }) => {
    if (!value) return;
    const item = document.createElement('div');
    item.className = 'viewer-meta-item';

    const labelSpan = document.createElement('span');
    labelSpan.className = 'viewer-meta-label';
    labelSpan.textContent = `${label}:`;
    item.appendChild(labelSpan);
    item.appendChild(document.createTextNode(` ${value}`));

    metaContainer.appendChild(item);
  });

  // Clear re-analysis slot
  const reanalysisSlot = $('#viewerReanalysisSlot');
  if (reanalysisSlot) reanalysisSlot.innerHTML = '';

  const transcript = meeting.transcript || [];
  const memos = meeting.memos || [];
  const analyses = meeting.analysisHistory || [];

  // Merge transcript lines and memos, sorted by timestamp
  const merged = [
    ...transcript.map((line, idx) => ({ ...line, _type: 'transcript', _index: idx })),
    ...memos.map(m => ({ ...m, _type: 'memo' }))
  ].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  // Render transcript + memos with data-index
  transcriptContainer.innerHTML = '';
  merged.forEach(item => {
    const div = document.createElement('div');
    if (item._type === 'memo') {
      div.className = 'transcript-line memo-line';

      const timeSpan = document.createElement('span');
      timeSpan.className = 'transcript-time';
      timeSpan.style.cssText = 'font-family:var(--font-mono);font-size:11px;color:var(--text-muted);min-width:48px;';
      timeSpan.textContent = formatTimeFromMs(item.timestamp - (meeting.startTime || 0));

      const badge = document.createElement('span');
      badge.className = 'memo-badge';
      badge.textContent = t('viewer.memo_badge');

      const textSpan = document.createElement('span');
      textSpan.className = 'transcript-text memo-text';
      textSpan.textContent = item.text;

      div.appendChild(timeSpan);
      div.appendChild(badge);
      div.appendChild(textSpan);
    } else {
      div.className = 'transcript-line' + (item.bookmarked ? ' bookmarked' : '');
      div.dataset.index = item._index;

      const timeSpan = document.createElement('span');
      timeSpan.className = 'transcript-time';
      timeSpan.style.cssText = 'font-family:var(--font-mono);font-size:11px;color:var(--text-muted);min-width:48px;';
      timeSpan.textContent = formatTimeFromMs(item.timestamp - (meeting.startTime || 0));

      const textSpan = document.createElement('span');
      textSpan.className = 'transcript-text';
      textSpan.textContent = item.text;

      div.appendChild(timeSpan);
      div.appendChild(textSpan);
    }
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
    const p = document.createElement('p');
    p.className = 'text-muted';
    p.textContent = t('viewer.no_analysis');
    analysisContainer.innerHTML = '';
    analysisContainer.appendChild(p);
  }

  // Scroll sync: transcript scroll -> find matching analysis
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
  }, { signal: viewerAbortController.signal });

  // Render chat history
  const chatContainer = $('#viewerChat');
  chatContainer.innerHTML = '';
  const chatTitle = document.createElement('h4');
  chatTitle.className = 'viewer-section-title';
  chatTitle.textContent = t('viewer.chat_title');
  chatContainer.appendChild(chatTitle);

  const chatHistory = (meeting.chatHistory || []).filter(msg =>
    !msg.text.startsWith('[add_context:') &&
    !msg.text.startsWith('[add_memo:') &&
    msg.text !== '[rerun_analysis]'
  );

  if (chatHistory.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'text-muted';
    empty.textContent = t('viewer.no_chat');
    chatContainer.appendChild(empty);
  } else {
    chatHistory.forEach(msg => {
      const div = document.createElement('div');
      div.className = `chat-message ${msg.role}`;
      const content = document.createElement('div');
      content.className = 'chat-message-content';
      if (msg.role === 'model') {
        content.innerHTML = renderMarkdown(msg.text);
      } else {
        content.textContent = msg.text;
      }
      div.appendChild(content);
      chatContainer.appendChild(div);
    });
  }

  // Viewer Load button with confirmation
  const btnViewerLoad = $('#btnViewerLoad');
  if (btnViewerLoad) {
    btnViewerLoad.textContent = t('viewer.load');
    btnViewerLoad.onclick = () => {
      if (state.transcript.length > 0 || state.isRecording) {
        if (!confirm(t('viewer.load_confirm'))) return;
      }
      emit('meeting:load', { id: meeting.id });
      $('#viewerModal').hidden = true;
    };
  }

  // Load hint i18n
  const loadHint = $('#viewerModal .viewer-load-hint');
  if (loadHint) loadHint.textContent = t('viewer.load_hint');
}

function renderViewerAnalysis(container, analysis) {
  if (isMarkdownAnalysis(analysis)) {
    renderMarkdownAnalysis(container, analysis);
  } else {
    // Legacy JSON-based rendering
    container.innerHTML = '';
    getSectionConfig().forEach(({ key, icon, title }) => {
      const section = document.createElement('div');
      section.className = 'ai-section';
      const content = analysis[key];

      const h3 = document.createElement('h3');
      h3.className = 'ai-section-title';

      const iconSpan = document.createElement('span');
      iconSpan.className = 'ai-section-icon';
      iconSpan.textContent = icon;

      const labelSpan = document.createElement('span');
      labelSpan.className = 'ai-section-label';
      labelSpan.textContent = title;

      h3.appendChild(iconSpan);
      h3.appendChild(labelSpan);
      section.appendChild(h3);

      const bodyDiv = document.createElement('div');
      bodyDiv.className = 'ai-section-body';

      if (Array.isArray(content)) {
        if (content.length > 0) {
          const ul = document.createElement('ul');
          content.forEach(i => {
            const li = document.createElement('li');
            const text = typeof i === 'object' && i !== null
              ? Object.values(i).filter(v => v != null).join(' \u2014 ')
              : i;
            li.textContent = text;
            ul.appendChild(li);
          });
          bodyDiv.appendChild(ul);
        } else {
          bodyDiv.textContent = t('card.no_items');
        }
      } else if (typeof content === 'object' && content) {
        bodyDiv.textContent = Object.entries(content).map(([k, v]) => `${k}: ${v}`).join(', ');
      } else {
        bodyDiv.textContent = content || t('card.no_data');
      }

      section.appendChild(bodyDiv);
      container.appendChild(section);
    });
  }
}
