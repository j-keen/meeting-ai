// ui/dialogs.js - In-app replacements for window.confirm / prompt / alert.
//
// Promise-based and styled like the rest of the app (.modal-overlay/.modal):
//   await confirmDialog({ message, danger: true })   -> true | false
//   await promptDialog({ label, defaultValue })       -> string | null (null = cancelled; '' is a valid answer)
//   await alertDialog({ message })                     -> undefined
// Enter confirms, Escape cancels, a backdrop click cancels, focus goes to the
// primary button (or the input for prompts) and returns to the opener on close.
// Requests made while a dialog is open are queued and shown one at a time.

import { t } from '../i18n.js';

let seq = 0;
let queue = Promise.resolve();

function tr(key, fallback) {
  const s = t(key);
  return s && s !== key ? s : fallback;
}

function normalize(opts) {
  return typeof opts === 'string' ? { message: opts } : (opts || {});
}

function focusables(root) {
  return [...root.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])')]
    .filter(el => !el.disabled && !el.hidden);
}

function openDialog(kind, opts) {
  const run = () => new Promise((resolve) => {
    const id = `appDialog${++seq}`;
    const { title, message, label, defaultValue, placeholder, confirmText, cancelText, danger } = opts;
    const opener = document.activeElement;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay app-dialog-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.dataset.dialogKind = kind;

    const box = document.createElement('div');
    box.className = 'modal app-dialog' + (danger ? ' app-dialog--danger' : '');
    overlay.appendChild(box);

    const body = document.createElement('div');
    body.className = 'app-dialog-body';
    box.appendChild(body);

    let labelledBy = null;
    if (title) {
      const h = document.createElement('h3');
      h.className = 'app-dialog-title';
      h.id = `${id}-title`;
      h.textContent = title;
      body.appendChild(h);
      labelledBy = h.id;
    }
    if (message) {
      const p = document.createElement('p');
      p.className = 'app-dialog-message';
      p.id = `${id}-msg`;
      p.textContent = message;
      body.appendChild(p);
      if (labelledBy) overlay.setAttribute('aria-describedby', p.id);
      else labelledBy = p.id;
    }

    let input = null;
    if (kind === 'prompt') {
      const lab = document.createElement('label');
      lab.className = 'app-dialog-label';
      lab.id = `${id}-label`;
      lab.htmlFor = `${id}-input`;
      lab.textContent = label || '';
      if (label) body.appendChild(lab);
      input = document.createElement('input');
      input.type = 'text';
      input.className = 'app-dialog-input';
      input.id = `${id}-input`;
      input.autocomplete = 'off';
      input.value = defaultValue != null ? String(defaultValue) : '';
      if (placeholder) input.placeholder = placeholder;
      body.appendChild(input);
      if (!labelledBy && label) labelledBy = lab.id;
    }
    if (labelledBy) overlay.setAttribute('aria-labelledby', labelledBy);

    const actions = document.createElement('div');
    actions.className = 'app-dialog-actions';
    box.appendChild(actions);

    let cancelBtn = null;
    if (kind !== 'alert') {
      cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn app-dialog-cancel';
      cancelBtn.textContent = cancelText || tr('dialog.cancel', 'Cancel');
      actions.appendChild(cancelBtn);
    }
    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'btn btn-primary app-dialog-ok' + (danger ? ' app-dialog-ok--danger' : '');
    okBtn.textContent = confirmText || tr('dialog.ok', 'OK');
    actions.appendChild(okBtn);

    let done = false;
    let onKey = null;
    const close = (confirmed) => {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) {
        try { opener.focus({ preventScroll: true }); } catch { /* ignore */ }
      }
      if (kind === 'confirm') resolve(!!confirmed);
      else if (kind === 'prompt') resolve(confirmed ? input.value : null);
      else resolve(undefined);
    };

    // Capture phase so global Escape/Enter shortcuts (e.g. "close the modal
    // underneath") don't also fire while this dialog is on top.
    onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(false);
      } else if (e.key === 'Enter') {
        if (e.isComposing || e.keyCode === 229) return; // Korean IME composing
        e.preventDefault();
        e.stopPropagation();
        if (e.target === cancelBtn) close(false);
        else close(true);
      } else if (e.key === 'Tab') {
        const list = focusables(box);
        if (!list.length) return;
        const first = list[0];
        const last = list[list.length - 1];
        const inside = box.contains(document.activeElement);
        if (e.shiftKey && (document.activeElement === first || !inside)) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
          e.preventDefault(); first.focus();
        }
        e.stopPropagation();
      }
    };

    okBtn.addEventListener('click', () => close(true));
    cancelBtn?.addEventListener('click', () => close(false));
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) overlay.dataset.backdropDown = '1';
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay && overlay.dataset.backdropDown === '1') close(false);
      delete overlay.dataset.backdropDown;
    });
    // Don't let "click outside to close" handlers of whatever sits underneath
    // (popovers, panels) see clicks made inside this dialog.
    ['mousedown', 'pointerdown', 'touchstart', 'click'].forEach((type) => {
      overlay.addEventListener(type, (e) => e.stopPropagation());
    });
    document.addEventListener('keydown', onKey, true);

    document.body.appendChild(overlay);
    if (input) {
      input.focus();
      input.select();
    } else {
      okBtn.focus();
    }
  });

  const p = queue.then(run, run);
  queue = p.then(() => {}, () => {});
  return p;
}

/** @returns {Promise<boolean>} */
export function confirmDialog(opts) {
  return openDialog('confirm', normalize(opts));
}

/** @returns {Promise<string|null>} null when cancelled; '' when confirmed empty. */
export function promptDialog(opts) {
  const o = normalize(opts);
  // promptDialog('Label') reads like window.prompt('Label')
  if (typeof opts === 'string') { o.label = o.message; delete o.message; }
  return openDialog('prompt', o);
}

/** @returns {Promise<void>} */
export function alertDialog(opts) {
  return openDialog('alert', normalize(opts));
}

// Bridge for classic (non-module) scripts such as supabase-client.js.
if (typeof window !== 'undefined') {
  window.appDialogs = {
    confirm: confirmDialog,
    prompt: promptDialog,
    alert: alertDialog,
    authError: (message) => alertDialog({
      title: tr('auth.login_failed_title', 'Sign-in failed'),
      message: t('auth.login_failed', { msg: message || '' }),
    }),
  };
}
