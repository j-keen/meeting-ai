// hint-system.js - Smart hint rotation with level system, context detection, and progress dots

import { state, on } from './event-bus.js';
import { loadSettings, saveSettings } from './storage.js';
import { t } from './i18n.js';

const INTERVAL = 3500;
const FADE = 300;
const LEVEL_THRESHOLDS = [0, 1, 6, 20]; // L0, L1, L2, L3(auto-hide)

// Context state machine: idle → rec0 → rec1 → analyzed → ended
let context = 'idle';
let transcriptLineCount = 0;

// Per-panel rotation state
const panels = {};

function getLevel() {
  const settings = loadSettings();
  const lifetime = (settings.lifetimeEditCount || 0) + state.sessionEditCount;
  if (lifetime >= LEVEL_THRESHOLDS[3]) return 3;
  if (lifetime >= LEVEL_THRESHOLDS[2]) return 2;
  if (lifetime >= LEVEL_THRESHOLDS[1]) return 1;
  return 0;
}

function resolvePool(panel, level, ctx) {
  // Try exact match, then lower levels, then idle context, then guaranteed fallback
  for (let l = level; l >= 0; l--) {
    const keys = collectKeys(panel, l, ctx);
    if (keys.length) return keys;
  }
  // Fallback to idle context at any level
  for (let l = level; l >= 0; l--) {
    const keys = collectKeys(panel, l, 'idle');
    if (keys.length) return keys;
  }
  // Absolute fallback
  return [t(`hint.${panel}.L0.idle.0`)];
}

function collectKeys(panel, level, ctx) {
  const prefix = `hint.${panel}.L${level}.${ctx}.`;
  const results = [];
  for (let i = 0; i < 5; i++) {
    const key = prefix + i;
    const val = t(key);
    // t() returns the key itself if not found
    if (val && val !== key) results.push(val);
  }
  return results;
}

function initPanel(panel, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const textEl = container.querySelector('.panel-hint-text');
  const dotsEl = container.querySelector('.panel-hint-dots');
  const dismissBtn = container.querySelector('.panel-hint-dismiss');

  const p = {
    container,
    textEl,
    dotsEl,
    pool: [],
    idx: 0,
    interval: null,
  };
  panels[panel] = p;

  dismissBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dismiss();
  });

  // Accordion: click hint container to collapse
  container.addEventListener('click', () => {
    toggleHintCollapse(panel);
  });

  // Accordion: toggle bar
  const toggleBar = container.parentElement.querySelector(`.panel-hint-toggle-bar[data-target="${containerId}"]`);
  if (toggleBar) {
    toggleBar.addEventListener('click', () => {
      toggleHintCollapse(panel);
    });
    p.toggleBar = toggleBar;
  }

  // Restore collapsed state
  const settings = loadSettings();
  if (settings.hintsCollapsed) {
    container.classList.add('collapsed');
    if (toggleBar) toggleBar.querySelector('.panel-hint-toggle').classList.add('collapsed');
  }

  refreshPool(panel);
  startRotation(panel);
}

function refreshPool(panel) {
  const p = panels[panel];
  if (!p) return;

  const level = getLevel();

  // L3: auto-hide
  if (level >= 3) {
    const settings = loadSettings();
    if (!settings.hintsHidden) {
      settings.hintsHidden = true;
      saveSettings(settings);
    }
    p.container.classList.add('hidden');
    if (p.toggleBar) p.toggleBar.classList.add('hidden');
    return;
  }

  // Check if user has hidden hints
  const settings = loadSettings();
  if (settings.hintsHidden) {
    p.container.classList.add('hidden');
    if (p.toggleBar) p.toggleBar.classList.add('hidden');
    return;
  }

  p.container.classList.remove('hidden');
  if (p.toggleBar) p.toggleBar.classList.remove('hidden');
  p.pool = resolvePool(panel, level, context);
  p.idx = 0;

  // Render dots
  renderDots(p);
  showCurrent(p);
}

function renderDots(p) {
  p.dotsEl.innerHTML = '';
  if (p.pool.length <= 1) return;
  for (let i = 0; i < p.pool.length; i++) {
    const dot = document.createElement('span');
    dot.className = 'dot' + (i === 0 ? ' active' : '');
    p.dotsEl.appendChild(dot);
  }
}

function showCurrent(p) {
  if (!p.pool.length) return;
  p.textEl.textContent = p.pool[p.idx];
  // Update active dot
  const dots = p.dotsEl.querySelectorAll('.dot');
  dots.forEach((d, i) => d.classList.toggle('active', i === p.idx));
}

function startRotation(panel) {
  const p = panels[panel];
  if (!p) return;
  stopRotation(panel);

  if (p.pool.length <= 1) return;

  p.interval = setInterval(() => {
    p.textEl.classList.add('fade-out');
    setTimeout(() => {
      p.idx = (p.idx + 1) % p.pool.length;
      showCurrent(p);
      p.textEl.classList.remove('fade-out');
    }, FADE);
  }, INTERVAL);
}

function stopRotation(panel) {
  const p = panels[panel];
  if (!p) return;
  if (p.interval) {
    clearInterval(p.interval);
    p.interval = null;
  }
}

function refreshAll() {
  for (const panel of Object.keys(panels)) {
    refreshPool(panel);
    startRotation(panel);
  }
}

function setContext(newCtx) {
  if (context === newCtx) return;
  context = newCtx;
  refreshAll();
}

function incrementEditCount() {
  state.sessionEditCount++;
  const settings = loadSettings();
  settings.lifetimeEditCount = (settings.lifetimeEditCount || 0) + 1;
  saveSettings(settings);

  // Check if level changed
  refreshAll();
}

function toggleHintCollapse(panel) {
  const settings = loadSettings();
  const collapsed = !settings.hintsCollapsed;
  settings.hintsCollapsed = collapsed;
  saveSettings(settings);

  for (const [, p] of Object.entries(panels)) {
    p.container.classList.toggle('collapsed', collapsed);
    if (p.toggleBar) {
      p.toggleBar.querySelector('.panel-hint-toggle').classList.toggle('collapsed', collapsed);
    }
  }
}

function dismiss() {
  const settings = loadSettings();
  settings.hintsHidden = true;
  saveSettings(settings);
  for (const p of Object.values(panels)) {
    p.container.classList.add('hidden');
    if (p.toggleBar) p.toggleBar.classList.add('hidden');
  }
}

export function setHintsVisible(visible) {
  const settings = loadSettings();
  settings.hintsHidden = !visible;
  saveSettings(settings);
  refreshAll();
}

export function initHintSystem() {
  initPanel('transcript', 'transcriptHintContainer');
  initPanel('analysis', 'analysisHintContainer');

  // Subscribe to events for context transitions
  on('recording:started', () => {
    transcriptLineCount = state.transcript.length;
    setContext(transcriptLineCount > 0 ? 'rec1' : 'rec0');
  });

  on('recording:stopped', () => {
    if (context === 'rec0' || context === 'rec1') {
      setContext('idle');
    }
  });

  on('meeting:ending', () => {
    setContext('ended');
  });

  on('analysis:complete', () => {
    setContext('analyzed');
  });

  // Track transcript growth for rec0 → rec1 transition
  on('transcript:add', () => {
    if (context === 'rec0') {
      transcriptLineCount++;
      if (transcriptLineCount >= 3) {
        setContext('rec1');
      }
    }
  });

  // Track edits for level progression
  on('transcript:edit', () => {
    incrementEditCount();
  });

  on('analysis:userCorrections', () => {
    incrementEditCount();
  });
}
