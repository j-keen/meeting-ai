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
export function parseMarkdownBlocks(markdown) {
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
export function blocksToMarkdown(blocks) {
  return blocks.map(b => b.raw).join('\n\n');
}

// Render markdown analysis with block-level memo support (double-click)
function renderMarkdownAnalysis(container, analysis) {
  container.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'ai-markdown-content';

  if (!analysis.blockMemos) analysis.blockMemos = [];

  const blocks = parseMarkdownBlocks(analysis.markdown);

  blocks.forEach((block, index) => {
    const blockEl = document.createElement('div');
    blockEl.className = 'ai-block';
    blockEl.dataset.blockIndex = index;
    blockEl.innerHTML = renderMarkdown(block.raw);

    // Show existing memo if any
    const existingMemo = analysis.blockMemos.find(m => m.blockIndex === index);
    if (existingMemo) {
      blockEl.appendChild(createMemoDisplay(existingMemo, block, index, analysis, div));
      blockEl.classList.add('has-memo');
    }

    // Double-click to add/edit memo
    blockEl.addEventListener('dblclick', (e) => {
      if (e.target.closest('.ai-block-memo') || e.target.closest('.ai-block-memo-input')) return;
      if (blockEl.querySelector('.ai-block-memo-input')) return;
      startBlockMemo(blockEl, block, index, analysis, div);
    });

    div.appendChild(blockEl);
  });

  container.appendChild(div);
}

// Create memo display element
function createMemoDisplay(memoObj, block, index, analysis, containerDiv) {
  const memoEl = document.createElement('div');
  memoEl.className = 'ai-block-memo';

  const icon = document.createElement('span');
  icon.className = 'ai-block-memo-icon';
  icon.textContent = '\uD83D\uDCDD';

  const text = document.createElement('span');
  text.className = 'ai-block-memo-text';
  text.textContent = memoObj.memo;

  const removeBtn = document.createElement('button');
  removeBtn.className = 'ai-block-memo-remove';
  removeBtn.textContent = '\u2715';
  removeBtn.title = t('block_memo.remove');
  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    analysis.blockMemos = analysis.blockMemos.filter(m => m.blockIndex !== index);
    memoEl.remove();
    const blockEl = memoEl.closest('.ai-block');
    if (blockEl) blockEl.classList.remove('has-memo');
    emit('analysis:memoChanged', analysis);
  });

  memoEl.appendChild(icon);
  memoEl.appendChild(text);
  memoEl.appendChild(removeBtn);

  // Click memo text to edit
  text.addEventListener('click', (e) => {
    e.stopPropagation();
    const blockEl = memoEl.closest('.ai-block');
    if (blockEl) startBlockMemo(blockEl, block, index, analysis, containerDiv, memoObj.memo);
  });

  return memoEl;
}

// Enter memo mode for a block (double-click)
function startBlockMemo(blockEl, block, index, analysis, containerDiv, existingText) {
  // Remove existing memo display if present
  const existingMemoEl = blockEl.querySelector('.ai-block-memo');
  if (existingMemoEl) existingMemoEl.remove();

  // Remove existing input if already open
  const existingInput = blockEl.querySelector('.ai-block-memo-input');
  if (existingInput) existingInput.remove();

  if (!analysis.blockMemos) analysis.blockMemos = [];

  const inputWrap = document.createElement('div');
  inputWrap.className = 'ai-block-memo-input';

  const icon = document.createElement('span');
  icon.className = 'ai-block-memo-icon';
  icon.textContent = '\uD83D\uDCDD';

  const textarea = document.createElement('textarea');
  textarea.className = 'ai-block-memo-textarea';
  textarea.placeholder = t('block_memo.placeholder');
  textarea.value = existingText || '';
  textarea.rows = 1;

  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'ai-block-memo-actions';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-xs btn-primary';
  saveBtn.textContent = '\u2713';
  saveBtn.title = t('block_memo.save');

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-xs';
  cancelBtn.textContent = '\u2715';
  cancelBtn.title = t('block_memo.cancel');

  actionsDiv.appendChild(cancelBtn);
  actionsDiv.appendChild(saveBtn);
  inputWrap.appendChild(icon);
  inputWrap.appendChild(textarea);
  inputWrap.appendChild(actionsDiv);
  blockEl.appendChild(inputWrap);
  textarea.focus();

  // Auto-resize
  const autoResize = () => {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  };
  textarea.addEventListener('input', autoResize);
  requestAnimationFrame(autoResize);

  let done = false;

  const cancel = () => {
    if (done) return;
    done = true;
    inputWrap.remove();
    // Restore existing memo display if there was one
    const existing = analysis.blockMemos.find(m => m.blockIndex === index);
    if (existing) {
      blockEl.appendChild(createMemoDisplay(existing, block, index, analysis, containerDiv));
      blockEl.classList.add('has-memo');
    }
    removeOutsideListener();
  };

  const save = () => {
    if (done) return;
    const text = textarea.value.trim();
    if (!text) {
      // Remove memo if empty
      analysis.blockMemos = analysis.blockMemos.filter(m => m.blockIndex !== index);
      blockEl.classList.remove('has-memo');
      done = true;
      inputWrap.remove();
      removeOutsideListener();
      emit('analysis:memoChanged', analysis);
      return;
    }

    done = true;
    inputWrap.remove();

    // Update or add memo
    const existingIdx = analysis.blockMemos.findIndex(m => m.blockIndex === index);
    const blockSnippet = block.raw.replace(/^#+\s*/, '').slice(0, 100);
    const memoObj = { blockIndex: index, memo: text, blockSnippet };
    if (existingIdx >= 0) {
      analysis.blockMemos[existingIdx] = memoObj;
    } else {
      analysis.blockMemos.push(memoObj);
    }

    blockEl.classList.add('has-memo');
    blockEl.appendChild(createMemoDisplay(memoObj, block, index, analysis, containerDiv));
    removeOutsideListener();
    emit('analysis:memoChanged', analysis);
  };

  saveBtn.addEventListener('click', (e) => { e.stopPropagation(); save(); });
  cancelBtn.addEventListener('click', (e) => { e.stopPropagation(); cancel(); });

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); }
    if (e.key === 'Escape') cancel();
  });

  const onOutsideClick = (e) => {
    if (!inputWrap.contains(e.target)) save();
  };
  const removeOutsideListener = () => {
    document.removeEventListener('mousedown', onOutsideClick, true);
  };
  requestAnimationFrame(() => {
    document.addEventListener('mousedown', onOutsideClick, true);
  });
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

function renderAnalysisContent(container, analysis) {
  if (isMarkdownAnalysis(analysis)) {
    renderMarkdownAnalysis(container, analysis);
  } else {
    renderLegacySections(container, analysis);
  }
}

// Navigation moved to Analysis Style Modal — this is a no-op kept for API compat
export function updateAnalysisNav() {}

export function renderAnalysis(analysis) {
  const container = $('#aiSections');
  const empty = $('#aiEmpty');
  if (empty) empty.style.display = 'none';
  container.classList.remove('ai-updating');

  renderAnalysisContent(container, analysis);

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

export function showAiIdle() {
  const aiEmpty = $('#aiEmpty');
  if (!aiEmpty) return;
  const texts = aiEmpty.querySelectorAll(':scope > p');
  texts.forEach(p => p.style.display = 'none');
  const waiting = $('#aiWaiting');
  if (waiting) {
    waiting.style.display = '';
    const hint = $('#aiWaitingHint');
    if (hint) hint.textContent = t('ai.idle');
    const sub = waiting.querySelector('.waiting-hint');
    if (sub) sub.textContent = t('ai.idle_hint');
  }
}

export function showChatIdle() {
  const chatEmpty = $('#chatEmpty');
  if (!chatEmpty) return;
  const texts = chatEmpty.querySelectorAll(':scope > p');
  texts.forEach(p => p.style.display = 'none');
  const waiting = $('#chatWaiting');
  if (waiting) {
    waiting.style.display = '';
    const text = waiting.querySelector('.waiting-text');
    const hint = waiting.querySelector('.waiting-hint');
    if (text) text.textContent = t('chat.idle');
    if (hint) hint.textContent = t('chat.idle_hint');
  }
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
