// ui/dialog-a11y.js - Accessibility layer for every .modal-overlay dialog and
// off-canvas panel. Works generically (including overlays created at runtime)
// by observing the DOM, so the many existing open/close call sites
// (`el.hidden = false`, `overlay.remove()`, ...) need no changes.
//
// - role="dialog" + aria-modal + aria-labelledby (modal title) on each overlay
// - moves focus into a dialog when it opens, traps Tab / Shift+Tab inside the
//   topmost open dialog, restores focus to the opener when it closes
// - off-canvas panels marked aria-hidden="true" (settings panel) get `inert`
//   so they drop out of the tab order while closed
//
// Escape handling intentionally stays where it is (ui.js initKeyboardShortcuts
// and the per-modal handlers); this module only reacts to open/close.
//
// Single owner rule: ui/dialogs.js (confirm/prompt/alert, .app-dialog-overlay)
// owns its own semantics, initial focus, Tab trap and focus restoration. Here
// such overlays are tracked only so they count as the topmost dialog (nothing
// underneath grabs focus or traps Tab while they are open); this module never
// moves focus for them and never records/restores an opener for them.

import { t } from '../i18n.js';

const OVERLAY = '.modal-overlay';
const SELF_MANAGED = '.app-dialog-overlay';
const OFFCANVAS = '#settingsPanel';
const FOCUSABLE = [
  'a[href]', 'area[href]', 'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])', 'select:not([disabled])',
  'textarea:not([disabled])', 'iframe', 'summary',
  '[contenteditable=""]', '[contenteditable="true"]', '[tabindex]',
].join(',');
// First match in document order wins; [data-dialog-title] lets a modal opt in explicitly.
const TITLE = '[data-dialog-title], .modal-title, .modal-header h1, .modal-header h2, .modal-header h3, h1, h2, h3, .launcher-actions-title';
const TEXT_ENTRY = 'input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="button"]):not([type="submit"]):not([type="range"]), textarea';

let seq = 0;
/** Open dialogs, bottom → top: { el, returnFocus } */
const stack = [];
let pendingRestore = null;
let scheduled = false;

function isOpen(el) {
  if (!el.isConnected || el.hidden) return false;
  return getComputedStyle(el).display !== 'none';
}

function isVisible(el) {
  return el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
}

function focusables(root) {
  return [...root.querySelectorAll(FOCUSABLE)].filter(el =>
    el.tabIndex >= 0 && !el.closest('[inert]') && isVisible(el));
}

function canFocus(el) {
  return el && el.isConnected && el !== document.body && !el.closest('[inert]')
    && !el.closest('[hidden]') && isVisible(el);
}

/** Add dialog semantics to an overlay (idempotent). */
function decorate(overlay) {
  if (overlay.getAttribute('role') !== 'dialog') overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  if (!overlay.hasAttribute('tabindex')) overlay.setAttribute('tabindex', '-1');
  if (!overlay.hasAttribute('aria-labelledby') && !overlay.hasAttribute('aria-label')) {
    const title = overlay.querySelector(TITLE);
    if (title) {
      if (!title.id) title.id = `dlg-title-${++seq}`;
      overlay.setAttribute('aria-labelledby', title.id);
    } else {
      overlay.setAttribute('aria-label', t('a11y.dialog'));
    }
  }
  labelIconButtons(overlay);
}

/** Give "×"-style close buttons an accessible name when they have none. */
function labelIconButtons(root) {
  root.querySelectorAll('.modal-close, button[data-close]').forEach(btn => {
    if (btn.hasAttribute('aria-label') && btn.getAttribute('aria-label') !== 'close') return;
    if (btn.textContent.trim().length > 1) return; // has a real text label
    btn.setAttribute('data-i18n-aria', 'a11y.close');
    btn.setAttribute('aria-label', t('a11y.close'));
  });
}

function focusInitial(overlay) {
  if (overlay.contains(document.activeElement) && document.activeElement !== overlay) return;
  const items = focusables(overlay);
  // Touch devices: focusing a text/date field on open pops the soft keyboard or a
  // native picker over the dialog, so only honour an explicit [autofocus] there.
  const coarse = window.matchMedia?.('(pointer: coarse)')?.matches;
  const target = items.find(el => el.hasAttribute('autofocus'))
    || (coarse ? null : items.find(el => el.matches(TEXT_ENTRY)));
  (target || overlay).focus({ preventScroll: true });
}

/** Reconcile the open-dialog stack with the DOM. */
function sync() {
  scheduled = false;
  const open = [...document.querySelectorAll(OVERLAY)].filter(isOpen);

  // Closed (hidden or removed) dialogs
  for (let i = stack.length - 1; i >= 0; i--) {
    if (!open.includes(stack[i].el)) {
      const [entry] = stack.splice(i, 1);
      if (!entry.selfManaged) pendingRestore = entry.returnFocus || pendingRestore;
    }
  }

  // Newly opened dialogs
  for (const el of open) {
    if (stack.some(s => s.el === el)) continue;
    if (el.matches(SELF_MANAGED)) {
      stack.push({ el, returnFocus: null, selfManaged: true });
      continue;
    }
    decorate(el);
    const active = document.activeElement;
    const returnFocus = canFocus(active) && !el.contains(active) ? active : pendingRestore;
    pendingRestore = null;
    stack.push({ el, returnFocus });
  }

  const top = stack[stack.length - 1];
  if (top) {
    // A dialog closed on top of another one: return to its opener when that
    // opener lives in the dialog now on top, otherwise the default initial focus.
    const restore = pendingRestore;
    pendingRestore = null;
    if (top.selfManaged) return;
    if (restore && top.el.contains(restore) && canFocus(restore)
      && !top.el.contains(document.activeElement)) {
      restore.focus({ preventScroll: true });
    } else {
      focusInitial(top.el);
    }
  } else if (pendingRestore) {
    const target = pendingRestore;
    pendingRestore = null;
    const active = document.activeElement;
    if ((!active || active === document.body || !canFocus(active)) && canFocus(target)) {
      target.focus({ preventScroll: true });
    }
  }
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  // Let the opener's code finish populating/focusing before we reconcile.
  requestAnimationFrame(sync);
}

/** Off-canvas panels: inert while aria-hidden="true". */
let panelReturnFocus = null;
function syncOffcanvas(panel, fromMutation) {
  const closed = panel.getAttribute('aria-hidden') === 'true';
  if (closed === panel.inert) return;
  if (closed) {
    const hadFocus = panel.contains(document.activeElement);
    panel.inert = true;
    if (fromMutation && hadFocus && canFocus(panelReturnFocus)) panelReturnFocus.focus({ preventScroll: true });
    panelReturnFocus = null;
  } else {
    panelReturnFocus = document.activeElement;
    panel.inert = false;
    if (fromMutation) {
      const first = panel.querySelector('.settings-close') || focusables(panel)[0];
      first?.focus({ preventScroll: true });
    }
  }
}

function onKeydown(e) {
  if (e.key !== 'Tab' || e.altKey || e.ctrlKey || e.metaKey) return;
  const top = stack[stack.length - 1];
  if (!top || top.selfManaged || !isOpen(top.el)) return;
  const items = focusables(top.el);
  if (items.length === 0) { e.preventDefault(); top.el.focus({ preventScroll: true }); return; }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (!top.el.contains(active) || active === top.el) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  } else if (e.shiftKey && active === first) {
    e.preventDefault(); last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault(); first.focus();
  }
}

let initialized = false;
export function initDialogA11y() {
  if (initialized) return;
  initialized = true;

  labelIconButtons(document);
  document.querySelectorAll(OVERLAY).forEach(decorate);

  const panels = [...document.querySelectorAll(OFFCANVAS)];
  panels.forEach(p => syncOffcanvas(p, false));

  const mo = new MutationObserver(records => {
    for (const r of records) {
      const target = r.target;
      if (r.type === 'attributes' && r.attributeName === 'aria-hidden' && panels.includes(target)) {
        syncOffcanvas(target, true);
        continue;
      }
      if (r.type === 'attributes' && target.classList?.contains('modal-overlay')) { schedule(); continue; }
      if (r.type === 'childList') {
        const touched = [...r.addedNodes, ...r.removedNodes].some(n =>
          n.nodeType === 1 && (n.matches(OVERLAY) || n.querySelector?.(OVERLAY)));
        if (touched) schedule();
      }
    }
  });
  mo.observe(document.body, {
    subtree: true, childList: true, attributes: true,
    attributeFilter: ['hidden', 'style', 'class', 'aria-hidden'],
  });

  document.addEventListener('keydown', onKeydown);
  schedule();
}
