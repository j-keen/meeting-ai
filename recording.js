// recording.js - Recording lifecycle, STT, analysis, correction, auto-save, idle detection

import { state, on, emit } from './event-bus.js';
import { createSTT } from './stt.js';
import { startAudioRecording, stopAudioRecording, hasRecording, recoverChunks, getCurrentRecordingSize } from './audio-recorder.js';
import { analyzeTranscript, correctSentences, generateMeetingTitle, generateFinalMinutes, suggestMeetingMetadata } from './ai.js';
import { isProxyAvailable } from './gemini-api.js';
import {
  saveMeeting, getMeeting, loadSettings, saveSettings,
  loadContacts, addContact, loadLocations, addLocation,
  getLocationFrequency, linkMeetings,
  loadCorrectionDict, addCorrectionEntry,
  getProUsageCount, incrementProUsage,
} from './storage.js';
import {
  showToast, showCenterToast, showWhisperToast,
  addTranscriptLine, showInterim, clearInterim,
  showAnalysisSkeletons, renderAnalysis, renderHighlights,
  updateTranscriptLineUI, removeTranscriptLineUI,
  showTranscriptConnecting, showTranscriptWaiting, hideTranscriptWaiting, resetTranscriptEmpty,
  showAiWaiting, hideAiWaiting, resetAiEmpty,
  showChatWaiting, resetChatEmpty,
  addMemoLine, getAnalysisAsText,
} from './ui.js';
import { t, getDateLocale, getAiLanguage } from './i18n.js';
import { showLauncherModal } from './launcher.js';
import { loadChatHistory } from './chat.js';

const $ = (sel) => document.querySelector(sel);

export function buildFullProfile() {
  return state.settings.userProfile || '';
}

function buildCategoryHints() {
  return {};
}

// ===== Core Logic =====
let stt = null;
let timerInterval = null;
let autoSaveInterval = null;
let autoAnalysisInterval = null;
let isAnalyzing = false;
let isCorrecting = false;
let charsSinceLastAnalysis = 0;
let linesSinceLastAnalysis = 0;
let lastAnalysisTimestamp = 0;
let charsSinceLastCorrection = 0;

// Pause tracking
let pausedDuration = 0;
let pauseStartTime = null;

// Guard: idle detection + max duration
const IDLE_WARNING_MS = 15 * 60 * 1000;
const IDLE_AUTOPAUSE_MS = 20 * 60 * 1000;
const MAX_RECORDING_MS = 6 * 60 * 60 * 1000;
let lastTranscriptTime = 0;
let idleCheckInterval = null;
let idleWarningShown = false;
let maxDurationTimeout = null;
let audioSizeInterval = null;


// ===== Draft Recovery (sessionStorage + localStorage crash recovery) =====
const DRAFT_KEY = 'meeting-ai-draft';
const ACTIVE_SESSION_KEY = 'meeting-ai-active-session';
let draftSaveInterval = null;

function buildDraftData() {
  return {
    meetingId: state.meetingId,
    meetingTitle: state.meetingTitle,
    meetingStartTime: state.meetingStartTime,
    meetingLocation: state.meetingLocation,
    transcript: state.transcript,
    memos: state.memos,
    chatHistory: state.chatHistory,
    analysisHistory: state.analysisHistory,
    currentAnalysis: state.currentAnalysis,
    userInsights: state.userInsights,
    tags: state.tags,
    starRating: state.starRating,
    categories: state.categories,
    participants: state.participants,
    settings: { meetingPreset: state.settings.meetingPreset, meetingContext: state.settings.meetingContext },
    pausedDuration: getTotalPausedMs(),
    savedAt: Date.now(),
  };
}

function saveDraft() {
  if (!state.meetingId) return;
  const hasContent = state.transcript.length > 0 || state.memos.length > 0 || state.chatHistory.length > 0;
  if (!hasContent) return;
  try {
    const draft = buildDraftData();
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch { /* ignore quota errors */ }
}

// Save active session to localStorage (survives browser crash)
export function saveActiveSession() {
  if (!state.meetingId) return;
  const hasContent = state.transcript.length > 0 || state.memos.length > 0 || state.chatHistory.length > 0;
  if (!hasContent) return;
  try {
    const data = buildDraftData();
    data.isActiveSession = true;
    localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(data));
  } catch { /* ignore quota errors */ }
}

function clearActiveSession() {
  try { localStorage.removeItem(ACTIVE_SESSION_KEY); } catch { /* ignore */ }
}

export function clearDraftRecovery() {
  sessionStorage.removeItem(DRAFT_KEY);
  clearActiveSession();
  if (draftSaveInterval) { clearInterval(draftSaveInterval); draftSaveInterval = null; }
}

function startDraftSaving() {
  if (draftSaveInterval) clearInterval(draftSaveInterval);
  draftSaveInterval = setInterval(() => {
    saveDraft();
    saveActiveSession();
  }, 15000); // every 15s
}

export function checkDraftRecovery() {
  // Priority 1: sessionStorage draft (normal refresh — more recent)
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (raw) {
      const draft = JSON.parse(raw);
      if (Date.now() - draft.savedAt <= 12 * 60 * 60 * 1000) {
        showDraftRecoveryBanner(draft, 'session');
        return;
      }
      sessionStorage.removeItem(DRAFT_KEY);
    }
  } catch { sessionStorage.removeItem(DRAFT_KEY); }

  // Priority 2: localStorage active session (crash recovery)
  try {
    const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
    if (!raw) return;
    const session = JSON.parse(raw);
    // Only recover if less than 6 hours old (max meeting duration)
    if (Date.now() - session.savedAt > MAX_RECORDING_MS) {
      clearActiveSession();
      return;
    }
    // Multi-tab guard: check if another tab is already running this meeting
    // Use a brief lock check via sessionStorage
    const tabLockKey = 'meeting-ai-tab-' + session.meetingId;
    if (sessionStorage.getItem(tabLockKey)) return; // this tab already has it
    showDraftRecoveryBanner(session, 'crash');
  } catch { clearActiveSession(); }
}

function showDraftRecoveryBanner(draft, source) {
  const existing = $('#draftRecoveryBanner');
  if (existing) existing.remove();

  const timeStr = new Date(draft.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const lines = draft.transcript?.length || 0;
  const isCrashRecovery = source === 'crash';

  const banner = document.createElement('div');
  banner.id = 'draftRecoveryBanner';
  banner.className = 'draft-recovery-banner';

  const message = isCrashRecovery
    ? t('draft.crash_recovery_message', { time: timeStr, lines })
    : t('draft.recovery_message', { time: timeStr, lines });

  banner.innerHTML = `
    <span>${message}</span>
    <div class="draft-recovery-actions">
      <button class="btn btn-sm btn-primary" id="btnDraftRecover">${t('draft.recover')}</button>
      ${isCrashRecovery ? `<button class="btn btn-sm" id="btnDraftSaveEnd" style="border:1px solid var(--accent)">${t('draft.save_and_end')}</button>` : ''}
    </div>
  `;
  document.body.prepend(banner);

  $('#btnDraftRecover').onclick = () => {
    banner.remove();
    recoverDraft(draft, source);
  };
  if (isCrashRecovery) {
    const saveEndBtn = $('#btnDraftSaveEnd');
    if (saveEndBtn) {
      saveEndBtn.onclick = () => {
        banner.remove();
        recoverDraft(draft, source);
        // Go directly to end meeting modal
        setTimeout(() => proceedEndMeeting(), 100);
      };
    }
  }
}

function recoverDraft(draft, source) {
  sessionStorage.removeItem(DRAFT_KEY);
  if (source === 'crash') clearActiveSession();

  state.meetingId = draft.meetingId;
  state.meetingTitle = draft.meetingTitle || '';
  state.meetingStartTime = draft.meetingStartTime;
  pausedDuration = draft.pausedDuration || 0;
  pauseStartTime = null;
  state.meetingLocation = draft.meetingLocation || '';
  state.transcript = draft.transcript || [];
  state.memos = draft.memos || [];
  state.chatHistory = draft.chatHistory || [];
  state.analysisHistory = draft.analysisHistory || [];
  state.currentAnalysis = draft.currentAnalysis || null;
  state.userInsights = draft.userInsights || [];
  state.tags = draft.tags || [];
  state.starRating = draft.starRating || 3;
  state.categories = draft.categories || [];
  state.participants = draft.participants || [];
  if (draft.settings) {
    if (draft.settings.meetingPreset) state.settings.meetingPreset = draft.settings.meetingPreset;
    if (draft.settings.meetingContext) state.settings.meetingContext = draft.settings.meetingContext;
  }

  // Multi-tab lock: mark this tab as owning this meeting
  sessionStorage.setItem('meeting-ai-tab-' + state.meetingId, '1');

  // Render recovered transcript
  state.transcript.forEach(line => addTranscriptLine(line));
  // Render recovered memos
  state.memos.forEach(memo => addMemoLine(memo));
  // Render recovered chat history
  loadChatHistory();
  // Render analysis if available
  if (state.currentAnalysis) renderAnalysis(state.currentAnalysis);
  // Show meeting as paused (user can resume or save)
  state.meetingEnded = true;
  const titleInput = $('#meetingTitleInput');
  if (titleInput) { titleInput.value = state.meetingTitle; titleInput.hidden = false; }

  // Restore timer display
  if (state.meetingStartTime) {
    const diff = draft.savedAt - state.meetingStartTime - (draft.pausedDuration || 0);
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    $('#meetingTimer').textContent =
      `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  } else {
    $('#meetingTimer').textContent = '00:00:00';
  }

  const draftPill = $('#meetingPill');
  draftPill.hidden = false;
  draftPill.classList.remove('recording');
  draftPill.classList.add('paused');
  $('#meetingStatus').textContent = source === 'crash'
    ? t('draft.crash_recovered_status')
    : t('draft.recovered_status');

  // Show post-end buttons so user can resume or save
  const endBtn = $('#btnEndMeeting');
  endBtn.hidden = false;

  // Hide launcher if showing
  const launcher = $('#launcherModal');
  if (launcher) launcher.hidden = true;

  const toastMsg = source === 'crash'
    ? t('toast.crash_recovered')
    : t('toast.draft_recovered');
  showToast(toastMsg, 'success');
}

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function getTotalPausedMs() {
  return pausedDuration + (pauseStartTime ? Date.now() - pauseStartTime : 0);
}

function updateTimer() {
  if (!state.meetingStartTime) return;
  const diff = Date.now() - state.meetingStartTime - getTotalPausedMs();
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  $('#meetingTimer').textContent =
    `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  // Native app bridge: update foreground notification timer (every 10s to avoid notification spam)
  if (window.__nativeBridge?.isNative && window.ReactNativeWebView) {
    const elapsedSec = Math.floor(diff / 1000);
    if (elapsedSec % 10 === 0) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'updateTimer', elapsed: elapsedSec, title: state.meetingTitle || 'Meeting AI'
      }));
    }
  }
}

export function getElapsedTimeStr() {
  if (!state.meetingStartTime) return 'unknown';
  // In loaded mode, use last transcript timestamp instead of current time
  if (state.loadedMeetingId && state.transcript.length > 0) {
    const lastTs = state.transcript[state.transcript.length - 1].timestamp;
    const diff = lastTs - state.meetingStartTime;
    const mins = Math.floor(diff / 60000);
    return t('minutes', { n: mins });
  }
  const diff = Date.now() - state.meetingStartTime - getTotalPausedMs();
  const mins = Math.floor(diff / 60000);
  return t('minutes', { n: mins });
}

export async function resumeFromLoaded() {
  if (state.isRecording || !state.loadedMeetingId) return;

  // Calculate pause gap: time between last transcript/memo and now
  const timestamps = [
    ...state.transcript.map(l => l.timestamp),
    ...state.memos.map(m => m.timestamp),
  ].filter(Boolean);
  const lastActivity = timestamps.length > 0 ? Math.max(...timestamps) : state.meetingStartTime;
  pausedDuration += Date.now() - lastActivity;
  pauseStartTime = null;

  // Exit loaded mode
  state.loadedMeetingId = null;
  state.loadedMeetingOriginal = null;
  const banner = document.querySelector('#loadedMeetingBanner');
  if (banner) banner.hidden = true;
  document.body.classList.remove('loaded-mode');
  const editInfoBtn = document.querySelector('#btnEditSaveInfo');
  if (editInfoBtn) editInfoBtn.remove();
  const bottomResume = document.querySelector('#btnBottomResume');
  if (bottomResume) bottomResume.remove();

  // Start recording (meetingId & meetingStartTime already set, so no new ID created)
  await startRecording();
}

export async function startRecording() {
  if (state.isRecording) return;
  if (state.loadedMeetingId) return; // Cannot record while a past meeting is loaded

  stt = createSTT();

  try {
    await stt.start({
      language: state.settings.language || 'ko',
      onRecordingStream: (stream) => {
        if (state.settings.audioRecording) {
          startAudioRecording(state.meetingId, stream);
          state._audioRecordingActive = true;
        } else {
          stream.getTracks().forEach(tr => tr.stop());
        }
      },
      onInterim: (text) => {
        showInterim(text);
      },
      onFinal: (text) => {
        const line = {
          id: generateId(),
          text,
          timestamp: Date.now(),
          bookmarked: false,
        };
        state.transcript.push(line);
        addTranscriptLine(line);
        emit('transcript:add', line);
        checkCharThreshold(text);
        lastTranscriptTime = Date.now();
        idleWarningShown = false;
      },
      onReplace: (text) => {
        // Mobile: replace last transcript line instead of creating a new one
        const lastLine = state.transcript[state.transcript.length - 1];
        if (lastLine) {
          lastLine.text = text;
          lastLine.timestamp = Date.now();
          updateTranscriptLineUI(lastLine.id);
          lastTranscriptTime = Date.now();
        }
      },
      onError: (err) => {
        showToast(err, 'error');
      },
      onConnecting: () => {
        showTranscriptConnecting();
      },
      onConnected: (engine) => {
        showTranscriptWaiting();
        showToast(t('stt.connected'), 'success');
        // Show engine badge
        const badge = document.querySelector('#sttEngineBadge');
        if (badge) {
          badge.textContent = engine === 'deepgram' ? 'DG' : 'WS';
          badge.title = engine === 'deepgram' ? 'Deepgram Nova-2' : 'Web Speech API';
          badge.hidden = false;
        }
      },
    });

    // Set recording state only AFTER stt.start() succeeds
    state.isRecording = true;
    emit('recording:started');
    // Native app bridge: start foreground service
    if (window.__nativeBridge?.isNative && window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'recordingStarted', title: state.meetingTitle || 'Meeting AI'
      }));
    }

    if (!state.meetingStartTime) {
      state.meetingStartTime = Date.now();
      state.meetingId = generateId();
    } else if (pauseStartTime) {
      pausedDuration += Date.now() - pauseStartTime;
      pauseStartTime = null;
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
    startDraftSaving();

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
    const pill = $('#meetingPill');
    pill.hidden = false;
    pill.classList.remove('paused');
    pill.classList.add('recording');
    $('#meetingStatus').textContent = t('record.status_recording');
    $('#btnEndMeeting').hidden = false;

    // Show audio recording badge in pill
    if (state._audioRecordingActive) {
      const recBadge = $('#audioRecBadge');
      if (recBadge) recBadge.hidden = false;
      updateAudioRecBadge();
      if (audioSizeInterval) clearInterval(audioSizeInterval);
      audioSizeInterval = setInterval(updateAudioRecBadge, 10000);
    }

    showAiWaiting(state.settings.analysisCharThreshold || 1000);
    showChatWaiting();
    showToast(t('toast.recording_started'), 'success');

  } catch (err) {
    stt?.stop();
    stt = null;
    state.isRecording = false;
    showToast(t('toast.record_fail') + err.message, 'error');
  }
}

// Mobile: restart STT when returning from background
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible') return;
  if (!state.isRecording || !stt) return;

  // If STT died while in background (isRunning got reset by fatal error), restart it
  if (!stt.isRunning) {
    console.log('[Recording] Page visible — STT died in background, restarting...');
    stt.stop();
    stt = createSTT();
    try {
      await stt.start({
        language: state.settings.language || 'ko',
        onRecordingStream: () => {},  // skip recording stream on restart
        onInterim: (text) => { showInterim(text); },
        onFinal: (text) => {
          const line = {
            id: generateId(),
            text,
            timestamp: Date.now(),
            bookmarked: false,
          };
          state.transcript.push(line);
          addTranscriptLine(line);
          emit('transcript:add', line);
          lastTranscriptTime = Date.now();
        },
        onReplace: (text) => {
          const lastLine = state.transcript[state.transcript.length - 1];
          if (lastLine) {
            lastLine.text = text;
            lastLine.timestamp = Date.now();
            updateTranscriptLineUI(lastLine.id);
            lastTranscriptTime = Date.now();
          }
        },
        onError: (err) => { showToast(err, 'error'); },
        onConnecting: () => {},
        onConnected: (engine) => {
          showToast(t('stt.reconnected') || t('stt.connected'), 'success');
        },
      });
    } catch (err) {
      showToast(t('toast.record_fail') + err.message, 'error');
    }
  }
});

export async function stopRecording() {
  if (!state.isRecording) return;

  stt?.stop();
  stt = null;
  state.isRecording = false;
  emit('recording:stopped');
  // Native app bridge: stop foreground service
  if (window.__nativeBridge?.isNative && window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'recordingStopped' }));
  }

  // Stop audio recording if active
  if (state._audioRecordingActive) {
    await stopAudioRecording().catch(() => {});
    state._audioRecordingActive = false;
  }
  pauseStartTime = Date.now();
  clearInterim();

  clearInterval(timerInterval);
  clearInterval(autoSaveInterval);
  clearInterval(autoAnalysisInterval);
  clearInterval(idleCheckInterval);
  clearTimeout(maxDurationTimeout);
  charsSinceLastAnalysis = 0;
  linesSinceLastAnalysis = 0;
  charsSinceLastCorrection = 0;

  const btn = $('#btnRecord');
  btn.classList.remove('recording');
  btn.classList.add('paused');
  btn.querySelector('.record-label').textContent = t('record.paused');
  const pill = $('#meetingPill');
  pill.classList.remove('recording');
  pill.classList.add('paused');
  $('#meetingStatus').textContent = t('record.status_paused');
  const badge = $('#sttEngineBadge');
  if (badge) badge.hidden = true;
  const recBadge = $('#audioRecBadge');
  if (recBadge) recBadge.hidden = true;
  if (audioSizeInterval) { clearInterval(audioSizeInterval); audioSizeInterval = null; }

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
  if (!state.settings.autoAnalysis) return;
  charsSinceLastAnalysis = 0;
  linesSinceLastAnalysis = 0;
  lastAnalysisTimestamp = Date.now();
  charsSinceLastCorrection = 0;
  // 10-minute fallback timer: run analysis if at least 3 lines accumulated
  autoAnalysisInterval = setInterval(() => {
    if (state.isRecording && linesSinceLastAnalysis >= 3) runAnalysis();
  }, 10 * 60 * 1000);
}

function checkCharThreshold(newLineText) {
  if (!state.settings.autoAnalysis) return;
  charsSinceLastAnalysis += newLineText.length;
  linesSinceLastAnalysis++;
  charsSinceLastCorrection += newLineText.length;

  const threshold = state.settings.analysisCharThreshold || 1000;
  // Analysis trigger: enough chars AND at least 5 lines
  if (charsSinceLastAnalysis >= threshold && linesSinceLastAnalysis >= 5) {
    charsSinceLastAnalysis = 0;
    linesSinceLastAnalysis = 0;
    lastAnalysisTimestamp = Date.now();
    runAnalysis();
  }

  // Correction trigger: every 2000 chars
  if (charsSinceLastCorrection >= 2000 && state.settings.autoCorrection) {
    charsSinceLastCorrection = 0;
    runCorrection(true);
  }
}

function onAnalysisComplete() {
  charsSinceLastAnalysis = 0;
  linesSinceLastAnalysis = 0;
  lastAnalysisTimestamp = Date.now();
}

// AI sentence correction (triggered by char threshold in checkCharThreshold)
function startAiCorrection() {
  charsSinceLastCorrection = 0;
}

export async function runCorrection(uncorrectedOnly) {
  if (isCorrecting || !isProxyAvailable()) return;
  isCorrecting = true;
  try {
    const lines = uncorrectedOnly
      ? state.transcript.filter(l => !l.originalText)
      : state.transcript;
    if (lines.length === 0) return;

    const correctionDict = loadCorrectionDict();
    const batchSize = 20;
    for (let i = 0; i < lines.length; i += batchSize) {
      const batch = lines.slice(i, i + batchSize);
      const corrections = await correctSentences({
        lines: batch,
        model: 'gemini-2.5-flash-lite',
        correctionDict,
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

export async function runAnalysis() {
  if (isAnalyzing) return;
  if (!isProxyAvailable()) {
    showToast(t('toast.no_api_key'), 'warning');
    return;
  }
  if (state.transcript.length === 0 && state.memos.length === 0 && state.chatHistory.length === 0) {
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

    // Build combined meeting context: settings context + user analysis context
    let combinedContext = state.settings.meetingContext || '';
    if (state.analysisContext) {
      combinedContext = combinedContext
        ? combinedContext + '\n\n[User Analysis Context]\n' + state.analysisContext
        : state.analysisContext;
    }

    // Include user corrections from previous analysis (one-shot)
    const corrections = state.analysisCorrections.length > 0
      ? [...state.analysisCorrections]
      : [];

    // Collect block memos from current analysis
    const blockMemos = (state.currentAnalysis && state.currentAnalysis.blockMemos)
      ? state.currentAnalysis.blockMemos.filter(m => m.memo)
      : [];

    // Streaming preview: show markdown as it arrives
    const aiContainer = document.querySelector('#aiSections');
    let streamPreviewEl = null;
    let _renderMd = null;

    const result = await analyzeTranscript({
      transcript: state.transcript,
      prompt: state.settings.customPrompt,
      meetingContext: combinedContext,
      meetingPreset: state.settings.meetingPreset,
      elapsedTime: getElapsedTimeStr(),
      strategy: 'full',
      recentMinutes: 5,
      previousSummary,
      userInsights: state.userInsights,
      memos: state.memos,
      chatHistory: state.chatHistory,
      userProfile: buildFullProfile(),
      model: state.settings.geminiModel || 'gemini-2.5-flash',
      userCorrections: corrections,
      blockMemos,
      metadata: {
        datetime: state.meetingStartTime,
        location: state.meetingLocation || '',
        participants: state.participants || [],
        description: state.meetingDescription || '',
      },
      onStream: (textSoFar) => {
        if (!aiContainer) return;
        if (!streamPreviewEl) {
          aiContainer.innerHTML = '';
          aiContainer.classList.remove('ai-updating');
          streamPreviewEl = document.createElement('div');
          streamPreviewEl.className = 'ai-markdown-content ai-streaming';
          aiContainer.appendChild(streamPreviewEl);
        }
        if (_renderMd) {
          streamPreviewEl.innerHTML = _renderMd(textSoFar);
          aiContainer.scrollTop = aiContainer.scrollHeight;
        } else {
          import('./chat.js').then(({ renderMarkdown }) => {
            _renderMd = renderMarkdown;
            streamPreviewEl.innerHTML = renderMarkdown(textSoFar);
            aiContainer.scrollTop = aiContainer.scrollHeight;
          });
        }
      },
    });

    // Clear corrections after they've been sent (one-shot)
    if (corrections.length > 0) {
      state.analysisCorrections = [];
    }

    state.currentAnalysis = result;
    result.transcriptLength = state.transcript.length;
    state.analysisHistory.push(result);
    renderAnalysis(result);

    // Show whisper toasts
    if (result.whispers && result.whispers.length > 0) {
      if (!state.whisperHistory) state.whisperHistory = [];
      result.whispers.forEach((w, i) => {
        state.whisperHistory.push({ text: w, timestamp: Date.now(), analysisIndex: state.analysisHistory.length - 1 });
        setTimeout(() => showWhisperToast(w), i * 400);
      });
    }

    emit('analysis:complete', result);
  } catch (err) {
    const msg = err.status === 429
      ? t('toast.rate_limit')
      : t('toast.analysis_fail') + err.message;
    showToast(msg, 'error');
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
    onAnalysisComplete();
  }
}

export function autoSave() {
  if (!state.meetingId) return;
  const defaultTitle = t('meeting_title', { date: new Date(state.meetingStartTime).toLocaleDateString(getDateLocale()), time: new Date(state.meetingStartTime).toLocaleTimeString(getDateLocale(), { hour: '2-digit', minute: '2-digit' }) });
  const meeting = {
    id: state.meetingId,
    title: state.meetingTitle || defaultTitle,
    startTime: state.meetingStartTime,
    duration: getElapsedTimeStr(),
    preset: state.settings.meetingPreset || 'copilot',
    location: state.meetingLocation || '',
    meetingContext: state.settings.meetingContext || '',
    analysisContext: state.analysisContext || '',
    transcript: state.transcript,
    memos: state.memos,
    analysisHistory: state.analysisHistory,
    chatHistory: state.chatHistory,
    userInsights: state.userInsights,
    tags: state.tags,
    starRating: state.starRating,
    categories: state.categories,
    participants: state.participants,
    whisperHistory: state.whisperHistory || [],
    documents: state.documents || [],
    interrupted: !state.meetingEnded,
    type: state.importType || 'live',
    hasAudio: !!state._audioRecordingActive,
  };
  const result = saveMeeting(meeting);
  if (window.saveMeetingWithSync) window.saveMeetingWithSync(meeting);
  if (result.warning === 'storage_high') {
    showToast(t('toast.storage_high'), 'warning');
  }
  // Create bidirectional links for reference meetings (from 경청준비)
  if (state.referenceIds?.length) {
    state.referenceIds.forEach(refId => linkMeetings(state.meetingId, refId));
    state.referenceIds = null; // Only link once
  }
}

export function endMeeting() {
  // Block if nothing was recorded/typed/chatted
  const hasContent = state.transcript.length > 0 || state.memos.length > 0 || state.chatHistory.length > 0;
  if (!hasContent) {
    showToast(t('toast.empty_meeting'), 'warning');
    return;
  }

  // Always show confirm dialog
  showEndConfirmDialog(() => {
    proceedEndMeeting();
  });
}

function proceedEndMeeting() {
  emit('meeting:ending');
  stopRecording();
  clearDraftRecovery();
  state.meetingTitle = $('#meetingTitleInput')?.value || state.meetingTitle;
  showEndMeetingModal();
}

function showEndConfirmDialog(onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay end-confirm-overlay';
  const elapsed = getElapsedTimeStr();
  overlay.innerHTML = `
    <div class="modal" style="max-width:400px;">
      <div class="modal-body" style="padding:24px;text-align:center;">
        <p style="font-size:1.05rem;margin-bottom:4px;">${t('end_confirm.message')}</p>
        <p style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:16px;">
          ${t('end_confirm.stats', { duration: elapsed, lines: state.transcript.length })}
        </p>
        <div style="display:flex;gap:8px;justify-content:center;">
          <button class="btn" id="btnEndConfirmCancel">${t('end_confirm.cancel')}</button>
          <button class="btn btn-primary" id="btnEndConfirmOk">${t('end_confirm.confirm')}</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#btnEndConfirmCancel').onclick = () => overlay.remove();
  overlay.querySelector('#btnEndConfirmOk').onclick = () => {
    overlay.remove();
    onConfirm();
  };
  // Clicking overlay background closes
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

let _minutesGenerationPromise = null; // Track ongoing minutes generation

// editMeeting: meeting object from storage (for viewer edit mode)
export function showEndMeetingModal(editMeeting) {
  const isEditMode = !!editMeeting;
  state._editMode = isEditMode;
  state._editMeetingId = editMeeting?.id || null;

  // If editing a saved meeting, load its data into state temporarily
  if (isEditMode) {
    state._editPrevState = {
      meetingTitle: state.meetingTitle,
      meetingLocation: state.meetingLocation,
      meetingStartTime: state.meetingStartTime,
      starRating: state.starRating,
      tags: [...state.tags],
      participants: [...state.participants],
    };
    state.meetingTitle = editMeeting.title || '';
    state.meetingLocation = editMeeting.location || '';
    state.meetingStartTime = editMeeting.startTime || editMeeting.createdAt;
    state.starRating = editMeeting.starRating || 3;
    state.tags = [...(editMeeting.tags || [])];
    state._aiTags = [];
    state.participants = [...(editMeeting.participants || [])];
  }

  const modal = $('#endMeetingModal');
  modal.hidden = false;

  // Update modal title for edit mode
  const modalTitle = modal.querySelector('.modal-header h3');
  if (modalTitle) {
    modalTitle.textContent = isEditMode ? t('end_meeting.edit_title') : t('end_meeting.title');
  }

  // Reset footer to default state
  resetFooterToDefault(isEditMode);

  // Render meeting summary stats
  const statsEl = $('#endMeetingStats');
  if (statsEl) {
    const stats = [];
    if (isEditMode) {
      stats.push(`${t('end_meeting.stat_transcript')}: ${(editMeeting.transcript || []).length}`);
      const bookmarkCount = (editMeeting.transcript || []).filter(l => l.bookmarked).length;
      if (bookmarkCount > 0) stats.push(`${t('end_meeting.stat_bookmarks')}: ${bookmarkCount}`);
      if ((editMeeting.memos || []).length > 0) stats.push(`${t('end_meeting.stat_memos')}: ${editMeeting.memos.length}`);
      if ((editMeeting.analysisHistory || []).length > 0) stats.push(`${t('end_meeting.stat_analyses')}: ${editMeeting.analysisHistory.length}`);
      // Show last modified timestamp
      if (editMeeting.updatedAt) {
        const updDate = new Date(editMeeting.updatedAt);
        stats.push(`${t('end_meeting.last_modified')}: ${updDate.toLocaleString()}`);
      }
    } else {
      stats.push(`${t('end_meeting.stat_duration')}: ${getElapsedTimeStr()}`);
      stats.push(`${t('end_meeting.stat_transcript')}: ${state.transcript.length}`);
      const bookmarkCount = state.transcript.filter(l => l.bookmarked).length;
      if (bookmarkCount > 0) stats.push(`${t('end_meeting.stat_bookmarks')}: ${bookmarkCount}`);
      if (state.memos.length > 0) stats.push(`${t('end_meeting.stat_memos')}: ${state.memos.length}`);
      if (state.analysisHistory.length > 0) stats.push(`${t('end_meeting.stat_analyses')}: ${state.analysisHistory.length}`);
      if (state.chatHistory.length > 0) stats.push(`${t('end_meeting.stat_chats')}: ${state.chatHistory.length}`);
    }
    statsEl.textContent = stats.join('  ·  ');
  }

  // Populate date/time (auto-generated from meeting start, editable)
  const meetingDate = new Date(state.meetingStartTime || Date.now());
  const datetimeInput = $('#endMeetingDatetime');
  const pad = n => String(n).padStart(2, '0');
  datetimeInput.value = `${meetingDate.getFullYear()}-${pad(meetingDate.getMonth() + 1)}-${pad(meetingDate.getDate())}T${pad(meetingDate.getHours())}:${pad(meetingDate.getMinutes())}`;

  const titleInput = $('#endMeetingTitle');
  titleInput.value = state.meetingTitle || '';

  renderEndMeetingTags();
  updateStarRating(state.starRating);
  renderEndMeetingParticipants();

  // Show participant dropdown immediately so users see available contacts on open
  updateParticipantDropdown('');

  const locationInput = $('#endMeetingLocation');
  locationInput.value = state.meetingLocation || '';
  updateLocationDropdown('');

  // Audio download section (P-5)
  renderEndMeetingAudio(isEditMode);

  // AI title/tag generation (with caching) — skip in edit mode
  const suggestionsEl = $('#aiTitleSuggestions');
  const chipsEl = $('#aiTitleChips');
  if (!isEditMode && isProxyAvailable() && state.transcript.length > 0) {
    suggestionsEl.hidden = false;
    chipsEl.innerHTML = '';

    if (state.aiTitleCached) {
      suggestionsEl.querySelector('.ai-suggestions-label').textContent = t('end_meeting.title_hint');
      renderTitleChips(state.aiTitleCached.titles, chipsEl, titleInput);
    } else {
      fetchAndCacheTitles(chipsEl, titleInput, suggestionsEl);
    }

    $('#btnRegenerateTitles').onclick = () => {
      state.aiTitleCached = null;
      chipsEl.innerHTML = '';
      fetchAndCacheTitles(chipsEl, titleInput, suggestionsEl);
    };

    // AI metadata suggestions (parallel with title)
    fetchAndCacheMetadata();
  } else {
    suggestionsEl.hidden = true;
  }
}

async function downloadAudioFile(meetingId, title) {
  try {
    const { getRecording } = await import('./audio-recorder.js');
    const blob = await getRecording(meetingId);
    if (!blob) return false;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    a.download = `${title || 'recording'}_${dateStr}.webm`;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

function updateAudioRecBadge() {
  const badge = $('#audioRecBadge');
  const sizeEl = $('#audioRecSize');
  if (!badge || !sizeEl) return;
  const size = getCurrentRecordingSize();
  if (size < 1024) {
    sizeEl.textContent = size + ' B';
  } else if (size < 1024 * 1024) {
    sizeEl.textContent = (size / 1024).toFixed(0) + ' KB';
  } else {
    sizeEl.textContent = (size / (1024 * 1024)).toFixed(1) + ' MB';
  }
}

async function renderEndMeetingAudio(isEditMode) {
  const section = $('#endMeetingAudioSection');
  if (!section) return;

  // Only show for live recordings (not edit mode, not imported)
  if (isEditMode || !state._audioRecordingActive) {
    section.hidden = true;
    return;
  }

  // Check if recording exists
  try {
    const exists = await hasRecording(state.meetingId);
    if (!exists) { section.hidden = true; return; }
  } catch { section.hidden = true; return; }

  section.hidden = false;

  // Dynamic retention days in warning
  const retentionDays = state.settings.audioRetentionDays || 30;
  const warnEl = $('#endMeetingAudioWarn');
  if (warnEl) {
    warnEl.textContent = retentionDays > 0
      ? t('end_meeting.audio_warn_days', { days: retentionDays })
      : t('end_meeting.audio_warn_manual');
  }

  // Auto-download notice
  const autoEl = $('#endMeetingAudioAuto');
  if (autoEl) {
    if (state.settings.audioAutoDownload) {
      autoEl.textContent = t('end_meeting.audio_auto_download_notice');
      autoEl.hidden = false;
    } else {
      autoEl.hidden = true;
    }
  }

  // Download button
  const dlBtn = $('#btnEndMeetingAudioDownload');
  if (dlBtn) {
    dlBtn.onclick = async () => {
      const title = $('#endMeetingTitle')?.value?.trim() || state.meetingTitle || 'recording';
      const ok = await downloadAudioFile(state.meetingId, title);
      if (!ok) { showToast(t('end_meeting.audio_not_found'), 'warning'); return; }
      dlBtn.textContent = '✓ ' + t('end_meeting.audio_downloaded');
      dlBtn.disabled = true;
      setTimeout(() => {
        dlBtn.innerHTML = '⬇ <span>' + t('end_meeting.download_audio') + '</span>';
        dlBtn.disabled = false;
      }, 3000);
    };
  }
}

function resetFooterToDefault(isEditMode = false) {
  const footer = $('#endMeetingFooter');
  footer.classList.remove('save-progress-state', 'save-complete-state', 'save-error-state');

  const actions = $('#endMeetingFooterActions');
  actions.innerHTML = '';

  // Cancel
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn';
  cancelBtn.id = 'btnEndMeetingCancel';
  cancelBtn.textContent = t('end_meeting.cancel');
  cancelBtn.onclick = () => {
    if (isEditMode) cancelEditMeeting();
    else cancelEndMeeting();
  };

  // Generate Minutes button (opens model selection modal)
  const genBtn = document.createElement('button');
  genBtn.className = 'btn btn-purple';
  genBtn.id = 'btnGenerateMinutes';
  genBtn.textContent = t('end_meeting.generate_minutes');
  if (isEditMode) {
    // In edit mode: save metadata, load meeting, let user generate from loaded state
    const editMeetingId = state._editMeetingId;
    genBtn.onclick = () => {
      saveEditMeeting();
      emit('meeting:load', { id: editMeetingId });
      $('#viewerModal').hidden = true;
      // Open minutes model modal after a tick (to allow state to settle)
      setTimeout(() => {
        const modelModal = $('#minutesModelModal');
        if (modelModal) modelModal.hidden = false;
      }, 100);
    };
  } else {
    genBtn.onclick = () => {
      const modelModal = $('#minutesModelModal');
      modelModal.hidden = false;
      // Update Pro usage count
      const proCount = getProUsageCount();
      const proUsageEl = $('#modelModalProUsage');
      if (proUsageEl && proCount > 0) {
        proUsageEl.textContent = t('minutes.pro_usage', { n: proCount });
        proUsageEl.hidden = false;
      }
    };
  }

  // Determine transcript for checking
  const transcript = isEditMode
    ? (getMeeting(state._editMeetingId)?.transcript || [])
    : state.transcript;

  // Hide generate button if no proxy or no transcript
  if (!isProxyAvailable() || transcript.length === 0) {
    genBtn.hidden = true;
  }

  // Save
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-primary';
  saveBtn.id = 'btnEndMeetingSave';
  saveBtn.textContent = t('end_meeting.save');
  saveBtn.onclick = () => {
    if (isEditMode) saveEditMeeting();
    else finalizeEndMeeting();
  };

  // AI Document Generator button
  const docGenBtn = document.createElement('button');
  docGenBtn.className = 'btn btn-green';
  docGenBtn.id = 'btnDocGenerator';
  docGenBtn.textContent = t('dg.button_label');
  docGenBtn.onclick = () => emit('docGenerator:open');
  if (!isProxyAvailable() || transcript.length === 0) {
    docGenBtn.hidden = true;
  }

  actions.append(cancelBtn, genBtn, docGenBtn, saveBtn);

  // Re-enable form inputs
  const body = $('#endMeetingModal .modal-body');
  if (body) body.classList.remove('disabled-form');
}

// AI metadata suggestion rendering — auto-fill into badges
function fetchAndCacheMetadata() {
  const tagLoading = $('#aiTagLoading');
  if (state.aiMetadataCached) {
    applyAiMetadata(state.aiMetadataCached);
    if (tagLoading) tagLoading.hidden = true;
    return;
  }

  if (tagLoading) tagLoading.hidden = false;

  const spinnerTimeout = setTimeout(() => {
    if (tagLoading && !tagLoading.hidden) {
      tagLoading.innerHTML = `<span class="ai-suggestions-label ai-error">${t('end_meeting.tags_error')}</span>` +
        `<button class="ai-retry-btn" id="btnRetryTags">${t('end_meeting.retry')}</button>`;
      tagLoading.querySelector('#btnRetryTags').onclick = () => {
        tagLoading.innerHTML = `<span class="ai-loading-spinner"></span><span>${t('end_meeting.tags_generating')}</span>`;
        state.aiMetadataCached = null;
        fetchAndCacheMetadata();
      };
    }
  }, 10000);

  suggestMeetingMetadata({
    transcript: state.transcript,
    meetingContext: state.settings.meetingContext || '',
    existingTags: state.tags,
  }).then(result => {
    clearTimeout(spinnerTimeout);
    if (tagLoading) tagLoading.hidden = true;
    if (!result) return;
    state.aiMetadataCached = result;
    applyAiMetadata(result);
  }).catch(() => {
    clearTimeout(spinnerTimeout);
    if (tagLoading) {
      tagLoading.hidden = false;
      tagLoading.innerHTML = `<span class="ai-suggestions-label ai-error">${t('end_meeting.tags_error')}</span>` +
        `<button class="ai-retry-btn" id="btnRetryTags">${t('end_meeting.retry')}</button>`;
      tagLoading.querySelector('#btnRetryTags').onclick = () => {
        tagLoading.innerHTML = `<span class="ai-loading-spinner"></span><span>${t('end_meeting.tags_generating')}</span>`;
        state.aiMetadataCached = null;
        fetchAndCacheMetadata();
      };
    }
  });
}

function applyAiMetadata(metadata) {
  // Auto-fill tags (with _isAi marker)
  const existingTags = state.tags.map(t2 => t2.toLowerCase());
  (metadata.tags || []).forEach(tag => {
    if (!existingTags.includes(tag.toLowerCase())) {
      state.tags.push(tag);
      if (!state._aiTags) state._aiTags = [];
      state._aiTags.push(tag);
      existingTags.push(tag.toLowerCase());
    }
  });
  renderEndMeetingTags();

  // Categories from AI → merge into tags
  if (metadata.categories && metadata.categories.length > 0) {
    metadata.categories.forEach(cat => {
      if (!existingTags.includes(cat.toLowerCase())) {
        state.tags.push(cat);
        if (!state._aiTags) state._aiTags = [];
        state._aiTags.push(cat);
        existingTags.push(cat.toLowerCase());
      }
    });
    renderEndMeetingTags();
  }
}

function createUnifiedBadge(text, onRemove, isAi = false) {
  const badge = document.createElement('span');
  badge.className = 'unified-badge' + (isAi ? ' ai-filled' : '');
  if (isAi) {
    const icon = document.createElement('span');
    icon.className = 'unified-badge-ai-icon';
    icon.textContent = '✨';
    badge.appendChild(icon);
  }
  badge.appendChild(document.createTextNode(text));
  const removeBtn = document.createElement('button');
  removeBtn.className = 'unified-badge-remove';
  removeBtn.textContent = '\u00d7';
  removeBtn.onclick = (e) => { e.stopPropagation(); onRemove(); };
  badge.appendChild(removeBtn);
  return badge;
}

function renderTitleChips(titles, container, titleInput) {
  container.innerHTML = '';
  titles.forEach((title, i) => {
    const chip = document.createElement('button');
    chip.className = 'ai-title-chip';
    if (titleInput.value === title) chip.classList.add('selected');
    chip.style.animationDelay = `${i * 0.08}s`;
    chip.textContent = title;
    chip.addEventListener('click', () => {
      titleInput.value = title;
      container.querySelectorAll('.ai-title-chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
    });
    container.appendChild(chip);
  });
}

function fetchAndCacheTitles(chipsEl, titleInput, suggestionsEl) {
  const label = suggestionsEl.querySelector('.ai-suggestions-label');
  label.classList.remove('ai-error');
  label.innerHTML = `<span class="ai-loading-spinner"></span>${t('end_meeting.title_generating')}`;
  // Remove old retry button if any
  const oldRetry = suggestionsEl.querySelector('.ai-retry-btn');
  if (oldRetry) oldRetry.remove();

  generateMeetingTitle({
    transcript: state.transcript,
    existingTitle: state.meetingTitle,
  }).then(result => {
    if (!result) { suggestionsEl.hidden = true; return; }
    label.innerHTML = '';
    label.textContent = t('end_meeting.title_hint');

    state.aiTitleCached = {
      titles: [result.title, ...(result.alternatives || [])].filter(Boolean),
      tags: result.tags || [],
    };
    renderTitleChips(state.aiTitleCached.titles, chipsEl, titleInput);

  }).catch(() => {
    label.classList.add('ai-error');
    label.innerHTML = '';
    label.textContent = t('end_meeting.title_error');
    const retryBtn = document.createElement('button');
    retryBtn.className = 'ai-retry-btn';
    retryBtn.textContent = t('end_meeting.retry');
    retryBtn.onclick = () => fetchAndCacheTitles(chipsEl, titleInput, suggestionsEl);
    label.after(retryBtn);
  });
}

export function renderEndMeetingTags() {
  const container = $('#endMeetingTags');
  container.innerHTML = '';
  state.tags.forEach(tag => {
    const badge = createUnifiedBadge(tag, () => {
      state.tags = state.tags.filter(t2 => t2 !== tag);
      if (state._aiTags) state._aiTags = state._aiTags.filter(t2 => t2 !== tag);
      renderEndMeetingTags();
    });
    container.appendChild(badge);
  });
}


export function updateStarRating(rating) {
  state.starRating = rating;
  document.querySelectorAll('#endMeetingStars .star-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.star) <= rating);
  });
}

export function renderEndMeetingParticipants() {
  const container = $('#endMeetingParticipantsSelected');
  container.innerHTML = '';
  state.participants.forEach(p => {
    const label = p.title ? `${p.name || p} · ${p.title}` : (p.name || p);
    const badge = createUnifiedBadge(label, () => {
      state.participants = state.participants.filter(pp => pp !== p);
      renderEndMeetingParticipants();
    });
    container.appendChild(badge);
  });
}

// Dropdown for participant input — shows contacts filtered by query
export function updateParticipantDropdown(query) {
  const dropdown = $('#participantDropdown');
  const contacts = loadContacts();
  const q = query.toLowerCase().trim();

  // Filter contacts not already selected
  const available = contacts.filter(c =>
    !state.participants.some(p => (p.id || p) === c.id)
  );

  // Filter by query
  const filtered = q
    ? available.filter(c => c.name.toLowerCase().includes(q) || (c.company || '').toLowerCase().includes(q))
    : available;

  if (filtered.length === 0) {
    dropdown.hidden = true;
    return;
  }

  dropdown.innerHTML = '';
  const section = document.createElement('div');
  section.className = 'unified-dropdown-section';
  const header = document.createElement('div');
  header.className = 'unified-dropdown-header';
  header.textContent = t('end_meeting.contacts') || 'Contacts';
  section.appendChild(header);

  filtered.slice(0, 8).forEach(contact => {
    const item = document.createElement('div');
    item.className = 'unified-dropdown-item';
    const nameSpan = document.createElement('span');
    nameSpan.textContent = contact.name;
    item.appendChild(nameSpan);
    if (contact.title) {
      const titleSpan = document.createElement('span');
      titleSpan.className = 'unified-dropdown-item-sub';
      titleSpan.textContent = contact.title;
      item.appendChild(titleSpan);
    }
    if (contact.company) {
      const sub = document.createElement('span');
      sub.className = 'unified-dropdown-item-sub';
      sub.textContent = contact.company;
      item.appendChild(sub);
    }
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      state.participants.push({ id: contact.id, name: contact.name, title: contact.title });
      renderEndMeetingParticipants();
      $('#endMeetingParticipantInput').value = '';
      updateParticipantDropdown('');
      $('#endMeetingParticipantInput').focus();
    });
    section.appendChild(item);
  });

  dropdown.appendChild(section);
  dropdown.hidden = false;
}

// Dropdown for tag input — shows recent tags filtered by query
export function updateTagDropdown(query) {
  const dropdown = $('#tagDropdown');
  const q = query.toLowerCase().trim();

  // Collect all unique tags from saved meetings
  const allMeetings = JSON.parse(localStorage.getItem('meetings') || '[]');
  const allTags = new Set();
  allMeetings.forEach(m => (m.tags || []).forEach(tag => allTags.add(tag)));
  // Remove already-selected tags
  state.tags.forEach(tag => allTags.delete(tag));

  const available = [...allTags];
  const filtered = q
    ? available.filter(tag => tag.toLowerCase().includes(q))
    : available;

  if (filtered.length === 0) {
    dropdown.hidden = true;
    return;
  }

  dropdown.innerHTML = '';
  const section = document.createElement('div');
  section.className = 'unified-dropdown-section';
  const header = document.createElement('div');
  header.className = 'unified-dropdown-header';
  header.textContent = t('end_meeting.recent_tags') || 'Recent';
  section.appendChild(header);

  filtered.slice(0, 8).forEach(tag => {
    const item = document.createElement('div');
    item.className = 'unified-dropdown-item';
    item.textContent = tag;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!state.tags.includes(tag)) state.tags.push(tag);
      renderEndMeetingTags();
      $('#endMeetingTagInput').value = '';
      updateTagDropdown('');
      $('#endMeetingTagInput').focus();
    });
    section.appendChild(item);
  });

  dropdown.appendChild(section);
  dropdown.hidden = false;
}

// Dropdown for location input — shows saved locations filtered by query
export function updateLocationDropdown(query) {
  const dropdown = $('#locationDropdown');
  const locations = loadLocations();
  const locFreq = getLocationFrequency();
  const q = query.toLowerCase().trim();

  // Sort by frequency (most used first), then alphabetically
  const sorted = [...locations].sort((a, b) => {
    const fa = locFreq[a.name] || 0, fb = locFreq[b.name] || 0;
    if (fb !== fa) return fb - fa;
    return a.name.localeCompare(b.name);
  });

  // Filter by query
  const filtered = q
    ? sorted.filter(loc => loc.name.toLowerCase().includes(q))
    : sorted;

  dropdown.innerHTML = '';

  // If there are matching locations, show them
  if (filtered.length > 0) {
    // Recent: locations that have been used at least once
    const recent = filtered.filter(l => (locFreq[l.name] || 0) > 0);
    // All: every location not already shown in recent
    const recentNames = new Set(recent.map(l => l.name));
    const allOthers = filtered.filter(l => !recentNames.has(l.name));

    if (recent.length > 0) {
      const section = document.createElement('div');
      section.className = 'unified-dropdown-section';
      const header = document.createElement('div');
      header.className = 'unified-dropdown-header';
      header.textContent = t('end_meeting.recent_locations') || 'Recent';
      section.appendChild(header);
      recent.slice(0, 5).forEach(loc => {
        section.appendChild(createLocationItem(loc, locFreq[loc.name] || 0));
      });
      dropdown.appendChild(section);
    }

    if (allOthers.length > 0) {
      const section = document.createElement('div');
      section.className = 'unified-dropdown-section';
      const header = document.createElement('div');
      header.className = 'unified-dropdown-header';
      header.textContent = t('end_meeting.all_locations') || 'All';
      section.appendChild(header);
      const listWrap = document.createElement('div');
      listWrap.className = 'location-all-list';
      allOthers.forEach(loc => {
        listWrap.appendChild(createLocationItem(loc, 0));
      });
      section.appendChild(listWrap);
      dropdown.appendChild(section);
    }
  }

  // If user typed something that doesn't exactly match, show "Add new" option
  if (q && !locations.some(l => l.name.toLowerCase() === q)) {
    const section = document.createElement('div');
    section.className = 'unified-dropdown-section';
    const item = document.createElement('div');
    item.className = 'unified-dropdown-item location-add-new';
    item.innerHTML = `<span style="color:var(--accent)">+ </span><span>${t('end_meeting.add_location') || 'Add'} "<strong>${query.trim()}</strong>"</span>`;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const name = query.trim();
      $('#endMeetingLocation').value = name;
      state.meetingLocation = name;
      dropdown.hidden = true;
    });
    section.appendChild(item);
    dropdown.appendChild(section);
  }

  dropdown.hidden = dropdown.children.length === 0;
}

function createLocationItem(loc, freq) {
  const item = document.createElement('div');
  item.className = 'unified-dropdown-item';
  const nameSpan = document.createElement('span');
  nameSpan.textContent = loc.name;
  item.appendChild(nameSpan);
  if (loc.memo) {
    const memoSpan = document.createElement('span');
    memoSpan.className = 'unified-dropdown-item-sub';
    memoSpan.textContent = loc.memo;
    item.appendChild(memoSpan);
  }
  if (freq > 0) {
    const freqSpan = document.createElement('span');
    freqSpan.className = 'unified-dropdown-item-sub';
    freqSpan.textContent = `${freq}×`;
    item.appendChild(freqSpan);
  }
  item.addEventListener('click', (e) => {
    e.stopPropagation();
    $('#endMeetingLocation').value = loc.name;
    state.meetingLocation = loc.name;
    $('#locationDropdown').hidden = true;
  });
  return item;
}

// Save metadata only (no minutes generation)
export async function finalizeEndMeeting() {
  state.meetingTitle = $('#endMeetingTitle').value.trim();
  state.meetingLocation = $('#endMeetingLocation').value.trim();
  if (state.meetingLocation) addLocation(state.meetingLocation);

  const dtVal = $('#endMeetingDatetime').value;
  if (dtVal) state.meetingStartTime = new Date(dtVal).getTime();

  const hasContent = state.transcript.length > 0 || state.memos.length > 0 || state.chatHistory.length > 0;
  if (!hasContent) {
    $('#endMeetingModal').hidden = true;
    showToast(t('toast.empty_meeting'), 'warning');
    resetMeeting();
    restoreEndButton(false);
    return;
  }

  // Show saving indicator
  const footer = $('#endMeetingFooter');
  const actions = $('#endMeetingFooterActions');
  footer.classList.add('save-progress-state');
  actions.innerHTML = `
    <div class="save-progress-content">
      <div class="save-progress-bar"><div class="save-progress-bar-inner"></div></div>
      <span class="save-progress-text">${t('end_meeting.saving')}</span>
    </div>
  `;
  const body = $('#endMeetingModal .modal-body');
  if (body) body.classList.add('disabled-form');

  const hasUncorrected = state.transcript.some(l => !l.originalText);
  if (isProxyAvailable() && hasUncorrected && state.transcript.length > 0) {
    await runCorrection(false);
  }

  state.meetingEnded = true;
  autoSave();
  clearDraftRecovery();

  // Auto-download audio if enabled
  if (state.settings.audioAutoDownload && state._audioRecordingActive) {
    const title = state.meetingTitle || 'recording';
    await downloadAudioFile(state.meetingId, title);
  }

  // Close modal and show toast
  footer.classList.remove('save-progress-state');
  if (body) body.classList.remove('disabled-form');
  closeAndFinalizeMeeting();
  showCenterToast(t('end_meeting.save_complete'));
}

// Save + generate minutes with selected model
async function finalizeWithMinutes() {
  state.meetingTitle = $('#endMeetingTitle').value.trim();
  state.meetingLocation = $('#endMeetingLocation').value.trim();
  if (state.meetingLocation) addLocation(state.meetingLocation);

  const dtVal = $('#endMeetingDatetime').value;
  if (dtVal) state.meetingStartTime = new Date(dtVal).getTime();

  const hasContent = state.transcript.length > 0 || state.memos.length > 0 || state.chatHistory.length > 0;
  if (!hasContent) {
    $('#endMeetingModal').hidden = true;
    showToast(t('toast.empty_meeting'), 'warning');
    resetMeeting();
    restoreEndButton(false);
    return;
  }

  const hasUncorrected = state.transcript.some(l => !l.originalText);
  if (isProxyAvailable() && hasUncorrected && state.transcript.length > 0) {
    await runCorrection(false);
  }

  state.meetingEnded = true;
  autoSave();
  clearDraftRecovery();

  // Auto-download audio if enabled
  if (state.settings.audioAutoDownload && state._audioRecordingActive) {
    const title = state.meetingTitle || 'recording';
    await downloadAudioFile(state.meetingId, title);
  }

  // Show progress in footer
  showSaveProgress();

  const body = $('#endMeetingModal .modal-body');
  if (body) body.classList.add('disabled-form');

  _minutesGenerationPromise = generateFinalMeetingMinutes().then(() => {
    _minutesGenerationPromise = null;
    showSaveComplete();
  }).catch(err => {
    _minutesGenerationPromise = null;
    showSaveError(err.message);
  });
}


function updatePostEndUI() {
  const recBtn = $('#btnRecord');
  recBtn.classList.remove('recording', 'paused');
  recBtn.querySelector('.record-label').textContent = t('record.label');
  $('#meetingStatus').textContent = t('record.status_ended');
  const pill = $('#meetingPill');
  pill.classList.remove('recording');
  pill.classList.add('paused');
  const titleInput = $('#meetingTitleInput');
  if (titleInput) titleInput.hidden = true;
}

function closeAndFinalizeMeeting() {
  $('#endMeetingModal').hidden = true;

  const recBtn = $('#btnRecord');
  recBtn.classList.remove('recording', 'paused');
  recBtn.querySelector('.record-label').textContent = t('record.label');

  showPostEndButtons();

  $('#meetingStatus').textContent = t('record.status_ended');
  const pill2 = $('#meetingPill');
  pill2.classList.remove('recording');
  pill2.classList.add('paused');
  const titleInput = $('#meetingTitleInput');
  if (titleInput) titleInput.hidden = true;
}

export function showSaveFooterWithMinutesReady(onViewMinutes) {
  const footer = $('#endMeetingFooter');
  footer.classList.remove('save-progress-state', 'save-complete-state', 'save-error-state');

  const actions = $('#endMeetingFooterActions');
  actions.innerHTML = '';

  const body = $('#endMeetingModal .modal-body');
  if (body) body.classList.remove('disabled-form');

  // Cancel
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn';
  cancelBtn.textContent = t('end_meeting.cancel');
  cancelBtn.onclick = () => cancelEndMeeting();

  // View Minutes
  const viewBtn = document.createElement('button');
  viewBtn.className = 'btn btn-accent';
  viewBtn.textContent = t('end_meeting.view_minutes');
  viewBtn.onclick = () => { if (onViewMinutes) onViewMinutes(); };

  // Save
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-primary';
  saveBtn.textContent = t('end_meeting.save');
  saveBtn.onclick = () => finalizeEndMeeting();

  actions.append(cancelBtn, viewBtn, saveBtn);
}

function showSaveProgress() {
  const footer = $('#endMeetingFooter');
  footer.classList.add('save-progress-state');

  const actions = $('#endMeetingFooterActions');
  actions.innerHTML = `
    <div class="save-progress-content">
      <div class="save-progress-bar"><div class="save-progress-bar-inner"></div></div>
      <span class="save-progress-text">${t('end_meeting.generating_minutes')}</span>
    </div>
    <button class="btn btn-sm" id="btnSaveProgressClose">${t('end_meeting.close_background')}</button>
  `;

  actions.querySelector('#btnSaveProgressClose').onclick = () => {
    closeAndFinalizeMeeting();
    showToast(t('toast.minutes_generating_bg'), 'info');
  };

  // X button during generation → same as background close
  const closeBtn = $('#endMeetingModal .modal-close');
  closeBtn.onclick = (e) => {
    e.stopPropagation();
    closeAndFinalizeMeeting();
    showToast(t('toast.minutes_generating_bg'), 'info');
  };

  // Overlay click during generation → same as background close
  const modal = $('#endMeetingModal');
  modal._progressClickHandler = (e) => {
    if (e.target === modal) {
      e.stopImmediatePropagation();
      closeAndFinalizeMeeting();
      showToast(t('toast.minutes_generating_bg'), 'info');
    }
  };
  modal.addEventListener('click', modal._progressClickHandler, true);
}

function showSaveComplete() {
  const footer = $('#endMeetingFooter');
  footer.classList.remove('save-progress-state');
  footer.classList.add('save-complete-state');

  // Remove progress overlay click handler
  cleanupProgressHandlers();

  // Re-enable form
  const body = $('#endMeetingModal .modal-body');
  if (body) body.classList.remove('disabled-form');

  // Close modal and show toast
  closeAndFinalizeMeeting();
  showCenterToast(t('end_meeting.save_complete'));
}

function showSaveError(errorMsg) {
  const footer = $('#endMeetingFooter');
  footer.classList.remove('save-progress-state');
  footer.classList.add('save-error-state');

  // Remove progress overlay click handler
  cleanupProgressHandlers();

  const actions = $('#endMeetingFooterActions');
  actions.innerHTML = `
    <div class="save-error-content">
      <span class="save-error-text">${t('end_meeting.minutes_error')}: ${errorMsg}</span>
    </div>
    <button class="btn" id="btnSaveErrorClose">${t('end_meeting.close')}</button>
  `;

  actions.querySelector('#btnSaveErrorClose').onclick = () => closeAndFinalizeMeeting();
}

function cleanupProgressHandlers() {
  const modal = $('#endMeetingModal');
  if (modal._progressClickHandler) {
    modal.removeEventListener('click', modal._progressClickHandler, true);
    modal._progressClickHandler = null;
  }
}

export async function generateFinalMeetingMinutes(template, promptConfig = {}) {
  showAnalysisSkeletons();

  const metadata = {
    title: state.meetingTitle,
    participants: state.participants.map(p => p.name || p),
    tags: state.tags,
    categories: state.categories,
    location: state.meetingLocation,
    datetime: state.meetingStartTime,
    starRating: state.starRating,
  };

  // Streaming preview for final minutes — render into minutes preview modal
  const previewContent = document.querySelector('#minutesPreviewContent');
  const aiContainer = document.querySelector('#aiSections');
  let streamPreviewEl = null;
  let _renderMd = null;

  const result = await generateFinalMinutes({
    transcript: state.transcript,
    analysisHistory: state.analysisHistory,
    meetingContext: state.settings.meetingContext,
    meetingPreset: state.settings.meetingPreset,
    elapsedTime: getElapsedTimeStr(),
    memos: state.memos,
    userProfile: buildFullProfile(),
    model: state.settings.geminiModel || 'gemini-2.5-flash',
    template: template || '',
    referenceDoc: promptConfig.referenceDoc || '',
    basePromptOverride: promptConfig.basePromptOverride || '',
    userInstruction: promptConfig.userInstruction || '',
    metadata,
    onStream: (textSoFar) => {
      const target = previewContent || aiContainer;
      if (!target) return;
      if (!streamPreviewEl) {
        target.innerHTML = '';
        target.classList.remove('ai-updating');
        streamPreviewEl = document.createElement('div');
        streamPreviewEl.className = 'ai-markdown-content ai-streaming';
        target.appendChild(streamPreviewEl);
      }
      if (_renderMd) {
        streamPreviewEl.innerHTML = _renderMd(textSoFar);
        target.scrollTop = target.scrollHeight;
      } else {
        import('./chat.js').then(({ renderMarkdown }) => {
          _renderMd = renderMarkdown;
          streamPreviewEl.innerHTML = renderMarkdown(textSoFar);
          target.scrollTop = target.scrollHeight;
        });
      }
    },
  });

  state.currentAnalysis = result;
  result.transcriptLength = state.transcript.length;
  state.analysisHistory.push(result);
  renderAnalysis(result);
  autoSave();

  emit('analysis:complete', result);
}

export async function regenerateMinutes(model, template, promptConfig = {}) {
  state.settings.geminiModel = model;
  await generateFinalMeetingMinutes(template, promptConfig);
}

export function cancelEndMeeting() {
  $('#endMeetingModal').hidden = true;
}

// Edit mode: save metadata changes to the stored meeting
function saveEditMeeting() {
  const meetingId = state._editMeetingId;
  const meeting = getMeeting(meetingId);
  if (!meeting) return;

  // Capture form values
  meeting.title = $('#endMeetingTitle').value.trim();
  meeting.location = $('#endMeetingLocation').value.trim();
  if (meeting.location) addLocation(meeting.location);
  const dtVal = $('#endMeetingDatetime').value;
  if (dtVal) meeting.startTime = new Date(dtVal).getTime();
  meeting.starRating = state.starRating;
  meeting.tags = [...state.tags];
  meeting.participants = [...state.participants];

  saveMeeting(meeting);
  if (window.saveMeetingWithSync) window.saveMeetingWithSync(meeting);

  // Restore previous state
  restoreEditState();
  $('#endMeetingModal').hidden = true;
  showToast(t('end_meeting.edit_saved'), 'success');

  // Refresh viewer if open
  if (!$('#viewerModal').hidden) {
    emit('meeting:view', { id: meetingId });
  }
}

// Edit mode: cancel and restore previous state
function cancelEditMeeting() {
  restoreEditState();
  $('#endMeetingModal').hidden = true;
}

function restoreEditState() {
  if (state._editPrevState) {
    Object.assign(state, state._editPrevState);
    delete state._editPrevState;
  }
  state._editMode = false;
  state._editMeetingId = null;
}

function showPostEndButtons() {
  // 기존 버튼이 있으면 먼저 제거 (중복 방지)
  const existingResume = $('#btnResumeMeeting');
  const existingExport = $('#btnPostExport');
  const existingNew = $('#btnNewMeeting');
  const existingDocGen = $('#btnPostDocGen');
  if (existingResume) existingResume.remove();
  if (existingExport) existingExport.remove();
  if (existingNew) existingNew.remove();
  if (existingDocGen) existingDocGen.remove();

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

  const btnDocGen = document.createElement('button');
  btnDocGen.className = 'btn btn-sm';
  btnDocGen.id = 'btnPostDocGen';
  btnDocGen.textContent = '📄 ' + t('dg.button_label');

  endBtn.hidden = true;
  endBtn.parentNode.insertBefore(btnResume, endBtn.nextSibling);
  endBtn.parentNode.insertBefore(btnDocGen, btnResume.nextSibling);
  endBtn.parentNode.insertBefore(btnNew, btnDocGen.nextSibling);

  btnDocGen.addEventListener('click', () => emit('docGenerator:open'));
  btnResume.addEventListener('click', () => resumeMeeting());
  btnNew.addEventListener('click', () => {
    resetMeeting();
    restoreEndButton(false);
  });
}

async function resumeMeeting() {
  state.meetingEnded = false;
  restoreEndButton();
  await startRecording();
  showToast(t('toast.meeting_resumed'), 'success');
}

function restoreEndButton(showEnd = true) {
  const endBtn = $('#btnEndMeeting');
  endBtn.hidden = !showEnd;
  const resume = $('#btnResumeMeeting');
  const exportBtn = $('#btnPostExport');
  const newBtn = $('#btnNewMeeting');
  const editInfoBtn = $('#btnEditSaveInfo');
  const docGenBtn = $('#btnPostDocGen');
  if (resume) resume.remove();
  if (exportBtn) exportBtn.remove();
  if (newBtn) newBtn.remove();
  if (editInfoBtn) editInfoBtn.remove();
  if (docGenBtn) docGenBtn.remove();
  const bottomResume = $('#btnBottomResume');
  if (bottomResume) bottomResume.remove();
}

export function resetMeeting(skipLauncher = false) {
  clearDraftRecovery();
  state.meetingEnded = false;
  state.meetingStartTime = null;
  state.isImported = false;
  state.importType = null;
  state._audioRecordingActive = false;
  document.body.classList.remove('imported-mode');
  pausedDuration = 0;
  pauseStartTime = null;
  // Clear loaded meeting state
  state.loadedMeetingId = null;
  state.loadedMeetingOriginal = null;
  const banner = document.querySelector('#loadedMeetingBanner');
  if (banner) banner.hidden = true;
  document.body.classList.remove('loaded-mode');
  // Remove bottom bar buttons if present
  const editInfoBtn = document.querySelector('#btnEditSaveInfo');
  if (editInfoBtn) editInfoBtn.remove();
  const bottomResume = document.querySelector('#btnBottomResume');
  if (bottomResume) bottomResume.remove();
  // Reset record button and hide end meeting button
  const recBtn = $('#btnRecord');
  recBtn.classList.remove('recording', 'paused');
  recBtn.querySelector('.record-label').textContent = t('record.label');
  const badge = $('#sttEngineBadge');
  if (badge) badge.hidden = true;
  const resetRecBadge = $('#audioRecBadge');
  if (resetRecBadge) resetRecBadge.hidden = true;
  if (audioSizeInterval) { clearInterval(audioSizeInterval); audioSizeInterval = null; }
  $('#btnEndMeeting').hidden = true;
  state.meetingId = null;
  state.meetingLocation = '';
  state.meetingDescription = '';
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
  state.analysisContext = '';
  state.analysisCorrections = [];
  state.aiTitleCached = null;
  state.aiMetadataCached = null;
  state.documents = [];
  state._aiTags = null;
  $('#transcriptList').innerHTML = '';
  resetTranscriptEmpty();
  $('#aiSections').innerHTML = '';
  resetAiEmpty();
  $('#chatMessages').innerHTML = '';
  resetChatEmpty();
  $('#meetingTimer').textContent = '00:00:00';
  const pill = $('#meetingPill');
  pill.hidden = true;
  pill.classList.remove('recording', 'paused');
  $('#meetingStatus').textContent = '';
  const headerTitleInput = $('#meetingTitleInput');
  if (headerTitleInput) { headerTitleInput.value = ''; headerTitleInput.hidden = true; }
  // Reset inbox badge
  const inboxBadge = document.querySelector('#inboxBadge');
  if (inboxBadge) inboxBadge.hidden = true;
  if (!skipLauncher) showLauncherModal();
}
