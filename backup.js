// @ts-check
// backup.js - Whole-app backup: every meeting, contact, location, preset and setting kept in
// localStorage goes into one JSON file, and can be restored from it. Audio recordings live in
// IndexedDB and are not included (they can be downloaded per meeting).

export const BACKUP_FORMAT = 'meeting-ai-backup';
export const BACKUP_VERSION = 1;

// Keys that belong to the app. Drafts / per-day usage counters / device ids are transient.
const INCLUDE = /^(meeting|faqItems$)/;
const EXCLUDE = new Set([
  'meeting_daily_usage', 'meeting-ai-device-id', 'meeting-ai-stt-debug',
  'meeting-ai-draft', 'meeting-ai-active-session', 'meeting-ai-analytics-optout',
]);
// Never export secrets that older versions may have stored inside settings.
const SECRET_SETTINGS = ['geminiApiKey', 'openaiApiKey'];

/** @param {Storage} [store] */
export function buildBackup(store = localStorage) {
  /** @type {Record<string, string>} */
  const data = {};
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (!key || !INCLUDE.test(key) || EXCLUDE.has(key)) continue;
    const value = store.getItem(key);
    if (value !== null) data[key] = value;
  }
  if (data['meeting-ai-data']) {
    try {
      const parsed = JSON.parse(data['meeting-ai-data']);
      if (parsed?.settings) SECRET_SETTINGS.forEach(k => delete parsed.settings[k]);
      data['meeting-ai-data'] = JSON.stringify(parsed);
    } catch { /* keep as-is */ }
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: new Date().toISOString(), data };
}

/**
 * Validate a parsed backup file. Returns the key→value map, or null when it is not a backup.
 * @param {any} json
 * @returns {Record<string, string> | null}
 */
export function readBackup(json) {
  if (!json || json.format !== BACKUP_FORMAT || typeof json.data !== 'object' || !json.data) return null;
  /** @type {Record<string, string>} */
  const out = {};
  for (const [k, v] of Object.entries(json.data)) {
    if (INCLUDE.test(k) && !EXCLUDE.has(k) && typeof v === 'string') out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Replace the app's localStorage data with the backup's.
 * @param {Record<string, string>} data
 * @param {Storage} [store]
 */
export function applyBackup(data, store = localStorage) {
  const old = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (key && INCLUDE.test(key) && !EXCLUDE.has(key)) old.push(key);
  }
  old.forEach(k => store.removeItem(k));
  for (const [k, v] of Object.entries(data)) store.setItem(k, v);
}

/** Trigger a download of the backup file. */
export function downloadBackup() {
  const backup = buildBackup();
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `meeting-ai-backup-${backup.createdAt.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return backup;
}
