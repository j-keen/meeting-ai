import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../i18n.js', () => ({ t: (k, p) => (p ? `${k}:${JSON.stringify(p)}` : k) }));

import { confirmDialog, promptDialog, alertDialog } from '../ui/dialogs.js';

const tick = () => new Promise(r => setTimeout(r, 0));
const overlay = () => document.querySelector('.app-dialog-overlay');
const key = (k, target = document.activeElement || document.body) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

describe('ui/dialogs', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('confirmDialog renders an accessible modal and resolves true on OK', async () => {
    const p = confirmDialog({ title: 'Delete?', message: 'Gone forever', confirmText: 'Delete', danger: true });
    await tick();
    const ov = overlay();
    expect(ov).toBeTruthy();
    expect(ov.classList.contains('modal-overlay')).toBe(true);
    expect(ov.getAttribute('role')).toBe('dialog');
    expect(ov.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(ov.getAttribute('aria-labelledby')).textContent).toBe('Delete?');
    const ok = ov.querySelector('.app-dialog-ok');
    expect(ok.textContent).toBe('Delete');
    expect(ok.classList.contains('app-dialog-ok--danger')).toBe(true);
    expect(document.activeElement).toBe(ok);
    ok.click();
    await expect(p).resolves.toBe(true);
    expect(overlay()).toBeNull();
  });

  it('confirmDialog resolves false on Cancel and on Escape; true on Enter', async () => {
    let p = confirmDialog('Sure?');
    await tick();
    overlay().querySelector('.app-dialog-cancel').click();
    await expect(p).resolves.toBe(false);

    p = confirmDialog('Sure?');
    await tick();
    key('Escape');
    await expect(p).resolves.toBe(false);

    p = confirmDialog('Sure?');
    await tick();
    key('Enter');
    await expect(p).resolves.toBe(true);
  });

  it('Escape does not reach document-level handlers underneath', async () => {
    const spy = vi.fn();
    document.addEventListener('keydown', spy);
    const p = confirmDialog('x');
    await tick();
    key('Escape');
    await p;
    expect(spy).not.toHaveBeenCalled();
    document.removeEventListener('keydown', spy);
  });

  it('promptDialog returns the value, "" when confirmed empty, null when cancelled', async () => {
    let p = promptDialog({ label: 'Name', defaultValue: 'abc' });
    await tick();
    const input = overlay().querySelector('input');
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('abc');
    input.value = 'new';
    key('Enter', input);
    await expect(p).resolves.toBe('new');

    p = promptDialog({ label: 'Name' });
    await tick();
    key('Enter', overlay().querySelector('input'));
    await expect(p).resolves.toBe('');

    p = promptDialog({ label: 'Name', defaultValue: 'x' });
    await tick();
    key('Escape');
    await expect(p).resolves.toBeNull();
  });

  it('alertDialog has a single button and resolves when dismissed', async () => {
    const p = alertDialog({ message: 'Heads up' });
    await tick();
    expect(overlay().querySelectorAll('button').length).toBe(1);
    overlay().querySelector('.app-dialog-ok').click();
    await expect(p).resolves.toBeUndefined();
  });

  it('queues dialogs requested while one is open', async () => {
    const a = confirmDialog('first');
    const b = confirmDialog('second');
    await tick();
    expect(document.querySelectorAll('.app-dialog-overlay').length).toBe(1);
    expect(overlay().textContent).toContain('first');
    overlay().querySelector('.app-dialog-ok').click();
    await expect(a).resolves.toBe(true);
    await tick();
    expect(overlay().textContent).toContain('second');
    overlay().querySelector('.app-dialog-cancel').click();
    await expect(b).resolves.toBe(false);
  });

  it('exposes window.appDialogs for classic scripts', () => {
    expect(typeof window.appDialogs.authError).toBe('function');
    expect(typeof window.appDialogs.confirm).toBe('function');
  });
});
