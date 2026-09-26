import { describe, it, expect } from 'vitest';
import { QUICK_PRESETS, localizePreset, customTypeAsPreset, buildQuickPresetConfig, getQuickPreset } from '../quick-presets.js';
import { getTypeDefaultPrompt, getDefaultChatPresets, setLanguage } from '../i18n.js';

const FIELDS = ['name', 'description', 'summary', 'focusPoints', 'chatSystemPrompt', 'chatPresets', 'memoHint', 'context', 'subjectPlaceholder'];

describe('quick presets', () => {
  it('every built-in preset is complete in ko and en', () => {
    expect(QUICK_PRESETS.map(p => p.id)).toEqual(
      ['lecture', 'one_on_one', 'work', 'consult', 'practice', 'brainstorm', 'study']);
    for (const p of QUICK_PRESETS) {
      expect(['copilot', 'minutes', 'learning']).toContain(p.meetingType);
      for (const lang of ['ko', 'en']) {
        for (const f of FIELDS) expect(p[lang][f], `${p.id}.${lang}.${f}`).toBeTruthy();
        expect(p[lang].chatPresets.length).toBeGreaterThanOrEqual(3);
        expect('analysisPrompt' in p[lang]).toBe(true);
      }
      // Same number of questions / focus points in both languages
      expect(p.ko.chatPresets.length).toBe(p.en.chatPresets.length);
      expect(p.ko.focusPoints.length).toBe(p.en.focusPoints.length);
    }
  });

  it('builds the prompt-builder config shape with zero edits', () => {
    const preset = localizePreset(getQuickPreset('lecture'), 'ko');
    const cfg = buildQuickPresetConfig(preset, 'ko');
    expect(cfg.meetingType).toBe('learning');
    // One-tap lecture uses the lecture-notes default prompt (🎯 questions first, 🔔 whisper) + focus points
    expect(cfg.analysisPrompt.startsWith(getTypeDefaultPrompt('learning'))).toBe(true);
    expect(cfg.analysisPrompt).toMatch(/^## 🎯 /m);
    expect(cfg.analysisPrompt).toMatch(/^## 🔔 /m);
    expect(cfg.analysisPrompt).toContain('이번 세션에서 특히 챙길 것');
    for (const fp of preset.focusPoints) expect(cfg.analysisPrompt).toContain(`- ${fp}`);
    expect(cfg.chatPresets).toEqual(preset.chatPresets);
    expect(cfg.chatSystemPrompt).toContain('add_memo'); // tool rules kept with the custom persona
    expect(cfg.context).toBe(preset.context);
    expect(cfg.title).toBe('');
  });

  it('applies edits: subject to title/context, custom focus and questions', () => {
    const preset = localizePreset(getQuickPreset('one_on_one'), 'en');
    const cfg = buildQuickPresetConfig(preset, 'en', {
      subject: '  Weekly sync ',
      focusPoints: ['Budget', ' ', 'Hiring'],
      chatPresets: ['Q1', ''],
    });
    expect(cfg.title).toBe('Weekly sync');
    expect(cfg.context.startsWith('Topic: Weekly sync\n')).toBe(true);
    expect(cfg.baseContext).toBe(preset.context);
    expect(cfg.analysisPrompt).toContain('- Budget\n- Hiring');
    expect(cfg.chatPresets).toEqual(['Q1']);
  });

  it('no focus points → base prompt only; null analysisPrompt → type default prompt', () => {
    const preset = localizePreset(getQuickPreset('consult'), 'ko');
    const cfg = buildQuickPresetConfig(preset, 'ko', { focusPoints: [] });
    expect(cfg.analysisPrompt).toBe(getTypeDefaultPrompt('copilot'));
  });

  it('wraps saved custom types', () => {
    const p = customTypeAsPreset({ id: 'custom_x', name: 'Mine', prompt: 'P', chatPresets: ['a'] });
    const cfg = buildQuickPresetConfig(p, 'ko');
    expect(cfg.meetingType).toBe('custom_x');
    expect(cfg.analysisPrompt).toBe('P');
    expect(cfg.chatPresets).toEqual(['a']);
  });
});

describe('default chat suggestion chips', () => {
  it('are student-oriented for lecture/learning sessions and meeting-oriented otherwise', () => {
    setLanguage('ko');
    const learning = getDefaultChatPresets('learning');
    expect(learning).toHaveLength(4);
    expect(learning.join(' ')).toMatch(/시험/);
    expect(learning.join(' ')).toMatch(/교수님/);
    expect(getDefaultChatPresets('minutes').join(' ')).toMatch(/액션 아이템/);
    expect(getDefaultChatPresets(undefined)).toEqual(getDefaultChatPresets('copilot'));
  });
});
