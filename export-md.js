// export-md.js - Transcript export functions (TXT / SRT)

import { state } from './event-bus.js';
import { getMeeting } from './storage.js';

const $ = (sel) => document.querySelector(sel);

function generatePlainTranscript() {
  let text = '';
  state.transcript.forEach(line => {
    text += `${line.text}\n`;
  });
  return text.trimEnd();
}

function generateSRT() {
  let srt = '';
  state.transcript.forEach((line, idx) => {
    const startMs = line.timestamp - (state.meetingStartTime || line.timestamp);
    const nextLine = state.transcript[idx + 1];
    const endMs = nextLine
      ? nextLine.timestamp - (state.meetingStartTime || nextLine.timestamp)
      : startMs + 5000;
    srt += `${idx + 1}\n`;
    srt += `${formatSRTTime(startMs)} --> ${formatSRTTime(endMs)}\n`;
    srt += `${line.text}\n\n`;
  });
  return srt.trimEnd();
}

function formatSRTTime(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const millis = Math.max(0, ms % 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

export function downloadFile(content, filename, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function getExportContent() {
  return generatePlainTranscript();
}

export async function handleExport(format, triggerBtn) {
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `transcript-${dateStr}`;

  if (format === 'txt') {
    const content = generatePlainTranscript();
    downloadFile(content, `${filename}.txt`);
  } else if (format === 'srt') {
    const content = generateSRT();
    downloadFile(content, `${filename}.srt`);
  }
  // Only close export modal if triggered from it
  if (!triggerBtn || triggerBtn.closest('#exportModal')) {
    $('#exportModal').hidden = true;
  }
}

export function handleExportMeeting(meetingId) {
  const meeting = getMeeting(meetingId);
  if (!meeting) return;
  const dateStr = new Date(meeting.createdAt || Date.now()).toISOString().slice(0, 10);
  downloadFile(JSON.stringify(meeting, null, 2), `meeting-${dateStr}.json`, 'application/json');
}
