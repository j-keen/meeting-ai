// ui.js - Facade module (re-exports from ui/ sub-modules + initialization functions)

import { state, emit } from './event-bus.js';
import { t } from './i18n.js';

// ===== Re-exports from sub-modules =====
export { showToast, showCenterToast, showWhisperToast, showUndoToast } from './ui/toast.js';

export {
  addTranscriptLine,
  showInterim,
  clearInterim,
  addMemoLine,
  initContextPopup,
  updateTranscriptLineUI,
  removeTranscriptLineUI,
  showTranscriptConnecting,
  showTranscriptIdle,
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
  showAiIdle,
  showAiWaiting,
  hideAiWaiting,
  resetAiEmpty,
  showChatIdle,
  showChatWaiting,
  resetChatEmpty,
} from './ui/analysis.js';

export {
  renderHistoryGrid,
  renderMeetingViewer,
  renderHighlights,
  renderInboxPreview,
  scrollToTranscriptLine,
  toggleTrashMode,
  isTrashMode,
  updateTrashBadge,
  refreshTrashView,
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
      updateAriaValue();
    });

    // a11y: role="separator" is focusable, so expose its value and support arrow keys
    function updateAriaValue() {
      const l = leftPanel.getBoundingClientRect().width;
      const total = l + rightPanel.getBoundingClientRect().width;
      if (total > 0) resizer.setAttribute('aria-valuenow', String(Math.round((l / total) * 100)));
    }
    resizer.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const l = leftPanel.getBoundingClientRect().width;
      const total = l + rightPanel.getBoundingClientRect().width;
      const step = e.shiftKey ? 80 : 20;
      const leftWidth = Math.max(200, Math.min(l + (e.key === 'ArrowLeft' ? -step : step), total - 200));
      leftPanel.style.flex = `0 0 ${leftWidth}px`;
      rightPanel.style.flex = `0 0 ${total - leftWidth}px`;
      updateAriaValue();
    });
    requestAnimationFrame(updateAriaValue);
  });
}

// ===== Mobile Panel Tabs + Swipe =====
export function initPanelTabs() {
  const tabs = document.querySelectorAll('.panel-tab');
  const panels = [document.getElementById('panelLeft'), document.getElementById('panelCenter'), document.getElementById('panelRight')];
  const mainContent = document.querySelector('.main-content');
  let currentIndex = 0;

  // Add sliding indicator to tab bar
  const tabBar = document.getElementById('panelTabs');
  let indicator = tabBar.querySelector('.panel-tabs-indicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.className = 'panel-tabs-indicator';
    tabBar.appendChild(indicator);
  }

  const isMobile = () => window.innerWidth <= 768;

  // On phones the non-active panels sit off-screen (translateX) but would still
  // be Tab / screen-reader reachable: make them inert. Desktop shows all three.
  function syncPanelInert() {
    const mobile = isMobile();
    panels.forEach((p, i) => p?.toggleAttribute('inert', mobile && i !== currentIndex));
  }

  function switchToPanel(index, animate = true) {
    if (index < 0 || index > 2) return;
    currentIndex = index;

    // Update tabs
    tabs.forEach(t => t.classList.remove('active'));
    tabs[index].classList.add('active');

    // Slide indicator
    indicator.style.transform = `translateX(${index * 100}%)`;

    // Slide panels (mobile only)
    if (isMobile()) {
      panels.forEach((p, i) => {
        if (!animate) p.classList.add('swiping');
        p.style.transform = `translateX(${(i - index) * 100}%)`;
        p.classList.toggle('panel-active', i === index);
        if (!animate) requestAnimationFrame(() => p.classList.remove('swiping'));
      });
    } else {
      panels.forEach((p, i) => {
        p.style.transform = '';
        p.classList.toggle('panel-active', i === index);
      });
    }
    syncPanelInert();
  }

  // Tab click handlers
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => switchToPanel(i));
  });

  // Clear inline transforms when switching to desktop
  window.addEventListener('resize', () => {
    if (!isMobile()) {
      panels.forEach(p => { p.style.transform = ''; p.classList.remove('swiping'); });
    } else {
      // Re-apply transforms for current index
      panels.forEach((p, i) => {
        p.style.transform = `translateX(${(i - currentIndex) * 100}%)`;
      });
    }
    syncPanelInert();
  });

  // ===== Touch Swipe =====
  let touchStartX = 0;
  let touchStartY = 0;
  let touchDeltaX = 0;
  let isSwiping = false;
  let directionLocked = false;

  mainContent.addEventListener('touchstart', (e) => {
    // Only on mobile
    if (window.innerWidth > 768) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchDeltaX = 0;
    isSwiping = false;
    directionLocked = false;
  }, { passive: true });

  mainContent.addEventListener('touchmove', (e) => {
    if (window.innerWidth > 768) return;
    const dx = e.touches[0].clientX - touchStartX;
    const dy = e.touches[0].clientY - touchStartY;

    // Lock direction on first significant movement
    if (!directionLocked && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      directionLocked = true;
      isSwiping = Math.abs(dx) > Math.abs(dy);
    }

    if (!isSwiping) return;
    e.preventDefault();
    touchDeltaX = dx;

    // Rubber-band effect at edges
    let clampedDx = dx;
    if ((currentIndex === 0 && dx > 0) || (currentIndex === 2 && dx < 0)) {
      clampedDx = dx * 0.3; // resistance at edges
    }

    // Live drag panels
    panels.forEach((p, i) => {
      p.classList.add('swiping');
      p.style.transform = `translateX(calc(${(i - currentIndex) * 100}% + ${clampedDx}px))`;
    });
    // Live drag indicator
    const indicatorOffset = currentIndex * 100;
    const indicatorDelta = (-clampedDx / mainContent.offsetWidth) * 100;
    indicator.style.transition = 'none';
    indicator.style.transform = `translateX(${indicatorOffset + indicatorDelta}%)`;
  }, { passive: false });

  mainContent.addEventListener('touchend', () => {
    if (window.innerWidth > 768 || !isSwiping) return;
    // Restore transitions
    panels.forEach(p => p.classList.remove('swiping'));
    indicator.style.transition = '';

    const threshold = 50;
    if (touchDeltaX < -threshold && currentIndex < 2) {
      switchToPanel(currentIndex + 1);
    } else if (touchDeltaX > threshold && currentIndex > 0) {
      switchToPanel(currentIndex - 1);
    } else {
      // Snap back
      switchToPanel(currentIndex);
    }
  }, { passive: true });

  // Initialize position without animation
  switchToPanel(0, false);
}

// ===== Mobile Bottom Bar Overflow Menu =====
// Keeps #btnRecord (and #btnEndMeeting while it's visible) always reachable on
// narrow screens by moving secondary controls into a "⋯" popover menu. Elements
// are moved (not cloned), so their existing event listeners keep working.
export function initBottomBarOverflow() {
  const toggleBtn = document.getElementById('btnBottomOverflow');
  const menu = document.getElementById('bottomOverflowMenu');
  const bottomCenter = document.getElementById('bottomCenter');
  const endBtn = document.getElementById('btnEndMeeting');
  if (!toggleBtn || !menu || !bottomCenter || !endBtn) return;

  // Kept directly reachable in .bottom-center: overflow toggle, record, end meeting.
  const beforeEndMeeting = ['btnHighAccuracy', 'sttStatusChip'];
  const afterEndMeeting = ['bottomDivider', 'btnLoadDemo', 'btnLoadDemo2'];

  const mq = window.matchMedia('(max-width: 768px)');

  function closeMenu() {
    if (menu.hidden) return;
    menu.hidden = true;
    toggleBtn.setAttribute('aria-expanded', 'false');
  }

  function applyLayout(compact) {
    document.body.classList.toggle('bar-compact', compact);
    if (compact) {
      toggleBtn.hidden = false;
      [...beforeEndMeeting, ...afterEndMeeting].forEach(id => {
        const el = document.getElementById(id);
        if (el && el.parentElement !== menu) menu.appendChild(el);
      });
    } else {
      toggleBtn.hidden = true;
      closeMenu();
      beforeEndMeeting.forEach(id => {
        const el = document.getElementById(id);
        if (el && el.parentElement !== bottomCenter) bottomCenter.insertBefore(el, endBtn);
      });
      afterEndMeeting.forEach(id => {
        const el = document.getElementById(id);
        if (el && el.parentElement !== bottomCenter) bottomCenter.appendChild(el);
      });
    }
  }

  /** Would the full (uncollapsed) bar clip? Measured synchronously, so nothing paints in between. */
  function fullBarOverflows() {
    applyLayout(false);
    const bar = bottomCenter.parentElement;
    const r = bottomCenter.getBoundingClientRect();
    return r.left < 0 || r.right > window.innerWidth
      || bottomCenter.scrollWidth > bottomCenter.clientWidth + 1
      || (bar && bar.scrollWidth > bar.clientWidth + 1);
  }

  // Compact on narrow screens, and also whenever the full bar doesn't fit — e.g. a phone in
  // landscape, or a long STT chip label — so REC is never pushed off-screen.
  let observer = null;
  let scheduled = false;
  function relayout() {
    scheduled = false;
    const wasOpen = !menu.hidden;
    const compact = mq.matches || fullBarOverflows();
    applyLayout(compact);
    if (compact && wasOpen) { menu.hidden = false; toggleBtn.setAttribute('aria-expanded', 'true'); }
    observer?.takeRecords(); // our own node moves are not a reason to re-run
  }
  function scheduleRelayout() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(relayout);
  }

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = menu.hidden;
    menu.hidden = !willOpen;
    toggleBtn.setAttribute('aria-expanded', String(willOpen));
  });

  // Close after acting on an item inside the menu, or on outside click / Escape.
  menu.addEventListener('click', (e) => {
    if (e.target.closest('button')) closeMenu();
  });
  document.addEventListener('click', (e) => {
    if (!menu.hidden && !menu.contains(e.target) && e.target !== toggleBtn) closeMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) closeMenu();
  });

  relayout();
  mq.addEventListener('change', scheduleRelayout);
  window.addEventListener('resize', scheduleRelayout);
  // State changes add/remove bar buttons (recording, post-end, loaded) and the chip label
  // changes with the engine; re-check when any of that happens.
  observer = new MutationObserver(scheduleRelayout);
  observer.observe(bottomCenter, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'class', 'style'] });
  observer.observe(menu, { childList: true, subtree: true, characterData: true });
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
}

// ===== Narrow Header Overflow Menu =====
// On phones the header can't fit logo/timer pill + title + four icon buttons, so
// secondary buttons move (not cloned — listeners and the auth label updates in
// supabase-client.js keep working) into a "⋯" popover: theme + login at <=430px,
// history too at <=360px. Settings stays in the bar.
export function initHeaderOverflow() {
  const toggleBtn = document.getElementById('btnHeaderMore');
  const menu = document.getElementById('headerMoreMenu');
  const settingsBtn = document.getElementById('btnSettings');
  if (!toggleBtn || !menu || !settingsBtn) return;
  const bar = settingsBtn.parentElement;
  const narrow = window.matchMedia('(max-width: 430px)');
  const tiny = window.matchMedia('(max-width: 360px)');

  function closeMenu() {
    if (menu.hidden) return;
    menu.hidden = true;
    toggleBtn.setAttribute('aria-expanded', 'false');
  }

  function place(id, inMenu, restore) {
    const el = document.getElementById(id);
    if (!el) return;
    if (inMenu) { if (el.parentElement !== menu) menu.appendChild(el); }
    else if (el.parentElement !== bar) restore(el);
  }

  function applyLayout() {
    const isNarrow = narrow.matches;
    const isTiny = tiny.matches;
    toggleBtn.hidden = !isNarrow;
    if (!isNarrow) closeMenu();
    // Menu order: history, theme, login. Bar order: theme, history, settings, login, ⋯
    place('btnHistory', isTiny, el => bar.insertBefore(el, settingsBtn));
    const history = document.getElementById('btnHistory');
    place('btnThemeToggle', isNarrow, el => bar.insertBefore(el, history?.parentElement === bar ? history : settingsBtn));
    place('btnAuth', isNarrow, el => bar.insertBefore(el, toggleBtn));
    if (history?.parentElement === menu && menu.firstElementChild !== history) menu.prepend(history);
  }

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = menu.hidden;
    menu.hidden = !willOpen;
    toggleBtn.setAttribute('aria-expanded', String(willOpen));
  });
  menu.addEventListener('click', (e) => {
    if (e.target.closest('button')) closeMenu();
  });
  document.addEventListener('click', (e) => {
    if (!menu.hidden && !menu.contains(e.target) && !toggleBtn.contains(e.target)) closeMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) { closeMenu(); toggleBtn.focus(); }
  });

  applyLayout();
  narrow.addEventListener('change', applyLayout);
  tiny.addEventListener('change', applyLayout);
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
    let mouseDownTarget = null;
    overlay.addEventListener('mousedown', (e) => {
      mouseDownTarget = e.target;
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay && mouseDownTarget === overlay) overlay.hidden = true;
      mouseDownTarget = null;
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
