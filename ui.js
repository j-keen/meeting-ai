// ui.js - Facade module (re-exports from ui/ sub-modules + initialization functions)

import { state, emit } from './event-bus.js';
import { t } from './i18n.js';

// ===== Re-exports from sub-modules =====
export { showToast, showCenterToast } from './ui/toast.js';

export {
  addTranscriptLine,
  showInterim,
  clearInterim,
  addMemoLine,
  initContextPopup,
  updateTranscriptLineUI,
  removeTranscriptLineUI,
  showTranscriptConnecting,
  showTranscriptWaiting,
  hideTranscriptWaiting,
  resetTranscriptEmpty,
} from './ui/transcript.js';

export {
  showAnalysisSkeletons,
  renderAnalysis,
  updateAnalysisNav,
  getAnalysisAsText,
  renderAnalysisInto,
  renderAnalysisHistory,
  showAiWaiting,
  hideAiWaiting,
  resetAiEmpty,
  showChatWaiting,
  resetChatEmpty,
} from './ui/analysis.js';

export {
  renderHistoryGrid,
  renderMeetingViewer,
  renderHighlights,
  renderInboxPreview,
  scrollToTranscriptLine,
} from './ui/history-view.js';

// ===== Initialization functions (kept in facade) =====
const $ = (sel) => document.querySelector(sel);

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
      // viewerModal -> historyModal
      const viewerModal = $('#viewerModal');
      if (viewerModal && !viewerModal.hidden) {
        viewerModal.hidden = true;
        $('#historyModal').hidden = false;
        return;
      }
      // If any modal is open, close it first and stop
      const openModals = document.querySelectorAll('.modal-overlay:not([hidden])');
      if (openModals.length > 0) {
        openModals.forEach(m => m.hidden = true);
        return;
      }
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
