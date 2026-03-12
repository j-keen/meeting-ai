// ai.js - Gemini API analysis module with model selection and auto-tagging

import { getAiPrompt, getAiPresetContext, getAiLanguage, getDateLocale, t } from './i18n.js';
import { callGemini, isProxyAvailable } from './gemini-api.js';

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

// Extract first heading or first line as a short flow/headline
function extractHeadline(markdown) {
  // Try ## Headline / ## 한줄 요약 content
  const headlineMatch = markdown.match(/^##\s+(?:Headline|한줄\s*요약)[^\n]*\n+(.+)/m);
  if (headlineMatch) return headlineMatch[1].trim().slice(0, 80);
  // Try first ## heading
  const firstH2 = markdown.match(/^##\s+(.+)/m);
  if (firstH2) return firstH2[1].trim().slice(0, 80);
  // Fallback: first non-empty line
  const firstLine = markdown.split('\n').find(l => l.trim());
  return (firstLine || '').replace(/^#+\s*/, '').trim().slice(0, 80);
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
  userProfile = '',
  model = 'gemini-2.5-flash',
  userCorrections = [],
}) {
  if (!isProxyAvailable()) throw new Error('Proxy not available');
  if (!transcript || transcript.length === 0) throw new Error('No transcript to analyze');

  const contextText = meetingContext || getPresetContext(meetingPreset || 'general');
  const transcriptText = buildTranscriptText(transcript, strategy, recentMinutes, previousSummary);

  const systemPrompt = prompt || getAiPrompt();
  const messageParts = [
    `Meeting Context: ${contextText}`,
    `Elapsed Time: ${elapsedTime || 'unknown'}`,
  ];

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

  if (userCorrections && userCorrections.length > 0) {
    messageParts.push('');
    messageParts.push('[User Corrections - The user manually edited parts of the previous analysis. Please take these corrections into account and adjust your analysis accordingly. These are one-time hints, so incorporate the intent naturally rather than repeating them verbatim.]');
    userCorrections.forEach(c => {
      messageParts.push(`- Changed: "${c.before}" → "${c.after}"`);
    });
  }

  messageParts.push('');
  messageParts.push('Transcript:');
  messageParts.push(transcriptText);

  const lang = getAiLanguage();
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
      const data = await callGemini(model, body);
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

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
      return {
        markdown: rawText,
        flow: extractHeadline(rawText),
        summary: rawText,
        timestamp: Date.now(),
      };
    } catch (err) {
      lastError = err;
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
  const prompt = `Based on this meeting summary and transcript, generate 3-5 short tags (keywords) that categorize this meeting. ${langInstruction} Return ONLY a JSON array of strings. No explanation.

Summary: ${summary}

Transcript excerpt: ${transcriptSnippet}`;

  try {
    const data = await callGemini(model, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.3 }
    });

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const parsed = JSON.parse(rawText);
    if (Array.isArray(parsed)) return parsed.map(t => String(t).trim()).filter(Boolean).slice(0, 5);
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
    ? '한국어로 제목과 태그를 생성하세요.'
    : 'Generate title and tags in English.';

  const prompt = `Based on this meeting transcript, generate a concise meeting title and relevant tags. ${langInstruction}

${existingTitle ? `Current title: "${existingTitle}" - suggest alternatives that might be better.\n` : ''}
Transcript:
${transcriptText}

Return ONLY valid JSON:
{
  "title": "suggested main title (concise, under 50 chars)",
  "alternatives": ["2-3 alternative titles"],
  "tags": ["3-5 relevant keyword tags"]
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
export async function generateFinalMinutes({
  transcript,
  analysisHistory = [],
  meetingContext,
  meetingPreset,
  elapsedTime,
  memos = [],
  userProfile = '',
  model = 'gemini-2.5-flash',
}) {
  if (!isProxyAvailable()) throw new Error('Proxy not available');
  if (!transcript || transcript.length === 0) throw new Error('No transcript');

  const contextText = meetingContext || getAiPresetContext(meetingPreset || 'general');
  const transcriptText = buildTranscriptText(transcript, 'full', 0, null);

  // Gather previous analysis summaries for context
  const prevAnalyses = analysisHistory
    .filter(a => a.markdown || a.summary)
    .map(a => a.markdown || a.summary)
    .slice(-3) // last 3 analyses
    .join('\n---\n');

  const lang = getAiLanguage();
  const prompt = lang === 'ko' ? FINAL_MINUTES_PROMPT.ko : FINAL_MINUTES_PROMPT.en;

  const messageParts = [
    `Meeting Context: ${contextText}`,
    `Total Duration: ${elapsedTime || 'unknown'}`,
    `Total Lines: ${transcript.length}`,
  ];

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

  messageParts.push('', 'Full Transcript:', transcriptText);

  const langReminder = lang === 'ko'
    ? '\n\n[IMPORTANT] 반드시 한국어로 작성하세요.'
    : '\n\n[IMPORTANT] Respond ONLY in English.';
  messageParts.push(langReminder);

  const body = {
    contents: [{
      parts: [{ text: prompt + '\n\n' + messageParts.join('\n') }]
    }],
    generationConfig: { temperature: 0.2 }
  };

  const data = await callGemini(model, body);
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  return {
    markdown: rawText,
    flow: extractHeadline(rawText),
    summary: rawText,
    timestamp: Date.now(),
    isFinalMinutes: true,
  };
}

const FINAL_MINUTES_PROMPT = {
  en: `You are an expert meeting secretary producing the FINAL, DEFINITIVE meeting minutes. This is the complete record generated after the meeting has ended — it must be thorough and comprehensive.

Respond in well-structured **Markdown**. Use the following structure:

# Final Meeting Minutes

## Overview
- **Date/Time**: (from transcript timestamps)
- **Duration**: (from provided duration)
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
- This is the FINAL record — be exhaustive, do not omit any discussed topic
- Use exact numbers, dates, names, and technical terms as stated
- Describe actual content, not abstract references like "discussed X"
- Organize chronologically within each section
- If memos are provided, incorporate the user's personal notes/observations`,

  ko: `당신은 전문 회의 비서입니다. 회의가 끝난 후 생성하는 **최종 확정 회의록**을 작성합니다. 빠짐없이 철저하고 포괄적으로 작성하세요.

잘 구조화된 **Markdown** 형식으로 응답하세요:

# 최종 회의록

## 개요
- **일시**: (트랜스크립트 타임스탬프 기반)
- **소요 시간**: (제공된 시간 정보)
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
- 이것은 **최종 기록**입니다 — 빠뜨리는 주제 없이 철저하게 작성
- 구체적 수치, 날짜, 이름, 기술 용어는 그대로 기록
- "~에 대해 논의함" 같은 추상적 표현 대신 실제 구체적 내용을 서술
- 각 섹션 내에서 시간순으로 정리
- 메모가 제공된 경우, 사용자의 개인 메모/관찰을 반영`
};

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
