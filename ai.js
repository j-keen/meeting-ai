// ai.js - Gemini API analysis module with model selection and auto-tagging

import { getAiPrompt, getAiPresetContext, getAiLanguage, getDateLocale, t } from './i18n.js';
import { callGemini, isProxyAvailable } from './gemini-api.js';

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
          openQuestions: Array.isArray(parsed.openQuestions) ? parsed.openQuestions : [],
          actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
          suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
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
export async function generateTags({ summary, transcript, model = 'gemini-2.5-flash' }) {
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

// AI-powered sentence correction
export async function correctSentences({ lines, model = 'gemini-2.5-flash' }) {
  if (!isProxyAvailable() || !lines || lines.length === 0) return [];

  const lang = getAiLanguage();
  const langLabel = lang === 'ko' ? 'Korean' : 'English';
  const numbered = lines.map((l, i) => `${i}: ${l.text}`).join('\n');

  const prompt = `You are a meeting transcript corrector for ${langLabel} STT output.

Correct ONLY:
- STT misrecognition errors (wrong words from similar pronunciation)
- Obvious typos and grammatical errors
- Do NOT change meaning, style, or rephrase sentences

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
