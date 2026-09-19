// @ts-check
// wake-lock.js - Screen Wake Lock helper. No document listeners here; the
// caller (meeting-session.js) re-acquires on visibilitychange.

let sentinel = null;

export function isSupported() {
  return 'wakeLock' in navigator;
}

export async function acquire() {
  if (sentinel) return true;
  if (!isSupported()) return false;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => { sentinel = null; });
    return true;
  } catch {
    sentinel = null;
    return false;
  }
}

export async function release() {
  if (!sentinel) return;
  try {
    await sentinel.release();
  } catch {
    // ignore
  }
  sentinel = null;
}

export function isHeld() {
  return !!sentinel;
}
