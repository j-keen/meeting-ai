// ui/analysis.js - AI analysis section rendering
// NOTE: innerHTML usage is intentional for rendering trusted markdown/HTML content
// from the application's own analysis engine, matching the original ui.js implementation.

import { state, emit } from '../event-bus.js';
import { t, getDateLocale } from '../i18n.js';
import { renderMarkdown } from '../chat.js';

const $ = (sel) => document.querySelector(sel);

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

// Reconstruct full markdown from blocks array
function blocksToMarkdown(blocks) {
  return blocks.map(b => b.raw).join('\n\n');
}

// Render markdown analysis with block-level editing support
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

    // Edit icon (shown on hover via CSS)
    const editBtn = document.createElement('button');
    editBtn.className = 'ai-block-edit-btn';
    editBtn.innerHTML = '&#x270E;';
    editBtn.title = t('block_edit.edit');
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (div.querySelector('.ai-block.editing')) return;
      startBlockEdit(blockEl, block, index, blocks, analysis, div);
    });
    blockEl.appendChild(editBtn);

    div.appendChild(blockEl);
  });

  container.appendChild(div);
}

// Enter edit mode for a single block
function startBlockEdit(blockEl, block, index, blocks, analysis, containerDiv) {
  const originalRaw = block.raw;
  let done = false; // prevent double-fire from outside click + blur race
  blockEl.classList.add('editing');
  containerDiv.classList.add('has-editing-block');

  // Create textarea for editing
  const textarea = document.createElement('textarea');
  textarea.className = 'ai-block-textarea';
  textarea.value = originalRaw;

  // Mini toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'ai-block-toolbar';

  const hintSpan = document.createElement('span');
  hintSpan.className = 'ai-block-hint';
  hintSpan.textContent = t('block_edit.hint');

  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'ai-block-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-xs';
  cancelBtn.dataset.action = 'cancel';
  cancelBtn.title = t('block_edit.cancel');
  cancelBtn.textContent = '\u2715';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-xs btn-primary';
  saveBtn.dataset.action = 'save';
  saveBtn.title = t('block_edit.done');
  saveBtn.textContent = '\u2713';

  actionsDiv.appendChild(cancelBtn);
  actionsDiv.appendChild(saveBtn);
  toolbar.appendChild(hintSpan);
  toolbar.appendChild(actionsDiv);

  // Replace block content with editor
  blockEl.innerHTML = '';
  blockEl.appendChild(textarea);
  blockEl.appendChild(toolbar);
  textarea.focus();

  // Auto-resize textarea
  const autoResize = () => {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  };
  textarea.addEventListener('input', autoResize);
  requestAnimationFrame(autoResize);

  // Helper: re-add edit button after cancel/save
  const reattachEditBtn = () => {
    const editBtn = document.createElement('button');
    editBtn.className = 'ai-block-edit-btn';
    editBtn.innerHTML = '&#x270E;';
    editBtn.title = t('block_edit.edit');
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (containerDiv.querySelector('.ai-block.editing')) return;
      startBlockEdit(blockEl, block, index, blocks, analysis, containerDiv);
    });
    blockEl.appendChild(editBtn);
  };

  // Cleanup outside-click listener
  const removeOutsideListener = () => {
    document.removeEventListener('mousedown', onOutsideClick, true);
  };

  const cancel = () => {
    if (done) return;
    done = true;
    removeOutsideListener();
    blockEl.classList.remove('editing');
    containerDiv.classList.remove('has-editing-block');
    blockEl.innerHTML = renderMarkdown(originalRaw);
    reattachEditBtn();
  };

  const save = () => {
    if (done) return;
    const newRaw = textarea.value.trim();
    if (!newRaw || newRaw === originalRaw) {
      cancel();
      return;
    }

    done = true;
    removeOutsideListener();

    // Track correction
    const oldContent = originalRaw.replace(/^#+\s*/, '').replace(/^[-*]\s*/gm, '').trim();
    const newContent = newRaw.replace(/^#+\s*/, '').replace(/^[-*]\s*/gm, '').trim();
    if (oldContent !== newContent) {
      emit('analysis:userCorrections', [{ before: originalRaw.slice(0, 120), after: newRaw.slice(0, 120) }]);
    }

    // Update block
    block.raw = newRaw;
    blocks[index] = block;

    // Rebuild full markdown
    const newMarkdown = blocksToMarkdown(blocks);
    analysis.markdown = newMarkdown;
    analysis.summary = newMarkdown;
    analysis.flow = extractHeadlineFromMarkdown(newMarkdown);
    analysis.userEdited = true;

    // Re-render just this block
    blockEl.classList.remove('editing');
    containerDiv.classList.remove('has-editing-block');
    blockEl.innerHTML = renderMarkdown(newRaw);
    reattachEditBtn();

    emit('analysis:edited', analysis);
  };

  toolbar.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'cancel') cancel();
    if (action === 'save') save();
  });

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cancel();
    if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      save();
    }
  });

  // Auto-save on outside click (like transcript editing)
  const onOutsideClick = (e) => {
    if (!blockEl.contains(e.target)) {
      save();
    }
  };
  requestAnimationFrame(() => {
    document.addEventListener('mousedown', onOutsideClick, true);
  });
}

// Extract meaningful corrections by comparing old and new markdown line by line
function extractCorrections(oldMd, newMd) {
  const oldLines = oldMd.split('\n');
  const newLines = newMd.split('\n');
  const corrections = [];
  const maxLen = Math.max(oldLines.length, newLines.length);

  for (let i = 0; i < maxLen; i++) {
    const oldLine = (oldLines[i] || '').trim();
    const newLine = (newLines[i] || '').trim();
    if (oldLine !== newLine && oldLine && newLine) {
      // Skip pure heading/formatting changes
      const oldContent = oldLine.replace(/^#+\s*/, '').replace(/^\*+\s*/, '').replace(/^-\s*/, '');
      const newContent = newLine.replace(/^#+\s*/, '').replace(/^\*+\s*/, '').replace(/^-\s*/, '');
      if (oldContent !== newContent) {
        corrections.push({ before: oldLine.slice(0, 120), after: newLine.slice(0, 120) });
      }
    }
  }
  // Limit to 5 most meaningful corrections
  return corrections.slice(0, 5);
}

// Extract headline from markdown (mirror of ai.js logic)
function extractHeadlineFromMarkdown(markdown) {
  const headlineMatch = markdown.match(/^##\s+(?:Headline|한줄\s*요약)[^\n]*\n+(.+)/m);
  if (headlineMatch) return headlineMatch[1].trim().slice(0, 80);
  const firstH2 = markdown.match(/^##\s+(.+)/m);
  if (firstH2) return firstH2[1].trim().slice(0, 80);
  const firstLine = markdown.split('\n').find(l => l.trim());
  return (firstLine || '').replace(/^#+\s*/, '').trim().slice(0, 80);
}

// Render legacy JSON-based analysis with section cards
function renderLegacySections(container, analysis) {
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
          li.textContent = typeof item === 'object' && item !== null
            ? Object.values(item).filter(v => v != null).join(' \u2014 ')
            : item;
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

// ===== Analysis Navigator =====
let analysisNavIndex = -1; // -1 = latest (live)
let analysisNavInitialized = false;

function renderAnalysisContent(container, analysis) {
  if (isMarkdownAnalysis(analysis)) {
    renderMarkdownAnalysis(container, analysis);
  } else {
    renderLegacySections(container, analysis);
  }
}

export function updateAnalysisNav() {
  const nav = $('#analysisNav');
  const history = state.analysisHistory;
  if (!nav || history.length < 2) {
    if (nav) nav.style.display = 'none';
    return;
  }
  nav.style.display = '';

  const total = history.length;
  const viewIdx = analysisNavIndex < 0 ? total - 1 : analysisNavIndex;
  const isLatest = viewIdx === total - 1;

  const prevBtn = $('#analysisNavPrev');
  const nextBtn = $('#analysisNavNext');
  const label = $('#analysisNavLabel');

  prevBtn.disabled = viewIdx <= 0;
  nextBtn.disabled = isLatest;

  if (label) {
    const analysis = history[viewIdx];
    const time = analysis?.timestamp
      ? new Date(analysis.timestamp).toLocaleTimeString(getDateLocale(), { hour: '2-digit', minute: '2-digit' })
      : '';
    const timeSpan = document.createElement('span');
    timeSpan.className = 'nav-time';
    timeSpan.textContent = time;
    label.textContent = `${t('panel.ai')} ${viewIdx + 1} `;
    label.appendChild(timeSpan);
  }

  if (!analysisNavInitialized) {
    analysisNavInitialized = true;
    prevBtn.addEventListener('click', () => navigateAnalysis(-1));
    nextBtn.addEventListener('click', () => navigateAnalysis(1));

    const panel = $('#panelCenter');
    panel.setAttribute('tabindex', '-1');
    panel.style.outline = 'none';
    panel.addEventListener('keydown', (e) => {
      if (e.target.matches('input, textarea, [contenteditable]')) return;
      if (state.analysisHistory.length < 2) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); navigateAnalysis(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); navigateAnalysis(1); }
    });
  }
}

function navigateAnalysis(direction) {
  const history = state.analysisHistory;
  if (history.length < 2) return;

  const total = history.length;
  const currentIdx = analysisNavIndex < 0 ? total - 1 : analysisNavIndex;
  const newIdx = Math.max(0, Math.min(total - 1, currentIdx + direction));
  if (newIdx === currentIdx) return;

  analysisNavIndex = newIdx;
  const container = $('#aiSections');
  container.classList.remove('ai-updating');
  renderAnalysisContent(container, history[newIdx]);
  updateAnalysisNav();
}

export function renderAnalysis(analysis) {
  const container = $('#aiSections');
  const empty = $('#aiEmpty');
  if (empty) empty.style.display = 'none';
  container.classList.remove('ai-updating');

  // Always jump to latest on new analysis
  analysisNavIndex = -1;
  renderAnalysisContent(container, analysis);
  updateAnalysisNav();

  // Toggle copy & compare buttons
  const copyBtn = $('#btnCopyAnalysis');
  if (copyBtn) copyBtn.style.display = '';
}

// Get analysis content as markdown text for clipboard
export function getAnalysisAsText(analysis) {
  if (!analysis) return '';
  if (analysis.markdown) return analysis.markdown;
  // Legacy format: build markdown from sections
  const lines = [];
  getSectionConfig().forEach(({ key, title }) => {
    const val = analysis[key];
    if (!val) return;
    lines.push(`## ${title}`);
    if (Array.isArray(val)) {
      val.forEach(item => lines.push(`- ${item}`));
    } else {
      lines.push(val);
    }
    lines.push('');
  });
  return lines.join('\n');
}

// Render analysis into any container element
export function renderAnalysisInto(container, analysis) {
  renderAnalysisContent(container, analysis);
}

// ===== Analysis History =====
export function renderAnalysisHistory() {
  const timeline = $('#analysisTimeline');
  timeline.innerHTML = '';
  if (state.analysisHistory.length === 0) {
    const p = document.createElement('p');
    p.className = 'text-muted';
    p.style.cssText = 'text-align:center;padding:20px;';
    p.textContent = t('analysis_history.empty');
    timeline.appendChild(p);
    return;
  }
  state.analysisHistory.forEach((analysis, idx) => {
    const item = document.createElement('div');
    item.className = 'analysis-history-item' + (analysis.bookmarked ? ' bookmarked' : '');
    const time = new Date(analysis.timestamp).toLocaleTimeString(getDateLocale(), { hour: '2-digit', minute: '2-digit' });
    const flowText = analysis.flow || (analysis.summary || '').slice(0, 60) + ((analysis.summary || '').length > 60 ? '...' : '');

    // Build the row
    const row = document.createElement('div');
    row.className = 'analysis-history-row';

    const bookmarkBtn = document.createElement('button');
    bookmarkBtn.className = 'analysis-history-bookmark';
    bookmarkBtn.title = 'Bookmark';
    bookmarkBtn.textContent = analysis.bookmarked ? '\u2605' : '\u2606';

    const infoDiv = document.createElement('div');
    infoDiv.className = 'analysis-history-info';
    infoDiv.title = t('analysis_history.view_detail');

    const numSpan = document.createElement('span');
    numSpan.className = 'analysis-history-num';
    numSpan.textContent = `#${idx + 1}`;

    const timeSpan = document.createElement('span');
    timeSpan.className = 'analysis-history-time';
    timeSpan.textContent = time;

    const flowSpan = document.createElement('span');
    flowSpan.className = 'analysis-history-flow';
    flowSpan.textContent = flowText;

    infoDiv.appendChild(numSpan);
    infoDiv.appendChild(timeSpan);
    infoDiv.appendChild(flowSpan);
    row.appendChild(bookmarkBtn);
    row.appendChild(infoDiv);
    item.appendChild(row);

    // Memo area
    const memoArea = document.createElement('div');
    memoArea.className = 'analysis-history-memo-area';
    if (analysis.memo) {
      const memoSpan = document.createElement('span');
      memoSpan.className = 'analysis-history-memo';
      memoSpan.textContent = analysis.memo;
      memoArea.appendChild(memoSpan);
    } else {
      const memoAddBtn = document.createElement('button');
      memoAddBtn.className = 'analysis-history-memo-add';
      memoAddBtn.textContent = t('analysis_history.add_memo');
      memoArea.appendChild(memoAddBtn);
    }
    item.appendChild(memoArea);

    // Bookmark toggle
    bookmarkBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      analysis.bookmarked = !analysis.bookmarked;
      renderAnalysisHistory();
      // saved via periodic autoSave
    });

    // Click row -> open detail modal
    infoDiv.addEventListener('click', () => {
      openAnalysisDetail(analysis, idx);
    });

    // Memo add/edit
    const memoBtn = memoArea.querySelector('.analysis-history-memo-add');
    const memoSpanEl = memoArea.querySelector('.analysis-history-memo');

    if (memoBtn) {
      memoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showMemoInput(memoArea, analysis, idx);
      });
    }
    if (memoSpanEl) {
      memoSpanEl.addEventListener('click', (e) => {
        e.stopPropagation();
        showMemoInput(memoArea, analysis, idx);
      });
    }

    timeline.appendChild(item);
  });
}

function showMemoInput(container, analysis, idx) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'analysis-history-memo-input';
  input.placeholder = t('analysis_history.memo_placeholder');
  input.value = analysis.memo || '';
  container.innerHTML = '';
  container.appendChild(input);
  input.focus();

  const save = () => {
    analysis.memo = input.value.trim();
    renderAnalysisHistory();
    // saved via periodic autoSave
  };
  input.addEventListener('blur', save);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') { renderAnalysisHistory(); }
  });
}

function openAnalysisDetail(analysis, idx) {
  const modal = $('#analysisDetailModal');
  const title = $('#analysisDetailTitle');
  const container = $('#analysisDetailSections');
  const time = new Date(analysis.timestamp).toLocaleTimeString(getDateLocale(), { hour: '2-digit', minute: '2-digit' });
  title.textContent = `#${idx + 1} \u2014 ${time}`;
  renderAnalysisContent(container, analysis);
  modal.hidden = false;
}

export function showAiWaiting(charThreshold) {
  const aiEmpty = $('#aiEmpty');
  if (!aiEmpty) return;
  // Hide existing empty text
  const texts = aiEmpty.querySelectorAll(':scope > p');
  texts.forEach(p => p.style.display = 'none');
  const waiting = $('#aiWaiting');
  if (waiting) {
    waiting.style.display = '';
    const hint = $('#aiWaitingHint');
    if (hint) hint.textContent = t('ai.waiting_hint_chars', { n: charThreshold });
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
    const defaultPresets = [
      t('chat.suggestion_1'),
      t('chat.suggestion_2'),
      t('chat.suggestion_3'),
    ];
    const suggestions = state.settings.chatPresets || defaultPresets;
    suggestions.forEach(text => {
      const chip = document.createElement('button');
      chip.className = 'chat-suggestion-chip';
      chip.textContent = text;
      chip.addEventListener('click', () => {
        const input = $('#chatInput');
        if (input) input.value = text;
        const sendBtn = $('#btnChatSend');
        if (sendBtn) sendBtn.click();
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
