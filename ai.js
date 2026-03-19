// ai.js - Gemini API analysis module with model selection and auto-tagging

import { getAiPrompt, getAiPresetContext, getAiLanguage, getDateLocale, t, getTypeDefaultPrompt, getMeetingTypeCategoryMap } from './i18n.js';
import { callGemini, callGeminiStream, isProxyAvailable } from './gemini-api.js';
import { getCategoryGuidance } from './category-prompts.js';
import { loadCategories, loadTypePrompts, loadCustomTypes } from './storage.js';

// Normalize array items: if Gemini returns objects instead of strings, flatten them
function flattenItems(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(item =>
    typeof item === 'object' && item !== null
      ? Object.values(item).filter(v => v != null).join(' — ')
      : String(item)
  );
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

function buildTranscriptText(transcript, strategy, recentMinutes, previousSummary) {
  if (!transcript || transcript.length === 0) return '';

  const formatLine = (line, idx) => {
    const time = new Date(line.timestamp).toLocaleTimeString(getDateLocale(), { hour: '2-digit', minute: '2-digit' });
    return `#${idx} [${time}]: ${line.text}`;
  };

  if (strategy === 'full') {
    return transcript.map(formatLine).join('\n');
  }

  const cutoff = Date.now() - recentMinutes * 60 * 1000;
  const recent = transcript.filter(l => l.timestamp >= cutoff);

  // 'smart': previous summary + recent transcript
  let text = '';
  if (previousSummary) {
    text += `[Previous Summary]\n${previousSummary}\n\n[Recent Transcript]\n`;
  }
  text += (recent.length > 0 ? recent : transcript.slice(-20)).map(formatLine).join('\n');
  return text;
}

function parseGeminiResponse(text) {
  // Try JSON parse for backward compatibility (old prompts / tag generation)
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

// Extract first heading or first suggested line as a short flow/headline
function extractHeadline(markdown) {
  // Try ## 🎯 section — extract first suggested line (strip tag emoji)
  const suggestedMatch = markdown.match(/^##\s+🎯[^\n]*\n+(?:[-*]\s*(?:[🔍✋📌⚠️💬🔄]\s*)?)?[""]?([^"""\n]+)/m);
  if (suggestedMatch) return suggestedMatch[1].replace(/[""]$/,'').trim().slice(0, 80);
  // Legacy: ## Headline / ## 한줄 요약 content
  const headlineMatch = markdown.match(/^##\s+(?:Headline|한줄\s*요약)[^\n]*\n+(.+)/m);
  if (headlineMatch) return headlineMatch[1].trim().slice(0, 80);
  // Try first ## heading
  const firstH2 = markdown.match(/^##\s+(.+)/m);
  if (firstH2) return firstH2[1].trim().slice(0, 80);
  // Fallback: first non-empty line
  const firstLine = markdown.split('\n').find(l => l.trim());
  return (firstLine || '').replace(/^#+\s*/, '').trim().slice(0, 80);
}

/** Extract whisper section from markdown, returning cleaned markdown + whispers array */
function extractWhispers(markdown) {
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

export async function analyzeTranscript({
  transcript,
  prompt,
  meetingContext,
  meetingPreset,
  elapsedTime,
  strategy = 'smart',
  recentMinutes = 5,
  previousSummary = null,
  userInsights = [],
  memos = [],
  chatHistory = [],
  userProfile = '',
  model = 'gemini-2.5-flash',
  userCorrections = [],
  blockMemos = [],
  onStream = null,
  categories = [],
  categoryHints = {},
}) {
  if (!isProxyAvailable()) throw new Error('Proxy not available');
  const hasTranscript = transcript && transcript.length > 0;
  const hasMemos = memos && memos.length > 0;
  const hasInsights = userInsights && userInsights.length > 0;
  const hasChatHistory = chatHistory && chatHistory.length > 0;
  if (!hasTranscript && !hasMemos && !hasInsights && !hasChatHistory) throw new Error('No transcript to analyze');

  const effectivePreset = meetingPreset || 'copilot';
  const contextText = meetingContext || getPresetContext(effectivePreset);
  const transcriptText = buildTranscriptText(transcript, strategy, recentMinutes, previousSummary);

  const lang = getAiLanguage();

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
    const customTypes = loadCustomTypes();
    const ct = customTypes.find(t => t.id === effectivePreset);
    if (ct) {
      if (ct.guidance && !guidance.analysis) {
        guidance.analysis = `[Analysis Guidance] ${ct.guidance}`;
      }
      if (ct.context && !contextText) {
        // Use custom context if no other context is set
      }
    }
  }

  // Use per-type prompt: explicit prompt > type-specific prompt > global default
  const systemPrompt = prompt || getPromptForType(effectivePreset);
  const messageParts = [
    `Meeting Context: ${contextText}`,
    `Elapsed Time: ${elapsedTime || 'unknown'}`,
  ];

  // Inject category-specific guidance
  if (guidance.nameRules) {
    messageParts.push('', guidance.nameRules);
  }
  if (guidance.analysis) {
    messageParts.push('', guidance.analysis);
  }

  if (userProfile) {
    messageParts.push('');
    messageParts.push('[User Profile - This person is ONE of the meeting participants. NOT all statements are from this person. If you find any insight in the transcript that would be particularly helpful for this participant, mention it briefly.]');
    messageParts.push(userProfile);
  }

  if (userInsights && userInsights.length > 0) {
    messageParts.push('');
    messageParts.push('[User Insights]');
    userInsights.forEach(insight => messageParts.push(`- ${insight}`));
  }

  if (memos && memos.length > 0) {
    messageParts.push('');
    messageParts.push('[User Memos - personal notes and opinions from the meeting participant]');
    memos.forEach(m => {
      const time = new Date(m.timestamp).toLocaleTimeString(getDateLocale(), { hour: '2-digit', minute: '2-digit' });
      messageParts.push(`- [${time}] ${m.text}`);
    });
  }

  if (hasChatHistory) {
    messageParts.push('');
    messageParts.push('[AI Chat History - previous Q&A between the user and AI assistant during this meeting]');
    chatHistory.forEach(m => {
      const role = m.role === 'user' ? 'User' : 'AI';
      messageParts.push(`- ${role}: ${m.text || m.content || ''}`);
    });
  }

  if (userCorrections && userCorrections.length > 0) {
    messageParts.push('');
    messageParts.push('[User Corrections - The user manually edited parts of the previous analysis. Please take these corrections into account and adjust your analysis accordingly. These are one-time hints, so incorporate the intent naturally rather than repeating them verbatim.]');
    userCorrections.forEach(c => {
      messageParts.push(`- Changed: "${c.before}" → "${c.after}"`);
    });
  }

  if (blockMemos && blockMemos.length > 0) {
    messageParts.push('');
    messageParts.push('[User Notes on Previous Analysis - The user left memos on specific parts of the previous analysis. These reflect their feedback, preferences, or corrections. Incorporate this feedback naturally into your new analysis.]');
    blockMemos.forEach(m => {
      messageParts.push(`- On "${m.blockSnippet}": ${m.memo}`);
    });
  }

  messageParts.push('');
  if (hasTranscript) {
    messageParts.push('Transcript:');
    messageParts.push(transcriptText);
  } else {
    messageParts.push('Transcript: (no transcript yet — analyze based on memos and insights above)');
  }

  const langReminder = lang === 'ko'
    ? '\n\n[IMPORTANT] 위 회의록이 어떤 언어이든, 분석 결과는 반드시 한국어로 작성하세요.'
    : '\n\n[IMPORTANT] Regardless of the transcript language, respond ONLY in English.';
  messageParts.push(langReminder);

  const userMessage = messageParts.join('\n');

  const body = {
    contents: [{
      parts: [{ text: systemPrompt + '\n\n' + userMessage }]
    }],
    generationConfig: {
      temperature: 0.3,
    }
  };

  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      let rawText;

      if (onStream) {
        const result = await callGeminiStream(model, body, (_chunk, fullSoFar) => {
          onStream(fullSoFar);
        });
        rawText = result.text;
      } else {
        const data = await callGemini(model, body);
        rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
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
      if (attempt === 0) await new Promise(r => setTimeout(r, 1000));
    }
  }

  throw lastError;
}

// Auto-generate tags from analysis
export async function generateTags({ summary, transcript, model = 'gemini-2.5-flash-lite' }) {
  if (!isProxyAvailable() || !summary) return [];

  const transcriptSnippet = (transcript || []).slice(0, 10).map(l => l.text).join(' ').slice(0, 500);
  const lang = getAiLanguage();
  const langInstruction = lang === 'ko'
    ? '태그를 반드시 한국어로 생성하세요.'
    : 'Generate tags in English.';
  const prompt = `Based on this meeting summary and transcript, generate up to 10 short tags (keywords) that categorize this meeting. ${langInstruction} Return ONLY a JSON array of strings. No explanation.

Summary: ${summary}

Transcript excerpt: ${transcriptSnippet}`;

  try {
    const data = await callGemini(model, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.3 }
    });

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const parsed = JSON.parse(rawText);
    if (Array.isArray(parsed)) return parsed.map(t => String(t).trim()).filter(Boolean).slice(0, 10);
    return [];
  } catch {
    return [];
  }
}

// AI-powered meeting title generation
export async function generateMeetingTitle({ transcript, existingTitle }) {
  if (!isProxyAvailable() || !transcript || transcript.length === 0) return null;

  const head = transcript.slice(0, 40).map(l => l.text).join('\n').slice(0, 2000);
  const tail = transcript.slice(-20).map(l => l.text).join('\n').slice(0, 1000);
  const transcriptText = transcript.length > 60 ? head + '\n...\n' + tail : head;

  const lang = getAiLanguage();
  const langInstruction = lang === 'ko'
    ? '한국어로 제목을 생성하세요.'
    : 'Generate title in English.';

  const prompt = `Based on this meeting transcript, generate a concise meeting title. ${langInstruction}

${existingTitle ? `Current title: "${existingTitle}" - suggest alternatives that might be better.\n` : ''}
Transcript:
${transcriptText}

Return ONLY valid JSON:
{
  "title": "suggested main title (concise, under 50 chars)",
  "alternatives": ["2-3 alternative titles"]
}`;

  try {
    const data = await callGemini('gemini-2.5-flash-lite', {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.4 }
    });
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const parsed = parseGeminiResponse(rawText);
    return {
      title: parsed.title || '',
      alternatives: Array.isArray(parsed.alternatives) ? parsed.alternatives : [],
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    };
  } catch {
    return null;
  }
}

// Generate final meeting minutes at meeting end
export function getDefaultMinutesPrompt() {
  const lang = getAiLanguage();
  return lang === 'ko' ? FINAL_MINUTES_PROMPT.ko : FINAL_MINUTES_PROMPT.en;
}

export async function generateFinalMinutes({
  transcript,
  analysisHistory = [],
  meetingContext,
  meetingPreset,
  elapsedTime,
  memos = [],
  userProfile = '',
  model = 'gemini-2.5-flash',
  template = '',
  referenceDoc = '',
  basePromptOverride = '',
  userInstruction = '',
  metadata = {},
  onStream = null,
  categories = [],
  categoryHints = {},
}) {
  if (!isProxyAvailable()) throw new Error('Proxy not available');
  if (!transcript || transcript.length === 0) throw new Error('No transcript');

  const effectivePreset = meetingPreset || 'copilot';
  const contextText = meetingContext || getAiPresetContext(effectivePreset);
  const transcriptText = buildTranscriptText(transcript, 'full', 0, null);

  // Gather previous analysis summaries for context
  const prevAnalyses = analysisHistory
    .filter(a => a.markdown || a.summary)
    .map(a => a.markdown || a.summary)
    .slice(-3) // last 3 analyses
    .join('\n---\n');

  const lang = getAiLanguage();
  // Auto-resolve category guidance from meeting type if no explicit categories
  let effectiveCategories = categories;
  if (!effectiveCategories || effectiveCategories.length === 0) {
    const catMap = getMeetingTypeCategoryMap();
    const mappedCat = catMap[effectivePreset];
    if (mappedCat) effectiveCategories = [mappedCat];
  }
  const guidance = getCategoryGuidance(effectiveCategories, lang, categoryHints);
  const prompt = basePromptOverride || (lang === 'ko' ? FINAL_MINUTES_PROMPT.ko : FINAL_MINUTES_PROMPT.en);

  const messageParts = [
    `Meeting Context: ${contextText}`,
    `Total Duration: ${elapsedTime || 'unknown'}`,
    `Total Lines: ${transcript.length}`,
  ];

  // Inject category-specific guidance
  if (guidance.nameRules) {
    messageParts.push('', guidance.nameRules);
  }
  if (guidance.minutes) {
    messageParts.push('', guidance.minutes);
  }

  // Inject metadata if provided
  if (metadata && Object.keys(metadata).length > 0) {
    messageParts.push('', '[Meeting Metadata — use this information in the Overview section]');
    if (metadata.title) messageParts.push(`Meeting Title: ${metadata.title}`);
    if (metadata.datetime) {
      const dt = new Date(metadata.datetime);
      messageParts.push(`Date/Time: ${dt.toLocaleDateString(getDateLocale())} ${dt.toLocaleTimeString(getDateLocale(), { hour: '2-digit', minute: '2-digit' })}`);
    }
    if (metadata.location) messageParts.push(`Location: ${metadata.location}`);
    if (metadata.participants && metadata.participants.length > 0) {
      messageParts.push(`Participants: ${metadata.participants.join(', ')}`);
    }
    if (metadata.categories && metadata.categories.length > 0) {
      messageParts.push(`Categories: ${metadata.categories.join(', ')}`);
    }
    if (metadata.tags && metadata.tags.length > 0) {
      messageParts.push(`Tags: ${metadata.tags.join(', ')}`);
    }
  }

  if (userProfile) {
    messageParts.push('', '[User Profile]', userProfile);
  }

  if (memos && memos.length > 0) {
    messageParts.push('', '[User Memos]');
    memos.forEach(m => {
      const time = new Date(m.timestamp).toLocaleTimeString(getDateLocale(), { hour: '2-digit', minute: '2-digit' });
      messageParts.push(`- [${time}] ${m.text}`);
    });
  }

  if (prevAnalyses) {
    messageParts.push('', '[Previous Interim Analyses]', prevAnalyses);
  }

  if (template) {
    messageParts.push('', '[Template Structure — use this heading structure]', template);
  }

  if (referenceDoc) {
    messageParts.push('', '[Reference Minutes Style]', referenceDoc);
  }

  if (userInstruction) {
    messageParts.push('', '[Additional Instruction]', userInstruction);
  }

  messageParts.push('', 'Full Transcript:', transcriptText);

  const langReminder = lang === 'ko'
    ? '\n\n[IMPORTANT] 반드시 한국어로 작성하세요.'
    : '\n\n[IMPORTANT] Respond ONLY in English.';
  messageParts.push(langReminder);

  // Mode-specific prompt additions
  const isProModel = model.includes('pro');
  const modeInstruction = isProModel
    ? (lang === 'ko'
      ? '\n\n[Mode: Pro] 최대한 상세하게 작성하세요. 논의의 맥락과 배경까지 기술하세요. 발언자 간 의견 차이를 포착하세요. 숨은 인사이트와 패턴을 도출하세요. 후속 권장 사항을 추가하세요.'
      : '\n\n[Mode: Pro] Be as detailed as possible. Describe the context and background of discussions. Capture differences in opinions between speakers. Derive hidden insights and patterns. Add follow-up recommendations.')
    : (lang === 'ko'
      ? '\n\n[Mode: Flash] 간결하지만 빠뜨리는 내용 없이 작성하세요. 각 섹션 3-5줄 이내. 핵심 결정과 액션 아이템에 집중하세요. 불필요한 배경 설명은 생략하세요.'
      : '\n\n[Mode: Flash] Be concise but don\'t miss anything important. Keep each section to 3-5 lines. Focus on key decisions and action items. Skip unnecessary background explanations.');

  const body = {
    contents: [{
      parts: [{ text: prompt + '\n\n' + messageParts.join('\n') + modeInstruction }]
    }],
    generationConfig: { temperature: isProModel ? 0.3 : 0.2 }
  };

  let rawText;
  if (onStream) {
    const result = await callGeminiStream(model, body, (_chunk, fullSoFar) => {
      onStream(fullSoFar);
    });
    rawText = result.text;
  } else {
    const data = await callGemini(model, body);
    rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  const cleanedText = stripPreamble(rawText);

  return {
    markdown: cleanedText,
    flow: extractHeadline(cleanedText),
    summary: cleanedText,
    timestamp: Date.now(),
    isFinalMinutes: true,
    generatedModel: model,
  };
}

// AI-powered meeting metadata suggestions
export async function suggestMeetingMetadata({ transcript, meetingContext, existingTags = [] }) {
  if (!isProxyAvailable() || !transcript || transcript.length === 0) return null;

  const head = transcript.slice(0, 40).map(l => l.text).join('\n').slice(0, 2000);
  const tail = transcript.slice(-20).map(l => l.text).join('\n').slice(0, 1000);
  const transcriptText = transcript.length > 60 ? head + '\n...\n' + tail : head;

  const lang = getAiLanguage();
  const langInstruction = lang === 'ko'
    ? '한국어로 결과를 생성하세요.'
    : 'Generate results in English.';

  const prompt = `Based on this meeting transcript, suggest metadata. ${langInstruction}

${meetingContext ? `Meeting Context: ${meetingContext}\n` : ''}
Already known tags: ${existingTags.join(', ') || 'none'}

Transcript:
${transcriptText}

Suggest NEW tags (up to 7 keywords not already listed), ordered by relevance (most relevant first), and categories from this list: ${JSON.stringify(loadCategories().map(c => c.name || c))}. Return at most 2 categories.

Return ONLY valid JSON:
{
  "tags": ["new tag 1", "new tag 2"],
  "categories": ["matching category"]
}`;

  try {
    const data = await callGemini('gemini-2.5-flash-lite', {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.3 }
    });
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const parsed = JSON.parse(rawText);
    return {
      tags: Array.isArray(parsed.tags) ? parsed.tags.map(t => String(t).trim()).filter(Boolean).slice(0, 7) : [],
      categories: Array.isArray(parsed.categories) ? parsed.categories.map(c => String(c).trim()).filter(Boolean).slice(0, 2) : [],
    };
  } catch {
    return null;
  }
}

const FINAL_MINUTES_PROMPT = {
  en: `You are an expert meeting secretary producing the FINAL, DEFINITIVE meeting minutes. This is the complete record generated after the meeting has ended — it must be thorough and comprehensive.

Respond in well-structured **Markdown**. Use the following structure:

# Final Meeting Minutes

## Overview
- **Date/Time**: (use provided metadata if available, otherwise from transcript timestamps)
- **Duration**: (from provided duration)
- **Location**: (from provided metadata, omit if not provided)
- **Participants**: (from provided metadata, omit if not provided)
- **Key Result**: One sentence — the most important outcome.

## Executive Summary
3-5 sentence high-level summary covering all major topics and outcomes.

## Detailed Discussion
Chronological, detailed account of ALL topics discussed. For each topic:
- What was discussed (specific details, numbers, names)
- Key arguments or perspectives raised
- Outcome: [DECIDED] or [PENDING]

## Decisions Made
Numbered list of all confirmed decisions with context.

## Action Items
- **[Owner]** Task description — Deadline (if known)

## Unresolved Issues
Items without conclusion — what's blocking, who needs to follow up.

## Risks & Concerns
Potential issues flagged during the meeting.

## Next Steps
What needs to happen before the next meeting.

## Key Takeaways
3-5 bullet points — the most important things to remember.

Rules:
- Do NOT include any greeting, preamble, or meta-commentary. Start directly with the first heading.
- This is the FINAL record — be exhaustive, do not omit any discussed topic
- Use exact numbers, dates, names, and technical terms as stated
- Describe actual content, not abstract references like "discussed X"
- Organize chronologically within each section
- If memos are provided, incorporate the user's personal notes/observations`,

  ko: `당신은 전문 회의 비서입니다. 회의가 끝난 후 생성하는 **최종 확정 회의록**을 작성합니다. 빠짐없이 철저하고 포괄적으로 작성하세요.

잘 구조화된 **Markdown** 형식으로 응답하세요:

# 최종 회의록

## 개요
- **일시**: (메타데이터가 제공된 경우 사용, 아니면 트랜스크립트 타임스탬프 기반)
- **소요 시간**: (제공된 시간 정보)
- **장소**: (메타데이터에서, 없으면 생략)
- **참석자**: (메타데이터에서, 없으면 생략)
- **핵심 결과**: 한 문장 — 가장 중요한 결론.

## 요약 (Executive Summary)
주요 주제와 결과를 포괄하는 3-5문장 요약.

## 상세 논의 내용
모든 논의 주제를 시간순으로 상세히 기술. 각 주제별:
- 무엇이 논의되었는지 (구체적 세부사항, 수치, 이름)
- 제기된 주요 의견이나 관점
- 결과: [결정] 또는 [미결]

## 결정사항
확정된 모든 결정 사항을 번호 목록으로 (맥락 포함).

## 실행 항목 (Action Items)
- **[담당자]** 할 일 — 기한 (파악 가능한 경우)

## 미결 사항
결론이 나지 않은 항목 — 차단 요소, 후속 담당자.

## 리스크 및 우려사항
회의 중 제기된 잠재적 문제.

## 다음 단계
다음 회의 전 해야 할 일.

## 핵심 요점 (Key Takeaways)
가장 중요한 3-5가지 사항.

규칙:
- 인사말, 서두, 메타 코멘트를 포함하지 마세요. 첫 번째 제목(#)으로 바로 시작하세요.
- 이것은 **최종 기록**입니다 — 빠뜨리는 주제 없이 철저하게 작성
- 구체적 수치, 날짜, 이름, 기술 용어는 그대로 기록
- "~에 대해 논의함" 같은 추상적 표현 대신 실제 구체적 내용을 서술
- 각 섹션 내에서 시간순으로 정리
- 메모가 제공된 경우, 사용자의 개인 메모/관찰을 반영`
};

// Refine a single section of the meeting minutes via AI
export async function refineSectionContent({ fullMarkdown, sectionMarkdown, instruction, lang }) {
  if (!isProxyAvailable()) throw new Error('Proxy not available');

  const systemPrompt = lang === 'ko'
    ? `당신은 회의록 편집 도우미입니다. 전체 회의록 맥락을 참고하여, 지정된 섹션만 수정하세요.
수정된 섹션의 마크다운만 반환하세요. 다른 설명은 불필요합니다.`
    : `You are a meeting minutes editing assistant. Refer to the full minutes for context, and modify only the specified section.
Return only the modified section markdown. No other explanation needed.`;

  const userMessage = `[Full Meeting Minutes (for context)]
${fullMarkdown}

[Target Section to Modify]
${sectionMarkdown}

[Instruction]
${instruction}`;

  const body = {
    contents: [{
      parts: [{ text: systemPrompt + '\n\n' + userMessage }]
    }],
    generationConfig: { temperature: 0.2 }
  };

  const data = await callGemini('gemini-2.5-flash', body);
  return data.candidates?.[0]?.content?.parts?.[0]?.text || sectionMarkdown;
}

// AI-powered sentence correction
export async function correctSentences({ lines, model = 'gemini-2.5-flash', correctionDict = [] }) {
  if (!isProxyAvailable() || !lines || lines.length === 0) return [];

  const lang = getAiLanguage();
  const langLabel = lang === 'ko' ? 'Korean' : 'English';
  const numbered = lines.map((l, i) => `${i}: ${l.text}`).join('\n');

  let dictSection = '';
  if (correctionDict.length > 0) {
    const entries = correctionDict.map(e => `- "${e.original}" → "${e.corrected}"`).join('\n');
    dictSection = `\n\nUser correction dictionary (apply these known corrections when matching patterns appear):
${entries}\n`;
  }

  const prompt = `You are a meeting transcript corrector for ${langLabel} STT output.

Correct ONLY:
- STT misrecognition errors (wrong words from similar pronunciation)
- Obvious typos and grammatical errors
- Do NOT change meaning, style, or rephrase sentences
${dictSection}
Numbered sentences:
${numbered}

Return a JSON array of objects with "index" (number) and "corrected" (string) for lines that need correction ONLY. Return empty array [] if no corrections needed.`;

  try {
    const data = await callGemini(model, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
    });
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const parsed = JSON.parse(rawText);
    if (Array.isArray(parsed)) return parsed.filter(c => typeof c.index === 'number' && typeof c.corrected === 'string');
    return [];
  } catch {
    return [];
  }
}
