import { describe, it, expect, vi } from 'vitest';

vi.mock('../i18n.js', () => ({
  t: vi.fn(k => k),
  getAiLanguage: vi.fn(() => 'ko'),
}));
vi.mock('../gemini-api.js', () => ({
  callGeminiGuarded: vi.fn(),
  isAiAvailable: vi.fn(() => true),
  UsageLimitError: class UsageLimitError extends Error {},
}));
vi.mock('../storage.js', () => ({
  loadCategories: vi.fn(() => []),
  loadSettings: vi.fn(() => ({})),
  saveSettings: vi.fn(),
  saveMeeting: vi.fn(),
  addCustomType: vi.fn(),
  loadCustomTypes: vi.fn(() => []),
}));
vi.mock('../ui.js', () => ({ showToast: vi.fn() }));
vi.mock('../ai.js', () => ({ getPromptForType: vi.fn(() => '') }));
vi.mock('../preset-save.js', () => ({ createPresetSaveForm: vi.fn() }));
vi.mock('../style-history.js', () => ({ pushStyleHistory: vi.fn() }));
vi.mock('../export-doc.js', () => ({ exportPDF: vi.fn(), exportWord: vi.fn() }));
vi.mock('../export-md.js', () => ({ downloadFile: vi.fn() }));

const { buildContents, capTranscriptLines, renderMarkdown, latexToPlain } = await import('../chat.js');
const { extractPrompt, lostParsedHeadings } = await import('../prompt-adjuster.js');
const { getSystemPrompt, buildMeetingContext } = await import('../doc-generator.js');
const { extractJSON } = await import('../prompt-builder.js');

describe('chat buildContents', () => {
  it('does not send the current user message twice and skips tool markers', () => {
    const history = [
      { role: 'user', text: '메모해줘: ELBO 유도' },
      { role: 'model', text: '[add_memo: ELBO 유도]' },
      { role: 'model', text: '메모에 저장했어요.' },
      { role: 'user', text: '방금 개념 다시 설명해줘' },
    ];
    const contents = buildContents('방금 개념 다시 설명해줘', history);
    expect(contents.map(c => [c.role, c.parts[0].text])).toEqual([
      ['user', '메모해줘: ELBO 유도'],
      ['model', '메모에 저장했어요.'],
      ['user', '방금 개념 다시 설명해줘'],
    ]);
  });

  it('appends the user text when history does not end with it', () => {
    expect(buildContents('hi', []).map(c => c.parts[0].text)).toEqual(['hi']);
  });
});

describe('renderMarkdown', () => {
  it('renders a document H1 and indented bullets as sub-items instead of printing "- "', () => {
    const html = renderMarkdown('# 후속 메일\n\n## 과제\n- 접근성 개선\n  - aria-label 22건\n  - 대비 5건\n1. 첫째\n   2. 둘째');
    expect(html).toContain('<h1>후속 메일</h1>');
    expect(html).toContain('<h2>과제</h2>');
    expect(html).toContain('<ul><li>접근성 개선</li><li class="md-sub">aria-label 22건</li>');
    expect(html).toContain('<li class="md-sub">둘째</li>');
    expect(html).not.toMatch(/(^|>)\s*- /);
    expect(html).not.toContain('# ');
  });

  it('keeps ordered-list numbering when sub-bullets split the list', () => {
    const html = renderMarkdown('1. 가정\n   - 독립\n2. 결론');
    expect(html).toBe('<ol><li value="1">가정</li></ol><ul><li class="md-sub">독립</li></ul><ol><li value="2">결론</li></ol>');
  });
});

describe('latexToPlain', () => {
  it('turns LaTeX math from chat answers into readable plain text', () => {
    expect(latexToPlain(String.raw`사후분포 \(p(z\mid x)\)를 구하기 어렵다`)).toBe('사후분포 p(z|x)를 구하기 어렵다');
    expect(latexToPlain(String.raw`\[ \log p(x) = \log \int p(x,z)\,dz \]`)).toBe(' log p(x) = log ∫ p(x,z) dz ');
    expect(latexToPlain(String.raw`\mathbb{E}_{q(z)}[\log p(x|z)] - \mathrm{KL}(q\|p)`)).toBe('E_q(z)[log p(x|z)] - KL(q‖p)');
    expect(latexToPlain(String.raw`\boxed{z = \mu + \sigma \cdot \epsilon}`)).toBe('z = μ + σ · ε');
    expect(latexToPlain(String.raw`\frac{1}{2}\sigma^{2}`)).toBe('1/2σ^2');
  });

  it('leaves plain text and code blocks alone', () => {
    expect(latexToPlain('KL(q‖p), z = μ + σ·ε')).toBe('KL(q‖p), z = μ + σ·ε');
    const code = '```\n' + String.raw`\frac{a}{b}` + '\n```';
    expect(latexToPlain(code)).toBe(code);
    expect(renderMarkdown(String.raw`\(\alpha\)`)).toBe('α');
  });
});

describe('capTranscriptLines', () => {
  it('keeps the most recent lines within the budget and notes the omission', () => {
    const lines = Array.from({ length: 100 }, (_, i) => `[10:${String(i).padStart(2, '0')}] line ${i}`);
    const out = capTranscriptLines(lines, 200, 'ko');
    expect(out.length).toBeLessThan(260);
    expect(out).toMatch(/^\[\.\.\. 앞부분 \d+줄 생략 \.\.\.\]/);
    expect(out.endsWith('line 99')).toBe(true);
  });

  it('returns short transcripts unchanged', () => {
    expect(capTranscriptLines(['a', 'b'], 100)).toBe('a\nb');
  });
});

describe('prompt-adjuster extractPrompt', () => {
  it('accepts ```prompt, ```markdown and bare fences', () => {
    expect(extractPrompt('바꿨어요!\n```prompt\n## 🎯 A\n```')).toBe('## 🎯 A');
    expect(extractPrompt('Done\n```markdown\n## 🎯 B\n```')).toBe('## 🎯 B');
    expect(extractPrompt('Done\n```\n## 🎯 C\n```')).toBe('## 🎯 C');
  });

  it('takes the longest block when there are several', () => {
    const text = '```text\nshort\n```\n그리고\n```prompt\n## 🎯 long prompt body\n## 🔔 귓속말\n```';
    expect(extractPrompt(text)).toBe('## 🎯 long prompt body\n## 🔔 귓속말');
  });

  it('ignores json fences and returns null without a fence', () => {
    expect(extractPrompt('```json\n{"a":1}\n```')).toBe(null);
    expect(extractPrompt('no fence here')).toBe(null);
  });

  it('flags dropped 🎯 / 🔔 headings only when the original had them', () => {
    const orig = '## 🎯 추천 멘트\n- 🔍 "x"\n## 🔔 귓속말\n- y';
    expect(lostParsedHeadings(orig, '## 🎯 추천 멘트\n## 🔔 귓속말')).toEqual([]);
    expect(lostParsedHeadings(orig, '## 요약\n- z')).toEqual(['🎯', '🔔']);
    expect(lostParsedHeadings('## 주제\n', '## 요약\n')).toEqual([]);
  });
});

describe('doc-generator prompt', () => {
  it('keeps the document markers and H1 contract, with the data at the end', () => {
    const sp = getSystemPrompt('[Transcript]\nhello', true);
    expect(sp).toContain('---DOCUMENT_START---\n# 제목');
    expect(sp).toContain('---DOCUMENT_END---');
    expect(sp).toContain('[확인 필요');
    expect(sp.trimEnd().endsWith('[Transcript]\nhello')).toBe(true);
    expect(getSystemPrompt('ctx', false)).toContain('---DOCUMENT_START---\n# Title');
  });

  it('caps the transcript to the most recent part and drops long chat history', () => {
    const src = {
      transcript: Array.from({ length: 3000 }, (_, i) => ({ text: `문장 ${i} `.repeat(3) })),
      chatHistory: [{ role: 'user', text: 'x'.repeat(5000) }],
      analysisHistory: [{ markdown: '## 🎯 A\n' + 'y'.repeat(20000) }],
    };
    const ctx = buildMeetingContext(src);
    expect(ctx).toContain('문장 2999');
    expect(ctx).not.toContain('문장 0 ');
    expect(ctx).not.toContain('[Chat]');
    expect(ctx.length).toBeLessThan(40000);
  });
});

describe('prompt-builder extractJSON', () => {
  it('accepts ```json, bare ``` and unfenced JSON', () => {
    expect(extractJSON('```json\n{"name":"a"}\n```')).toEqual({ name: 'a' });
    expect(extractJSON('여기요\n```\n{"name":"b"}\n```')).toEqual({ name: 'b' });
    expect(extractJSON('결과: {"name":"c"} 끝')).toEqual({ name: 'c' });
    expect(extractJSON('no json')).toBe(null);
  });
});
