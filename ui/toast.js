// ui/toast.js - Toast notification system

const $ = (sel) => document.querySelector(sel);

// Toast policy: at most MAX_VISIBLE on screen (oldest dismissed first; undo toasts
// are kept over plain ones), and an identical message already showing is refreshed
// instead of stacking a duplicate.
const MAX_VISIBLE = 2;
const TOAST_MS = 4000;

// Keep toasts off the interactive header of whatever is open: beside the
// settings panel on wide screens, and below the settings tabs / modal headers
// otherwise. Values feed the --toast-top / --toast-right vars in styles.css.
const GAP = 8;
function placeContainer(container) {
  container.style.removeProperty('--toast-top');
  container.style.removeProperty('--toast-right');
  const panel = document.querySelector('.settings-panel.open');
  const wide = window.innerWidth > 768;
  const avoid = [];
  if (panel) {
    if (wide && panel.offsetWidth < window.innerWidth - 240) {
      container.style.setProperty('--toast-right', `${panel.offsetWidth + 16}px`);
    } else {
      const head = panel.querySelector('.settings-tabs') || panel.querySelector('.settings-header');
      if (head) avoid.push(head);
    }
  }
  document.querySelectorAll('.modal-overlay:not(.app-dialog-overlay)').forEach(o => {
    if (o.hidden || getComputedStyle(o).display === 'none') return;
    const head = o.querySelector('.modal-header');
    if (head) avoid.push(head);
  });
  if (!avoid.length) return;
  const box = container.getBoundingClientRect();
  let top = box.top;
  for (const el of avoid) {
    const r = el.getBoundingClientRect();
    if (!r.width || r.left >= box.right || r.right <= box.left) continue;
    if (r.bottom + GAP > top && r.top < box.bottom) top = r.bottom + GAP;
  }
  if (top !== box.top) container.style.setProperty('--toast-top', `${Math.round(top)}px`);
}

function liveToasts(container) {
  return [...container.querySelectorAll('.toast')].filter(el => !el.classList.contains('toast-out'));
}

function enforceLimit(container, incoming = 1) {
  const live = liveToasts(container);
  let excess = live.length + incoming - MAX_VISIBLE;
  if (excess <= 0) return;
  const plain = live.filter(el => !el.classList.contains('undo-toast'));
  const undo = live.filter(el => el.classList.contains('undo-toast'));
  for (const el of [...plain, ...undo]) {
    if (excess-- <= 0) break;
    removeToast(el);
  }
}

export function showToast(message, type = 'success') {
  const container = $('#toastContainer');
  const dup = liveToasts(container).find(el =>
    !el.classList.contains('undo-toast') && el.classList.contains(type)
    && el.querySelector('.toast-message')?.textContent === String(message));
  if (dup) {
    clearTimeout(dup._toastTimer);
    dup._toastTimer = setTimeout(() => removeToast(dup), TOAST_MS);
    return;
  }
  enforceLimit(container);
  const tmpl = $('#tmplToast');
  const el = tmpl.content.cloneNode(true).querySelector('.toast');
  el.classList.add(type);
  el.querySelector('.toast-message').textContent = message;
  el.querySelector('.toast-close').addEventListener('click', () => removeToast(el));
  container.appendChild(el);
  placeContainer(container);
  el._toastTimer = setTimeout(() => removeToast(el), TOAST_MS);
}

export function showCenterToast(message, duration = 2500) {
  document.querySelector('.center-toast')?.remove();
  const el = document.createElement('div');
  el.className = 'center-toast';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => {
    el.classList.add('center-toast-out');
    setTimeout(() => el.remove(), 300);
  }, duration);
}

export function showUndoToast(message, undoCallback, duration = 5000) {
  const container = $('#toastContainer');
  const el = document.createElement('div');
  el.className = 'toast undo-toast';

  const msgSpan = document.createElement('span');
  msgSpan.className = 'toast-message';
  msgSpan.textContent = message;
  el.appendChild(msgSpan);

  const undoBtn = document.createElement('button');
  undoBtn.className = 'toast-undo-btn';
  undoBtn.textContent = undoCallback._undoLabel || 'Undo';
  let undone = false;
  undoBtn.addEventListener('click', () => {
    if (undone) return;
    undone = true;
    undoCallback();
    removeToast(el);
  });
  el.appendChild(undoBtn);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'toast-close';
  closeBtn.innerHTML = '&times;';
  closeBtn.addEventListener('click', () => removeToast(el));
  el.appendChild(closeBtn);

  // Progress bar
  const progress = document.createElement('div');
  progress.className = 'toast-undo-progress';
  progress.style.animationDuration = duration + 'ms';
  el.appendChild(progress);

  enforceLimit(container);
  container.appendChild(el);
  placeContainer(container);
  setTimeout(() => {
    if (!undone) removeToast(el);
  }, duration);

  return { cancel: () => { undone = true; removeToast(el); } };
}

function removeToast(el) {
  if (el.classList.contains('toast-out')) return;
  el.classList.add('toast-out');
  setTimeout(() => el.remove(), 300);
}

// Whisper toast — shown at top of transcript panel, auto-dismiss 3s, click to pin
export function showWhisperToast(text) {
  const container = $('#whisperContainer');
  if (!container) return;

  const el = document.createElement('div');
  el.className = 'whisper-toast';

  const icon = document.createElement('span');
  icon.className = 'whisper-icon';
  icon.textContent = '🔔';

  const msg = document.createElement('span');
  msg.className = 'whisper-text';
  msg.textContent = text;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'whisper-close';
  closeBtn.innerHTML = '&times;';
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    removeWhisper(el);
  });

  el.appendChild(icon);
  el.appendChild(msg);
  el.appendChild(closeBtn);

  // Click to pin/unpin
  let pinned = false;
  let autoTimer = setTimeout(() => {
    if (!pinned) removeWhisper(el);
  }, 5000);

  el.addEventListener('click', () => {
    pinned = !pinned;
    el.classList.toggle('whisper-pinned', pinned);
    if (pinned) {
      clearTimeout(autoTimer);
    } else {
      autoTimer = setTimeout(() => removeWhisper(el), 3000);
    }
  });

  container.appendChild(el);
  // Trigger enter animation
  requestAnimationFrame(() => el.classList.add('whisper-visible'));
}

function removeWhisper(el) {
  if (el.classList.contains('whisper-out')) return;
  el.classList.add('whisper-out');
  setTimeout(() => el.remove(), 300);
}
