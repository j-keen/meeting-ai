// ui/toast.js - Toast notification system

const $ = (sel) => document.querySelector(sel);

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

  container.appendChild(el);
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
