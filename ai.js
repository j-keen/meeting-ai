// ai.js - AI analysis, final minutes / lecture notes, title+metadata, section refine, STT correction.
// Requests are Gemini-shaped ({ systemInstruction, contents, generationConfig }); the request layer
// (gemini-api.js → openai-adapter.js) maps them to OpenAI, where systemInstruction becomes the
// system message and responseMimeType 'application/json' becomes response_format json_object
// (which forces a top-level OBJECT — never ask for a bare JSON array).

import { getAiPrompt, getAiPresetContext, getAiLanguage, getDateLocale, getTypeDefaultPrompt, getMeetingTypeCategoryMap } from './i18n.js';
import { modelFor, isProModel } from './models.js';
import { callGeminiGuarded, UsageLimitError, isAiAvailable } from './gemini-api.js';
import { getCategoryGuidance } from './category-prompts.js';
import { loadCategories, loadTypePrompts, loadCustomTypes } from './storage.js';
import { state } from './event-bus.js';

// Normalize array items: if the model returns objects instead of strings, flatten them
function flattenItems(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(item =>
    typeof item === 'object' && item !== null
      ? Object.values(item).filter(v => v != null).join(' — ')
      : String(item)
  );
}

function responseText(data) {
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

export function getDefaultPrompt() {
  return getAiPrompt();
}

export function getPresetContext(preset) {
  return getAiPresetContext(preset);
}

/** Get the effective prompt for a meeting type (custom override > type default > global default) */
export function getPromptForType(meetingType) {
  const typePrompts = loadTypePrompts();
  if (typePrompts[meetingType]) return typePrompts[meetingType];

  // Check custom types
  if (meetingType && meetingType.startsWith('custom_')) {
    const customTypes = loadCustomTypes();
    const ct = customTypes.find(t => t.id === meetingType);
    if (ct && ct.prompt) return ct.prompt;
  }

  return getTypeDefaultPrompt(meetingType);
}

/** Lecture sessions get lecture-shaped outputs (live notes preset, lecture-notes final document). */
export function isLectureSession(meetingPreset, categories = []) {
  if (meetingPreset === 'learning') return true;
  return Array.isArray(categories) && categories.includes('교육');
}

// ─── Transcript selection (live analysis cost control) ──────────────────────
// A live analysis fires every ~1,000 transcript chars. Resending the whole transcript each
// time makes a 90-minute lecture cost grow quadratically, so 'auto' sends the full transcript
// only while it is short, then switches to [previous analysis] + the recent window. The
// window always reaches back to (just before) the previous analysis, so no line is skipped.
export const AUTO_FULL_CHARS = 8000;     // ≈ first 25-40 min of Korean speech: send everything
const RECENT_MAX_CHARS = 12000;          // hard cap on the recent window (tail kept)
const PREVIOUS_MAX_CHARS = 12000;        // cap on the carried-over previous analysis (cumulative notes grow)
const PREVIOUS_OVERLAP_MS = 60 * 1000;   // re-send a minute before the previous analysis

// Sections that are about "right now" and may legitimately change or shrink between refreshes
const TRANSIENT_SECTION = /^(?:🎯|💡|🔔|📌)/u;

/**
 * Item counts of the cumulative sections of the previous analysis, e.g. "📚 핵심 개념 12, ⚠️ 강조·주의 5".
 * Given to the model with the windowed transcript so it carries earlier items forward instead of
 * rewriting the notes around the recent window only.
 */
export function carryChecklist(previousMarkdown) {
  const out = [];
  const sections = String(previousMarkdown || '').split(/^## /m).slice(1);
  for (const sec of sections) {
    const [title, ...body] = sec.split('\n');
    if (!title || TRANSIENT_SECTION.test(title.trim())) continue;
    const items = body.filter(l => /^(?:[-*]|\d+\.)\s+\S/.test(l)).length;
    if (items > 0) out.push(`${title.trim()} ${items}`);
  }
  return out.join(', ');
}

function formatLine(line, idx) {
  const time = new Date(line.timestamp).toLocaleTimeString(getDateLocale(), { hour: '2-digit', minute: '2-digit' });
  return `#${idx} [${time}]: ${line.text}`;
}

function capPrevious(text) {
  const cleaned = extractWhispers(String(text || '')).cleaned.trim();
  if (cleaned.length <= PREVIOUS_MAX_CHARS) return cleaned;
  const cut = cleaned.slice(0, PREVIOUS_MAX_CHARS);
  return cut.slice(0, Math.max(cut.lastIndexOf('\n'), PREVIOUS_MAX_CHARS * 0.8)) + '\n…';
}

/**
 * Pick what part of the transcript a live analysis sees.
 * strategy: 'full' (everything), 'smart' (previous analysis + recent window whenever a previous
 * analysis exists), 'auto' (full while the transcript is ≤ AUTO_FULL_CHARS, then like 'smart').
 * Line numbers (#idx) always refer to the position in the whole transcript.
 * @returns {{ text: string, previous: string, windowed: boolean, from: number, minutes: number }}
 */
export function selectTranscript(transcript, { strategy = 'full', recentMinutes = 5, previousSummary = null, previousAt = 0 } = {}) {
  const lines = transcript || [];
  const full = { text: lines.map(formatLine).join('\n'), previous: '', windowed: false, from: 0, minutes: 0 };
  if (lines.length === 0 || strategy === 'full' || !previousSummary) return full;
  const totalChars = lines.reduce((n, l) => n + (l.text?.length || 0), 0);
  if (strategy === 'auto' && totalChars <= AUTO_FULL_CHARS) return full;

  // Window relative to the newest line (not Date.now(): imported/reopened meetings are in the past)
  const lastTs = Number(lines[lines.length - 1].timestamp);
  let from = lines.length;
  if (Number.isFinite(lastTs)) {
    let cutoff = lastTs - recentMinutes * 60 * 1000;
    if (previousAt) cutoff = Math.min(cutoff, previousAt - PREVIOUS_OVERLAP_MS);
    from = lines.findIndex(l => Number(l.timestamp) >= cutoff);
    if (from < 0) from = lines.length;
  }
  from = Math.min(from, Math.max(0, lines.length - 5)); // at least the last 5 lines
  let chars = 0;
  for (let i = lines.length - 1; i >= from; i--) {       // cap the window, keeping the tail
    chars += (lines[i].text?.length || 0) + 16;
    if (chars > RECENT_MAX_CHARS) { from = i + 1; break; }
  }
  if (from === 0) return full;
  const firstTs = Number(lines[from].timestamp);
  const minutes = Number.isFinite(firstTs) && Number.isFinite(lastTs) ? Math.max(1, Math.round((lastTs - firstTs) / 60000)) : recentMinutes;
  return {
    text: lines.slice(from).map((l, i) => formatLine(l, from + i)).join('\n'),
    previous: capPrevious(previousSummary),
    windowed: true,
    from,
    minutes,
  };
}

function parseGeminiResponse(text) {
  // Try JSON parse for backward compatibility (old prompts / JSON tasks)
  try { return JSON.parse(text); } catch {}
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch {}
  }
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[0]); } catch {}
  }
  return null;
}

/**
 * Short headline for history rows / compare view.
 * '## 🎯 …' section → its first bullet with the leading emoji tag and quotes removed.
 * The `u` flag matters: without it an emoji class matches single UTF-16 halves and the
 * headline became a lone surrogate ("\udd0d") or a bare variation selector.
 */
export function extractHeadline(markdown) {
  const text = String(markdown || '');
  const suggestedMatch = text.match(/^##\s+🎯[^\n]*\n+[-*]\s*(?:[\p{Extended_Pictographic}\u{FE0F}\u{200D}]+\s*)?["“]?([^"”\n]+)/mu);
  if (suggestedMatch) {
    const line = suggestedMatch[1].replace(/["”]\s*$/, '').trim();
    if (line) return line.slice(0, 80);
  }
  // Legacy: ## Headline / ## 한줄 요약 content
  const headlineMatch = text.match(/^##\s+(?:Headline|한줄\s*요약)[^\n]*\n+(.+)/m);
  if (headlineMatch) return headlineMatch[1].trim().slice(0, 80);
  // Try first ## heading
  const firstH2 = text.match(/^##\s+(.+)/m);
  if (firstH2) return firstH2[1].trim().slice(0, 80);
  // Fallback: first non-empty line
  const firstLine = text.split('\n').find(l => l.trim());
  return (firstLine || '').replace(/^#+\s*/, '').trim().slice(0, 80);
}

/** Extract whisper section from markdown, returning cleaned markdown + whispers array */
export function extractWhispers(markdown) {
  // Match ## 🔔 Whisper or ## 🔔 귓속말 section (until next ## or end)
  const whisperRegex = /^## 🔔\s*(?:Whisper|귓속말)\s*\n([\s\S]*?)(?=\n## |\n$|$)/m;
  const match = markdown.match(whisperRegex);
  if (!match) return { cleaned: markdown, whispers: [] };

  // Extract individual whisper items (lines starting with -)
  const whisperBlock = match[1].trim();
  const whispers = whisperBlock
    .split('\n')
    .map(line => line.replace(/^[-*]\s*/, '').trim())
    .filter(line => line.length > 0);

  // Remove the whisper section from the displayed markdown
  const cleaned = markdown.replace(whisperRegex, '').replace(/\n{3,}/g, '\n\n').trim();

  return { cleaned, whispers };
}

/** Remove any AI preamble text before the first markdown heading */
function stripPreamble(text) {
  const idx = text.indexOf('#');
  if (idx > 0) return text.slice(idx);
  return text;
}

const ANALYSIS_LABELS = {
  ko: {
    context: '상황', elapsed: '경과 시간', setup: '미팅 설정', datetime: '일시', location: '장소', participants: '참석자', purpose: '목적',
    profile: '사용자 프로필 (참석자 중 한 명 — 모든 발언이 이 사람의 것은 아님)',
    insights: '사용자 인사이트', memos: '사용자 메모', chat: '사용자가 AI 채팅에서 물어본 것 (최근)',
    previous: '이전 분석 — 이 내용을 유지하고, 아래 새 트랜스크립트로 바뀐 부분만 갱신',
    carry: list => `[유지할 항목 수] ${list} — 이전 분석의 이 항목들은 삭제하지 말고(짧게 줄이는 것은 가능) 새 항목을 뒤에 추가하세요.`,
    recent: (m, from) => `최근 트랜스크립트 — 마지막 약 ${m}분 (#${from}부터). 그 이전 내용은 [이전 분석]에 반영되어 있음`,
    transcript: '트랜스크립트', noTranscript: '트랜스크립트: (아직 없음 — 위 메모와 인사이트를 바탕으로 분석)',
    corrections: '사용자 수정 — 이전 분석에서 사용자가 고친 부분. 그대로 반복하지 말고 의도를 반영',
    blockMemos: '이전 분석에 남긴 사용자 메모 — 피드백으로 반영',
    lang: '[출력 언어] 반드시 한국어로 작성.',
  },
  en: {
    context: 'Context', elapsed: 'Elapsed time', setup: 'Meeting setup', datetime: 'Date/Time', location: 'Location', participants: 'Participants', purpose: 'Purpose',
    profile: 'User profile (one of the participants — not every statement is theirs)',
    insights: 'User insights', memos: 'User memos', chat: 'What the user asked the AI chat (recent)',
    previous: 'Previous analysis — keep it and update only what the new transcript below changes',
    carry: list => `[Items to carry over] ${list} — do not delete these items from the previous analysis (shortening is fine); append new items after them.`,
    recent: (m, from) => `Recent transcript — last ~${m} min (from #${from}). Earlier content is reflected in the [Previous analysis]`,
    transcript: 'Transcript', noTranscript: 'Transcript: (none yet — analyze based on the memos and insights above)',
    corrections: 'User corrections — parts of the previous analysis the user edited. Reflect the intent; do not repeat verbatim',
    blockMemos: 'User notes on the previous analysis — treat as feedback',
    lang: '[Output language] English only.',
  },
};

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString(getDateLocale(), { hour: '2-digit', minute: '2-digit' });
}

export async function analyzeTranscript({
  transcript,
  prompt,
  meetingContext,
  meetingPreset,
  elapsedTime,
  strategy = 'smart',
  recentMinutes = 5,
  previousSummary = null,
  previousAt = 0,
  userInsights = [],
  memos = [],
  chatHistory = [],
  userProfile = '',
  model = modelFor('analysis'),
  userCorrections = [],
  blockMemos = [],
  onStream = null,
  categories = [],
  categoryHints = {},
  metadata = {},
}) {
  if (!isAiAvailable()) throw new Error('Proxy not available');
  const hasTranscript = transcript && transcript.length > 0;
  const hasMemos = memos && memos.length > 0;
  const hasInsights = userInsights && userInsights.length > 0;
  const hasChatHistory = chatHistory && chatHistory.length > 0;
  if (!hasTranscript && !hasMemos && !hasInsights && !hasChatHistory) throw new Error('No transcript to analyze');

  const effectivePreset = meetingPreset || 'copilot';
  const contextText = meetingContext || getPresetContext(effectivePreset);
  const selection = selectTranscript(transcript, { strategy, recentMinutes, previousSummary, previousAt });

  const lang = getAiLanguage();
  const L = ANALYSIS_LABELS[lang === 'ko' ? 'ko' : 'en'];

  // Auto-resolve category guidance from meeting type if no explicit categories
  let effectiveCategories = categories;
  if (!effectiveCategories || effectiveCategories.length === 0) {
    const catMap = getMeetingTypeCategoryMap();
    const mappedCat = catMap[effectivePreset];
    if (mappedCat) effectiveCategories = [mappedCat];
  }
  const guidance = getCategoryGuidance(effectiveCategories, lang, categoryHints);

  // Custom type guidance
  if (effectivePreset && effectivePreset.startsWith('custom_')) {
    const ct = loadCustomTypes().find(t => t.id === effectivePreset);
    if (ct?.guidance && !guidance.analysis) guidance.analysis = `[Analysis Guidance] ${ct.guidance}`;
  }

  // The preset prompt is the system message. The user turn is ordered stable → changing so the
  // provider's prompt cache can reuse the longest possible prefix between refreshes: context and
  // setup first, the (append-only) transcript next, one-shot hints and the clock last.
  const systemPrompt = prompt || getPromptForType(effectivePreset);
  const parts = [`[${L.context}] ${contextText}`];
  if (guidance.nameRules) parts.push('', guidance.nameRules);
  if (guidance.analysis) parts.push('', guidance.analysis);

  if (metadata && Object.keys(metadata).some(k => metadata[k] && (!Array.isArray(metadata[k]) || metadata[k].length))) {
    const setup = [];
    if (metadata.datetime) {
      const dt = new Date(metadata.datetime);
      setup.push(`${L.datetime}: ${dt.toLocaleDateString(getDateLocale())} ${fmtTime(dt)}`);
    }
    if (metadata.location) setup.push(`${L.location}: ${metadata.location}`);
    if (metadata.participants && metadata.participants.length > 0) {
      const participantStrs = metadata.participants.map(p => {
        if (typeof p === 'string') return p;
        let s = p.name || '';
        if (p.title) s += `(${p.title}`;
        if (p.company) s += p.title ? `/${p.company})` : `(${p.company})`;
        else if (p.title) s += ')';
        return s;
      });
      setup.push(`${L.participants}: ${participantStrs.join(' | ')}`);
    }
    if (metadata.description) setup.push(`${L.purpose}: ${metadata.description}`);
    if (setup.length) parts.push('', `[${L.setup}]`, ...setup);
  }

  if (userProfile) parts.push('', `[${L.profile}]`, userProfile);

  if (hasInsights) {
    parts.push('', `[${L.insights}]`);
    userInsights.forEach(insight => parts.push(`- ${insight}`));
  }

  if (hasMemos) {
    parts.push('', `[${L.memos}]`);
    memos.forEach(m => parts.push(`- [${fmtTime(m.timestamp)}] ${m.text}`));
  }

  // The chat has its own context; the analysis only needs to know what the user is curious about.
  const askedInChat = (chatHistory || [])
    .filter(m => m.role === 'user')
    .map(m => String(m.text || m.content || '').trim().slice(0, 200))
    .filter(Boolean)
    .slice(-5);
  if (askedInChat.length) {
    parts.push('', `[${L.chat}]`);
    askedInChat.forEach(q => parts.push(`- ${q}`));
  }

  if (selection.windowed) {
    parts.push('', `[${L.previous}]`, selection.previous);
    const carry = carryChecklist(selection.previous);
    if (carry) parts.push('', L.carry(carry));
  }

  parts.push('');
  if (hasTranscript) {
    parts.push(selection.windowed ? `[${L.recent(selection.minutes, selection.from)}]` : `[${L.transcript}]`);
    parts.push(selection.text);
  } else {
    parts.push(L.noTranscript);
  }

  if (userCorrections && userCorrections.length > 0) {
    parts.push('', `[${L.corrections}]`);
    userCorrections.forEach(c => parts.push(`- "${c.before}" → "${c.after}"`));
  }

  if (blockMemos && blockMemos.length > 0) {
    parts.push('', `[${L.blockMemos}]`);
    blockMemos.forEach(m => parts.push(`- "${m.blockSnippet}": ${m.memo}`));
  }

  parts.push('', `[${L.elapsed}] ${elapsedTime || 'unknown'}`, L.lang);

  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: parts.join('\n') }] }],
    generationConfig: { temperature: 0.3 },
  };

  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      let rawText;

      if (onStream) {
        const result = await callGeminiGuarded(model, body, {
          category: 'analysis',
          onStream: (_chunk, fullSoFar) => { onStream(fullSoFar); },
        });
        rawText = result.text;
      } else {
        const data = await callGeminiGuarded(model, body, { category: 'analysis' });
        rawText = responseText(data);
      }

      // Try JSON parse for backward compatibility with old-style prompts
      const parsed = parseGeminiResponse(rawText);
      if (parsed && parsed.summary) {
        return {
          flow: parsed.flow || '',
          summary: parsed.summary || '',
          context: parsed.context || '',
          openQuestions: flattenItems(parsed.openQuestions),
          actionItems: flattenItems(parsed.actionItems),
          suggestions: flattenItems(parsed.suggestions),
          markdown: null,
          timestamp: Date.now(),
        };
      }

      // Markdown response (new default)
      const { cleaned, whispers } = extractWhispers(rawText);
      return {
        markdown: cleaned,
        flow: extractHeadline(cleaned),
        summary: cleaned,
        whispers,
        timestamp: Date.now(),
      };
    } catch (err) {
      lastError = err;
      // 429 errors are already retried in gemini-api.js — don't retry again here
      if (err.status === 429) break;
      if (err instanceof UsageLimitError) break;
      if (attempt === 0) await new Promise(r => setTimeout(r, 1000));
    }
  }

  throw lastError;
}

// ─── End of meeting: title + tags + categories in ONE light call ─────────────
function transcriptExcerpt(transcript) {
  const head = transcript.slice(0, 40).map(l => l.text).join('\n').slice(0, 2000);
  const tail = transcript.slice(-20).map(l => l.text).join('\n').slice(0, 1000);
  return transcript.length > 60 ? head + '\n...\n' + tail : head;
}

function cleanStrings(arr, max) {
  return Array.isArray(arr) ? arr.map(s => String(s).trim()).filter(Boolean).slice(0, max) : [];
}

/**
 * Title suggestions and metadata (tags, categories) from one request.
 * @returns {Promise<{title: string, alternatives: string[], tags: string[], categories: string[]} | null>}
 */
export async function suggestTitleAndMetadata({ transcript, meetingContext = '', existingTitle = '', existingTags = [] }) {
  if (!isAiAvailable() || !transcript || transcript.length === 0) return null;

  const lang = getAiLanguage();
  const categories = loadCategories().map(c => c.name || c);
  const prompt = `From this meeting/lecture transcript, produce a title and metadata. ${lang === 'ko' ? 'Write the title, alternatives and tags in Korean.' : 'Write the title, alternatives and tags in English.'}
${meetingContext ? `Context: ${meetingContext}\n` : ''}${existingTitle ? `Current title: "${existingTitle}" (propose better ones)\n` : ''}Already known tags: ${existingTags.join(', ') || 'none'}
Categories to choose from (pick at most 2 that fit, else none): ${JSON.stringify(categories)}

Transcript:
${transcriptExcerpt(transcript)}

Return a JSON object:
{"title":"concise and specific (name the actual subject), under 40 chars","alternatives":["2 alternative titles"],"tags":["up to 7 NEW short keywords, most relevant first, not already in the known tags"],"categories":["0-2 names copied exactly from the list"]}`;

  try {
    const data = await callGeminiGuarded(modelFor('title'), {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.3 }
    }, { category: 'tags' });
    const parsed = parseGeminiResponse(responseText(data));
    if (!parsed || typeof parsed !== 'object') return null;
    const known = new Set(existingTags.map(t => String(t).toLowerCase()));
    return {
      title: String(parsed.title || '').trim(),
      alternatives: cleanStrings(parsed.alternatives, 3),
      tags: cleanStrings(parsed.tags, 7).filter(t => !known.has(t.toLowerCase())),
      categories: cleanStrings(parsed.categories, 2).filter(c => categories.includes(c)),
    };
  } catch {
    return null;
  }
}

// Parser contract for both final prompts: stripPreamble keeps text from the first '#';
// every section is an H2 ('## ') because section refine and export split on it ('###' is
// fine inside a section); chat.js renderMarkdown has no table/hr/LaTeX support.
const FINAL_MINUTES_PROMPT = {
  en: `You are a professional meeting secretary producing the **final meeting minutes** after the meeting has ended. Be exhaustive, but include only what is in the transcript.

English Markdown. No preamble or greeting; start with the first heading. Structure:

# Final Meeting Minutes

## Overview
- **Date/Time**: from metadata if given, otherwise from transcript timestamps
- **Duration**: the provided value
- **Location**: only if in metadata
- **Participants**: only if in metadata
- **Key Result**: the single most important outcome, one sentence

## Executive Summary
3-5 sentences covering the major topics and outcomes.

## Detailed Discussion
One "### Agenda item" subheading per topic in order, and under each:
- What was discussed (numbers, names, conditions verbatim)
- Opinions and concerns raised
- Outcome: [DECIDED] or [PENDING]

## Decisions
Numbered list of confirmed decisions only, with rationale and conditions. "None" if none.

## Action Items
- **[Owner or TBD]** Task — deadline (only if mentioned)
"None" if none.

## Unresolved Issues
Items without a conclusion, why, and who follows up.

## Risks & Concerns
Potential problems raised during the meeting. Omit the section if none.

## Next Steps
What must happen before the next meeting.

## Key Takeaways
The 3-5 most important points.

Rules:
- Never invent decisions, owners or deadlines that are not in the transcript or memos. Unclear owner → [TBD].
- Numbers, dates, names and technical terms exactly as heard.
- Write actual content, not abstractions like "discussed X".
- There is no speaker attribution: do not assert who said what; mention names only when stated, tagged "(estimated)".
- If memos are provided, fold the user's memos into the related agenda item.
- No tables, no horizontal rules, no indented sub-bullets; use one-level lists.`,

  ko: `당신은 전문 회의 비서입니다. 회의가 끝난 뒤 생성하는 **최종 회의록**을 작성합니다. 빠짐없이, 그러나 트랜스크립트에 있는 내용만.

한국어 마크다운. 서문·인사 없이 첫 제목부터 시작. 구조:

# 최종 회의록

## 개요
- **일시**: 메타데이터가 있으면 그대로, 없으면 트랜스크립트 타임스탬프 기준
- **소요 시간**: 제공된 값
- **장소**: 메타데이터에 있을 때만
- **참석자**: 메타데이터에 있을 때만
- **핵심 결과**: 가장 중요한 결론 한 문장

## 요약
주요 주제와 결과를 3~5문장으로.

## 상세 논의
안건 순서대로 "### 안건명" 소제목을 두고, 각 안건마다:
- 논의 내용 (수치·이름·조건을 그대로)
- 제기된 의견·우려
- 결과: [결정] 또는 [미결]

## 결정사항
확정된 결정만 번호 목록으로, 근거·조건 포함. 없으면 "없음".

## 실행 항목
- **[담당자 또는 미정]** 할 일 — 기한 (언급된 경우만)
없으면 "없음".

## 미결 사항
결론이 나지 않은 항목과 그 이유, 후속 담당.

## 리스크 및 우려사항
회의 중 제기된 잠재적 문제. 없으면 이 섹션 생략.

## 다음 단계
다음 회의 전까지 해야 할 일.

## 핵심 요점
가장 중요한 3~5가지.

규칙:
- 트랜스크립트·메모에 없는 결정, 담당자, 기한을 만들지 마세요. 담당자가 불명확하면 [미정].
- 수치·날짜·이름·기술 용어는 들린 그대로.
- "~에 대해 논의함" 같은 추상 표현 대신 실제 내용을 쓰세요.
- 화자 구분이 없으므로 발언자를 단정하지 말고, 이름이 명시된 경우에만 "(추정)"을 붙여 언급하세요.
- 메모가 제공되면 사용자의 메모를 관련 안건에 반영하세요.
- 표, 구분선(---), 들여쓴 하위 목록은 쓰지 말고 한 단계 목록을 쓰세요.`
};

const FINAL_NOTES_PROMPT = {
  en: `You are a teaching assistant writing up an advanced lecture. After the lecture, produce the **final lecture notes** a student can use directly for review and exam prep.

English Markdown. No preamble or greeting; start with the first heading. Structure:

# Lecture Notes: (lecture topic)

## At a Glance
3-5 sentences on what this lecture covered and why.

## Key Concepts
In lecture order, for each concept:
### Concept name
- Definition: as explained in the lecture
- Intuition / example: the lecturer's examples and analogies (if any)
- Formula: any formula mentioned, written out as spoken (if any)
- Common confusion / warning: what the lecturer pointed out (if any)

## Line of Reasoning
Problem → idea → derivation → result as a numbered list, one line of supporting lecture content per step.

## What the Lecturer Emphasized
Everything flagged as "important", "on the exam", "must". Exam scope, assignments and deadlines each on their own line, exactly as heard.

## Questions & Answers
Questions raised during the lecture with their answers as Q/A pairs. Omit if none.

## Open Questions
Things explained only briefly, deferred to a later session, or worth looking up.

## Glossary
- Term (original/abbreviation): one-line definition

## Review Questions
3-5 questions answerable from the lecture alone:
- Q: …
- A: (short answer based on the lecture)

Rules:
- Never invent content that is not in the transcript or memos. Essential background, and any interpretation the lecturer did not say, gets a "(supplement)" tag.
- Keep formulas, numbers, names and years as heard. Correct only obvious STT errors as "heard(→ likely)".
- Write formulas as plain text, never LaTeX (KL(q‖p), z = μ + σ·ε). No tables, no horizontal rules, no indented sub-bullets; one-level lists only; put several points of one item on one line separated by "; ".
- Do not use meeting-minutes structure (decisions, action items, owners, attendees). These are lecture notes; never assign tasks to people.
- If memos are provided, fold the student's memos under the matching concept.`,

  ko: `당신은 고급 강의를 정리하는 조교입니다. 강의가 끝난 뒤, 학생이 시험 공부와 복습에 그대로 쓸 수 있는 **최종 강의 노트**를 작성합니다.

한국어 마크다운. 서문·인사 없이 첫 제목부터 시작. 구조:

# 강의 노트: (강의 주제)

## 한눈에 보기
이 강의가 무엇을 왜 다뤘는지 3~5문장.

## 핵심 개념
강의 순서대로, 개념마다:
### 개념명
- 정의: 강의에서 설명된 그대로
- 직관·예시: 강사가 든 예시·비유 (있으면)
- 수식: 언급된 수식을 말로 풀어 쓴 형태 그대로 (있으면)
- 흔한 오해·주의: 강사가 짚은 것 (있으면)

## 논리 전개
문제 → 아이디어 → 유도 → 결과를 번호 목록으로, 각 단계에 근거가 된 강의 내용을 한 줄씩.

## 강사가 강조한 것
"중요", "시험", "반드시"라고 한 것을 그대로. 시험 범위·과제·마감은 별도 줄로 정확히.

## 질문과 답변
강의 중 나온 질문과 답을 Q/A 쌍으로. 없으면 이 섹션 생략.

## 남은 의문점
설명이 짧았거나, 다음에 다룬다고 미룬 것, 학생이 더 찾아볼 것.

## 용어집
- 용어 (원어/약자): 한 줄 정의

## 복습 문제
강의 내용만으로 답할 수 있는 문제 3~5개:
- Q: …
- A: (강의 내용 기준의 짧은 답)

규칙:
- 트랜스크립트와 메모에 없는 내용을 만들지 마세요. 이해에 꼭 필요한 배경지식과, 강의에서 직접 말하지 않은 해석·부연은 문장 끝에 "(보충)".
- 수식·수치·이름·연도는 들린 그대로. 명백한 STT 오인식만 "들린 말(→ 추정)"으로 정정.
- 수식은 LaTeX 없이 일반 텍스트로 (KL(q‖p), z = μ + σ·ε). 표·구분선(---)·들여쓴 하위 목록 금지, 한 단계 목록만. 한 항목에 여러 내용이 있으면 한 줄에 "; "로 이어 쓰기.
- 회의록 형식(결정사항, 실행 항목, 담당자, 참석자)을 쓰지 마세요. 이것은 강의 노트이며, 누구에게도 할 일을 배정하지 마세요.
- 메모가 제공되면 학생의 메모를 해당 개념 아래에 반영하세요.`
};

// ─── Final document at meeting end: meeting minutes or lecture notes ─────────
function allDefaultFinalPrompts() {
  return [FINAL_MINUTES_PROMPT.ko, FINAL_MINUTES_PROMPT.en, FINAL_NOTES_PROMPT.ko, FINAL_NOTES_PROMPT.en].map(s => s.trim());
}

/**
 * Default base prompt for the final document of the current (or given) session:
 * lecture notes for lecture sessions, meeting minutes otherwise.
 */
export function getDefaultMinutesPrompt(meetingPreset = state.settings?.meetingPreset, categories = state.categories) {
  const lang = getAiLanguage() === 'ko' ? 'ko' : 'en';
  return isLectureSession(meetingPreset, categories) ? FINAL_NOTES_PROMPT[lang] : FINAL_MINUTES_PROMPT[lang];
}

const FINAL_LABELS = {
  ko: {
    meeting: { context: '회의 정보', duration: '소요 시간', lines: '줄 수', prev: '마지막 실시간 분석', transcript: '전체 트랜스크립트' },
    lecture: { context: '강의 정보', duration: '소요 시간', lines: '줄 수', prev: '마지막 실시간 강의 노트', transcript: '전체 트랜스크립트' },
    metadata: '메타데이터 — 개요 섹션에 사용', title: '제목', datetime: '일시', location: '장소', participants: '참석자', categories: '카테고리', tags: '태그',
    profile: '사용자 프로필', memos: '사용자 메모', template: '템플릿 구조 — 이 제목 구조를 사용', reference: '참고 문서 스타일', instruction: '추가 지시',
    lang: '[출력 언어] 반드시 한국어로 작성.',
  },
  en: {
    meeting: { context: 'Meeting context', duration: 'Total duration', lines: 'Total lines', prev: 'Latest live analysis', transcript: 'Full transcript' },
    lecture: { context: 'Lecture', duration: 'Duration', lines: 'Total lines', prev: 'Latest live lecture notes', transcript: 'Full transcript' },
    metadata: 'Metadata — use in the overview section', title: 'Title', datetime: 'Date/Time', location: 'Location', participants: 'Participants', categories: 'Categories', tags: 'Tags',
    profile: 'User profile', memos: 'User memos', template: 'Template structure — use this heading structure', reference: 'Reference document style', instruction: 'Additional instruction',
    lang: '[Output language] English only.',
  },
};

const DETAIL_INSTRUCTION = {
  ko: {
    lecture: '[상세 모드] 개념마다 강의에서 나온 정의·예시·수식·주의점을 빠짐없이 적으세요. 단, 트랜스크립트에 없는 내용은 추가하지 마세요.',
    meeting: '[상세 모드] 안건마다 논의 맥락과 근거, 엇갈린 의견까지 빠짐없이 적으세요. 단, 트랜스크립트에 없는 결정·담당자·기한은 만들지 마세요.',
    concise: '[간결 모드] 빠뜨리는 내용 없이, 각 섹션은 핵심만 짧게 쓰세요.',
  },
  en: {
    lecture: '[Detailed mode] For every concept, include all definitions, examples, formulas and warnings given in the lecture. Add nothing that is not in the transcript.',
    meeting: '[Detailed mode] For every agenda item, include the context, rationale and differing views. Never invent decisions, owners or deadlines that are not in the transcript.',
    concise: '[Concise mode] Miss nothing, but keep each section short.',
  },
};

export async function generateFinalMinutes({
  transcript,
  analysisHistory = [],
  meetingContext,
  meetingPreset,
  elapsedTime,
  memos = [],
  userProfile = '',
  model = modelFor('minutes'),
  template = '',
  referenceDoc = '',
  basePromptOverride = '',
  userInstruction = '',
  metadata = {},
  onStream = null,
  categories = [],
  categoryHints = {},
}) {
  if (!isAiAvailable()) throw new Error('Proxy not available');
  if (!transcript || transcript.length === 0) throw new Error('No transcript');

  const effectivePreset = meetingPreset || 'copilot';
  const contextText = meetingContext || getAiPresetContext(effectivePreset);
  const transcriptText = selectTranscript(transcript, { strategy: 'full' }).text;
  const lang = getAiLanguage() === 'ko' ? 'ko' : 'en';
  const lecture = isLectureSession(effectivePreset, [...(categories || []), ...(metadata?.categories || [])]);
  const kind = lecture ? 'lecture' : 'meeting';
  const L = FINAL_LABELS[lang];

  // The latest live analysis is cumulative, so one is enough context
  const prevAnalysis = analysisHistory
    .filter(a => !a.isFinalMinutes && (a.markdown || a.summary))
    .map(a => a.markdown || a.summary)
    .slice(-1)[0] || '';

  // Auto-resolve category guidance from meeting type if no explicit categories
  let effectiveCategories = categories;
  if (!effectiveCategories || effectiveCategories.length === 0) {
    const mappedCat = getMeetingTypeCategoryMap()[effectivePreset];
    if (mappedCat) effectiveCategories = [mappedCat];
  }
  const guidance = getCategoryGuidance(effectiveCategories, lang, categoryHints);

  // An override that is just one of the built-in defaults (e.g. the prompt editor applied without
  // edits) is not a real override: pick the right default for this session and language.
  const override = String(basePromptOverride || '').trim();
  const isCustom = override && !allDefaultFinalPrompts().includes(override);
  const basePrompt = isCustom ? override : (lecture ? FINAL_NOTES_PROMPT[lang] : FINAL_MINUTES_PROMPT[lang]);
  // Heavy tier gets the full-detail instruction; a lighter model (e.g. after a usage downgrade) stays concise.
  const mode = isProModel(model) ? DETAIL_INSTRUCTION[lang][kind] : DETAIL_INSTRUCTION[lang].concise;

  const labels = L[kind];
  const parts = [
    `[${labels.context}] ${metadata?.title && lecture ? `${metadata.title} — ` : ''}${contextText}`,
    `[${labels.duration}] ${elapsedTime || 'unknown'}`,
    `[${labels.lines}] ${transcript.length}`,
  ];

  if (guidance.nameRules) parts.push('', guidance.nameRules);
  if (guidance.minutes) parts.push('', guidance.minutes);

  if (metadata && Object.keys(metadata).length > 0) {
    const meta = [];
    if (metadata.title) meta.push(`${L.title}: ${metadata.title}`);
    if (metadata.datetime) {
      const dt = new Date(metadata.datetime);
      meta.push(`${L.datetime}: ${dt.toLocaleDateString(getDateLocale())} ${fmtTime(dt)}`);
    }
    if (metadata.location) meta.push(`${L.location}: ${metadata.location}`);
    if (metadata.participants && metadata.participants.length > 0) meta.push(`${L.participants}: ${metadata.participants.join(', ')}`);
    if (metadata.categories && metadata.categories.length > 0) meta.push(`${L.categories}: ${metadata.categories.join(', ')}`);
    if (metadata.tags && metadata.tags.length > 0) meta.push(`${L.tags}: ${metadata.tags.join(', ')}`);
    if (meta.length) parts.push('', `[${L.metadata}]`, ...meta);
  }

  if (userProfile) parts.push('', `[${L.profile}]`, userProfile);

  if (memos && memos.length > 0) {
    parts.push('', `[${L.memos}]`);
    memos.forEach(m => parts.push(`- [${fmtTime(m.timestamp)}] ${m.text}`));
  }

  if (prevAnalysis) parts.push('', `[${labels.prev}]`, prevAnalysis);
  if (template) parts.push('', `[${L.template}]`, template);
  if (referenceDoc) parts.push('', `[${L.reference}]`, referenceDoc);
  if (userInstruction) parts.push('', `[${L.instruction}]`, userInstruction);

  parts.push('', `[${labels.transcript}]`, transcriptText, '', L.lang);

  const body = {
    systemInstruction: { parts: [{ text: `${basePrompt}\n\n${mode}` }] },
    contents: [{ role: 'user', parts: [{ text: parts.join('\n') }] }],
    generationConfig: { temperature: 0.3 },
  };

  let rawText;
  if (onStream) {
    const result = await callGeminiGuarded(model, body, {
      category: 'minutes',
      onStream: (_chunk, fullSoFar) => { onStream(fullSoFar); },
    });
    rawText = result.text;
  } else {
    const data = await callGeminiGuarded(model, body, { category: 'minutes' });
    rawText = responseText(data);
  }

  const cleanedText = stripPreamble(rawText);
  // Lecture notes open with "# 강의 노트: <topic>" — the topic is a better history headline than "한눈에 보기".
  const h1 = lecture ? cleanedText.match(/^#\s+(.+)$/m)?.[1]?.trim() : '';

  return {
    markdown: cleanedText,
    flow: (h1 || extractHeadline(cleanedText)).slice(0, 80),
    summary: cleanedText,
    timestamp: Date.now(),
    isFinalMinutes: true,
    generatedModel: model,
  };
}

// ─── Section refine (minutes / lecture notes editor) ─────────────────────────
const REFINE_CONTEXT_MAX_CHARS = 12000;

/** Strip code fences the model may wrap around the section and restore a dropped heading. */
export function normalizeRefinedSection(text, originalSection) {
  let out = String(text || '').trim()
    .replace(/^```[\w-]*[ \t]*\r?\n/, '')
    .replace(/\r?\n?```\s*$/, '')
    .trim();
  if (!out) return originalSection;
  const heading = String(originalSection || '').match(/^(#{1,4}) [^\n]*/);
  if (heading && !/^#{1,4}\s/.test(out)) out = `${heading[0]}\n${out}`;
  return out;
}

function refineContext(fullMarkdown, sectionMarkdown) {
  const full = String(fullMarkdown || '');
  if (full.length <= REFINE_CONTEXT_MAX_CHARS) return full;
  const idx = Math.max(0, full.indexOf(sectionMarkdown));
  const half = (REFINE_CONTEXT_MAX_CHARS - sectionMarkdown.length) / 2;
  const start = Math.max(0, Math.floor(idx - Math.max(half, 2000)));
  const end = Math.min(full.length, Math.ceil(idx + sectionMarkdown.length + Math.max(half, 2000)));
  return (start > 0 ? '…\n' : '') + full.slice(start, end) + (end < full.length ? '\n…' : '');
}

export async function refineSectionContent({ fullMarkdown, sectionMarkdown, instruction, lang }) {
  if (!isAiAvailable()) throw new Error('Proxy not available');

  const systemPrompt = lang === 'ko'
    ? `당신은 회의록/강의 노트 편집 도우미입니다. 전체 문서는 맥락 참고용이고, 수정 대상은 [수정할 섹션] 하나뿐입니다.
- 수정된 섹션만 출력하세요. 코드블록(\`\`\`) 없이, 원래의 제목 줄로 시작해서 그 섹션 끝까지.
- 지시에 없는 사실을 추가하지 마세요. 원문에 없는 수치·이름·기한을 만들지 마세요.
- 다른 섹션, 설명, 인사말을 붙이지 마세요. 표는 쓰지 말고 목록을 쓰세요.`
    : `You are an editor for meeting minutes / lecture notes. The full document is context only; the only thing to modify is the [Target section].
- Output the modified section only: no code fences, starting with its original heading line and ending at the end of that section.
- Add no facts that are not in the instruction or the document; never invent numbers, names or deadlines.
- No other sections, explanations or greetings. No tables; use lists.`;

  const userMessage = lang === 'ko'
    ? `[전체 문서 (맥락)]\n${refineContext(fullMarkdown, sectionMarkdown)}\n\n[수정할 섹션]\n${sectionMarkdown}\n\n[지시]\n${instruction}`
    : `[Full document (context)]\n${refineContext(fullMarkdown, sectionMarkdown)}\n\n[Target section]\n${sectionMarkdown}\n\n[Instruction]\n${instruction}`;

  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    generationConfig: { temperature: 0.2 }
  };

  const data = await callGeminiGuarded(modelFor('refine'), body, { category: 'refine' });
  return normalizeRefinedSection(responseText(data), sectionMarkdown);
}

// ─── STT sentence correction ─────────────────────────────────────────────────
/**
 * Read corrections from the model's JSON. OpenAI json_object mode forces an object, so the prompt
 * asks for {"corrections":[…]}; a bare array (older prompt / other providers) is still accepted,
 * and so is a single correction object.
 */
export function parseCorrections(parsed, lineCount = Infinity) {
  let arr = null;
  if (Array.isArray(parsed)) arr = parsed;
  else if (parsed && typeof parsed === 'object') {
    arr = Array.isArray(parsed.corrections) ? parsed.corrections
      : (typeof parsed.index === 'number' ? [parsed] : null);
  }
  if (!arr) return [];
  return arr.filter(c => c && Number.isInteger(c.index) && c.index >= 0 && c.index < lineCount
    && typeof c.corrected === 'string' && c.corrected.trim());
}

export async function correctSentences({ lines, model = modelFor('correction'), correctionDict = [], domainHint = '' }) {
  if (!isAiAvailable() || !lines || lines.length === 0) return [];

  const lang = getAiLanguage();
  const ko = lang === 'ko';
  const langLabel = ko ? 'Korean' : 'English';
  const numbered = lines.map((l, i) => `${i}: ${l.text}`).join('\n');

  let dictSection = '';
  if (correctionDict.length > 0) {
    const entries = correctionDict.map(e => `- "${e.original}" → "${e.corrected}"`).join('\n');
    dictSection = `\nUser correction dictionary (apply these known corrections when matching patterns appear):\n${entries}\n`;
  }

  const examples = ko
    ? `- acronyms and symbols that STT spelled out letter by letter → their written form ("케이엘" → "KL", "피 오브 엑스" → "p(x)", "엠에스이" → "MSE", "브이에이이" → "VAE", "제트" as a variable → "z")
- spacing, obvious typos, wrong particles/endings ("까지에요" → "까지예요")`
    : `- acronyms and symbols that STT spelled out ("kay ell" → "KL", "p of x" → "p(x)", "em ess ee" → "MSE")
- obvious typos, spacing and grammar slips`;
  const loanwords = ko
    ? 'Do NOT translate: Korean transliterations of loanwords stay Korean ("가우시안", "베르누이", "리파라미터라이제이션", "인트랙터블", "젠슨" stay as they are).'
    : 'Do NOT translate or respell names and loanwords that are already understandable.';

  const prompt = `You correct ${langLabel} speech-to-text transcript lines.

Fix ONLY:
- misheard words (similar pronunciation)
${examples}
Do NOT: rephrase, change meaning or register, merge or split lines, add or remove words. Every word that is not an error stays exactly as it is.
${loanwords}
When unsure, leave the line unchanged.
${domainHint ? `\nDomain / topic hint (use it to resolve ambiguous terms): ${String(domainHint).slice(0, 300)}\n` : ''}${dictSection}
Lines (index: text):
${numbered}

Return a JSON object: {"corrections":[{"index":<number>,"corrected":"<full corrected line>"}]}
Include only lines that actually change. If nothing needs correction return {"corrections":[]}.`;

  try {
    const data = await callGeminiGuarded(model, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
    }, { category: 'correction' });
    const parsed = parseGeminiResponse(responseText(data));
    return parseCorrections(parsed, lines.length)
      // Guard against rewrites: a correction keeps roughly the line's length
      .filter(c => {
        const orig = lines[c.index].text || '';
        return c.corrected.length >= orig.length * 0.4 && c.corrected.length <= orig.length * 1.6 + 10;
      });
  } catch {
    return [];
  }
}
