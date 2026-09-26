import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../gemini-api.js', () => ({
  callGeminiGuarded: vi.fn(),
  isAiAvailable: vi.fn(() => true),
  UsageLimitError: class UsageLimitError extends Error {},
}));

import { callGeminiGuarded } from '../gemini-api.js';
import { setAiLanguage, getPromptPresets, getAiPrompt } from '../i18n.js';
import {
  extractHeadline, extractWhispers, parseCorrections, correctSentences, normalizeRefinedSection,
  selectTranscript, isLectureSession, generateFinalMinutes, getDefaultMinutesPrompt, analyzeTranscript,
  suggestTitleAndMetadata, refineSectionContent, AUTO_FULL_CHARS, carryChecklist,
} from '../ai.js';
import { parseMarkdownBlocks } from '../ui/analysis.js';

const reply = text => ({ candidates: [{ content: { parts: [{ text }] } }] });
const lastBody = () => callGeminiGuarded.mock.calls.at(-1)[1];
const userText = body => body.contents.map(c => c.parts.map(p => p.text).join('')).join('\n');
const systemText = body => body.systemInstruction?.parts?.map(p => p.text).join('') || '';

beforeEach(() => {
  callGeminiGuarded.mockReset();
  setAiLanguage('ko');
});

describe('extractHeadline', () => {
  it('takes the first 🎯 line without its emoji tag or quotes (multi-codepoint emoji)', () => {
    expect(extractHeadline('## 🎯 추천 멘트\n- 🔍 "접근성 태스크는 누가?"\n- ✋ "b"')).toBe('접근성 태스크는 누가?');
    expect(extractHeadline('## 🎯 추천 멘트\n- ⚠️ "베타 기능 위험"')).toBe('베타 기능 위험');
    expect(extractHeadline('## 🎯 지금 물어볼 질문\n- 🔍 “곡선 따옴표 케이스”')).toBe('곡선 따옴표 케이스');
    expect(extractHeadline('## 🎯 Suggested Lines\n- ✋ "March deadline?"')).toBe('March deadline?');
    expect(extractHeadline('## 🎯 Q\n- plain line')).toBe('plain line');
  });

  it('never returns a lone surrogate', () => {
    const h = extractHeadline('## 🎯 추천 멘트\n- 🔍 "질문"');
    expect(/[\uD800-\uDFFF]/.test(h)).toBe(false);
  });

  it('falls back to legacy headline, first H2, first line', () => {
    expect(extractHeadline('## 한줄 요약\n핵심 요약')).toBe('핵심 요약');
    expect(extractHeadline('# T\n## 한눈에 보기\n본문')).toBe('한눈에 보기');
    expect(extractHeadline('그냥 텍스트')).toBe('그냥 텍스트');
  });
});

describe('extractWhispers', () => {
  it('pulls the 🔔 section out as toasts', () => {
    const md = '## 🎯 지금 물어볼 질문\n- 🔍 "q"\n\n## 🔔 귓속말\n- 방금 \'시험에 나온다\'고 함\n\n## 📝 용어\n- KL';
    const { cleaned, whispers } = extractWhispers(md);
    expect(whispers).toEqual(["방금 '시험에 나온다'고 함"]);
    expect(cleaned).not.toContain('🔔');
    expect(cleaned).toContain('## 📝 용어');
  });
});

describe('parseCorrections (R1: OpenAI json_object forces an object)', () => {
  it('reads the object-wrapped shape', () => {
    expect(parseCorrections({ corrections: [{ index: 1, corrected: 'KL' }, { index: 'x', corrected: 'y' }] }, 5))
      .toEqual([{ index: 1, corrected: 'KL' }]);
  });
  it('still accepts a bare array and a single object', () => {
    expect(parseCorrections([{ index: 0, corrected: 'a' }], 5)).toHaveLength(1);
    expect(parseCorrections({ index: 7, corrected: 'b' }, 20)).toEqual([{ index: 7, corrected: 'b' }]);
  });
  it('drops out-of-range indices and junk', () => {
    expect(parseCorrections({ corrections: [{ index: 9, corrected: 'a' }, { index: -1, corrected: 'b' }, null] }, 3)).toEqual([]);
    expect(parseCorrections(null)).toEqual([]);
    expect(parseCorrections({ foo: 1 })).toEqual([]);
  });
});

describe('correctSentences', () => {
  const lines = [{ text: '케이엘이 정규화 항이에요.' }, { text: '중간고사 범위는 오늘까지에요.' }, { text: '그대로' }];

  it('applies corrections returned as {"corrections":[…]} and asks for an object', async () => {
    callGeminiGuarded.mockResolvedValue(reply(JSON.stringify({ corrections: [
      { index: 0, corrected: 'KL이 정규화 항이에요.' },
      { index: 1, corrected: '중간고사 범위는 오늘까지예요.' },
    ] })));
    const out = await correctSentences({ lines, domainHint: '대학원 강의 — VAE' });
    expect(out.map(c => c.index)).toEqual([0, 1]);
    const prompt = userText(lastBody());
    expect(prompt).toContain('{"corrections":[');
    expect(prompt).toContain('대학원 강의 — VAE');
    expect(lastBody().generationConfig.responseMimeType).toBe('application/json');
  });

  it('rejects a "correction" that rewrites the line', async () => {
    callGeminiGuarded.mockResolvedValue(reply(JSON.stringify({ corrections: [{ index: 2, corrected: '완전히 다른 아주 긴 문장으로 바꿔 버린 결과입니다' }] })));
    expect(await correctSentences({ lines })).toEqual([]);
  });

  it('returns [] on API failure', async () => {
    callGeminiGuarded.mockRejectedValue(new Error('boom'));
    expect(await correctSentences({ lines })).toEqual([]);
  });
});

describe('selectTranscript (R6)', () => {
  const mk = (n, len = 100, startMs = 1_000_000, stepMs = 30_000) =>
    Array.from({ length: n }, (_, i) => ({ text: 'x'.repeat(len), timestamp: startMs + i * stepMs }));

  it('auto sends everything while the transcript is short', () => {
    const t = mk(20);
    const s = selectTranscript(t, { strategy: 'auto', previousSummary: 'prev', previousAt: t[15].timestamp });
    expect(s.windowed).toBe(false);
    expect(s.text.split('\n')).toHaveLength(20);
  });

  it('auto switches to previous analysis + recent window, reaching back to the previous analysis', () => {
    const t = mk(200); // 20,000 chars, 100 minutes
    expect(200 * 100).toBeGreaterThan(AUTO_FULL_CHARS);
    const prevAt = t[150].timestamp;
    const s = selectTranscript(t, { strategy: 'auto', recentMinutes: 8, previousSummary: '## 📚 핵심 개념\n- a\n\n## 🔔 귓속말\n- old', previousAt: prevAt });
    expect(s.windowed).toBe(true);
    // the window covers everything since (a minute before) the previous analysis
    expect(s.from).toBeLessThanOrEqual(149);
    expect(s.text.startsWith(`#${s.from} [`)).toBe(true);
    expect(s.text.split('\n').at(-1).startsWith('#199 [')).toBe(true);
    // old whispers are not carried over (they would be re-toasted)
    expect(s.previous).not.toContain('🔔');
    expect(s.previous).toContain('핵심 개념');
  });

  it('full strategy and a missing previous analysis always send everything', () => {
    const t = mk(200);
    expect(selectTranscript(t, { strategy: 'full', previousSummary: 'p' }).windowed).toBe(false);
    expect(selectTranscript(t, { strategy: 'auto', previousSummary: null }).windowed).toBe(false);
  });

  it('caps a very long gap to the tail', () => {
    const t = mk(400, 100);
    const s = selectTranscript(t, { strategy: 'smart', previousSummary: 'p', previousAt: t[10].timestamp });
    expect(s.text.length).toBeLessThan(14000);
    expect(s.text.split('\n').at(-1).startsWith('#399 [')).toBe(true);
  });
});

describe('analyzeTranscript request shape', () => {
  it('sends the preset prompt as the system message and whispers become toasts', async () => {
    callGeminiGuarded.mockResolvedValue(reply('## 🎯 지금 물어볼 질문\n- 🔍 "ELBO가 타이트해지는 조건은?"\n\n## 🔔 귓속말\n- 과제 마감 언급됨\n\n## 📚 핵심 개념\n- **ELBO**: 하한'));
    const r = await analyzeTranscript({
      transcript: [{ text: '엘보를 최대화합니다', timestamp: Date.now() }],
      meetingPreset: 'learning', elapsedTime: '13분', strategy: 'auto',
    });
    const body = lastBody();
    expect(systemText(body)).toBe(getPromptPresets().learning.prompt);
    expect(userText(body)).toContain('엘보를 최대화합니다');
    expect(userText(body)).not.toContain(getPromptPresets().learning.prompt.slice(0, 40));
    expect(r.flow).toBe('ELBO가 타이트해지는 조건은?');
    expect(r.whispers).toEqual(['과제 마감 언급됨']);
    expect(r.markdown).not.toContain('🔔');
  });

  it('includes only user chat questions, not the whole chat log', async () => {
    callGeminiGuarded.mockResolvedValue(reply('## 🎯 추천 멘트\n- 🔍 "a"'));
    await analyzeTranscript({
      transcript: [{ text: 'hi', timestamp: Date.now() }],
      chatHistory: [{ role: 'user', text: '질문 하나' }, { role: 'model', text: '아주 긴 AI 답변' }],
    });
    const u = userText(lastBody());
    expect(u).toContain('질문 하나');
    expect(u).not.toContain('아주 긴 AI 답변');
  });
});

describe('live prompts render cleanly (R2/R4)', () => {
  it('no hr banners; 🎯 is the first H2; whisper heading matches the parser', () => {
    for (const lang of ['ko', 'en']) {
      setAiLanguage(lang);
      for (const p of [getAiPrompt(), getPromptPresets().learning.prompt]) {
        expect(p).not.toMatch(/^---\s*$/m);
        expect(p).not.toMatch(/^### ▸/m);
        expect(p.match(/^## .+$/m)[0].startsWith('## 🎯')).toBe(true);
        expect(p).toMatch(/^## 🔔 (?:귓속말|Whisper)$/m);
      }
    }
  });
});

describe('final document (R3/R16)', () => {
  const transcript = [{ text: '오늘은 변분 추론입니다', timestamp: Date.now() }];

  it('lecture sessions get lecture notes, meetings get minutes', () => {
    expect(isLectureSession('learning')).toBe(true);
    expect(isLectureSession('copilot', ['교육'])).toBe(true);
    expect(isLectureSession('minutes', ['정기회의'])).toBe(false);
    expect(getDefaultMinutesPrompt('learning', [])).toContain('# 강의 노트');
    expect(getDefaultMinutesPrompt('copilot', [])).toContain('# 최종 회의록');
  });

  it('uses the lecture-notes system prompt and the detail instruction on the heavy model', async () => {
    callGeminiGuarded.mockResolvedValue(reply('서문\n# 강의 노트: 변분 추론과 VAE\n\n## 한눈에 보기\n요약'));
    const r = await generateFinalMinutes({ transcript, meetingPreset: 'learning', model: 'gemini-3.1-pro-preview' });
    const sys = systemText(lastBody());
    expect(sys).toContain('# 강의 노트');
    expect(sys).toContain('[상세 모드]');
    expect(sys).toContain('누구에게도 할 일을 배정하지 마세요');
    expect(r.markdown.startsWith('# 강의 노트')).toBe(true);
    expect(r.flow).toBe('강의 노트: 변분 추론과 VAE');
  });

  it('heavy OpenAI id also counts as heavy; light model gets the concise instruction', async () => {
    callGeminiGuarded.mockResolvedValue(reply('# 최종 회의록\n## 개요\n- x'));
    await generateFinalMinutes({ transcript, meetingPreset: 'copilot', model: 'gpt-5.6-sol' });
    expect(systemText(lastBody())).toContain('[상세 모드]');
    expect(systemText(lastBody())).toContain('담당자가 불명확하면 [미정]');
    await generateFinalMinutes({ transcript, meetingPreset: 'copilot', model: 'gpt-5.6-luna' });
    expect(systemText(lastBody())).toContain('[간결 모드]');
  });

  it('an unedited default override does not force minutes onto a lecture', async () => {
    callGeminiGuarded.mockResolvedValue(reply('# 강의 노트: x\n## 한눈에 보기\n- y'));
    await generateFinalMinutes({ transcript, meetingPreset: 'learning', basePromptOverride: getDefaultMinutesPrompt('copilot', []) });
    expect(systemText(lastBody())).toContain('# 강의 노트');
    await generateFinalMinutes({ transcript, meetingPreset: 'learning', basePromptOverride: 'MY OWN PROMPT' });
    expect(systemText(lastBody()).startsWith('MY OWN PROMPT')).toBe(true);
  });
});

describe('suggestTitleAndMetadata (R9)', () => {
  it('one request returns title, alternatives, new tags and known categories', async () => {
    callGeminiGuarded.mockResolvedValue(reply(JSON.stringify({
      title: '변분 추론과 VAE', alternatives: ['ELBO 유도', 'VAE 입문'], tags: ['VAE', '기존태그', 'ELBO'], categories: ['교육', '없는카테고리'],
    })));
    const r = await suggestTitleAndMetadata({ transcript: [{ text: 'a' }], existingTags: ['기존태그'] });
    expect(callGeminiGuarded).toHaveBeenCalledTimes(1);
    expect(r.title).toBe('변분 추론과 VAE');
    expect(r.alternatives).toHaveLength(2);
    expect(r.tags).toEqual(['VAE', 'ELBO']);
    expect(r.categories).toEqual(['교육']);
  });

  it('returns null on failure', async () => {
    callGeminiGuarded.mockRejectedValue(new Error('x'));
    expect(await suggestTitleAndMetadata({ transcript: [{ text: 'a' }] })).toBeNull();
  });
});

describe('carryChecklist (R6 windowed refresh keeps earlier notes)', () => {
  it('counts items of cumulative sections only', () => {
    const md = '## 🎯 지금 물어볼 질문\n- 🔍 "q"\n\n## 📚 핵심 개념\n- **A**: a\n- **B**: b\n\n## 🧩 논리 흐름\n1. x\n2. y\n\n## 📝 용어\n- KL: k';
    expect(carryChecklist(md)).toBe('📚 핵심 개념 2, 🧩 논리 흐름 2, 📝 용어 1');
  });

  it('is sent with the windowed transcript', async () => {
    callGeminiGuarded.mockResolvedValue(reply('## 🎯 지금 물어볼 질문\n- 🔍 "q"'));
    const start = 1_000_000;
    const transcript = Array.from({ length: 120 }, (_, i) => ({ text: 'y'.repeat(100), timestamp: start + i * 30_000 }));
    await analyzeTranscript({
      transcript, meetingPreset: 'learning', strategy: 'auto', recentMinutes: 8,
      previousSummary: '## 📚 핵심 개념\n- **ELBO**: 하한', previousAt: transcript[100].timestamp,
    });
    const u = userText(lastBody());
    expect(u).toContain('[이전 분석');
    expect(u).toContain('📚 핵심 개념 1');
    expect(u).not.toContain('#0 [');
  });
});

describe('parseMarkdownBlocks renders what the model writes', () => {
  it('keeps nested bullets inside the list (flattened) and makes "# title" a heading block', () => {
    const blocks = parseMarkdownBlocks('# 강의 노트: VAE\n\n## 핵심 개념\n- 정의: a\n  - 세부 b\n  1. 세부 c\n- 수식: d');
    expect(blocks[0]).toEqual({ type: 'heading', raw: '# 강의 노트: VAE' });
    expect(blocks[2].type).toBe('ul');
    expect(blocks[2].raw).toBe('- 정의: a\n- 세부 b\n- 세부 c\n- 수식: d');
  });
});

describe('refineSectionContent (R11)', () => {
  it('strips code fences and restores a dropped heading', () => {
    expect(normalizeRefinedSection('```markdown\n- a\n- b\n```', '## 결정사항\n- old')).toBe('## 결정사항\n- a\n- b');
    expect(normalizeRefinedSection('## 결정사항\n- new', '## 결정사항\n- old')).toBe('## 결정사항\n- new');
    expect(normalizeRefinedSection('', '## X\n- old')).toBe('## X\n- old');
  });

  it('uses a system message and returns the normalized section', async () => {
    callGeminiGuarded.mockResolvedValue(reply('```\n- 수정됨\n```'));
    const out = await refineSectionContent({ fullMarkdown: '# T\n## 결정사항\n- old', sectionMarkdown: '## 결정사항\n- old', instruction: '고쳐', lang: 'ko' });
    expect(out).toBe('## 결정사항\n- 수정됨');
    expect(systemText(lastBody())).toContain('코드블록');
  });
});
