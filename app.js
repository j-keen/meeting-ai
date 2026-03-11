// app.js - State management, pub/sub, initialization

import { createSTT, startSTTComparison } from './stt.js';
import { analyzeTranscript, getDefaultPrompt, generateTags, correctSentences, generateMeetingTitle } from './ai.js';
import { checkProxyAvailable, isProxyAvailable } from './gemini-api.js';
import {
  saveMeeting, listMeetings, getMeeting, deleteMeeting, updateMeetingTags,
  loadSettings, saveSettings, getStorageUsage,
  loadContacts, addContact, loadLocations, addLocation, loadCategories,
} from './storage.js';
import {
  initDragResizer, initPanelTabs, addTranscriptLine, showInterim, clearInterim,
  addMemoLine, showAnalysisSkeletons, renderAnalysis, renderHighlights,
  renderAnalysisHistory, renderHistoryGrid, renderMeetingViewer,
  initModals, initContextPopup, toggleTheme, initKeyboardShortcuts,
  showToast, updateTranscriptLineUI, removeTranscriptLineUI,
  showTranscriptWaiting, hideTranscriptWaiting, resetTranscriptEmpty,
  showAiWaiting, hideAiWaiting, resetAiEmpty,
  showChatWaiting, resetChatEmpty,
  updateAnalysisNav,
  getAnalysisAsText, renderAnalysisInto,
} from './ui.js';
import { initSettings, closeSettings, tryCloseSettings } from './settings.js';
import { initChat } from './chat.js';
import { startMeetingPrep } from './meeting-prep.js';
import { t, setLanguage, setAiLanguage, getDateLocale, getAiLanguage, getPromptPresets } from './i18n.js';

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
  meetingTitle: '',
  starRating: 3,
  categories: [],
  participants: [],
};

const $ = (sel) => document.querySelector(sel);

function buildFullProfile() {
  return state.settings.userProfile || '';
}

// ===== Core Logic =====
let stt = null;
let timerInterval = null;
let autoSaveInterval = null;
let autoAnalysisInterval = null;
let isAnalyzing = false;
let isAnalysisPaused = false;
let aiCorrectionTimer = null;
let isCorrecting = false;
let countdownTimer = null;
let countdownEnd = 0;
let countdownIntervalMs = 0;

// Guard: idle detection + max duration
const IDLE_WARNING_MS = 15 * 60 * 1000;
const IDLE_AUTOPAUSE_MS = 20 * 60 * 1000;
const MAX_RECORDING_MS = 6 * 60 * 60 * 1000;
let lastTranscriptTime = 0;
let idleCheckInterval = null;
let idleWarningShown = false;
let maxDurationTimeout = null;

// Cached analysis chip elements (set after DOMContentLoaded)
let chipEl = null, chipIconEl = null, chipTextEl = null;
function getChipEls() {
  if (!chipEl) {
    chipEl = $('#analysisChip');
    chipIconEl = $('#analysisChipIcon');
    chipTextEl = $('#analysisChipText');
  }
  return { chip: chipEl, icon: chipIconEl, text: chipTextEl };
}


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

// STT Engine Badge status helper
function setSttBadgeStatus(status, label) {
  const badge = document.getElementById('sttEngineBadge');
  const nameEl = document.getElementById('sttEngineLabel');
  if (badge) badge.dataset.status = status;
  if (nameEl && label) nameEl.textContent = label;
}

// ===== STT Event Log =====
const sttEventLog = [];
const MAX_STT_LOG = 20;

function logSttEvent(type, message) {
  const entry = {
    time: new Date(),
    type, // 'connect' | 'error' | 'fallback' | 'info' | 'disconnect'
    message,
  };
  sttEventLog.unshift(entry);
  if (sttEventLog.length > MAX_STT_LOG) sttEventLog.pop();
}

function getSttLogIcon(type) {
  switch (type) {
    case 'connect': return '<span style="color:var(--success)">&#9679;</span>';
    case 'error': return '<span style="color:var(--danger)">&#10005;</span>';
    case 'fallback': return '<span style="color:var(--warning)">&#9888;</span>';
    case 'disconnect': return '<span style="color:var(--text-muted)">&#9675;</span>';
    default: return '<span style="color:var(--accent)">&#8505;</span>';
  }
}

// ===== STT Comparison Mode =====
let stopComparison = null;

function startComparisonMode() {
  if (state.isRecording) {
    showToast(t('stt.recording_locked'), 'warning');
    return;
  }

  const overlay = document.getElementById('sttCompareOverlay');
  if (!overlay) return;

  // Reset UI
  document.getElementById('compareWsResults').innerHTML = '';
  document.getElementById('compareDgResults').innerHTML = '';
  document.getElementById('compareWsInterim').textContent = '';
  document.getElementById('compareDgInterim').textContent = '';
  document.getElementById('compareWsCount').textContent = '0';
  document.getElementById('compareDgCount').textContent = '0';
  document.getElementById('compareWsDot').style.background = 'var(--text-muted)';
  document.getElementById('compareDgDot').style.background = 'var(--text-muted)';

  let wsCount = 0, dgCount = 0;

  overlay.hidden = false;
  logSttEvent('info', t('stt.log_compare_start'));

  stopComparison = startSTTComparison({
    language: state.settings.language || 'ko',
    onResult: (engine, text, isFinal) => {
      const prefix = engine === 'webspeech' ? 'Ws' : 'Dg';
      if (isFinal) {
        const resultsEl = document.getElementById(`compare${prefix}Results`);
        const p = document.createElement('p');
        p.textContent = text;
        resultsEl.appendChild(p);
        resultsEl.scrollTop = resultsEl.scrollHeight;
        document.getElementById(`compare${prefix}Interim`).textContent = '';

        if (engine === 'webspeech') wsCount++;
        else dgCount++;
        document.getElementById(`compare${prefix}Count`).textContent = engine === 'webspeech' ? wsCount : dgCount;
      } else {
        document.getElementById(`compare${prefix}Interim`).textContent = text;
      }
    },
    onError: (engine, err) => {
      const prefix = engine === 'webspeech' ? 'Ws' : 'Dg';
      const resultsEl = document.getElementById(`compare${prefix}Results`);
      const p = document.createElement('p');
      p.style.color = 'var(--danger)';
      p.textContent = `Error: ${err}`;
      resultsEl.appendChild(p);
      logSttEvent('error', `[${engine}] ${err}`);
    },
    onStatusChange: (engine, status) => {
      const dotId = engine === 'webspeech' ? 'compareWsDot' : 'compareDgDot';
      const dot = document.getElementById(dotId);
      if (dot) {
        const colors = { connecting: 'var(--warning)', active: 'var(--success)', error: 'var(--danger)' };
        dot.style.background = colors[status] || 'var(--text-muted)';
      }
    },
  });
}

function stopComparisonMode() {
  if (stopComparison) {
    stopComparison();
    stopComparison = null;
  }
  const overlay = document.getElementById('sttCompareOverlay');
  if (overlay) overlay.hidden = true;
  logSttEvent('info', t('stt.log_compare_end'));
}

async function startRecording() {
  if (state.isRecording) return;

  stt = createSTT();

  const isDeepgram = state.settings.sttEngine === 'deepgram';
  setSttBadgeStatus(isDeepgram ? 'connecting' : 'active', isDeepgram ? 'Deepgram' : 'Web Speech');

  // Lock STT engine select during recording
  const sttSelect = document.getElementById('selectSttEngine');
  if (sttSelect) sttSelect.disabled = true;

  logSttEvent('connect', t('stt.log_starting', { engine: isDeepgram ? 'Deepgram' : 'Web Speech' }));

  try {
    await stt.start({
      language: state.settings.language || 'ko',
      engineType: state.settings.sttEngine || 'webspeech',
      onInterim: (text) => {
        showInterim(text);
        // First result: mark badge as active (Deepgram connected successfully)
        const badge = document.getElementById('sttEngineBadge');
        if (badge && badge.dataset.status === 'connecting') {
          setSttBadgeStatus('active', 'Deepgram');
          logSttEvent('connect', 'Deepgram connected');
        }
      },
      onFinal: (text) => {
        // First result: mark badge as active
        const badge = document.getElementById('sttEngineBadge');
        if (badge && badge.dataset.status === 'connecting') {
          setSttBadgeStatus('active', 'Deepgram');
          logSttEvent('connect', 'Deepgram connected');
        }

        const line = {
          id: generateId(),
          text,
          timestamp: Date.now(),
          bookmarked: false,
          engine: stt?.engineName || 'unknown',
        };
        state.transcript.push(line);
        addTranscriptLine(line);
        emit('transcript:add', line);
        lastTranscriptTime = Date.now();
        idleWarningShown = false;
      },
      onError: (err) => {
        logSttEvent('error', err);
        showToast(err, 'error');
      },
      onEngineChange: (newEngine) => {
        // Fallback occurred — update badge to fallback state (don't change settings)
        setSttBadgeStatus('fallback', 'Web Speech (fallback)');
        logSttEvent('fallback', t('stt.fallback_warning'));
        // Show warning toast
        showToast(t('stt.fallback_warning'), 'warning');
      },
    });

    // Set recording state only AFTER stt.start() succeeds
    state.isRecording = true;

    if (!state.meetingStartTime) {
      state.meetingStartTime = Date.now();
      state.meetingId = generateId();
    }
    // Show meeting title input in header
    const titleInput = $('#meetingTitleInput');
    if (titleInput) {
      titleInput.hidden = false;
      titleInput.value = state.meetingTitle;
    }

    timerInterval = setInterval(updateTimer, 1000);
    autoSaveInterval = setInterval(() => autoSave(), 30000);
    startAutoAnalysis();
    startAiCorrection();
    updatePauseButtonVisibility(true);

    // Guards: idle detection + max duration
    lastTranscriptTime = Date.now();
    idleWarningShown = false;
    idleCheckInterval = setInterval(checkIdle, 60000);
    maxDurationTimeout = setTimeout(() => {
      stopRecording();
      showToast(t('guard.max_duration'), 'warning');
    }, MAX_RECORDING_MS);

    const btn = $('#btnRecord');
    btn.classList.remove('paused');
    btn.classList.add('recording');
    btn.querySelector('.record-label').textContent = t('record.meeting_active');
    $('#meetingStatus').textContent = t('record.status_recording');
    $('#btnEndMeeting').hidden = false;

    showTranscriptWaiting();
    showAiWaiting(state.settings.analysisInterval || 30);
    showChatWaiting();
    showToast(t('toast.recording_started'), 'success');

  } catch (err) {
    stt?.stop();
    stt = null;
    state.isRecording = false;
    setSttBadgeStatus('error', state.settings.sttEngine === 'deepgram' ? 'Deepgram' : 'Web Speech');
    logSttEvent('error', err.message);
    const sttSelect = document.getElementById('selectSttEngine');
    if (sttSelect) sttSelect.disabled = false;
    showToast(t('toast.record_fail') + err.message, 'error');
  }
}

function stopRecording() {
  if (!state.isRecording) return;

  stt?.stop();
  stt = null;
  state.isRecording = false;
  clearInterim();
  logSttEvent('disconnect', t('stt.log_stopped'));

  clearInterval(timerInterval);
  clearInterval(autoSaveInterval);
  clearInterval(autoAnalysisInterval);
  clearInterval(aiCorrectionTimer);
  clearInterval(idleCheckInterval);
  clearTimeout(maxDurationTimeout);
  stopAnalysisCountdown();
  isAnalysisPaused = false;
  updatePauseButtonVisibility(false);

  // Reset badge and unlock engine select
  setSttBadgeStatus('idle', state.settings.sttEngine === 'deepgram' ? 'Deepgram' : 'Web Speech');
  const sttSelect = document.getElementById('selectSttEngine');
  if (sttSelect) sttSelect.disabled = false;

  const btn = $('#btnRecord');
  btn.classList.remove('recording');
  btn.classList.add('paused');
  btn.querySelector('.record-label').textContent = t('record.paused');
  $('#meetingStatus').textContent = t('record.status_paused');

  autoSave();
}

function checkIdle() {
  if (!state.isRecording) return;
  const idleMs = Date.now() - lastTranscriptTime;
  if (idleMs >= IDLE_AUTOPAUSE_MS) {
    stopRecording();
    showToast(t('guard.idle_auto_stopped'), 'warning');
  } else if (idleMs >= IDLE_WARNING_MS && !idleWarningShown) {
    idleWarningShown = true;
    showToast(t('guard.idle_warning'), 'warning');
  }
}

function startAutoAnalysis() {
  clearInterval(autoAnalysisInterval);
  stopAnalysisCountdown();
  if (!state.settings.autoAnalysis) return;
  const intervalMs = (state.settings.analysisInterval || 30) * 1000;
  autoAnalysisInterval = setInterval(() => {
    if (state.isRecording && state.transcript.length > 0) runAnalysis();
  }, intervalMs);
  startAnalysisCountdown(intervalMs);
}

function startAnalysisCountdown(intervalMs) {
  stopAnalysisCountdown();
  const { chip } = getChipEls();
  if (!chip) return;
  const { icon } = getChipEls();
  countdownIntervalMs = intervalMs;
  countdownEnd = Date.now() + intervalMs;
  chip.className = 'analysis-chip counting';
  if (icon) icon.textContent = '⏸';
  updateCountdownText();
  countdownTimer = setInterval(() => updateCountdownText(), 1000);
}

function updateCountdownText() {
  const { icon, text } = getChipEls();
  if (!icon || !text) return;
  const remaining = Math.max(0, Math.ceil((countdownEnd - Date.now()) / 1000));
  text.textContent = t('analysis.countdown', { n: remaining });
}

function stopAnalysisCountdown() {
  clearInterval(countdownTimer);
  countdownTimer = null;
  const { chip, icon, text } = getChipEls();
  if (chip) {
    chip.className = 'analysis-chip';
    if (icon) icon.textContent = '';
    if (text) text.textContent = '';
  }
}

function showAnalyzingState() {
  const { chip, icon, text } = getChipEls();
  if (!chip) return;
  clearInterval(countdownTimer);
  countdownTimer = null;
  chip.className = 'analysis-chip analyzing';
  if (icon) icon.textContent = '⏳';
  if (text) text.textContent = t('analysis.analyzing');
}

function hideAnalyzingState() {
  const { chip } = getChipEls();
  if (chip) chip.classList.remove('analyzing');
  if (isAnalysisPaused) {
    showPausedState();
    return;
  }
  if (state.settings.autoAnalysis && state.isRecording) {
    const intervalMs = (state.settings.analysisInterval || 30) * 1000;
    startAnalysisCountdown(intervalMs);
  } else {
    stopAnalysisCountdown();
  }
}

function toggleAnalysisPause() {
  isAnalysisPaused = !isAnalysisPaused;
  if (isAnalysisPaused) {
    clearInterval(autoAnalysisInterval);
    stopAnalysisCountdown();
    showPausedState();
  } else {
    startAutoAnalysis();
  }
}

function updatePauseButtonVisibility(show) {
  const { chip } = getChipEls();
  if (!chip) return;
  chip.style.display = show ? '' : 'none';
  if (!show) {
    isAnalysisPaused = false;
    stopAnalysisCountdown();
  }
}

function showPausedState() {
  const { chip, icon, text } = getChipEls();
  if (!chip) return;
  clearInterval(countdownTimer);
  countdownTimer = null;
  chip.className = 'analysis-chip paused';
  if (icon) icon.textContent = '▶';
  if (text) text.textContent = t('analysis.paused');
}

// AI sentence correction (runs silently in background)
function startAiCorrection() {
  clearInterval(aiCorrectionTimer);
  if (!state.settings.autoCorrection) return;
  const intervalMs = 5 * 60 * 1000; // 5 minutes
  aiCorrectionTimer = setInterval(() => runCorrection(true), intervalMs);
}

async function runCorrection(uncorrectedOnly) {
  if (isCorrecting || !isProxyAvailable()) return;
  isCorrecting = true;
  try {
    const lines = uncorrectedOnly
      ? state.transcript.filter(l => !l.originalText)
      : state.transcript;
    if (lines.length === 0) return;

    const batchSize = 20;
    for (let i = 0; i < lines.length; i += batchSize) {
      const batch = lines.slice(i, i + batchSize);
      const corrections = await correctSentences({
        lines: batch,
        model: state.settings.geminiModel || 'gemini-2.5-flash',
      });
      for (const c of corrections) {
        const line = batch[c.index];
        if (!line || c.corrected === line.text) continue;
        if (!line.originalText) line.originalText = line.text;
        line.text = c.corrected;
        updateTranscriptLineUI(line.id);
      }
    }
  } catch { /* silent */ }
  finally { isCorrecting = false; }
}

async function runAnalysis() {
  stopAnalysisCountdown();
  showAnalyzingState();
  if (isAnalyzing) return;
  if (!isProxyAvailable()) {
    showToast(t('toast.no_api_key'), 'warning');
    return;
  }
  if (state.transcript.length === 0) {
    showToast(t('toast.no_transcript'), 'warning');
    return;
  }

  isAnalyzing = true;
  if (state.currentAnalysis) {
    // Keep previous result visible, just dim it
    const container = document.querySelector('#aiSections');
    if (container) container.classList.add('ai-updating');
  } else {
    showAnalysisSkeletons();
  }

  try {
    const lastAnalysis = state.analysisHistory.length > 0
      ? state.analysisHistory[state.analysisHistory.length - 1]
      : null;

    const previousSummary = lastAnalysis
      ? (lastAnalysis.markdown
          ? lastAnalysis.markdown
          : [
              lastAnalysis.summary,
              lastAnalysis.context ? `\n[대화 흐름] ${lastAnalysis.context}` : '',
              lastAnalysis.actionItems?.length ? `\n[실행 항목] ${lastAnalysis.actionItems.join(' / ')}` : '',
              lastAnalysis.openQuestions?.length ? `\n[미해결 질문] ${lastAnalysis.openQuestions.join(' / ')}` : '',
            ].filter(Boolean).join(''))
      : null;

    // Guard 4: force smart strategy for long transcripts
    let effectiveStrategy = state.settings.tokenStrategy || 'smart';
    if (state.transcript.length > 200 && effectiveStrategy === 'full') {
      effectiveStrategy = 'smart';
      showToast(t('guard.strategy_fallback'), 'info');
    }

    const result = await analyzeTranscript({
      transcript: state.transcript,
      prompt: state.settings.customPrompt,
      meetingContext: state.settings.meetingContext,
      meetingPreset: state.settings.meetingPreset,
      elapsedTime: getElapsedTimeStr(),
      strategy: effectiveStrategy,
      recentMinutes: state.settings.recentMinutes || 5,
      previousSummary,
      userInsights: state.userInsights,
      memos: state.memos,
      userProfile: buildFullProfile(),
      model: state.settings.geminiModel || 'gemini-2.5-flash',
    });

    state.currentAnalysis = result;
    result.transcriptLength = state.transcript.length;
    state.analysisHistory.push(result);
    renderAnalysis(result);

    // Auto-generate tags
    if (result.summary && state.tags.length === 0) {
      generateTags({
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
    const container = document.querySelector('#aiSections');
    if (container) container.classList.remove('ai-updating');
    if (!state.currentAnalysis) {
      renderAnalysis({
        summary: '', context: '', openQuestions: [],
        actionItems: [], suggestions: [],
      });
    }
  } finally {
    isAnalyzing = false;
    hideAnalyzingState();
  }
}

function autoSave() {
  if (!state.meetingId) return;
  const defaultTitle = t('meeting_title', { date: new Date(state.meetingStartTime).toLocaleDateString(getDateLocale()), time: new Date(state.meetingStartTime).toLocaleTimeString(getDateLocale(), { hour: '2-digit', minute: '2-digit' }) });
  const meeting = {
    id: state.meetingId,
    title: state.meetingTitle || defaultTitle,
    startTime: state.meetingStartTime,
    duration: getElapsedTimeStr(),
    preset: state.settings.meetingPreset || 'general',
    location: state.meetingLocation || '',
    meetingContext: state.settings.meetingContext || '',
    transcript: state.transcript,
    memos: state.memos,
    analysisHistory: state.analysisHistory,
    chatHistory: state.chatHistory,
    userInsights: state.userInsights,
    tags: state.tags,
    starRating: state.starRating,
    categories: state.categories,
    participants: state.participants,
  };
  const result = saveMeeting(meeting);
  if (result.warning === 'storage_high') {
    showToast(t('toast.storage_high'), 'warning');
  }
}

function endMeeting() {
  stopRecording();
  state.meetingTitle = $('#meetingTitleInput')?.value || state.meetingTitle;
  showEndMeetingModal();
}

function showEndMeetingModal() {
  const modal = $('#endMeetingModal');
  modal.hidden = false;

  const defaultTitle = t('meeting_title', {
    date: new Date(state.meetingStartTime || Date.now()).toLocaleDateString(getDateLocale()),
    time: new Date(state.meetingStartTime || Date.now()).toLocaleTimeString(getDateLocale(), { hour: '2-digit', minute: '2-digit' })
  });
  const titleInput = $('#endMeetingTitle');
  titleInput.value = state.meetingTitle || defaultTitle;

  renderEndMeetingTags();
  renderEndMeetingCategories();
  updateStarRating(state.starRating);
  renderEndMeetingParticipants();

  const locationInput = $('#endMeetingLocation');
  locationInput.value = state.meetingLocation || '';
  const datalist = $('#locationDatalist');
  datalist.innerHTML = '';
  loadLocations().forEach(loc => {
    const opt = document.createElement('option');
    opt.value = loc;
    datalist.appendChild(opt);
  });

  // AI title/tag generation
  const suggestionsEl = $('#aiTitleSuggestions');
  const chipsEl = $('#aiTitleChips');
  if (isProxyAvailable() && state.transcript.length > 0) {
    suggestionsEl.hidden = false;
    suggestionsEl.querySelector('.ai-suggestions-label').textContent = t('end_meeting.generating');
    chipsEl.innerHTML = '';

    generateMeetingTitle({
      transcript: state.transcript,
      existingTitle: state.meetingTitle,
    }).then(result => {
      if (!result) { suggestionsEl.hidden = true; return; }
      suggestionsEl.querySelector('.ai-suggestions-label').textContent = '';

      const allTitles = [result.title, ...(result.alternatives || [])].filter(Boolean);
      chipsEl.innerHTML = '';
      allTitles.forEach(title => {
        const chip = document.createElement('button');
        chip.className = 'ai-title-chip';
        chip.textContent = title;
        chip.addEventListener('click', () => { titleInput.value = title; });
        chipsEl.appendChild(chip);
      });

      if (result.tags && result.tags.length > 0) {
        result.tags.forEach(tag => {
          if (!state.tags.includes(tag)) state.tags.push(tag);
        });
        renderEndMeetingTags();
      }
    });
  } else {
    suggestionsEl.hidden = true;
  }
}

function renderEndMeetingTags() {
  const container = $('#endMeetingTags');
  container.innerHTML = '';
  state.tags.forEach(tag => {
    const el = document.createElement('span');
    el.className = 'end-meeting-tag';
    const tagText = document.createTextNode(tag);
    const removeBtn = document.createElement('button');
    removeBtn.className = 'end-meeting-tag-remove';
    removeBtn.textContent = '\u00d7';
    el.append(tagText, removeBtn);
    removeBtn.addEventListener('click', () => {
      state.tags = state.tags.filter(t2 => t2 !== tag);
      renderEndMeetingTags();
    });
    container.appendChild(el);
  });
}

function renderEndMeetingCategories() {
  const container = $('#endMeetingCategories');
  container.innerHTML = '';
  loadCategories().forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'end-meeting-category-btn';
    if (state.categories.includes(cat)) btn.classList.add('selected');
    btn.textContent = cat;
    btn.addEventListener('click', () => {
      if (state.categories.includes(cat)) {
        state.categories = state.categories.filter(c => c !== cat);
        btn.classList.remove('selected');
      } else {
        state.categories.push(cat);
        btn.classList.add('selected');
      }
    });
    container.appendChild(btn);
  });
}

function updateStarRating(rating) {
  state.starRating = rating;
  document.querySelectorAll('#endMeetingStars .star-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.star) <= rating);
  });
}

function renderEndMeetingParticipants() {
  const selectedContainer = $('#endMeetingParticipantsSelected');
  const listContainer = $('#endMeetingParticipantsList');

  selectedContainer.innerHTML = '';
  state.participants.forEach(p => {
    const badge = document.createElement('span');
    badge.className = 'contact-badge';
    const nameText = document.createTextNode(p.name || p);
    const removeBtn = document.createElement('button');
    removeBtn.className = 'contact-badge-remove';
    removeBtn.textContent = '\u00d7';
    badge.append(nameText, removeBtn);
    removeBtn.addEventListener('click', () => {
      state.participants = state.participants.filter(pp => pp !== p);
      renderEndMeetingParticipants();
    });
    selectedContainer.appendChild(badge);
  });

  const contacts = loadContacts();
  listContainer.innerHTML = '';
  if (contacts.length === 0 && state.participants.length === 0) {
    listContainer.innerHTML = `<p class="text-muted" style="font-size:11px;">${t('end_meeting.no_participants')}</p>`;
  } else {
    contacts.forEach(contact => {
      if (state.participants.some(p => (p.id || p) === contact.id)) return;
      const card = document.createElement('div');
      card.className = 'contact-card';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'contact-card-name';
      nameSpan.textContent = contact.name;
      const companySpan = document.createElement('span');
      companySpan.className = 'contact-card-company';
      companySpan.textContent = contact.company || '';
      card.append(nameSpan, companySpan);
      card.addEventListener('click', () => {
        state.participants.push({ id: contact.id, name: contact.name });
        renderEndMeetingParticipants();
      });
      listContainer.appendChild(card);
    });
  }
}

async function finalizeEndMeeting() {
  state.meetingTitle = $('#endMeetingTitle').value.trim();
  state.meetingLocation = $('#endMeetingLocation').value.trim();
  if (state.meetingLocation) addLocation(state.meetingLocation);

  // Auto-correct all uncorrected lines before saving
  const hasUncorrected = state.transcript.some(l => !l.originalText);
  if (isProxyAvailable() && hasUncorrected && state.transcript.length > 0) {
    showToast(t('toast.correcting'), 'info');
    await runCorrection(false);
    showToast(t('toast.correction_done'), 'success');
  }

  autoSave();
  state.meetingEnded = true;
  $('#endMeetingModal').hidden = true;

  // Reset record button to initial state
  const recBtn = $('#btnRecord');
  recBtn.classList.remove('recording', 'paused');
  recBtn.querySelector('.record-label').textContent = t('record.label');

  showPostEndButtons();

  $('#meetingStatus').textContent = t('record.status_ended');
  const titleInput = $('#meetingTitleInput');
  if (titleInput) titleInput.hidden = true;
  showToast(t('toast.meeting_saved'), 'success');
}

function cancelEndMeeting() {
  $('#endMeetingModal').hidden = true;
}

function showPostEndButtons() {
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

  endBtn.hidden = true;
  endBtn.parentNode.insertBefore(btnResume, endBtn.nextSibling);
  endBtn.parentNode.insertBefore(btnNew, btnResume.nextSibling);

  btnResume.addEventListener('click', () => resumeMeeting());
  btnNew.addEventListener('click', () => {
    resetMeeting();
    restoreEndButton();
  });
}

async function resumeMeeting() {
  state.meetingEnded = false;
  restoreEndButton();
  await startRecording();
  showToast(t('toast.meeting_resumed'), 'success');
}

function restoreEndButton() {
  const endBtn = $('#btnEndMeeting');
  endBtn.hidden = false;
  const resume = $('#btnResumeMeeting');
  const newBtn = $('#btnNewMeeting');
  if (resume) resume.remove();
  if (newBtn) newBtn.remove();
}

function resetMeeting() {
  state.meetingEnded = false;
  state.meetingStartTime = null;
  // Reset record button and hide end meeting button
  const recBtn = $('#btnRecord');
  recBtn.classList.remove('recording', 'paused');
  recBtn.querySelector('.record-label').textContent = t('record.label');
  $('#btnEndMeeting').hidden = true;
  state.meetingId = null;
  state.meetingLocation = '';
  state.meetingTitle = '';
  state.starRating = 3;
  state.categories = [];
  state.participants = [];
  state.transcript = [];
  state.memos = [];
  state.analysisHistory = [];
  state.currentAnalysis = null;
  state.chatHistory = [];
  state.userInsights = [];
  state.tags = [];
  $('#transcriptList').innerHTML = '';
  resetTranscriptEmpty();
  $('#aiSections').innerHTML = '';
  resetAiEmpty();
  $('#chatMessages').innerHTML = '';
  resetChatEmpty();
  $('#meetingTimer').textContent = '00:00:00';
  $('#meetingStatus').textContent = '';
  const headerTitleInput = $('#meetingTitleInput');
  if (headerTitleInput) { headerTitleInput.value = ''; headerTitleInput.hidden = true; }
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

function generateMarkdownSummary() {
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
    filterCategory: $('#historyFilterCategory')?.value || '',
    filterRating: $('#historyFilterRating')?.value || '',
    dateFrom: $('#historyFilterDateFrom')?.value || '',
    dateTo: $('#historyFilterDateTo')?.value || '',
  };
}

let historySearchTimer = null;
function refreshHistoryGrid() {
  renderHistoryGrid(listMeetings(), getHistoryFilters());
}
function refreshHistoryGridDebounced() {
  clearTimeout(historySearchTimer);
  historySearchTimer = setTimeout(refreshHistoryGrid, 250);
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

  // Check if Vertex AI proxy is available (for keyless operation)
  checkProxyAvailable();

  // ===== Welcome Modal =====
  const saved = loadSettings();
  if (!saved.welcomeDismissed) {
    showWelcomeModal();
  }

  // ===== Event Bindings =====

  // Record button
  $('#btnRecord').addEventListener('click', () => emit('recording:toggle'));
  on('recording:toggle', async () => {
    if (state.isRecording) stopRecording();
    else await startRecording();
  });

  // End meeting (with confirmation)
  $('#btnEndMeeting').addEventListener('click', () => endMeeting());

  // Pause/resume analysis (chip toggle)
  $('#analysisChip').addEventListener('click', () => toggleAnalysisPause());

  // Compare STT engines
  $('#btnCompareEngines')?.addEventListener('click', () => startComparisonMode());

  // Analyze now
  $('#btnAnalyzeNow').addEventListener('click', () => runAnalysis());

  // Copy analysis as markdown
  $('#btnCopyAnalysis').addEventListener('click', () => {
    const text = getAnalysisAsText(state.currentAnalysis);
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      showToast(t('toast.copied_md'), 'success');
    });
  });

  // Compare prompts modal
  $('#btnComparePrompts').addEventListener('click', () => openCompareModal());
  $('#btnRunCompare').addEventListener('click', () => runCompareAnalysis());
  $('#btnSetDefaultA').addEventListener('click', () => applyComparePromptAsDefault($('#compareTextA').value));
  $('#btnSetDefaultB').addEventListener('click', () => applyComparePromptAsDefault($('#compareTextB').value));

  // Demo data
  $('#btnLoadDemo').addEventListener('click', () => loadDemoData());
  $('#btnLoadDemo2').addEventListener('click', () => loadDemoData2());

  // Theme toggle
  $('#btnThemeToggle').addEventListener('click', () => {
    toggleTheme();
    saveSettings({ theme: state.settings.theme });
  });

  // Quick Start
  $('#btnQuickStart')?.addEventListener('click', async () => {
    const preset = $('#selectQuickPreset')?.value || 'general';
    state.settings.meetingPreset = preset;
    saveSettings({ meetingPreset: preset });
    $('#selectMeetingPreset').value = preset;
    await startRecording();
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

  // Meeting title input binding
  $('#meetingTitleInput')?.addEventListener('input', (e) => {
    state.meetingTitle = e.target.value;
  });

  // End Meeting Modal events
  $('#btnEndMeetingSave').addEventListener('click', () => finalizeEndMeeting());
  $('#btnEndMeetingCancel').addEventListener('click', () => cancelEndMeeting());

  // Star rating clicks
  document.querySelectorAll('#endMeetingStars .star-btn').forEach(btn => {
    btn.addEventListener('click', () => updateStarRating(parseInt(btn.dataset.star)));
  });

  // Close comparison
  document.getElementById('btnCloseCompare')?.addEventListener('click', stopComparisonMode);
  document.getElementById('btnStopCompare')?.addEventListener('click', stopComparisonMode);

  // Tag input (Enter to add)
  $('#endMeetingTagInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const tag = e.target.value.trim();
      if (tag && !state.tags.includes(tag)) {
        state.tags.push(tag);
        renderEndMeetingTags();
      }
      e.target.value = '';
    }
  });

  // Inline participant add
  $('#btnEndMeetingAddParticipant').addEventListener('click', () => {
    const input = $('#endMeetingParticipantInput');
    const name = input.value.trim();
    if (name) {
      const contact = addContact({ name });
      state.participants.push({ id: contact.id, name: contact.name });
      renderEndMeetingParticipants();
      input.value = '';
    }
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
  $('#btnBookmarks').addEventListener('click', () => {
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
    // Populate category filter dropdown
    const catSelect = $('#historyFilterCategory');
    if (catSelect) {
      const current = catSelect.value;
      const cats = loadCategories();
      catSelect.innerHTML = `<option value="" data-i18n="history.filter_all_categories">${t('history.filter_all_categories')}</option>` +
        cats.map(c => `<option value="${c}">${c}</option>`).join('');
      catSelect.value = current;
    }
    refreshHistoryGrid();
    $('#historyModal').hidden = false;
  });
  $('#historySearch').addEventListener('input', () => refreshHistoryGridDebounced());
  $('#historyFilterType').addEventListener('change', () => refreshHistoryGrid());
  $('#historyFilterTag')?.addEventListener('input', () => refreshHistoryGridDebounced());
  $('#historyFilterCategory')?.addEventListener('change', () => refreshHistoryGrid());
  $('#historyFilterRating')?.addEventListener('change', () => refreshHistoryGrid());
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

  on('transcript:edit', ({ id, text, original }) => {
    // Manual edits are preserved as-is
  });

  // Language change
  on('language:change', () => {
    if (state.currentAnalysis) renderAnalysis(state.currentAnalysis);
  });

  // Settings close
  on('settings:close', tryCloseSettings);

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
    const modal = $('#welcomeModal');
    if (modal) modal.hidden = true;
    startMeetingPrep();
  });

  on('meetingPrep:complete', async (config) => {
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
    await startRecording();
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

  const close = () => {
    modal.hidden = true;
    state.settings.welcomeDismissed = true;
    saveSettings(state.settings);
  };

  $('#welcomeClose').addEventListener('click', close);

  const keyHandler = (e) => {
    if (modal.hidden) return;
    if (e.key === 'Escape' || e.key === 'Enter') {
      close();
      document.removeEventListener('keydown', keyHandler);
    }
  };
  document.addEventListener('keydown', keyHandler);
}

// ===== Demo Data =====
function loadDemoData() {
  const now = Date.now();
  state.meetingStartTime = now - 55 * 60000;
  state.meetingId = generateId();
  state.meetingLocation = 'Conference Room A';
  state.meetingTitle = '주간 스프린트 리뷰 & 기술 전략 회의';

  const script = [
    // === Part 1: 스프린트 리뷰 (0~7분) ===
    { offset: 0, text: '자, 그럼 이번 주간 회의 시작하겠습니다. 오늘 안건이 좀 많아요. 스프린트 리뷰, 기술 부채 논의, 클라이언트 데모 준비, 그리고 채용 관련 업데이트까지.' },
    { offset: 20, text: '네, 지난주에 사용자 인증 모듈 리팩토링 완료했고요, 테스트 커버리지 85%까지 올렸습니다. 단위 테스트 42개, 통합 테스트 15개 추가했어요.' },
    { offset: 45, text: '좋습니다. 목표가 80%였으니까 초과 달성이네요. 성능 이슈는 해결됐나요?' },
    { offset: 60, text: '토큰 갱신 부분에서 레이스 컨디션이 있었는데, 뮤텍스 패턴으로 해결했습니다. 응답 시간 200ms에서 50ms로 줄었어요. P99 기준으로도 120ms 이하입니다.' },
    { offset: 85, text: '그거 Sentry에서 에러 얼마나 줄었어요? 지난달에 인증 관련 에러가 하루 평균 340건이었는데.' },
    { offset: 100, text: '이번 주 기준 하루 평균 12건으로 떨어졌습니다. 대부분 네트워크 타임아웃이라 서버 쪽 이슈는 아니에요.' },
    { offset: 120, text: '대단하네요. 340건에서 12건이면 96% 감소죠. 이거 다음 주 경영진 보고에 꼭 넣읍시다.' },

    // === Part 2: 대시보드 UI 진행상황 (7~14분) ===
    { offset: 145, text: '저는 새 대시보드 UI 디자인 완료했습니다. Figma에 올려놨는데 리뷰 부탁드려요. 총 화면 8개, 컴포넌트 34개입니다.' },
    { offset: 165, text: '오, 대시보드 기대되네요. 이번주 중으로 리뷰하겠습니다. 모바일 반응형도 포함인가요?' },
    { offset: 180, text: '네, 모바일 브레이크포인트 3개로 잡았고요. 태블릿은 그리드 2열, 모바일은 1열 레이아웃입니다. 768px, 1024px, 1440px 기준이에요.' },
    { offset: 200, text: '프론트엔드 구현할 때 디자인 토큰 사용하면 좋을 것 같은데, 색상 변수 정리되어 있나요?' },
    { offset: 220, text: '네, 디자인 시스템에 시맨틱 컬러 토큰 12개 정의해놨어요. JSON으로 export 가능합니다. primary, secondary, accent 각각 4단계씩이에요.' },
    { offset: 240, text: '다크 모드는 어떻게 처리했어요? 기존 앱은 다크 모드가 좀 깨져서 문의가 많았거든요.' },
    { offset: 258, text: '이번에 HSL 기반으로 완전히 새로 잡았어요. 라이트/다크 모드별 토큰을 분리해서, CSS 변수 하나로 전환됩니다. 테스트해보니 깨지는 부분 없었어요.' },

    // === Part 3: 기술 부채 논의 (14~22분) ===
    { offset: 280, text: '좋아요. 그럼 다음 안건, 기술 부채 얘기 좀 합시다. 현재 SonarQube 기준 코드 스멜 287개, 보안 취약점 3개 잡히고 있어요.' },
    { offset: 305, text: '보안 취약점 3개는 뭔가요? 심각도가 어떻게 되나요?' },
    { offset: 320, text: '하나는 SQL 인젝션 가능성인데 이건 ORM 사용해서 실제로는 문제 없어요. 나머지 둘은 의존성 라이브러리 CVE인데, lodash 4.17.19 버전이랑 axios 0.21.1 버전이에요.' },
    { offset: 350, text: 'lodash는 4.17.21로 올리면 되고, axios는 1.x로 메이저 업그레이드 해야 하는데 API 호출 패턴이 좀 바뀌어요.' },
    { offset: 370, text: 'axios 업그레이드하면 인터셉터 코드 전부 수정해야 되지 않나요? 영향 범위가 클 것 같은데.' },
    { offset: 390, text: '맞아요. API 서비스 레이어 파일이 23개인데, 그 중 인터셉터 사용하는 게 8개예요. 하루 반 정도 공수 필요합니다.' },
    { offset: 410, text: '그러면 이번 스프린트에 lodash만 먼저 올리고, axios는 다음 스프린트에 별도 태스크로 잡읍시다. 동의하시나요?' },
    { offset: 430, text: '네, 그게 안전할 것 같아요. axios 업그레이드는 별도 브랜치에서 충분히 테스트하고 머지하는 게 좋겠습니다.' },
    { offset: 445, text: '코드 스멜 287개는 어떡하죠? 전부 잡기엔 현실적으로 힘들잖아요.' },
    { offset: 460, text: '우선순위를 매기면 좋겠어요. critical이 12개, major가 45개인데, critical 12개는 이번 달 안에 처리하고, major는 분기 목표로 잡으면 어떨까요?' },
    { offset: 480, text: '좋습니다. critical 12개 담당자 배분하죠. 인증 관련 4개는 민수 씨, API 관련 5개는 지영 씨, 프론트 3개는 현우 씨 가능한가요?' },
    { offset: 500, text: '네, 가능합니다.' },
    { offset: 505, text: '저도 괜찮아요. 이번 주 내로 시작하겠습니다.' },
    { offset: 510, text: '프론트 3개 확인해봤는데 XSS 관련이라 빠르게 처리 가능합니다.' },

    // === Part 4: 클라이언트 데모 준비 (22~32분) ===
    { offset: 530, text: '좋습니다. 다음 안건, 다음 달 15일 클라이언트 데모 준비입니다. A사 김 부장님 외 3명 참석 예정이에요.' },
    { offset: 555, text: '데모 범위가 어디까지인가요? 전체 플로우인지, 핵심 기능만인지?' },
    { offset: 570, text: '핵심 기능 위주로요. 로그인, 대시보드, 보고서 생성 이 세 가지면 충분합니다. A사가 특히 보고서 커스터마이징에 관심이 많아요.' },
    { offset: 595, text: '보고서 커스터마이징이면 드래그 앤 드롭으로 위젯 배치하는 기능이죠? 그건 아직 베타인데 데모해도 괜찮을까요?' },
    { offset: 615, text: '베타여도 코어 기능은 안정적이에요. 엣지 케이스만 피하면 됩니다. 데모 시나리오를 미리 짜서 연습하면 충분해요.' },
    { offset: 635, text: '데모 시나리오 초안은 제가 이번 주 금요일까지 만들어서 공유하겠습니다.' },
    { offset: 650, text: '대시보드 애니메이션 효과 넣으면 데모에서 임팩트가 좋을 것 같은데, 개발 공수가 어떤가요?' },
    { offset: 670, text: 'Framer Motion 쓰면 하루 정도면 가능합니다. 차트 진입 애니메이션이랑 숫자 카운트업 정도? 로딩 스켈레톤도 넣으면 이틀이에요.' },
    { offset: 695, text: '좋아요, 그건 데모 전 주에 넣는 걸로 합시다. 로딩 스켈레톤까지 포함해주세요.' },
    { offset: 710, text: '데모 환경은 어디서 돌리나요? 프로덕션은 위험하고, 스테이징에 샘플 데이터 넣어야 할 것 같은데.' },
    { offset: 730, text: '스테이징에 별도 데모 테넌트를 만들어서, 실제감 있는 더미 데이터 500건 정도 넣어놓죠. 이건 제가 처리하겠습니다.' },
    { offset: 750, text: 'A사 산업 맞는 데이터로 넣으면 좋겠어요. 제조업 관련 KPI 데이터로요.' },
    { offset: 765, text: '좋은 생각이에요. 제조업 KPI 템플릿 있으니까 그걸로 커스텀하겠습니다.' },

    // === Part 5: 접근성 & CI/CD (32~40분) ===
    { offset: 790, text: '다음, 접근성 관련 업데이트. WCAG 2.1 AA 기준 맞추려면 컬러 대비 일부 수정이 필요해요. 현재 대비율 3.2:1인 곳이 5군데 있는데, 4.5:1로 올려야 합니다.' },
    { offset: 815, text: '컬러만의 문제인가요, 아니면 스크린 리더 대응도 필요한가요?' },
    { offset: 830, text: '스크린 리더도 이슈가 좀 있어요. aria-label 누락이 차트 컴포넌트에 14개, 폼 필드에 8개 있습니다. 총 22개 수정 필요해요.' },
    { offset: 855, text: '중요한 포인트네요. 이번 스프린트에 접근성 태스크도 추가합시다. 법적 이슈도 될 수 있으니까 우선순위 높게 잡아요.' },
    { offset: 875, text: '그리고 CI/CD 파이프라인에 접근성 자동 체크 넣으면 좋겠는데, axe-core 같은 거요. PR마다 자동으로 돌리면 다시는 빠지지 않을 거예요.' },
    { offset: 900, text: 'GitHub Actions에 axe-core 스텝 추가하는 건 제가 해볼게요. Lighthouse CI도 같이 넣으면 성능까지 한번에 체크 가능합니다.' },
    { offset: 920, text: '좋아요. 근데 CI 시간이 너무 길어지면 안 되는데, 현재 파이프라인이 몇 분이에요?' },
    { offset: 935, text: '현재 빌드 + 테스트가 평균 4분 30초에요. axe-core 추가하면 1분 정도 늘어날 거예요.' },
    { offset: 950, text: '5분 30초면 괜찮네요. 10분 넘어가기 전까지는 수용 가능합니다.' },

    // === Part 6: 채용 & 팀 확장 (40~48분) ===
    { offset: 975, text: '마지막 안건, 채용 업데이트입니다. 시니어 프론트엔드 개발자 포지션에 지원자 12명 들어왔어요. 서류 통과가 5명이고, 이번 주에 코딩 테스트 진행합니다.' },
    { offset: 1000, text: '코딩 테스트 문제는 어떤 걸로 하나요? 지난번에 알고리즘 위주였는데 실무형으로 바꾸는 건 어떨까요?' },
    { offset: 1020, text: '맞아요. 이번에는 React 컴포넌트 구현 과제로 준비했어요. 실시간 데이터 테이블 구현인데, 페이지네이션, 정렬, 필터링 포함이에요.' },
    { offset: 1045, text: '좋네요. 우리 프로젝트랑 직접 관련 있는 과제라서 평가하기도 좋을 것 같아요. 제한 시간은요?' },
    { offset: 1060, text: '3시간으로 잡았습니다. 코드 품질, 타입스크립트 활용, 테스트 작성 여부도 평가 기준에 넣었어요.' },
    { offset: 1080, text: '면접관은 누구누구 참여하나요?' },
    { offset: 1090, text: '1차 기술 면접은 저랑 현우 씨가 하고, 2차 컬처핏은 팀장님이 직접 하시는 걸로 하죠.' },
    { offset: 1110, text: '네, 그렇게 하겠습니다. 채용 일정은 이번 달 말까지 최종 결정하는 걸로.' },
    { offset: 1130, text: '그리고 주니어 백엔드 개발자도 한 명 더 필요한 것 같아요. API 엔드포인트 작업량이 계속 늘고 있어서요.' },
    { offset: 1150, text: '그건 다음 분기 인원 계획에 넣겠습니다. 지금은 시니어 프론트엔드 채용에 집중합시다.' },

    // === Part 7: 마무리 (48~55분) ===
    { offset: 1175, text: '자, 그럼 오늘 회의 정리하겠습니다. 이번 스프린트 목표를 정리하면요.' },
    { offset: 1195, text: '첫째, REST API 5개 엔드포인트 구현. WebSocket은 다음 스프린트로 연기.' },
    { offset: 1210, text: '둘째, 컴포넌트 라이브러리 Storybook 문서화. 셋째, 접근성 수정 22건 및 컬러 대비 5건.' },
    { offset: 1230, text: '넷째, lodash 버전 업그레이드. axios는 다음 스프린트.' },
    { offset: 1245, text: '다섯째, SonarQube critical 코드 스멜 12개 처리. 민수 씨 4개, 지영 씨 5개, 현우 씨 3개.' },
    { offset: 1260, text: '여섯째, 클라이언트 데모 시나리오 금요일까지 초안 작성. 스테이징 데모 테넌트 준비.' },
    { offset: 1280, text: '일곱째, CI/CD에 axe-core + Lighthouse CI 추가.' },
    { offset: 1295, text: '여덟째, 시니어 프론트엔드 코딩 테스트 이번 주 진행.' },
    { offset: 1310, text: '혹시 빠진 거 있나요?' },
    { offset: 1320, text: '아, 대시보드 Figma 디자인 리뷰도 이번 주 내로 해주셔야 해요.' },
    { offset: 1335, text: '맞다. 아홉째, 대시보드 Figma 디자인 리뷰. 수요일까지 코멘트 남겨주세요.' },
    { offset: 1350, text: '경영진 보고에 인증 모듈 성과 수치도 넣기로 했잖아요.' },
    { offset: 1365, text: '맞습니다. 열째, 경영진 보고 자료에 인증 모듈 개선 성과 포함. 에러 96% 감소, 응답 시간 75% 단축.' },
    { offset: 1385, text: '다들 오케이? 질문 있으면 슬랙 채널에 남겨주세요.' },
    { offset: 1395, text: '네, 오케이입니다!' },
    { offset: 1400, text: '수고하셨습니다. 다음 주 같은 시간에 봐요!' },
  ];

  script.forEach((item, idx) => {
    const line = {
      id: generateId() + idx,
      text: item.text,
      timestamp: state.meetingStartTime + item.offset * 1000,
      bookmarked: idx === 3 || idx === 6 || idx === 29 || idx === 55,
    };
    state.transcript.push(line);
    addTranscriptLine(line);
  });

  const memos = [
    { text: '인증 모듈 성과: 에러 340→12건/일 (96%↓), 응답 200→50ms (75%↓)', offset: 125 },
    { text: 'WebSocket은 다음 스프린트로 연기', offset: 435 },
    { text: '클라이언트 데모: 4/15, A사 김 부장 외 3명, 핵심 기능 위주', offset: 575 },
    { text: 'axios 1.x 업그레이드 다음 스프린트 별도 태스크', offset: 415 },
    { text: 'critical 코드 스멜: 민수(인증 4), 지영(API 5), 현우(프론트 3)', offset: 485 },
    { text: '시니어 프론트엔드 채용: 서류통과 5명, 이번 주 코딩 테스트', offset: 1065 },
  ];

  memos.forEach((m, i) => {
    const memo = { id: generateId() + 'm' + i, text: m.text, timestamp: state.meetingStartTime + m.offset * 1000 };
    state.memos.push(memo);
    addMemoLine(memo);
  });

  state.tags = ['weekly', 'sprint-review', 'dashboard', 'tech-debt', 'hiring'];

  updateTimer();
  timerInterval = setInterval(updateTimer, 1000);

  $('#meetingStatus').textContent = 'Demo Mode';
  showToast('Demo data loaded - 65 transcript lines', 'success');
}

window.__loadDemo = loadDemoData;

function loadDemoData2() {
  // First load base demo transcript (65 lines, ~55min)
  loadDemoData();

  // Extend transcript — additional discussion after main meeting wrap-up
  const extraScript = [
    // === Part 8: 추가 논의 — 모니터링 & 장애 대응 (55~62분) ===
    { offset: 1420, text: '아 잠깐, 하나만 더 얘기합시다. 지난주 금요일 장애 건 후속 조치요.' },
    { offset: 1440, text: '아, 맞다. 금요일 오후 3시에 DB 커넥션 풀 고갈돼서 API 서버 3대 다 죽었죠.' },
    { offset: 1460, text: '원인이 뭐였어요? 슬랙에서 대충 보긴 했는데 자세히는 못 봤어요.' },
    { offset: 1480, text: '배치 작업이 트랜잭션을 안 닫고 커넥션을 물고 있었어요. 최대 풀 사이즈가 20인데 배치가 18개를 점유하고 있었습니다.' },
    { offset: 1505, text: '그래서 일반 API 요청이 커넥션 대기하다가 타임아웃 난 거군요.' },
    { offset: 1520, text: '네. 일단 핫픽스로 배치 쪽 커넥션 타임아웃을 30초로 걸었고, 풀 사이즈를 50으로 늘렸어요.' },
    { offset: 1545, text: '근본적으로는 배치 전용 커넥션 풀을 분리해야 하지 않나요? 같은 풀 쓰면 또 터질 수 있어요.' },
    { offset: 1565, text: '맞아요. HikariCP 설정에서 배치용 별도 DataSource 만들면 됩니다. 이번 스프린트에 넣을까요?' },
    { offset: 1585, text: '넣읍시다. 우선순위 높게요. 그리고 모니터링도 강화해야 해요. 커넥션 풀 사용률 알림이 없었잖아요.' },
    { offset: 1610, text: 'Grafana에 커넥션 풀 대시보드는 있는데, 알림 임계값 설정이 안 돼 있었어요. 80% 넘으면 슬랙 알림 가게 하겠습니다.' },
    { offset: 1630, text: 'CloudWatch 알림도 같이 걸어주세요. 슬랙 놓칠 수 있으니까 PagerDuty 연동도 검토해봐요.' },
    { offset: 1650, text: '장애 대응 런북도 업데이트해야 합니다. 현재 런북이 작년 6월 버전이에요.' },
    { offset: 1670, text: '그건 제가 이번 주에 업데이트하겠습니다. DB 장애, API 장애, 프론트 장애 시나리오별로 정리할게요.' },

    // === Part 9: 성능 최적화 논의 (62~70분) ===
    { offset: 1695, text: '장애 얘기 나온 김에, 성능 쪽도 좀 봅시다. 대시보드 초기 로딩이 요즘 느려졌다는 피드백이 있어요.' },
    { offset: 1720, text: 'Lighthouse 점수가 얼마나 나오나요? 저번에 측정했을 때 78점이었는데.' },
    { offset: 1740, text: '이번 주 측정하니까 65점까지 떨어졌어요. FCP가 3.2초, LCP가 4.8초입니다.' },
    { offset: 1760, text: '뭐가 그렇게 무거워진 거예요? 번들 사이즈 분석해봤어요?' },
    { offset: 1780, text: 'webpack-bundle-analyzer 돌려봤는데, chart.js가 500KB, moment.js가 300KB 차지하고 있어요.' },
    { offset: 1800, text: 'moment.js는 dayjs로 교체합시다. 2KB밖에 안 되잖아요. chart.js는 트리쉐이킹 적용하면 반으로 줄일 수 있어요.' },
    { offset: 1825, text: '이미지 최적화도 필요해요. 히어로 배너가 2.4MB PNG예요. WebP로 변환하면 200KB까지 줄일 수 있습니다.' },
    { offset: 1845, text: '코드 스플리팅은요? 대시보드 페이지에서 안 쓰는 모듈까지 전부 로딩되고 있는 것 같은데.' },
    { offset: 1865, text: 'React.lazy로 라우트별 스플리팅 적용하면 초기 번들이 40%는 줄어들 겁니다. 보고서 모듈이 특히 무거워요.' },
    { offset: 1885, text: '좋아요. 성능 개선 태스크 정리하면: moment→dayjs, chart.js 트리쉐이킹, 이미지 WebP, 코드 스플리팅. 이 네 가지.' },
    { offset: 1910, text: '우선순위는 이미지 WebP가 제일 빠르고 효과 크니까 1순위, 그다음 moment→dayjs, 코드 스플리팅, chart.js 순서요.' },

    // === Part 10: 보안 감사 & 컴플라이언스 (70~78분) ===
    { offset: 1935, text: '한 가지 더. 다음 달에 보안 감사가 있어요. SOC 2 Type II 준비해야 합니다.' },
    { offset: 1955, text: '작년 감사 때 지적 사항이 뭐였죠? 그거 다 해결했나요?' },
    { offset: 1975, text: '로그 보관 기간이 30일이었는데 90일로 늘리라는 거랑, MFA 강제 적용이 안 돼 있다는 거였어요.' },
    { offset: 2000, text: '로그 보관은 S3 라이프사이클 정책으로 90일 설정 완료했고, MFA는 Okta에서 강제 적용했습니다. 12월에.' },
    { offset: 2025, text: '그럼 작년 지적 사항은 해결된 거네요. 올해 새로 봐야 할 건요?' },
    { offset: 2045, text: '개인정보 암호화 범위 확인이 필요해요. 이메일, 전화번호는 AES-256으로 암호화돼 있는데, 주소 필드가 평문이에요.' },
    { offset: 2070, text: '주소도 개인정보니까 암호화 대상이죠. 마이그레이션 스크립트 짜야겠네요. 기존 데이터가 얼마나 돼요?' },
    { offset: 2090, text: '약 12만 건입니다. 배치로 돌리면 2시간 정도 걸릴 것 같아요. 다운타임 없이 가능합니다.' },
    { offset: 2110, text: 'API 엔드포인트 인증 검사도 다시 해봐야 해요. 작년에 내부 어드민 API 3개가 인증 없이 열려 있었거든요.' },
    { offset: 2130, text: '지금은 전부 JWT 검증 미들웨어 통과하게 바꿨는데, 새로 추가된 API가 20개 넘으니까 전수 검사 필요합니다.' },
    { offset: 2155, text: '자동화된 API 보안 스캔 도구를 CI에 넣읍시다. OWASP ZAP이나 Burp Suite 커뮤니티 쓰면 되지 않나요?' },
    { offset: 2175, text: 'OWASP ZAP이 CI 연동이 쉬워요. GitHub Actions에 플러그인 있습니다. 이번 스프린트에 세팅하겠습니다.' },

    // === Part 11: 팀 문화 & 프로세스 개선 (78~85분) ===
    { offset: 2200, text: '기술 얘기는 여기까지 하고, 팀 프로세스 개선 건도 잠깐 논의합시다.' },
    { offset: 2220, text: '코드 리뷰 병목이 심해요. PR 올리고 리뷰 받기까지 평균 2.3일 걸리고 있어요.' },
    { offset: 2240, text: '리뷰어 자동 배정이 안 돼 있어서 그래요. CODEOWNERS 파일 설정하고 PR 올리면 자동으로 2명 배정되게 합시다.' },
    { offset: 2260, text: '리뷰 SLA도 정합시다. PR 올라오면 24시간 이내 최소 1차 리뷰. 어때요?' },
    { offset: 2280, text: '동의합니다. 그리고 PR 사이즈도 제한하면 좋겠어요. 파일 10개 이상이면 쪼개라고 가이드라인을.' },
    { offset: 2300, text: '맞아요. 저번에 PR 하나에 파일 47개 바뀐 거 리뷰하느라 반나절 날렸어요.' },
    { offset: 2320, text: '페어 프로그래밍도 주 1회 정도 하면 어떨까요? 지식 공유도 되고 리뷰 부담도 줄어들 것 같아요.' },
    { offset: 2340, text: '좋은 아이디어네요. 화요일 오후에 2시간 페어 프로그래밍 슬롯 잡읍시다.' },
    { offset: 2360, text: '스프린트 회고도 형식적으로 하지 말고 제대로 합시다. 매번 "잘했다, 다음에도 잘하자"로 끝나잖아요.' },
    { offset: 2385, text: '그래요. 이번부터 KPT 프레임워크 쓰겠습니다. Keep, Problem, Try 각각 3개씩 필수로 적어오기.' },

    // === Part 12: 최종 마무리 (85~90분) ===
    { offset: 2410, text: '자, 추가 논의까지 정리하면. 장애 후속 조치, 성능 최적화, 보안 감사, 프로세스 개선까지.' },
    { offset: 2430, text: '스프린트 목표가 원래 10개였는데 추가로 더 늘어난 건 아닌가요?' },
    { offset: 2450, text: '장애 후속은 핫이슈라 별도 트랙으로 가고, 보안 감사는 다음 달이니까 이번 스프린트에선 준비만. 성능 최적화는 이미지 WebP 변환만 이번에.' },
    { offset: 2475, text: '프로세스 개선은 CODEOWNERS 설정이랑 리뷰 SLA 적용만 이번 스프린트에 하죠.' },
    { offset: 2495, text: '그러면 추가 태스크는: 배치 커넥션 풀 분리, Grafana 알림 설정, 런북 업데이트, 이미지 WebP, CODEOWNERS, 리뷰 SLA. 6개.' },
    { offset: 2520, text: '기존 10개에 6개 추가면 16개인데, 좀 많지 않나요?' },
    { offset: 2540, text: 'CODEOWNERS랑 리뷰 SLA는 설정만 하면 되니까 30분이면 끝나요. 실질적으로 4개 추가라고 보면 됩니다.' },
    { offset: 2560, text: '알겠습니다. 그러면 이번 스프린트 총 14개 태스크로 확정. 우선순위는 장애 후속 > 기존 목표 > 성능 순서.' },
    { offset: 2580, text: '질문이나 우려사항 있으면 슬랙 #dev-team 채널에요. 다들 수고하셨습니다!' },
    { offset: 2595, text: '수고하셨습니다! 이번 주도 파이팅!' },
  ];

  extraScript.forEach((item, idx) => {
    const line = {
      id: generateId() + 'e' + idx,
      text: item.text,
      timestamp: state.meetingStartTime + item.offset * 1000,
      bookmarked: idx === 0 || idx === 25 || idx === 39,
    };
    state.transcript.push(line);
    addTranscriptLine(line);
  });

  // Additional memos for extended discussion
  const extraMemos = [
    { text: '장애 원인: 배치가 DB 커넥션 18/20개 점유 → 풀 고갈', offset: 1490 },
    { text: '성능: FCP 3.2s, LCP 4.8s — moment.js(300KB) + chart.js(500KB) 문제', offset: 1770 },
    { text: 'SOC 2 감사 대비: 주소 필드 암호화 + API 전수 보안 검사 필요', offset: 2050 },
    { text: '코드 리뷰 SLA: 24시간 이내 1차 리뷰, PR 파일 10개 이하', offset: 2270 },
  ];

  extraMemos.forEach((m, i) => {
    const memo = { id: generateId() + 'em' + i, text: m.text, timestamp: state.meetingStartTime + m.offset * 1000 };
    state.memos.push(memo);
    addMemoLine(memo);
  });

  state.meetingStartTime = Date.now() - 90 * 60000;
  showToast('Demo 2 loaded — extended transcript (115 lines, ~90min)', 'success');
}

// ===== Compare Prompts =====
function openCompareModal() {
  const modal = $('#compareModal');
  modal.hidden = false;

  // Populate select options with built-in + custom presets
  const builtIn = getPromptPresets();
  const custom = state.settings.customPromptPresets || {};

  [['compareSelectA', 'compareTextA'], ['compareSelectB', 'compareTextB']].forEach(([selId, textId], idx) => {
    const sel = $(`#${selId}`);
    sel.innerHTML = '';
    // Current prompt option
    const currentOpt = document.createElement('option');
    currentOpt.value = '__current__';
    currentOpt.textContent = t('compare.current_prompt');
    sel.appendChild(currentOpt);
    // Built-in presets
    Object.entries(builtIn).forEach(([key, { name }]) => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = name;
      sel.appendChild(opt);
    });
    // Custom presets
    Object.keys(custom).forEach(name => {
      const opt = document.createElement('option');
      opt.value = '__custom__' + name;
      opt.textContent = '\u2605 ' + name;
      sel.appendChild(opt);
    });

    // Default: A = current, B = first non-default preset
    if (idx === 0) {
      sel.value = '__current__';
    } else {
      const keys = Object.keys(builtIn);
      sel.value = keys.length > 1 ? keys[1] : '__current__';
    }

    // Set textarea from selection
    const updateText = () => {
      const ta = $(`#${textId}`);
      const val = sel.value;
      if (val === '__current__') {
        ta.value = state.settings.customPrompt || getDefaultPrompt();
      } else if (val.startsWith('__custom__')) {
        ta.value = custom[val.slice('__custom__'.length)] || '';
      } else {
        const preset = builtIn[val];
        ta.value = (preset && preset.prompt) || getDefaultPrompt();
      }
    };
    updateText();
    sel.onchange = updateText;
  });

  // Clear previous results
  $('#compareResultA').innerHTML = '';
  $('#compareResultB').innerHTML = '';
}

async function runCompareAnalysis() {
  if (state.transcript.length === 0) {
    showToast(t('toast.no_transcript'), 'warning');
    return;
  }
  if (!isProxyAvailable()) {
    showToast(t('toast.no_api_key'), 'warning');
    return;
  }

  const btn = $('#btnRunCompare');
  const origText = btn.textContent;
  btn.textContent = t('compare.running');
  btn.disabled = true;

  const promptA = $('#compareTextA').value;
  const promptB = $('#compareTextB').value;

  const resultA = $('#compareResultA');
  const resultB = $('#compareResultB');
  resultA.innerHTML = '<div class="skeleton-section"></div>';
  resultB.innerHTML = '<div class="skeleton-section"></div>';

  const lastAnalysis = state.analysisHistory.length > 0
    ? state.analysisHistory[state.analysisHistory.length - 1]
    : null;
  const previousSummary = lastAnalysis
    ? (lastAnalysis.markdown || lastAnalysis.summary || '')
    : null;

  const baseOpts = {
    transcript: state.transcript,
    meetingContext: state.settings.meetingContext,
    meetingPreset: state.settings.meetingPreset,
    elapsedTime: getElapsedTimeStr(),
    strategy: state.settings.tokenStrategy || 'smart',
    recentMinutes: state.settings.recentMinutes || 5,
    previousSummary,
    userInsights: state.userInsights,
    memos: state.memos,
    userProfile: buildFullProfile(),
    model: state.settings.geminiModel || 'gemini-2.5-flash',
  };

  const progress = $('#compareProgress');
  const btnDefaultA = $('#btnSetDefaultA');
  const btnDefaultB = $('#btnSetDefaultB');
  btnDefaultA.style.display = 'none';
  btnDefaultB.style.display = 'none';
  progress.textContent = t('compare.running');

  const taskA = analyzeTranscript({ ...baseOpts, prompt: promptA });
  const taskB = analyzeTranscript({ ...baseOpts, prompt: promptB });

  // Track individual completion for progress
  let aDone = false, bDone = false;
  taskA.then(r => { aDone = true; if (!bDone) progress.textContent = t('compare.progress_a_done'); return r; });
  taskB.then(r => { bDone = true; if (!aDone) progress.textContent = t('compare.progress_b_done'); return r; });

  const results = await Promise.allSettled([taskA, taskB]);

  if (results[0].status === 'fulfilled') {
    renderAnalysisInto(resultA, results[0].value);
    btnDefaultA.style.display = '';
  } else {
    resultA.innerHTML = `<p class="text-muted">${t('compare.error')}: ${results[0].reason?.message || ''}</p>`;
  }

  if (results[1].status === 'fulfilled') {
    renderAnalysisInto(resultB, results[1].value);
    btnDefaultB.style.display = '';
  } else {
    resultB.innerHTML = `<p class="text-muted">${t('compare.error')}: ${results[1].reason?.message || ''}</p>`;
  }

  progress.textContent = '';
  btn.textContent = origText;
  btn.disabled = false;
}

function applyComparePromptAsDefault(promptText) {
  state.settings.customPrompt = promptText;
  saveSettings(state.settings);
  const textPrompt = $('#textPrompt');
  if (textPrompt) textPrompt.value = promptText;
  showToast(t('compare.set_default_success'), 'success');
}

document.addEventListener('DOMContentLoaded', init);
