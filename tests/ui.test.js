import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  showToast,
  addTranscriptLine,
  showInterim,
  clearInterim,
  initDragResizer,
  initPanelTabs,
  initContextPopup,
  updateTranscriptLineUI,
  removeTranscriptLineUI,
  showTranscriptWaiting,
  hideTranscriptWaiting,
  resetTranscriptEmpty,
  toggleTheme,
  getAnalysisAsText,
  showAiWaiting,
  hideAiWaiting,
} from '../ui.js';

vi.mock('../event-bus.js', () => ({
  state: {
    isRecording: false,
    transcript: [],
    analysisHistory: [],
    settings: {},
    currentAnalysis: null,
    chatHistory: [],
    tags: [],
    meetingTitle: '',
    meetingStartTime: null,
    memos: [],
  },
  emit: vi.fn(),
}));
vi.mock('../i18n.js', () => ({ t: vi.fn(k => k), getDateLocale: vi.fn() }));
vi.mock('../chat.js', () => ({ renderMarkdown: vi.fn(text => text) }));

// ===== DOM Helpers =====

function createToastDOM() {
  document.body.innerHTML = '';

  const container = document.createElement('div');
  container.id = 'toastContainer';
  document.body.appendChild(container);

  // Build the template DOM manually (no innerHTML on untrusted content)
  const tmpl = document.createElement('template');
  tmpl.id = 'tmplToast';

  const toastDiv = document.createElement('div');
  toastDiv.className = 'toast';

  const msgSpan = document.createElement('span');
  msgSpan.className = 'toast-message';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'toast-close';
  closeBtn.textContent = 'x';

  toastDiv.appendChild(msgSpan);
  toastDiv.appendChild(closeBtn);
  tmpl.content.appendChild(toastDiv);
  document.body.appendChild(tmpl);
}

function createTranscriptDOM() {
  document.body.innerHTML = '';

  const list = document.createElement('div');
  list.id = 'transcriptList';
  document.body.appendChild(list);

  const empty = document.createElement('div');
  empty.id = 'transcriptEmpty';
  document.body.appendChild(empty);

  const tmpl = document.createElement('template');
  tmpl.id = 'tmplTranscriptLine';

  const lineDiv = document.createElement('div');
  lineDiv.className = 'transcript-line';

  const timeSpan = document.createElement('span');
  timeSpan.className = 'transcript-time';

  const textSpan = document.createElement('span');
  textSpan.className = 'transcript-text';

  const bookmarkBtn = document.createElement('button');
  bookmarkBtn.dataset.action = 'bookmark';

  const deleteBtn = document.createElement('button');
  deleteBtn.dataset.action = 'delete';

  lineDiv.appendChild(timeSpan);
  lineDiv.appendChild(textSpan);
  lineDiv.appendChild(bookmarkBtn);
  lineDiv.appendChild(deleteBtn);
  tmpl.content.appendChild(lineDiv);
  document.body.appendChild(tmpl);
}

// ===== Tests =====

describe('showToast', () => {
  beforeEach(() => {
    createToastDOM();
  });

  it('appends a toast element to the container', () => {
    showToast('Hello world');
    const container = document.getElementById('toastContainer');
    expect(container.querySelectorAll('.toast').length).toBe(1);
  });

  it('sets the toast message text', () => {
    showToast('Something happened');
    const msg = document.querySelector('#toastContainer .toast-message');
    expect(msg.textContent).toBe('Something happened');
  });

  it('adds the type as a CSS class (default success)', () => {
    showToast('OK');
    const toast = document.querySelector('#toastContainer .toast');
    expect(toast.classList.contains('success')).toBe(true);
  });

  it('adds a custom type class', () => {
    showToast('Oops', 'error');
    const toast = document.querySelector('#toastContainer .toast');
    expect(toast.classList.contains('error')).toBe(true);
    expect(toast.classList.contains('success')).toBe(false);
  });

  it('stacks multiple toasts', () => {
    showToast('First');
    showToast('Second');
    const container = document.getElementById('toastContainer');
    expect(container.querySelectorAll('.toast').length).toBe(2);
  });
});

describe('addTranscriptLine', () => {
  beforeEach(() => {
    createTranscriptDOM();
  });

  it('appends a transcript-line element to #transcriptList', () => {
    addTranscriptLine({ id: '1', text: 'Hello', timestamp: Date.now() });
    const list = document.getElementById('transcriptList');
    expect(list.querySelectorAll('.transcript-line').length).toBe(1);
  });

  it('sets the text content of the transcript-text span', () => {
    addTranscriptLine({ id: '2', text: 'Test text', timestamp: Date.now() });
    const textEl = document.querySelector('#transcriptList .transcript-text');
    expect(textEl.textContent).toBe('Test text');
  });

  it('stores the line id in data-id', () => {
    addTranscriptLine({ id: 'abc-123', text: 'ID test', timestamp: Date.now() });
    const el = document.querySelector('#transcriptList .transcript-line');
    expect(el.dataset.id).toBe('abc-123');
  });

  it('hides #transcriptEmpty when a line is added', () => {
    const empty = document.getElementById('transcriptEmpty');
    empty.style.display = '';
    addTranscriptLine({ id: '3', text: 'Any', timestamp: Date.now() });
    expect(empty.style.display).toBe('none');
  });

  it('adds the bookmarked class when line.bookmarked is true', () => {
    addTranscriptLine({ id: '4', text: 'Bookmarked', timestamp: Date.now(), bookmarked: true });
    const el = document.querySelector('#transcriptList .transcript-line');
    expect(el.classList.contains('bookmarked')).toBe(true);
  });
});

describe('showInterim / clearInterim', () => {
  beforeEach(() => {
    createTranscriptDOM();
    clearInterim();
  });

  it('showInterim adds an interim element to #transcriptList', () => {
    showInterim('partial text...');
    const list = document.getElementById('transcriptList');
    expect(list.querySelector('.interim')).not.toBeNull();
  });

  it('showInterim sets the interim text content', () => {
    showInterim('typing now');
    const textEl = document.querySelector('.interim .transcript-text');
    expect(textEl.textContent).toBe('typing now');
  });

  it('showInterim reuses the same element on repeated calls', () => {
    showInterim('first');
    showInterim('second');
    const list = document.getElementById('transcriptList');
    const interims = list.querySelectorAll('.interim');
    expect(interims.length).toBe(1);
    expect(interims[0].querySelector('.transcript-text').textContent).toBe('second');
  });

  it('clearInterim removes the interim element', () => {
    showInterim('text');
    clearInterim();
    const list = document.getElementById('transcriptList');
    expect(list.querySelector('.interim')).toBeNull();
  });

  it('clearInterim is safe to call when there is no interim element', () => {
    expect(() => clearInterim()).not.toThrow();
  });
});

describe('initDragResizer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    const main = document.createElement('div');
    main.className = 'main-content';

    const leftPanel = document.createElement('div');
    leftPanel.id = 'left-panel';

    const resizer = document.createElement('div');
    resizer.className = 'drag-resizer';
    resizer.dataset.left = 'left-panel';
    resizer.dataset.right = 'right-panel';

    const rightPanel = document.createElement('div');
    rightPanel.id = 'right-panel';

    main.appendChild(leftPanel);
    main.appendChild(resizer);
    main.appendChild(rightPanel);
    document.body.appendChild(main);
  });

  it('runs without throwing when panels exist', () => {
    expect(() => initDragResizer()).not.toThrow();
  });

  it('skips resizers with missing panel ids without throwing', () => {
    document.body.innerHTML = '';
    const main = document.createElement('div');
    main.className = 'main-content';
    const badResizer = document.createElement('div');
    badResizer.className = 'drag-resizer';
    badResizer.dataset.left = 'nonexistent-a';
    badResizer.dataset.right = 'nonexistent-b';
    main.appendChild(badResizer);
    document.body.appendChild(main);

    expect(() => initDragResizer()).not.toThrow();
  });

  it('adds active class on pointerdown', () => {
    initDragResizer();
    const resizer = document.querySelector('.drag-resizer');
    resizer.setPointerCapture = vi.fn();
    resizer.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1 }));
    expect(resizer.classList.contains('active')).toBe(true);
  });

  it('removes active class on pointerup', () => {
    initDragResizer();
    const resizer = document.querySelector('.drag-resizer');
    resizer.setPointerCapture = vi.fn();
    resizer.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1 }));
    resizer.dispatchEvent(new PointerEvent('pointerup'));
    expect(resizer.classList.contains('active')).toBe(false);
  });
});

describe('initPanelTabs', () => {
  beforeEach(() => {
    document.body.innerHTML = '';

    const panels = ['panelLeft', 'panelCenter', 'panelRight'];
    panels.forEach(id => {
      const p = document.createElement('div');
      p.id = id;
      p.className = 'panel';
      document.body.appendChild(p);
    });

    const tabDefs = ['left', 'center', 'right'];
    tabDefs.forEach(name => {
      const btn = document.createElement('button');
      btn.className = 'panel-tab';
      btn.dataset.panel = name;
      btn.textContent = name;
      document.body.appendChild(btn);
    });
  });

  it('runs without throwing', () => {
    expect(() => initPanelTabs()).not.toThrow();
  });

  it('clicking a tab adds panel-active to the corresponding panel', () => {
    initPanelTabs();
    document.querySelector('[data-panel="center"]').click();
    expect(document.getElementById('panelCenter').classList.contains('panel-active')).toBe(true);
  });

  it('clicking a tab removes panel-active from previously active panel', () => {
    initPanelTabs();
    document.getElementById('panelLeft').classList.add('panel-active');
    document.querySelector('[data-panel="center"]').click();
    expect(document.getElementById('panelLeft').classList.contains('panel-active')).toBe(false);
  });
});

describe('updateTranscriptLineUI / removeTranscriptLineUI', () => {
  beforeEach(async () => {
    createTranscriptDOM();
    const { state } = await import('../app.js');
    state.transcript = [
      { id: 'line-1', text: 'Original text', bookmarked: false },
    ];
  });

  it('updateTranscriptLineUI updates text on the DOM element', async () => {
    const list = document.getElementById('transcriptList');
    const el = document.createElement('div');
    el.className = 'transcript-line';
    el.dataset.id = 'line-1';
    const textSpan = document.createElement('span');
    textSpan.className = 'transcript-text';
    textSpan.textContent = 'Original text';
    el.appendChild(textSpan);
    list.appendChild(el);

    const { state } = await import('../app.js');
    state.transcript[0].text = 'Updated text';

    updateTranscriptLineUI('line-1');
    expect(textSpan.textContent).toBe('Updated text');
  });

  it('removeTranscriptLineUI removes the element from the DOM', () => {
    const list = document.getElementById('transcriptList');
    const el = document.createElement('div');
    el.className = 'transcript-line';
    el.dataset.id = 'line-remove';
    list.appendChild(el);

    removeTranscriptLineUI('line-remove');
    expect(document.querySelector('.transcript-line[data-id="line-remove"]')).toBeNull();
  });

  it('removeTranscriptLineUI does not throw if element not found', () => {
    expect(() => removeTranscriptLineUI('no-such-id')).not.toThrow();
  });
});

describe('transcript waiting state helpers', () => {
  beforeEach(() => {
    document.body.innerHTML = '';

    const placeholder = document.createElement('div');
    placeholder.id = 'transcriptEmptyPlaceholder';
    document.body.appendChild(placeholder);

    const waiting = document.createElement('div');
    waiting.id = 'transcriptWaiting';
    waiting.style.display = 'none';
    document.body.appendChild(waiting);
  });

  it('showTranscriptWaiting makes the waiting element visible', () => {
    showTranscriptWaiting();
    expect(document.getElementById('transcriptWaiting').style.display).toBe('');
  });

  it('showTranscriptWaiting hides the placeholder', () => {
    showTranscriptWaiting();
    expect(document.getElementById('transcriptEmptyPlaceholder').style.display).toBe('none');
  });

  it('hideTranscriptWaiting hides the waiting element', () => {
    document.getElementById('transcriptWaiting').style.display = '';
    hideTranscriptWaiting();
    expect(document.getElementById('transcriptWaiting').style.display).toBe('none');
  });

  it('resetTranscriptEmpty restores placeholder and hides waiting', () => {
    showTranscriptWaiting();
    resetTranscriptEmpty();
    expect(document.getElementById('transcriptEmptyPlaceholder').style.display).toBe('');
    expect(document.getElementById('transcriptWaiting').style.display).toBe('none');
  });
});

describe('toggleTheme', () => {
  it('switches from dark to light', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    toggleTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('switches from light to dark', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    toggleTheme();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('calls emit with theme:change event', async () => {
    const { emit } = await import('../app.js');
    vi.clearAllMocks();
    document.documentElement.setAttribute('data-theme', 'dark');
    toggleTheme();
    expect(emit).toHaveBeenCalledWith('theme:change', { theme: 'light' });
  });
});

describe('getAnalysisAsText', () => {
  it('returns empty string for null', () => {
    expect(getAnalysisAsText(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(getAnalysisAsText(undefined)).toBe('');
  });

  it('returns markdown directly when analysis.markdown is present', () => {
    const analysis = { markdown: '## Summary\nsome text' };
    expect(getAnalysisAsText(analysis)).toBe('## Summary\nsome text');
  });

  it('builds markdown from legacy array sections', () => {
    const analysis = {
      actionItems: ['Do this', 'Do that'],
    };
    const result = getAnalysisAsText(analysis);
    expect(result).toContain('- Do this');
    expect(result).toContain('- Do that');
  });

  it('builds markdown from legacy string sections', () => {
    const analysis = { summary: 'Short summary' };
    const result = getAnalysisAsText(analysis);
    expect(result).toContain('Short summary');
  });
});

describe('AI waiting state helpers', () => {
  beforeEach(() => {
    document.body.innerHTML = '';

    const aiEmpty = document.createElement('div');
    aiEmpty.id = 'aiEmpty';
    const p = document.createElement('p');
    p.textContent = 'No analysis yet';
    aiEmpty.appendChild(p);
    document.body.appendChild(aiEmpty);

    const aiWaiting = document.createElement('div');
    aiWaiting.id = 'aiWaiting';
    aiWaiting.style.display = 'none';
    const hint = document.createElement('span');
    hint.id = 'aiWaitingHint';
    aiWaiting.appendChild(hint);
    document.body.appendChild(aiWaiting);
  });

  it('showAiWaiting makes #aiWaiting visible', () => {
    showAiWaiting(200);
    expect(document.getElementById('aiWaiting').style.display).toBe('');
  });

  it('showAiWaiting does not throw and leaves #aiWaiting visible', () => {
    // happy-dom does not support :scope > p in querySelectorAll on element nodes,
    // so the paragraph-hiding branch is a no-op here. We verify the function runs
    // without error and the primary visible effect (showing #aiWaiting) is correct.
    expect(() => showAiWaiting(200)).not.toThrow();
    expect(document.getElementById('aiWaiting').style.display).toBe('');
  });

  it('hideAiWaiting hides #aiWaiting', () => {
    document.getElementById('aiWaiting').style.display = '';
    hideAiWaiting();
    expect(document.getElementById('aiWaiting').style.display).toBe('none');
  });
});

describe('initContextPopup', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    const popup = document.createElement('div');
    popup.id = 'contextPopup';
    popup.hidden = true;
    document.body.appendChild(popup);
  });

  it('runs without throwing', () => {
    expect(() => initContextPopup()).not.toThrow();
  });

  it('emits transcript:bookmark when bookmark action is clicked', async () => {
    const { emit } = await import('../app.js');
    vi.clearAllMocks();

    initContextPopup();
    const popup = document.getElementById('contextPopup');
    popup.dataset.lineId = 'my-line';
    popup.hidden = false;

    const btn = document.createElement('button');
    btn.dataset.action = 'bookmark';
    popup.appendChild(btn);
    btn.click();

    expect(emit).toHaveBeenCalledWith('transcript:bookmark', { id: 'my-line' });
  });

  it('emits transcript:delete when delete action is clicked', async () => {
    const { emit } = await import('../app.js');
    vi.clearAllMocks();

    initContextPopup();
    const popup = document.getElementById('contextPopup');
    popup.dataset.lineId = 'del-line';
    popup.hidden = false;

    const btn = document.createElement('button');
    btn.dataset.action = 'delete';
    popup.appendChild(btn);
    btn.click();

    expect(emit).toHaveBeenCalledWith('transcript:delete', { id: 'del-line' });
  });
});
