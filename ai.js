// ai.js - Gemini API analysis module with model selection and auto-tagging

import { getAiPrompt, getAiPresetContext, getAiLanguage, getDateLocale, t } from './i18n.js';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

function getGeminiUrl(model) {
  return `${GEMINI_BASE}/${model}:generateContent`;
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

  if (strategy === 'recent') {
    return recent.map(formatLine).join('\n');
  }

  // 'smart': previous summary + recent transcript
  let text = '';
  if (previousSummary) {
    text += `[Previous Summary]\n${previousSummary}\n\n[Recent Transcript]\n`;
  }
  text += (recent.length > 0 ? recent : transcript.slice(-20)).map(formatLine).join('\n');
  return text;
}

function parseGeminiResponse(text) {
  try { return JSON.parse(text); } catch {}
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch {}
  }
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[0]); } catch {}
  }
  return {
    summary: text.slice(0, 500),
    context: '',
    openQuestions: [],
    actionItems: [],
    suggestions: [],
  };
}

export async function analyzeTranscript({
  apiKey,
  transcript,
  prompt,
  meetingContext,
  meetingPreset,
  elapsedTime,
  strategy = 'smart',
  recentMinutes = 5,
  previousSummary = null,
  userInsights = [],
  model = 'gemini-2.5-flash',
}) {
  if (!apiKey) throw new Error('Gemini API key not set');
  if (!transcript || transcript.length === 0) throw new Error('No transcript to analyze');

  const contextText = meetingContext || getPresetContext(meetingPreset || 'general');
  const transcriptText = buildTranscriptText(transcript, strategy, recentMinutes, previousSummary);

  const systemPrompt = prompt || getAiPrompt();
  const messageParts = [
    `Meeting Context: ${contextText}`,
    `Elapsed Time: ${elapsedTime || 'unknown'}`,
  ];

  if (userInsights && userInsights.length > 0) {
    messageParts.push('');
    messageParts.push('[User Insights]');
    userInsights.forEach(insight => messageParts.push(`- ${insight}`));
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
      responseMimeType: 'application/json',
      temperature: 0.3,
    }
  };

  const url = `${getGeminiUrl(model)}?key=${apiKey}`;

  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini API error (${res.status}): ${errText.slice(0, 200)}`);
      }

      const data = await res.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const parsed = parseGeminiResponse(rawText);

      return {
        summary: parsed.summary || '',
        context: parsed.context || '',
        openQuestions: Array.isArray(parsed.openQuestions) ? parsed.openQuestions : [],
        actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
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
export async function generateTags({ apiKey, summary, transcript, model = 'gemini-2.5-flash' }) {
  if (!apiKey || !summary) return [];

  const transcriptSnippet = (transcript || []).slice(0, 10).map(l => l.text).join(' ').slice(0, 500);
  const lang = getAiLanguage();
  const langInstruction = lang === 'ko'
    ? '태그를 반드시 한국어로 생성하세요.'
    : 'Generate tags in English.';
  const prompt = `Based on this meeting summary and transcript, generate 3-5 short tags (keywords) that categorize this meeting. ${langInstruction} Return ONLY a JSON array of strings. No explanation.

Summary: ${summary}

Transcript excerpt: ${transcriptSnippet}`;

  try {
    const url = `${getGeminiUrl(model)}?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.3 }
      }),
    });

    if (!res.ok) return [];
    const data = await res.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const parsed = JSON.parse(rawText);
    if (Array.isArray(parsed)) return parsed.map(t => String(t).trim()).filter(Boolean).slice(0, 5);
    return [];
  } catch {
    return [];
  }
}

// AI-powered meeting title generation
export async function generateMeetingTitle({ apiKey, transcript, existingTitle }) {
  if (!apiKey || !transcript || transcript.length === 0) return null;

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
    const url = `${getGeminiUrl('gemini-2.5-flash-lite')}?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.4 }
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
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

// AI-powered typo correction
export async function correctTypos({ apiKey, corrections, recentText, model = 'gemini-2.5-flash' }) {
  if (!apiKey || !recentText) return {};

  const existingDict = Object.entries(corrections || {}).map(([k, v]) => `"${k}" -> "${v}"`).join(', ');
  const lang = getAiLanguage();
  const langLabel = lang === 'ko' ? 'Korean' : 'English';
  const prompt = `You are a meeting transcript typo corrector for ${langLabel} text.
Existing corrections: ${existingDict || 'none'}

Recent transcript text:
${recentText}

Find any obvious typos, misheard words, or STT errors. Return a JSON object where keys are the wrong words and values are the corrected words. Only include clear mistakes. Return empty object {} if no corrections needed.`;

  try {
    const url = `${getGeminiUrl(model)}?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
      }),
    });

    if (!res.ok) return {};
    const data = await res.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const parsed = JSON.parse(rawText);
    if (typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    return {};
  } catch {
    return {};
  }
}
