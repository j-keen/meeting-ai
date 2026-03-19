// ui/history-view.js - History grid and meeting viewer
// NOTE: innerHTML usage is intentional for rendering trusted application-generated content,
// matching the original ui.js implementation.

import { state, emit } from '../event-bus.js';
import { t, getDateLocale } from '../i18n.js';
import { renderMarkdown } from '../chat.js';
import { getLinkedMeetings, linkMeetings, unlinkMeetings, listMeetings as storageListMeetings, listDeletedMeetings } from '../storage.js';

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

// Relative time formatting
function formatRelativeTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);

  if (minutes < 1) return t('history.time_just_now');
  if (minutes < 60) return t('history.time_minutes_ago', { n: minutes });
  if (hours < 24) return t('history.time_hours_ago', { n: hours });
  if (days < 7) return t('history.time_days_ago', { n: days });
  if (weeks < 5) return t('history.time_weeks_ago', { n: weeks });
  return t('history.time_months_ago', { n: months });
}

// Get group label for a meeting timestamp
function getTimeGroup(timestamp) {
  const now = new Date();
  const date = new Date(timestamp);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekStart = new Date(today.getTime() - today.getDay() * 86400000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  if (date >= today) return t('history.group_today');
  if (date >= yesterday) return t('history.group_yesterday');
  if (date >= weekStart) return t('history.group_this_week');
  if (date >= monthStart) return t('history.group_this_month');
  return t('history.group_older');
}

// Sort meetings by sortBy option
function sortMeetings(meetings, sortBy) {
  const sorted = [...meetings];
  switch (sortBy) {
    case 'oldest':
      return sorted.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    case 'rating_desc':
      return sorted.sort((a, b) => (b.starRating || 0) - (a.starRating || 0));
    case 'duration_desc':
      return sorted.sort((a, b) => {
        const durA = parseDurationMs(a.duration);
        const durB = parseDurationMs(b.duration);
        return durB - durA;
      });
    case 'title_asc':
      return sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    case 'newest':
    default:
      return sorted.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }
}

// Parse duration string "MM:SS" to milliseconds
function parseDurationMs(dur) {
  if (!dur) return 0;
  const parts = dur.split(':').map(Number);
  if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
  if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  return 0;
}

export function renderHistoryGrid(meetings, { searchTerm = '', filterType = '', filterTag = '', filterRating = '', dateFrom = '', dateTo = '', sortBy = 'newest' } = {}) {
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

  // Sort
  filtered = sortMeetings(filtered, sortBy);

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

  // Group headers only for date-based sorts
  const useGroups = sortBy === 'newest' || sortBy === 'oldest';
  let lastGroup = '';

  filtered.forEach(meeting => {
    // Insert group header if needed
    if (useGroups) {
      const group = getTimeGroup(meeting.createdAt);
      if (group !== lastGroup) {
        lastGroup = group;
        const header = document.createElement('div');
        header.className = 'history-group-header';
        header.textContent = group;
        grid.appendChild(header);
      }
    }

    const tmpl = $('#tmplHistoryCard');
    const card = tmpl.content.cloneNode(true).querySelector('.history-card');
    card.dataset.meetingId = meeting.id;
    card.querySelector('.history-card-title').textContent = meeting.title || t('history.untitled');

    // Date: absolute + relative time
    const dateEl = card.querySelector('.history-card-date');
    const absDate = new Date(meeting.createdAt).toLocaleDateString(getDateLocale());
    const relTime = formatRelativeTime(meeting.createdAt);
    dateEl.textContent = absDate;
    dateEl.title = absDate;

    const relSpan = document.createElement('span');
    relSpan.className = 'history-card-relative-time';
    relSpan.textContent = relTime;
    dateEl.appendChild(relSpan);
    card.querySelector('.history-card-type').textContent = meeting.preset || t('settings.preset_copilot');
    card.querySelector('.history-card-duration').textContent = meeting.duration || '';
    card.querySelector('.history-card-location').textContent = meeting.location || '';

    // Import type badge
    if (meeting.type === 'imported') {
      const badge = document.createElement('span');
      badge.className = 'history-card-import-badge';
      badge.textContent = '\u{1F4CB} ' + t('history.imported');
      card.querySelector('.history-card-meta').appendChild(badge);
    } else if (meeting.type === 'uploaded') {
      const badge = document.createElement('span');
      badge.className = 'history-card-import-badge';
      badge.textContent = '\u{1F3B5} ' + t('history.audio_import');
      card.querySelector('.history-card-meta').appendChild(badge);
    }

    // Audio recording badge
    if (meeting.hasAudio) {
      const badge = document.createElement('span');
      badge.className = 'history-card-audio-badge';
      badge.textContent = '\u{1F399}';
      badge.title = t('history.has_audio');
      card.querySelector('.history-card-meta').appendChild(badge);
    }

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

    // Linked meetings count
    if (meeting.links && meeting.links.length > 0) {
      const linkEl = document.createElement('span');
      linkEl.className = 'history-card-links-count';
      linkEl.textContent = `\u{1F517} ${meeting.links.length}`;
      linkEl.title = t('link.title');
      card.querySelector('.history-card-meta').appendChild(linkEl);
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

    // Import type badge
    if (meeting.type === 'imported') {
      const importBadge = document.createElement('span');
      importBadge.className = 'viewer-badge viewer-badge-import';
      importBadge.textContent = '\u{1F4CB} ' + t('history.imported');
      badgesEl.appendChild(importBadge);
    } else if (meeting.type === 'uploaded') {
      const importBadge = document.createElement('span');
      importBadge.className = 'viewer-badge viewer-badge-import';
      importBadge.textContent = '\u{1F3B5} ' + t('history.audio_import');
      badgesEl.appendChild(importBadge);
    }
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

  // Render linked meetings
  renderViewerLinkedMeetings(meeting);

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

  // Audio player (P-5)
  const existingPlayer = $('#viewerAudioPlayer');
  if (existingPlayer) existingPlayer.remove();
  if (meeting.hasAudio) {
    renderViewerAudioPlayer(meeting, transcriptContainer);
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

  // Document generator button
  const btnViewerDocGen = $('#btnViewerDocGen');
  if (btnViewerDocGen) {
    btnViewerDocGen.onclick = () => {
      emit('docGenerator:open', meeting);
    };
  }
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

// ===== Linked Meetings in Viewer =====
function renderViewerLinkedMeetings(meeting) {
  const container = $('#viewerLinkedMeetings');
  if (!container) return;
  container.innerHTML = '';

  const linked = getLinkedMeetings(meeting.id);

  // Header row with title and add button
  const header = document.createElement('div');
  header.className = 'viewer-linked-header';

  const title = document.createElement('span');
  title.className = 'viewer-linked-title';
  title.textContent = t('link.title');
  header.appendChild(title);

  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-xs btn-outline viewer-linked-add';
  addBtn.textContent = t('link.add');
  addBtn.addEventListener('click', () => showLinkPopover(meeting.id, container));
  header.appendChild(addBtn);

  container.appendChild(header);

  if (!linked.length) {
    const empty = document.createElement('div');
    empty.className = 'viewer-linked-empty';
    empty.textContent = t('link.empty');
    container.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'viewer-linked-list';
  linked.forEach(m => {
    const badge = document.createElement('span');
    badge.className = 'viewer-linked-badge';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'viewer-linked-name';
    nameSpan.textContent = m.title || m.id;
    nameSpan.addEventListener('click', () => {
      emit('meeting:view', { id: m.id });
    });
    badge.appendChild(nameSpan);

    const dateSpan = document.createElement('span');
    dateSpan.className = 'viewer-linked-date';
    dateSpan.textContent = m.createdAt ? new Date(m.createdAt).toLocaleDateString(getDateLocale()) : '';
    badge.appendChild(dateSpan);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'viewer-linked-remove';
    removeBtn.textContent = '\u00D7';
    removeBtn.title = t('link.unlink_confirm');
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      unlinkMeetings(meeting.id, m.id);
      renderViewerLinkedMeetings(meeting);
    });
    badge.appendChild(removeBtn);

    list.appendChild(badge);
  });
  container.appendChild(list);
}

function showLinkPopover(meetingId, parentContainer) {
  // Remove existing popover
  const existing = parentContainer.querySelector('.viewer-link-popover');
  if (existing) { existing.remove(); return; }

  const popover = document.createElement('div');
  popover.className = 'viewer-link-popover';

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.className = 'ds-input-sm';
  searchInput.placeholder = t('link.search_placeholder');
  popover.appendChild(searchInput);

  const resultList = document.createElement('div');
  resultList.className = 'viewer-link-results';
  popover.appendChild(resultList);

  parentContainer.appendChild(popover);
  searchInput.focus();

  const linked = getLinkedMeetings(meetingId).map(m => m.id);

  function renderResults(query) {
    const all = storageListMeetings();
    const q = (query || '').replace(/\s/g, '').toLowerCase();
    const filtered = all.filter(m => {
      if (m.id === meetingId) return false;
      if (linked.includes(m.id)) return false;
      if (!q) return true;
      return (m.title || m.id || '').replace(/\s/g, '').toLowerCase().includes(q);
    }).slice(0, 10);

    resultList.innerHTML = '';
    if (!filtered.length) {
      resultList.innerHTML = `<div class="ds-ref-empty" style="padding:8px;font-size:12px;color:var(--text-tertiary)">${t('link.empty')}</div>`;
      return;
    }
    filtered.forEach(m => {
      const item = document.createElement('div');
      item.className = 'viewer-link-result-item';
      const date = m.createdAt ? new Date(m.createdAt).toLocaleDateString(getDateLocale()) : '';
      item.innerHTML = `<span>${m.title || m.id}</span><span class="ds-ref-date">${date}</span>`;
      item.addEventListener('click', () => {
        linkMeetings(meetingId, m.id);
        popover.remove();
        // Re-render with updated meeting data
        const updatedMeeting = all.find(x => x.id === meetingId) || { id: meetingId };
        renderViewerLinkedMeetings(updatedMeeting);
      });
      resultList.appendChild(item);
    });
  }

  renderResults('');
  searchInput.addEventListener('input', () => renderResults(searchInput.value));

  // Close on outside click
  const closeHandler = (e) => {
    if (!popover.contains(e.target)) {
      popover.remove();
      document.removeEventListener('mousedown', closeHandler);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', closeHandler), 0);
}

// ===== Trash View =====
let trashMode = false;

export function isTrashMode() { return trashMode; }

export function toggleTrashMode() {
  trashMode = !trashMode;
  const toolbar = $('.history-toolbar');
  const grid = $('#historyGrid');
  const btn = $('#btnTrashToggle');

  if (trashMode) {
    btn?.classList.add('active');
    if (toolbar) toolbar.style.display = 'none';
    renderTrashGrid(grid);
  } else {
    btn?.classList.remove('active');
    if (toolbar) toolbar.style.display = '';
    // Will be refreshed by caller
  }
  return trashMode;
}

export function refreshTrashView() {
  if (!trashMode) return;
  const grid = $('#historyGrid');
  if (grid) renderTrashGrid(grid);
}

export function updateTrashBadge() {
  const deleted = listDeletedMeetings();
  const badge = $('#trashBadge');
  if (!badge) return;
  if (deleted.length > 0) {
    badge.textContent = deleted.length;
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
}

function formatRelativeTimeTrash(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return t('history.time_just_now');
  if (minutes < 60) return t('history.time_minutes_ago', { n: minutes });
  if (hours < 24) return t('history.time_hours_ago', { n: hours });
  return t('history.time_days_ago', { n: days });
}

let trashSelected = new Set();

function updateBatchBar() {
  const bar = document.querySelector('.trash-batch-bar');
  if (!bar) return;
  const count = trashSelected.size;
  const countEl = bar.querySelector('.trash-batch-count');
  const restoreBtn = bar.querySelector('.trash-batch-restore');
  if (count > 0) {
    bar.classList.add('visible');
    if (countEl) countEl.textContent = t('trash.selected_count', { n: count });
    if (restoreBtn) restoreBtn.textContent = t('trash.restore_selected', { n: count });
  } else {
    bar.classList.remove('visible');
  }
}

function getSummaryPreview(meeting) {
  const lastAnalysis = meeting.analysisHistory?.[meeting.analysisHistory.length - 1];
  if (lastAnalysis?.markdown) {
    // Extract first non-heading, non-empty line
    const lines = lastAnalysis.markdown.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const clean = trimmed.replace(/^[-*]\s*/, '');
        return clean.length > 80 ? clean.slice(0, 80) + '...' : clean;
      }
    }
  }
  if (lastAnalysis?.summary) {
    const s = lastAnalysis.summary;
    return s.length > 80 ? s.slice(0, 80) + '...' : s;
  }
  return '';
}

function renderTrashGrid(grid) {
  grid.innerHTML = '';
  trashSelected.clear();
  const deleted = listDeletedMeetings();

  if (deleted.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'trash-empty';
    empty.innerHTML = `<div class="trash-empty-icon">&#128465;</div><div class="trash-empty-text">${t('trash.empty')}</div>`;
    grid.appendChild(empty);
    return;
  }

  // Header with select-all checkbox
  const header = document.createElement('div');
  header.className = 'trash-header';

  const selectAllLabel = document.createElement('label');
  selectAllLabel.className = 'trash-select-all';
  const selectAllCb = document.createElement('input');
  selectAllCb.type = 'checkbox';
  selectAllCb.className = 'trash-checkbox';
  selectAllLabel.appendChild(selectAllCb);
  const selectAllText = document.createElement('span');
  selectAllText.textContent = t('trash.select_all');
  selectAllLabel.appendChild(selectAllText);
  header.appendChild(selectAllLabel);

  const headerRight = document.createElement('div');
  headerRight.className = 'trash-header-right';
  const titleSpan = document.createElement('span');
  titleSpan.className = 'trash-header-title';
  titleSpan.textContent = t('trash.title');
  headerRight.appendChild(titleSpan);
  const countSpan = document.createElement('span');
  countSpan.className = 'trash-header-count';
  countSpan.textContent = deleted.length;
  headerRight.appendChild(countSpan);
  header.appendChild(headerRight);

  grid.appendChild(header);

  // Batch action bar (hidden until selection)
  const batchBar = document.createElement('div');
  batchBar.className = 'trash-batch-bar';
  const batchCount = document.createElement('span');
  batchCount.className = 'trash-batch-count';
  batchBar.appendChild(batchCount);
  const batchRestore = document.createElement('button');
  batchRestore.className = 'btn btn-sm btn-primary trash-batch-restore';
  batchRestore.addEventListener('click', () => {
    if (trashSelected.size === 0) return;
    emit('meeting:restoreBatch', { ids: [...trashSelected] });
  });
  batchBar.appendChild(batchRestore);
  grid.appendChild(batchBar);

  const allCheckboxes = [];

  deleted.forEach(meeting => {
    const card = document.createElement('div');
    card.className = 'history-card trash-card';
    card.dataset.meetingId = meeting.id;

    const cardRow = document.createElement('div');
    cardRow.className = 'trash-card-row';

    // Checkbox
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'trash-checkbox';
    cb.dataset.id = meeting.id;
    cb.addEventListener('change', () => {
      if (cb.checked) {
        trashSelected.add(meeting.id);
        card.classList.add('selected');
      } else {
        trashSelected.delete(meeting.id);
        card.classList.remove('selected');
      }
      selectAllCb.checked = trashSelected.size === deleted.length;
      selectAllCb.indeterminate = trashSelected.size > 0 && trashSelected.size < deleted.length;
      updateBatchBar();
    });
    allCheckboxes.push(cb);
    cardRow.appendChild(cb);

    const cardContent = document.createElement('div');
    cardContent.className = 'trash-card-content';

    const cardHeader = document.createElement('div');
    cardHeader.className = 'history-card-header';

    const title = document.createElement('span');
    title.className = 'history-card-title';
    title.textContent = meeting.title || t('history.untitled');
    cardHeader.appendChild(title);

    const date = document.createElement('span');
    date.className = 'history-card-date';
    date.textContent = new Date(meeting.createdAt).toLocaleDateString(getDateLocale());
    cardHeader.appendChild(date);

    cardContent.appendChild(cardHeader);

    // Summary preview
    const preview = getSummaryPreview(meeting);
    if (preview) {
      const summaryEl = document.createElement('div');
      summaryEl.className = 'trash-card-summary';
      summaryEl.textContent = preview;
      cardContent.appendChild(summaryEl);
    }

    const meta = document.createElement('div');
    meta.className = 'history-card-meta';

    const type = document.createElement('span');
    type.className = 'history-card-type';
    type.textContent = meeting.preset || t('settings.preset_copilot');
    meta.appendChild(type);

    if (meeting.duration) {
      const dur = document.createElement('span');
      dur.className = 'history-card-duration';
      dur.textContent = meeting.duration;
      meta.appendChild(dur);
    }

    const deletedTime = document.createElement('span');
    deletedTime.className = 'trash-deleted-time';
    deletedTime.textContent = t('trash.deleted_at', { time: formatRelativeTimeTrash(meeting.deletedAt) });
    meta.appendChild(deletedTime);

    cardContent.appendChild(meta);
    cardRow.appendChild(cardContent);
    card.appendChild(cardRow);

    const actions = document.createElement('div');
    actions.className = 'history-card-actions';

    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'btn btn-xs btn-primary';
    restoreBtn.textContent = t('trash.restore');
    restoreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      emit('meeting:restore', { id: meeting.id });
    });
    actions.appendChild(restoreBtn);

    const permDeleteBtn = document.createElement('button');
    permDeleteBtn.className = 'btn btn-xs btn-danger';
    permDeleteBtn.textContent = t('trash.permanent_delete');
    permDeleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      emit('meeting:permanentDelete', { id: meeting.id });
    });
    actions.appendChild(permDeleteBtn);

    card.appendChild(actions);
    grid.appendChild(card);
  });

  // Select-all handler
  selectAllCb.addEventListener('change', () => {
    allCheckboxes.forEach(cb => {
      cb.checked = selectAllCb.checked;
      const id = cb.dataset.id;
      const card = cb.closest('.trash-card');
      if (selectAllCb.checked) {
        trashSelected.add(id);
        card?.classList.add('selected');
      } else {
        trashSelected.delete(id);
        card?.classList.remove('selected');
      }
    });
    selectAllCb.indeterminate = false;
    updateBatchBar();
  });
}

// ===== Audio Player for Viewer (P-5) =====
async function renderViewerAudioPlayer(meeting, transcriptContainer) {
  try {
    const { getRecording } = await import('../audio-recorder.js');
    const blob = await getRecording(meeting.id);
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const player = document.createElement('div');
    player.id = 'viewerAudioPlayer';
    player.className = 'viewer-audio-player';

    const audio = document.createElement('audio');
    audio.src = url;
    audio.preload = 'metadata';

    // Controls
    const playBtn = document.createElement('button');
    playBtn.className = 'btn btn-sm viewer-audio-play';
    playBtn.textContent = '\u25B6';
    playBtn.addEventListener('click', () => {
      if (audio.paused) {
        audio.play();
        playBtn.textContent = '\u23F8';
      } else {
        audio.pause();
        playBtn.textContent = '\u25B6';
      }
    });

    audio.addEventListener('ended', () => { playBtn.textContent = '\u25B6'; });

    const timeDisplay = document.createElement('span');
    timeDisplay.className = 'viewer-audio-time';
    timeDisplay.textContent = '00:00 / 00:00';

    const seekBar = document.createElement('input');
    seekBar.type = 'range';
    seekBar.className = 'viewer-audio-seek';
    seekBar.min = '0';
    seekBar.max = '100';
    seekBar.value = '0';

    audio.addEventListener('loadedmetadata', () => {
      const dur = audio.duration;
      const m = Math.floor(dur / 60);
      const s = Math.floor(dur % 60);
      timeDisplay.textContent = `00:00 / ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    });

    audio.addEventListener('timeupdate', () => {
      const cur = audio.currentTime;
      const dur = audio.duration || 1;
      seekBar.value = String((cur / dur) * 100);
      const cm = Math.floor(cur / 60);
      const cs = Math.floor(cur % 60);
      const dm = Math.floor(dur / 60);
      const ds = Math.floor(dur % 60);
      timeDisplay.textContent = `${String(cm).padStart(2, '0')}:${String(cs).padStart(2, '0')} / ${String(dm).padStart(2, '0')}:${String(ds).padStart(2, '0')}`;
    });

    seekBar.addEventListener('input', () => {
      const dur = audio.duration || 1;
      audio.currentTime = (parseFloat(seekBar.value) / 100) * dur;
    });

    // Download button
    const dlBtn = document.createElement('a');
    dlBtn.className = 'btn btn-sm viewer-audio-download';
    dlBtn.href = url;
    dlBtn.download = `${meeting.title || 'recording'}.webm`;
    dlBtn.textContent = '\u2B07';
    dlBtn.title = t('viewer.download_audio');

    player.append(playBtn, seekBar, timeDisplay, dlBtn);

    // Insert before transcript container (sticky at bottom)
    const viewerBody = transcriptContainer.closest('.viewer-body') || transcriptContainer.parentElement;
    if (viewerBody) viewerBody.appendChild(player);

    // Click on transcript timestamps to seek audio
    transcriptContainer.addEventListener('click', (e) => {
      const timeSel = e.target.closest('.transcript-time');
      if (!timeSel) return;
      const line = timeSel.closest('.transcript-line');
      if (!line) return;
      const idx = parseInt(line.dataset.index);
      if (isNaN(idx)) return;
      const transcript = meeting.transcript || [];
      const item = transcript[idx];
      if (!item) return;
      const offsetMs = item.timestamp - (meeting.startTime || 0);
      if (offsetMs >= 0) {
        audio.currentTime = offsetMs / 1000;
        if (audio.paused) {
          audio.play();
          playBtn.textContent = '\u23F8';
        }
      }
    }, { signal: viewerAbortController.signal });
  } catch {
    // Audio recording module not available or no recording found
  }
}
