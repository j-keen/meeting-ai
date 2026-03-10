// app.js - State management, pub/sub, initialization

import { createSTT } from './stt.js';
import { analyzeTranscript, getDefaultPrompt, generateTags, correctTypos } from './ai.js';
import {
  saveMeeting, listMeetings, getMeeting, deleteMeeting, updateMeetingTags,
  loadSettings, saveSettings, getStorageUsage,
  loadTypoDict, saveTypoDict, addTypoCorrection,
} from './storage.js';
import {
  initDragResizer, initPanelTabs, addTranscriptLine, showInterim, clearInterim,
  addMemoLine, showAnalysisSkeletons, renderAnalysis, renderHighlights,
  renderAnalysisHistory, renderHistoryGrid, renderMeetingViewer,
  initModals, initContextPopup, toggleTheme, initKeyboardShortcuts,
  showToast, updateTranscriptLineUI, removeTranscriptLineUI,
  refreshTypoDict, applyTypoCorrections,
  updateMeetingInfoTime,
} from './ui.js';
import { initSettings, closeSettings, updateTypoDictCount } from './settings.js';
import { initChat } from './chat.js';
import { startMeetingPrep } from './meeting-prep.js';
import { t, setLanguage, setAiLanguage, getDateLocale, getAiLanguage } from './i18n.js';

// ===== Pub/Sub =====
const listeners = {};
export function on(event, fn) {
  if (!listeners[event]) listeners[event] = [];
  listeners[event].push(fn);
  return () => { listeners[event] = listeners[event].filter(f => f !== fn); };
}
export function emit(event, data) {
  (listeners[event] || []).forEach(fn => fn(data));
}

// ===== State =====
export const state = {
  isRecording: false,
  meetingStartTime: null,
  meetingId: null,
  meetingLocation: '',
  transcript: [],
  memos: [],
  analysisHistory: [],
  settings: {},
  currentAnalysis: null,
  chatHistory: [],
  userInsights: [],
  tags: [],
  meetingEnded: false,
};

const $ = (sel) => document.querySelector(sel);

// ===== Core Logic =====
let stt = null;
let timerInterval = null;
let autoSaveInterval = null;
let autoAnalysisInterval = null;
let isAnalyzing = false;
let aiTypoCorrectionTimer = null;
let analysisGaugeTimer = null;
let analysisGaugeStart = 0;
let analysisGaugeIntervalMs = 0;

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function updateTimer() {
  if (!state.meetingStartTime) return;
  const diff = Date.now() - state.meetingStartTime;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  $('#meetingTimer').textContent =
    `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getElapsedTimeStr() {
  if (!state.meetingStartTime) return 'unknown';
  const diff = Date.now() - state.meetingStartTime;
  const mins = Math.floor(diff / 60000);
  return t('minutes', { n: mins });
}

function startRecording() {
  if (state.isRecording) return;

  // Load typo dictionary
  refreshTypoDict();

  stt = createSTT();

  try {
    stt.start({
      language: state.settings.language || 'ko',
      onInterim: (text) => {
        showInterim(text);
      },
      onFinal: (text) => {
        // Apply typo corrections
        const { text: correctedText, corrections } = applyTypoCorrections(text);

        const line = {
          id: generateId(),
          text: correctedText,
          timestamp: Date.now(),
          bookmarked: false,
        };
        state.transcript.push(line);
        addTranscriptLine(line, corrections);
        emit('transcript:add', line);
      },
      onError: (err) => {
        showToast(err, 'error');
      },
    });

    state.isRecording = true;
    if (!state.meetingStartTime) {
      state.meetingStartTime = Date.now();
      state.meetingId = generateId();
      state.meetingLocation = $('#inputMeetingLocation')?.value || '';
      updateMeetingInfoTime();
    }

    timerInterval = setInterval(updateTimer, 1000);
    autoSaveInterval = setInterval(() => autoSave(), 30000);
    startAutoAnalysis();
    startAiTypoCorrection();

    const btn = $('#btnRecord');
    btn.classList.add('recording');
    btn.querySelector('.record-label').textContent = t('record.stop');
    $('#meetingStatus').textContent = t('record.status_recording');

  } catch (err) {
    showToast(t('toast.record_fail') + err.message, 'error');
  }
}

function stopRecording() {
  if (!state.isRecording) return;

  stt?.stop();
  stt = null;
  state.isRecording = false;
  clearInterim();

  clearInterval(timerInterval);
  clearInterval(autoSaveInterval);
  clearInterval(autoAnalysisInterval);
  clearInterval(aiTypoCorrectionTimer);
  stopAnalysisGauge();

  const btn = $('#btnRecord');
  btn.classList.remove('recording');
  btn.querySelector('.record-label').textContent = t('record.label');
  $('#meetingStatus').textContent = t('record.status_stopped');

  autoSave();
}

function startAutoAnalysis() {
  clearInterval(autoAnalysisInterval);
  stopAnalysisGauge();
  if (!state.settings.autoAnalysis) return;
  const intervalMs = (state.settings.analysisInterval || 30) * 1000;
  autoAnalysisInterval = setInterval(() => {
    if (state.isRecording && state.transcript.length > 0) runAnalysis();
  }, intervalMs);
  startAnalysisGauge(intervalMs);
}

function startAnalysisGauge(intervalMs) {
  stopAnalysisGauge();
  analysisGaugeIntervalMs = intervalMs;
  analysisGaugeStart = Date.now();
  const gauge = $('#analysisGauge');
  const fill = $('#analysisGaugeFill');
  if (!gauge || !fill) return;
  fill.style.transition = 'none';
  fill.style.width = '0%';
  gauge.classList.add('active');
  requestAnimationFrame(() => {
    fill.style.transition = `width ${intervalMs / 1000}s linear`;
    fill.style.width = '100%';
  });
  analysisGaugeTimer = setTimeout(() => {
    // cycle resets handled by resetAnalysisGauge
  }, intervalMs);
}

function resetAnalysisGauge() {
  if (!state.settings.autoAnalysis || !state.isRecording) return;
  const intervalMs = (state.settings.analysisInterval || 30) * 1000;
  startAnalysisGauge(intervalMs);
}

function stopAnalysisGauge() {
  clearTimeout(analysisGaugeTimer);
  analysisGaugeTimer = null;
  const gauge = $('#analysisGauge');
  const fill = $('#analysisGaugeFill');
  if (gauge) gauge.classList.remove('active');
  if (fill) {
    fill.style.transition = 'none';
    fill.style.width = '0%';
  }
}

// Periodic AI typo correction (hybrid approach)
function startAiTypoCorrection() {
  clearInterval(aiTypoCorrectionTimer);
  aiTypoCorrectionTimer = setInterval(async () => {
    if (!state.settings.geminiKey || state.transcript.length < 5) return;
    const recentText = state.transcript.slice(-10).map(l => l.text).join('\n');
    const currentDict = loadTypoDict();
    try {
      const newCorrections = await correctTypos({
        apiKey: state.settings.geminiKey,
        corrections: currentDict,
        recentText,
        model: state.settings.geminiModel || 'gemini-2.5-flash',
      });
      if (newCorrections && Object.keys(newCorrections).length > 0) {
        const merged = { ...currentDict, ...newCorrections };
        saveTypoDict(merged);
        refreshTypoDict();
        updateTypoDictCount();
      }
    } catch { /* silent */ }
  }, 120000); // Every 2 minutes
}

async function runAnalysis() {
  resetAnalysisGauge();
  if (isAnalyzing) return;
  if (!state.settings.geminiKey) {
    showToast(t('toast.no_api_key'), 'warning');
    return;
  }
  if (state.transcript.length === 0) {
    showToast(t('toast.no_transcript'), 'warning');
    return;
  }

  isAnalyzing = true;
  showAnalysisSkeletons();

  try {
    const previousSummary = state.analysisHistory.length > 0
      ? state.analysisHistory[state.analysisHistory.length - 1].summary
      : null;

    const result = await analyzeTranscript({
      apiKey: state.settings.geminiKey,
      transcript: state.transcript,
      prompt: state.settings.customPrompt,
      meetingContext: state.settings.meetingContext,
      meetingPreset: state.settings.meetingPreset,
      elapsedTime: getElapsedTimeStr(),
      strategy: state.settings.tokenStrategy || 'smart',
      recentMinutes: state.settings.recentMinutes || 5,
      previousSummary,
      userInsights: state.userInsights,
      model: state.settings.geminiModel || 'gemini-2.5-flash',
    });

    state.currentAnalysis = result;
    result.transcriptLength = state.transcript.length;
    state.analysisHistory.push(result);
    renderAnalysis(result);

    // Auto-generate tags
    if (result.summary && state.tags.length === 0) {
      generateTags({
        apiKey: state.settings.geminiKey,
        summary: result.summary,
        transcript: state.transcript,
        model: state.settings.geminiModel || 'gemini-2.5-flash',
      }).then(tags => {
        if (tags.length > 0) state.tags = tags;
      });
    }

    emit('analysis:complete', result);
  } catch (err) {
    showToast(t('toast.analysis_fail') + err.message, 'error');
    renderAnalysis(state.currentAnalysis || {
      summary: '', context: '', openQuestions: [],
      actionItems: [], suggestions: [],
    });
  } finally {
    isAnalyzing = false;
  }
}

function autoSave() {
  if (!state.meetingId) return;
  const meeting = {
    id: state.meetingId,
    title: t('meeting_title', { date: new Date(state.meetingStartTime).toLocaleDateString(getDateLocale()), time: new Date(state.meetingStartTime).toLocaleTimeString(getDateLocale(), { hour: '2-digit', minute: '2-digit' }) }),
    startTime: state.meetingStartTime,
    duration: getElapsedTimeStr(),
    preset: state.settings.meetingPreset || 'general',
    location: state.meetingLocation || $('#inputMeetingLocation')?.value || '',
    meetingContext: state.settings.meetingContext || '',
    transcript: state.transcript,
    memos: state.memos,
    analysisHistory: state.analysisHistory,
    chatHistory: state.chatHistory,
    userInsights: state.userInsights,
    tags: state.tags,
  };
  const result = saveMeeting(meeting);
  if (result.warning === 'storage_high') {
    showToast(t('toast.storage_high'), 'warning');
  }
}

function endMeeting() {
  // Confirmation to prevent accidental end
  if (state.isRecording || state.transcript.length > 0) {
    if (!confirm(t('confirm.end_meeting') || 'End this meeting? Data will be saved.')) return;
  }
  stopRecording();
  // Save location
  state.meetingLocation = $('#inputMeetingLocation')?.value || '';
  autoSave();
  state.meetingEnded = true;

  // Replace End Meeting button with Resume + New Meeting buttons
  const endBtn = $('#btnEndMeeting');
  const btnResume = document.createElement('button');
  btnResume.className = 'btn btn-sm';
  btnResume.id = 'btnResumeMeeting';
  btnResume.textContent = t('meeting.resume');
  btnResume.style.color = 'var(--accent)';
  btnResume.style.borderColor = 'var(--accent)';

  const btnNew = document.createElement('button');
  btnNew.className = 'btn btn-sm';
  btnNew.id = 'btnNewMeeting';
  btnNew.textContent = t('meeting.new');

  endBtn.style.display = 'none';
  endBtn.parentNode.insertBefore(btnResume, endBtn.nextSibling);
  endBtn.parentNode.insertBefore(btnNew, btnResume.nextSibling);

  btnResume.addEventListener('click', () => resumeMeeting());
  btnNew.addEventListener('click', () => {
    resetMeeting();
    restoreEndButton();
  });

  $('#meetingStatus').textContent = t('record.status_ended');
  showToast(t('toast.meeting_saved'), 'success');
}

function resumeMeeting() {
  state.meetingEnded = false;
  restoreEndButton();
  startRecording();
  showToast(t('toast.meeting_resumed'), 'success');
}

function restoreEndButton() {
  const endBtn = $('#btnEndMeeting');
  endBtn.style.display = '';
  const resume = $('#btnResumeMeeting');
  const newBtn = $('#btnNewMeeting');
  if (resume) resume.remove();
  if (newBtn) newBtn.remove();
}

function resetMeeting() {
  state.meetingEnded = false;
  state.meetingStartTime = null;
  state.meetingId = null;
  state.meetingLocation = '';
  state.transcript = [];
  state.memos = [];
  state.analysisHistory = [];
  state.currentAnalysis = null;
  state.chatHistory = [];
  state.userInsights = [];
  state.tags = [];
  $('#transcriptList').innerHTML = '';
  $('#transcriptEmpty').style.display = '';
  $('#aiSections').innerHTML = '';
  $('#aiEmpty').style.display = '';
  $('#chatMessages').innerHTML = '';
  $('#chatEmpty').style.display = '';
  $('#meetingTimer').textContent = '00:00:00';
  $('#meetingStatus').textContent = '';
  $('#inputMeetingLocation').value = '';
  $('#meetingInfoTime').textContent = '';
}

// ===== Export =====
function generateMarkdownFull() {
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
  return md;
}

function generateMarkdownSummary() {
  const analysis = state.currentAnalysis;
  if (!analysis) return `${t('md.no_analysis')}\n`;
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

function generateMarkdownHighlights() {
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

function generateJSON() {
  return JSON.stringify({
    id: state.meetingId,
    startTime: state.meetingStartTime,
    duration: getElapsedTimeStr(),
    location: state.meetingLocation,
    transcript: state.transcript,
    memos: state.memos,
    analysisHistory: state.analysisHistory,
    chatHistory: state.chatHistory,
    userInsights: state.userInsights,
    tags: state.tags,
  }, null, 2);
}

function formatTimeSimple(ts) {
  if (!state.meetingStartTime) return '00:00';
  const diff = ts - state.meetingStartTime;
  const m = Math.floor(diff / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function downloadFile(content, filename, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function sendToSlack(text) {
  const webhook = state.settings.slackWebhook;
  if (!webhook) { showToast(t('toast.slack_no_url'), 'warning'); return; }
  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    showToast(t('toast.slack_sent'), 'success');
  } catch (err) {
    showToast(t('toast.slack_fail') + err.message, 'error');
  }
}

function sendEmail(subject, body) {
  const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.open(mailto);
}

function handleExport(format) {
  const dateStr = new Date().toISOString().slice(0, 10);
  switch (format) {
    case 'md-full': downloadFile(generateMarkdownFull(), `meeting-${dateStr}.md`); break;
    case 'md-summary': downloadFile(generateMarkdownSummary(), `meeting-summary-${dateStr}.md`); break;
    case 'md-highlights': downloadFile(generateMarkdownHighlights(), `meeting-highlights-${dateStr}.md`); break;
    case 'json': downloadFile(generateJSON(), `meeting-${dateStr}.json`, 'application/json'); break;
    case 'slack': sendToSlack(generateMarkdownSummary()); break;
    case 'email': sendEmail(t('md.meeting_notes').replace('# ', '') + ' ' + dateStr, generateMarkdownSummary()); break;
  }
  $('#exportModal').hidden = true;
}

function handleExportMeeting(meetingId) {
  const meeting = getMeeting(meetingId);
  if (!meeting) return;
  const dateStr = new Date(meeting.createdAt || Date.now()).toISOString().slice(0, 10);
  downloadFile(JSON.stringify(meeting, null, 2), `meeting-${dateStr}.json`, 'application/json');
}

// ===== History filter helper =====
function getHistoryFilters() {
  return {
    searchTerm: $('#historySearch')?.value || '',
    filterType: $('#historyFilterType')?.value || '',
    filterTag: $('#historyFilterTag')?.value || '',
    dateFrom: $('#historyFilterDateFrom')?.value || '',
    dateTo: $('#historyFilterDateTo')?.value || '',
  };
}

function refreshHistoryGrid() {
  renderHistoryGrid(listMeetings(), getHistoryFilters());
}

// ===== Init =====
function init() {
  const savedSettings = loadSettings();
  setLanguage(savedSettings.uiLanguage || 'auto');
  setAiLanguage(savedSettings.aiLanguage || 'auto');

  initSettings();
  initDragResizer();
  initPanelTabs();
  initModals();
  initContextPopup();
  initKeyboardShortcuts();
  initChat();
  refreshTypoDict();

  // Set meeting info time
  const infoTime = $('#meetingInfoTime');
  if (infoTime) infoTime.textContent = new Date().toLocaleTimeString(getDateLocale(), { hour: '2-digit', minute: '2-digit' });

  // ===== Welcome Modal =====
  showWelcomeModal();

  // ===== Event Bindings =====

  // Record button
  $('#btnRecord').addEventListener('click', () => emit('recording:toggle'));
  on('recording:toggle', () => {
    if (state.isRecording) stopRecording();
    else startRecording();
  });

  // End meeting (with confirmation)
  $('#btnEndMeeting').addEventListener('click', () => endMeeting());

  // Analyze now
  $('#btnAnalyzeNow').addEventListener('click', () => runAnalysis());

  // Demo data
  $('#btnLoadDemo').addEventListener('click', () => loadDemoData());

  // Theme toggle
  $('#btnThemeToggle').addEventListener('click', () => {
    toggleTheme();
    saveSettings({ theme: state.settings.theme });
  });

  // Quick Start
  $('#btnQuickStart')?.addEventListener('click', () => {
    const preset = $('#selectQuickPreset')?.value || 'general';
    state.settings.meetingPreset = preset;
    saveSettings({ meetingPreset: preset });
    $('#selectMeetingPreset').value = preset;
    startRecording();
  });

  // Manual Setup & Start
  $('#btnManualSetup')?.addEventListener('click', () => {
    // Open settings to Prompt tab
    emit('settings:openPromptTab');
  });

  on('settings:openPromptTab', () => {
    const { openSettings } = require('./settings.js');
    import('./settings.js').then(mod => {
      mod.openSettings();
      document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.settings-tab-content').forEach(c => c.classList.remove('active'));
      const promptTab = document.querySelector('.settings-tab[data-tab="prompt"]');
      const promptContent = document.querySelector('.settings-tab-content[data-tab="prompt"]');
      if (promptTab) promptTab.classList.add('active');
      if (promptContent) promptContent.classList.add('active');
    });
  });

  // Quick start preset sync
  $('#selectQuickPreset')?.addEventListener('change', (e) => {
    const preset = e.target.value;
    state.settings.meetingPreset = preset;
    saveSettings({ meetingPreset: preset });
    $('#selectMeetingPreset').value = preset;
  });

  // Meeting location save on change
  $('#inputMeetingLocation')?.addEventListener('change', (e) => {
    state.meetingLocation = e.target.value;
  });

  // Memo
  const memoInput = $('#memoInput');
  const addMemo = () => {
    const text = memoInput.value.trim();
    if (!text) return;
    const memo = { id: generateId(), text, timestamp: Date.now() };
    state.memos.push(memo);
    addMemoLine(memo);
    memoInput.value = '';
    emit('memo:add', memo);
  };
  memoInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addMemo(); });
  $('#btnAddMemo').addEventListener('click', addMemo);

  // Memo from chat
  on('memo:fromChat', ({ text }) => {
    const memo = { id: generateId(), text, timestamp: Date.now() };
    state.memos.push(memo);
    addMemoLine(memo);
    emit('memo:add', memo);
  });

  // Memo delete
  on('memo:delete', ({ id }) => {
    state.memos = state.memos.filter(m => m.id !== id);
    const el = document.querySelector(`.transcript-line[data-id="${id}"]`);
    if (el) el.remove();
  });

  // Analysis rerun from chat
  on('analysis:rerun', () => runAnalysis());

  // Toast from other modules
  on('toast', ({ message, type }) => showToast(message, type || 'success'));

  // Export
  $('#btnExport').addEventListener('click', () => { $('#exportModal').hidden = false; });
  document.querySelectorAll('.export-btn').forEach(btn => {
    btn.addEventListener('click', () => handleExport(btn.dataset.format));
  });

  // Highlights
  $('#btnHighlights').addEventListener('click', () => {
    renderHighlights('all');
    $('#highlightsModal').hidden = false;
  });
  document.querySelectorAll('.highlights-tabs .btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.highlights-tabs .btn').forEach(b => b.classList.remove('tab-active'));
      e.target.classList.add('tab-active');
      renderHighlights(e.target.dataset.tab);
    });
  });

  // Analysis History
  $('#btnAnalysisHistory').addEventListener('click', () => {
    renderAnalysisHistory();
    $('#analysisHistoryModal').hidden = false;
  });

  // Meeting History
  $('#btnHistory').addEventListener('click', () => {
    refreshHistoryGrid();
    $('#historyModal').hidden = false;
  });
  $('#historySearch').addEventListener('input', () => refreshHistoryGrid());
  $('#historyFilterType').addEventListener('change', () => refreshHistoryGrid());
  $('#historyFilterTag')?.addEventListener('input', () => refreshHistoryGrid());
  $('#historyFilterDateFrom').addEventListener('change', () => refreshHistoryGrid());
  $('#historyFilterDateTo').addEventListener('change', () => refreshHistoryGrid());

  // Transcript events
  on('transcript:bookmark', ({ id }) => {
    const line = state.transcript.find(l => l.id === id);
    if (line) {
      line.bookmarked = !line.bookmarked;
      updateTranscriptLineUI(id);
    }
  });

  on('transcript:delete', ({ id }) => {
    state.transcript = state.transcript.filter(l => l.id !== id);
    removeTranscriptLineUI(id);
  });

  // Transcript edit - detect typo corrections
  on('transcript:edit', ({ id, text, original }) => {
    if (original && text !== original) {
      // Detect word-level changes for typo dictionary
      const origWords = original.split(/\s+/);
      const newWords = text.split(/\s+/);
      if (origWords.length === newWords.length) {
        for (let i = 0; i < origWords.length; i++) {
          if (origWords[i] !== newWords[i] && origWords[i].length > 1) {
            addTypoCorrection(origWords[i], newWords[i]);
          }
        }
        refreshTypoDict();
        updateTypoDictCount();
      }
    }
  });

  // Language change
  on('language:change', () => {
    if (state.currentAnalysis) renderAnalysis(state.currentAnalysis);
  });

  // Settings close
  on('settings:close', closeSettings);

  // Meeting view/delete/export
  on('meeting:view', ({ id }) => {
    const meeting = getMeeting(id);
    if (meeting) {
      renderMeetingViewer(meeting);
      $('#viewerModal').hidden = false;
      $('#historyModal').hidden = true;
    }
  });

  on('meeting:delete', ({ id }) => {
    if (confirm(t('confirm.delete_meeting'))) {
      deleteMeeting(id);
      refreshHistoryGrid();
      showToast(t('toast.meeting_deleted'), 'success');
    }
  });

  on('meeting:export', ({ id }) => handleExportMeeting(id));

  // Meeting tags
  on('meeting:addTag', ({ id, tag }) => {
    const meeting = getMeeting(id);
    if (meeting) {
      const tags = [...(meeting.tags || []), tag];
      updateMeetingTags(id, tags);
      refreshHistoryGrid();
    }
  });

  on('meeting:removeTag', ({ id, tag }) => {
    const meeting = getMeeting(id);
    if (meeting) {
      const tags = (meeting.tags || []).filter(t => t !== tag);
      updateMeetingTags(id, tags);
      refreshHistoryGrid();
    }
  });

  // Meeting prep events
  on('meetingPrep:start', () => {
    closeWelcomeModal();
    startMeetingPrep();
  });

  on('meetingPrep:complete', (config) => {
    // Apply meeting prep settings
    if (config.meetingType) {
      state.settings.meetingPreset = config.meetingType;
      saveSettings({ meetingPreset: config.meetingType });
      const presetSelect = $('#selectMeetingPreset');
      if (presetSelect) presetSelect.value = config.meetingType;
      const quickPreset = $('#selectQuickPreset');
      if (quickPreset) quickPreset.value = config.meetingType;
    }
    if (config.agenda) {
      state.settings.meetingContext = (state.settings.meetingContext || '') +
        (state.settings.meetingContext ? '\n' : '') + config.agenda;
      saveSettings({ meetingContext: state.settings.meetingContext });
    }
    if (config.customPrompt) {
      state.settings.customPrompt = config.customPrompt;
      saveSettings({ customPrompt: config.customPrompt });
    }
    // Start recording
    startRecording();
  });

  // beforeunload auto-save
  window.addEventListener('beforeunload', () => {
    if (state.meetingId) autoSave();
  });

  // Storage usage check
  const usage = getStorageUsage();
  if (usage.ratio > 0.8) {
    showToast(t('toast.storage_usage', { pct: (usage.ratio * 100).toFixed(0) }), 'warning');
  }
}

// ===== Welcome Modal =====
function showWelcomeModal() {
  const modal = $('#welcomeModal');
  if (!modal) return;
  modal.hidden = false;

  $('#welcomeQuickStart').addEventListener('click', () => {
    closeWelcomeModal();
    startRecording();
  });

  $('#welcomeMeetingPrep').addEventListener('click', () => {
    emit('meetingPrep:start');
  });

  $('#welcomeSearch').addEventListener('click', () => {
    closeWelcomeModal();
    refreshHistoryGrid();
    $('#historyModal').hidden = false;
  });

  $('#welcomeClose').addEventListener('click', () => {
    closeWelcomeModal();
  });

  // ESC to close
  const escHandler = (e) => {
    if (e.key === 'Escape' && !modal.hidden) {
      closeWelcomeModal();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

function closeWelcomeModal() {
  const modal = $('#welcomeModal');
  if (modal) modal.hidden = true;
}

// ===== Demo Data =====
function loadDemoData() {
  const now = Date.now();
  state.meetingStartTime = now - 25 * 60000;
  state.meetingId = generateId();
  state.meetingLocation = 'Conference Room A';

  $('#inputMeetingLocation').value = state.meetingLocation;
  updateMeetingInfoTime();

  const script = [
    { offset: 0, text: '자, 그럼 이번 주간 회의 시작하겠습니다. 지난주 스프린트 리뷰부터 해볼까요?' },
    { offset: 15, text: '네, 지난주에 사용자 인증 모듈 리팩토링 완료했고요, 테스트 커버리지 85%까지 올렸습니다.' },
    { offset: 35, text: '좋습니다. 목표가 80%였으니까 초과 달성이네요. 성능 이슈는 해결됐나요?' },
    { offset: 50, text: '토큰 갱신 부분에서 레이스 컨디션이 있었는데, 뮤텍스 패턴으로 해결했습니다. 응답 시간 200ms에서 50ms로 줄었어요.' },
    { offset: 70, text: '저는 새 대시보드 UI 디자인 완료했습니다. Figma에 올려놨는데 리뷰 부탁드려요.' },
    { offset: 85, text: '오, 대시보드 기대되네요. 이번주 중으로 리뷰하겠습니다. 모바일 반응형도 포함인가요?' },
    { offset: 100, text: '네, 모바일 브레이크포인트 3개로 잡았고요. 태블릿은 그리드 2열, 모바일은 1열 레이아웃입니다.' },
    { offset: 120, text: '프론트엔드 구현할 때 디자인 토큰 사용하면 좋을 것 같은데, 색상 변수 정리되어 있나요?' },
    { offset: 135, text: '네, 디자인 시스템에 시맨틱 컬러 토큰 12개 정의해놨어요. JSON으로 export 가능합니다.' },
    { offset: 155, text: '좋아요. 그러면 이번 주 목표 정리해봅시다. 개발팀은 대시보드 API 엔드포인트 구현, 맞죠?' },
    { offset: 170, text: '네, REST API 5개 엔드포인트랑 WebSocket 실시간 알림 기능까지 이번주 목표입니다.' },
    { offset: 190, text: '일정이 빡빡한데 괜찮을까요? WebSocket은 다음 주로 넘겨도 될 것 같은데.' },
    { offset: 210, text: '음... 솔직히 WebSocket은 좀 여유가 없을 수 있어요. 다음 주로 넘기는 게 나을 것 같습니다.' },
    { offset: 225, text: '그러면 저는 이번주에 컴포넌트 라이브러리 문서화 작업 진행할게요. Storybook으로요.' },
    { offset: 240, text: '좋습니다. 그리고 한 가지 더, 다음 달 클라이언트 데모가 있어서 준비해야 합니다.' },
    { offset: 260, text: '데모 범위가 어디까지인가요? 전체 플로우인지, 핵심 기능만인지?' },
    { offset: 275, text: '핵심 기능 위주로요. 로그인, 대시보드, 보고서 생성 이 세 가지면 충분합니다.' },
    { offset: 290, text: '대시보드 애니메이션 효과 넣으면 데모에서 임팩트가 좋을 것 같은데, 개발 공수가 어떤가요?' },
    { offset: 310, text: 'Framer Motion 쓰면 하루 정도면 가능합니다. 차트 진입 애니메이션이랑 숫자 카운트업 정도?' },
    { offset: 325, text: '좋아요, 그건 데모 전 주에 넣는 걸로 합시다. 다른 이슈 있나요?' },
    { offset: 340, text: '아, 접근성 관련해서 WCAG 2.1 AA 기준 맞추려면 컬러 대비 일부 수정이 필요해요.' },
    { offset: 355, text: '중요한 포인트네요. 이번 스프린트에 접근성 태스크도 추가합시다.' },
    { offset: 370, text: '그리고 CI/CD 파이프라인에 접근성 자동 체크 넣으면 좋겠는데, axe-core 같은 거요.' },
    { offset: 390, text: '동의합니다. 그럼 정리하면: API 엔드포인트 구현, 컴포넌트 문서화, 접근성 수정, 데모 준비. 다들 오케이?' },
    { offset: 405, text: '네, 오케이입니다.' },
    { offset: 410, text: '저도 좋습니다!' },
    { offset: 420, text: '좋아요, 수고하셨습니다. 다음 주 같은 시간에 봐요!' },
  ];

  script.forEach((item, idx) => {
    const line = {
      id: generateId() + idx,
      text: item.text,
      timestamp: state.meetingStartTime + item.offset * 1000,
      bookmarked: idx === 3 || idx === 14,
    };
    state.transcript.push(line);
    addTranscriptLine(line);
  });

  const memo1 = { id: generateId() + 'm1', text: 'WebSocket은 다음 주로 이동 결정', timestamp: state.meetingStartTime + 215 * 1000 };
  const memo2 = { id: generateId() + 'm2', text: '클라이언트 데모: 로그인 + 대시보드 + 보고서', timestamp: state.meetingStartTime + 280 * 1000 };
  state.memos.push(memo1, memo2);
  addMemoLine(memo1);
  addMemoLine(memo2);

  state.tags = ['weekly', 'sprint-review', 'dashboard'];

  updateTimer();
  timerInterval = setInterval(updateTimer, 1000);

  $('#meetingStatus').textContent = 'Demo Mode';
  showToast('Demo data loaded - 27 transcript lines', 'success');
}

window.__loadDemo = loadDemoData;

document.addEventListener('DOMContentLoaded', init);
