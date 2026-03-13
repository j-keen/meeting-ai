// export-md.js - Markdown export functions

import { state } from './event-bus.js';
import { t, getDateLocale } from './i18n.js';
import { showToast } from './ui.js';
import { exportPDF, exportWord } from './export-doc.js';
import { getMeeting } from './storage.js';

const $ = (sel) => document.querySelector(sel);

function getElapsedTimeStr() {
  if (!state.meetingStartTime) return 'unknown';
  const diff = Date.now() - state.meetingStartTime;
  const mins = Math.floor(diff / 60000);
  return t('minutes', { n: mins });
}

export function generateMarkdownFull() {
  let md = `${t('md.meeting_notes')}\n`;
  md += `${t('md.date')}: ${new Date(state.meetingStartTime || Date.now()).toLocaleString(getDateLocale())}\n`;
  md += `${t('md.duration')}: ${getElapsedTimeStr()}\n`;
  if (state.meetingLocation) md += `Location: ${state.meetingLocation}\n`;
  if (state.tags.length > 0) md += `Tags: ${state.tags.join(', ')}\n`;
  md += '\n';

  md += `${t('md.transcript')}\n\n`;
  state.transcript.forEach(line => {
    const time = formatTimeSimple(line.timestamp);
    md += `**[${time}]** ${line.text}\n\n`;
  });

  if (state.memos.length > 0) {
    md += `${t('md.memos')}\n\n`;
    state.memos.forEach(m => { md += `- [${formatTimeSimple(m.timestamp)}] ${m.text}\n`; });
    md += '\n';
  }

  const analysis = state.currentAnalysis;
  if (analysis) {
    if (analysis.markdown) {
      md += `${t('md.summary')}\n\n${analysis.markdown}\n\n`;
    } else {
      md += `${t('md.summary')}\n\n${analysis.summary || 'N/A'}\n\n`;
      if (analysis.actionItems?.length) {
        md += `${t('md.action_items')}\n\n`;
        analysis.actionItems.forEach(i => { md += `- [ ] ${i}\n`; });
        md += '\n';
      }
      if (analysis.openQuestions?.length) {
        md += `${t('md.open_questions')}\n\n`;
        analysis.openQuestions.forEach(q => { md += `- ${q}\n`; });
        md += '\n';
      }
    }
  }
  return md;
}

export function generateMarkdownSummary() {
  const analysis = state.currentAnalysis;
  if (!analysis) return `${t('md.no_analysis')}\n`;
  if (analysis.markdown) {
    let md = `${t('md.meeting_summary')}\n`;
    md += `${t('md.date')}: ${new Date(state.meetingStartTime || Date.now()).toLocaleString(getDateLocale())}\n\n`;
    md += analysis.markdown + '\n';
    return md;
  }
  let md = `${t('md.meeting_summary')}\n`;
  md += `${t('md.date')}: ${new Date(state.meetingStartTime || Date.now()).toLocaleString(getDateLocale())}\n\n`;
  md += `${t('md.summary')}\n${analysis.summary || 'N/A'}\n\n`;
  md += `${t('md.context')}\n${analysis.context || 'N/A'}\n\n`;
  if (analysis.actionItems?.length) {
    md += `${t('md.action_items')}\n`;
    analysis.actionItems.forEach(i => { md += `- [ ] ${i}\n`; });
    md += '\n';
  }
  if (analysis.openQuestions?.length) {
    md += `${t('md.open_questions')}\n`;
    analysis.openQuestions.forEach(q => { md += `- ${q}\n`; });
    md += '\n';
  }
  if (analysis.suggestions?.length) {
    md += `${t('md.suggestions')}\n`;
    analysis.suggestions.forEach(s => { md += `- ${s}\n`; });
  }
  return md;
}

export function generateMarkdownHighlights() {
  let md = `${t('md.highlights_title')}\n\n`;
  const bookmarked = state.transcript.filter(l => l.bookmarked);
  if (bookmarked.length > 0) {
    md += `${t('md.bookmarks')}\n\n`;
    bookmarked.forEach(l => { md += `- **[${formatTimeSimple(l.timestamp)}]** ${l.text}\n`; });
    md += '\n';
  }
  if (state.memos.length > 0) {
    md += `${t('md.memos')}\n\n`;
    state.memos.forEach(m => { md += `- [${formatTimeSimple(m.timestamp)}] ${m.text}\n`; });
  }
  return md;
}


function formatTimeSimple(ts) {
  if (!state.meetingStartTime) return '00:00';
  const diff = ts - state.meetingStartTime;
  const m = Math.floor(diff / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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
  const selected = document.querySelector('input[name="exportContent"]:checked')?.value || 'full';
  switch (selected) {
    case 'summary': return generateMarkdownSummary();
    case 'highlights': return generateMarkdownHighlights();
    default: return generateMarkdownFull();
  }
}

function getExportContentLabel() {
  const selected = document.querySelector('input[name="exportContent"]:checked')?.value || 'full';
  return selected === 'highlights' ? 'highlights' : selected === 'summary' ? 'summary' : 'meeting';
}

export async function handleExport(format, triggerBtn) {
  const dateStr = new Date().toISOString().slice(0, 10);
  const content = getExportContent();
  const label = getExportContentLabel();
  const filename = `${label}-${dateStr}`;
  const btn = triggerBtn || document.querySelector(`.export-fmt-btn[data-format="${format}"]`);
  const isAsync = format === 'pdf' || format === 'docx';

  if (isAsync && btn) {
    const origHTML = btn.innerHTML;
    btn.disabled = true;
    btn.querySelector('span:last-child').textContent = t('export.generating');
    try {
      if (format === 'pdf') await exportPDF(content, `${filename}.pdf`);
      else await exportWord(content, `${filename}.docx`);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = origHTML;
    }
  } else if (format === 'clipboard') {
    try {
      await navigator.clipboard.writeText(content);
      showToast(t('export.copied'), 'success');
    } catch {
      showToast(t('export.copy_fail'), 'error');
    }
  } else if (format === 'md') {
    downloadFile(content, `${filename}.md`);
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
