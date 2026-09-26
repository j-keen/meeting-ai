import { describe, it, expect, beforeEach } from 'vitest';
import { buildBackup, readBackup, applyBackup, BACKUP_FORMAT } from '../backup.js';

describe('backup.js', () => {
  beforeEach(() => localStorage.clear());

  it('exports app data, skips transient keys and strips old personal API keys', () => {
    localStorage.setItem('meeting-ai-data', JSON.stringify({ meetings: [{ id: 'm1' }], settings: { language: 'ko', geminiApiKey: 'secret', openaiApiKey: 'sk-secret' } }));
    localStorage.setItem('meeting-ai-style-history', '[]');
    localStorage.setItem('faqItems', '[]');
    localStorage.setItem('meeting_daily_usage', '{}');
    localStorage.setItem('meeting-ai-draft', '{}');
    localStorage.setItem('unrelated', 'x');

    const b = buildBackup();
    expect(b.format).toBe(BACKUP_FORMAT);
    expect(Object.keys(b.data).sort()).toEqual(['faqItems', 'meeting-ai-data', 'meeting-ai-style-history']);
    const inner = JSON.parse(b.data['meeting-ai-data']);
    expect(inner.meetings).toHaveLength(1);
    expect(inner.settings.language).toBe('ko');
    expect(inner.settings.geminiApiKey).toBeUndefined();
    expect(inner.settings.openaiApiKey).toBeUndefined();
  });

  it('rejects files that are not a backup', () => {
    expect(readBackup(null)).toBeNull();
    expect(readBackup({ meetings: [] })).toBeNull();
    expect(readBackup({ format: BACKUP_FORMAT, data: { unrelated: 'x' } })).toBeNull();
  });

  it('restores: replaces app keys, leaves unrelated keys alone', () => {
    localStorage.setItem('meeting-ai-data', JSON.stringify({ meetings: [{ id: 'old' }] }));
    localStorage.setItem('meeting-ai-style-history', 'old');
    localStorage.setItem('unrelated', 'keep');
    const data = readBackup({ format: BACKUP_FORMAT, data: { 'meeting-ai-data': JSON.stringify({ meetings: [{ id: 'new' }] }), unrelated: 'ignored' } });
    applyBackup(data);
    expect(JSON.parse(localStorage.getItem('meeting-ai-data')).meetings[0].id).toBe('new');
    expect(localStorage.getItem('meeting-ai-style-history')).toBeNull();
    expect(localStorage.getItem('unrelated')).toBe('keep');
  });
});
