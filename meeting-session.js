// @ts-check
// meeting-session.js - The single owner of the meeting lifecycle.
//
//   idle ──start()──▶ recording ──pause(reason)──▶ paused ──markEnded()──▶ ended
//                        ▲                           │                       │
//                        └──────── resume() ─────────┴───────────────────────┘
//   idle ──adoptDraft()/adoptImport()──▶ paused        any ──loadMeeting()──▶ ended (source=loaded)
//   any  ──reset()──▶ idle
//
// Everything else is a logged no-op. This module is the only writer of state.phase
// (besides the legacy accessors in event-bus.js), the only place STT callbacks are
// built, the only place recording timers are registered/cleared, and the only
// visibilitychange listener in the app.

import { state, on, emit } from './event-bus.js';
import { createSTT } from './stt.js';
import { createTimerGroup } from './session-timers.js';
import { syncSessionUI, setSessionStatusOverride, renderClock } from './session-ui.js';
import {
  showToast, showInterim, clearInterim, addTranscriptLine, addMemoLine, renderAnalysis,
  updateTranscriptLineUI, showTranscriptConnecting, showTranscriptWaiting,
  resetTranscriptEmpty, resetAiEmpty, resetChatEmpty,
} from './ui.js';
import { t } from './i18n.js';
import { startAudioRecording, stopAudioRecording } from './audio-recorder.js';
import { loadChatHistory } from './chat.js';
import * as wakeLock from './wake-lock.js';
import { startKeepAlive, stopKeepAlive, isMobileLike } from './background-keepalive.js';

const $ = (sel) => document.querySelector(sel);

const MAX_RECORDING_MS = 6 * 60 * 60 * 1000;

/** Timers that live only while phase === 'recording' (cleared on every pause). */
export const recTimers = createTimerGroup();
/** Timers that live for the whole meeting (draft autosave); cleared on reset(). */
export const sessionTimers = createTimerGroup();

/** @type {ReturnType<typeof createSTT> | null} */
let stt = null;
let webspeechFatalCount = 0;
let switchOfferShown = false;
let connectedShown = false;   // "connected" toast once per recording run, not per engine restart
let sttRecoverAttempts = 0;   // silent auto-recovery after an engine gives up

/**
 * Hooks let recording.js keep analysis/persistence logic without a circular import.
 * @type {{
 *   onFinalLine?: (line: any) => void,
 *   onReplaceLine?: (line: any) => void,
 *   autoSave?: () => void,
 *   onRecordingTimers?: (timers: ReturnType<typeof createTimerGroup>) => void,
 *   onSessionTimers?: (timers: ReturnType<typeof createTimerGroup>) => void,
 *   clearDraftRecovery?: () => void,
 *   onReset?: () => void,
 * }}
 */
let hooks = {};

export function configureSession(h) {
  hooks = { ...hooks, ...h };
}

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function getPhase() {
  return state.phase;
}

export function getTotalPausedMs() {
  return state.pausedDuration + (state.pauseStartTime ? Date.now() - state.pauseStartTime : 0);
}

/** Elapsed meeting time in ms, excluding pauses. */
/** Timestamp of the last transcript line or memo, or null when there is no content. */
function lastActivityTs() {
  const ts = [
    ...state.transcript.map(l => l.timestamp),
    ...state.memos.map(m => m.timestamp),
  ].filter(Boolean);
  return ts.length ? Math.max(...ts) : null;
}

export function getElapsedMs() {
  if (!state.meetingStartTime) return 0;
  if (state.source === 'loaded' && state.phase !== 'recording') {
    // A saved meeting's clock is frozen at its last activity, never wall-clock time.
    const last = lastActivityTs();
    return last ? Math.max(0, last - state.meetingStartTime) : 0;
  }
  return Math.max(0, Date.now() - state.meetingStartTime - getTotalPausedMs());
}

function log(msg) {
  if (state.settings?.debugLifecycle) console.log(`[session] ${msg}`);
}

function applyPhase(to, reason) {
  const from = state.phase;
  if (from === to) return;
  state.phase = to;
  log(`${from}→${to} (${reason})`);
  emit('session:transition', { from, to, reason });
}

// Any transition (including legacy setters in event-bus.js) re-syncs the chrome
// and keeps the wake lock in step with the phase.
on('session:transition', ({ to }) => {
  syncSessionUI();
  if (to === 'recording') acquireWakeLock();
  else releaseWakeLock();
});

// ===== Wake lock =====
let wakeLockWarned = false;
async function acquireWakeLock() {
  if (state.settings?.keepScreenAwake === false) return;
  if (!wakeLock.isSupported()) return;
  const ok = await wakeLock.acquire();
  if (!ok && !wakeLockWarned) {
    wakeLockWarned = true;
    showToast(t('toast.wake_lock_failed'), 'warning');
  }
}
async function releaseWakeLock() {
  await wakeLock.release();
}

// ===== STT =====

/**
 * The one place STT callbacks are built. Used by start(), resume() and the
 * background-return restart so they can never drift apart again.
 */
export function buildSttCallbacks({ withStream }) {
  return {
    language: state.settings.language || 'ko',
    settings: state.settings,
    onRecordingStream: (stream) => {
      if (withStream && state.settings.audioRecording) {
        try {
          startAudioRecording(state.meetingId, stream);
          state._audioRecordingActive = true;
          state._audioRecorded = true; // survives pause: end-meeting audio download / hasAudio
          syncSessionUI();
        } catch (err) {
          // Audio capture is optional; never let it block transcription.
          log(`audio recording unavailable: ${err.message}`);
          stream.getTracks().forEach(tr => tr.stop());
        }
      } else {
        stream.getTracks().forEach(tr => tr.stop());
      }
    },
    onInterim: (text) => showInterim(text),
    onFinal: (text) => {
      sttRecoverAttempts = 0;
      const line = { id: generateId(), text, timestamp: Date.now(), bookmarked: false };
      state.transcript.push(line);
      addTranscriptLine(line);
      emit('transcript:add', line);
      hooks.onFinalLine?.(line);
    },
    onReplace: (text) => {
      const lastLine = state.transcript[state.transcript.length - 1];
      if (!lastLine) return;
      lastLine.text = text;
      lastLine.timestamp = Date.now();
      updateTranscriptLineUI(lastLine.id);
      hooks.onReplaceLine?.(lastLine);
    },
    onError: (err) => showToast(err, 'error'),
    onFatalError: (engineName) => recoverStt(engineName),
    onConnecting: () => { if (!connectedShown) showTranscriptConnecting(); },
    onConnected: (engine) => {
      state.sttEngineName = engine;
      if (!connectedShown) {
        connectedShown = true;
        showTranscriptWaiting();
        showToast(t('stt.connected'), 'success');
      }
      syncSessionUI();
    },
  };
}

async function startStt({ withStream }) {
  if (stt) { stt.stop(); stt = null; }
  stt = createSTT();
  let started = false;
  try {
    started = await stt.start(buildSttCallbacks({ withStream }));
  } catch (err) {
    log(`stt.start threw: ${err.message}`);
    showToast(t('toast.record_fail') + err.message, 'error');
  }
  if (!started) {
    stt?.stop();
    stt = null;
    return false;
  }
  return true;
}

function stopStt() {
  if (!stt) return;
  stt.stop();
  stt = null;
  state.sttEngineName = null;
}

/**
 * An engine gave up mid-meeting (Android Chrome does this): restart it quietly with
 * backoff while the phase is still 'recording'. Only after repeated failures do we
 * tell the user and, on mobile, offer the keyboard engine.
 */
function recoverStt(engineName) {
  if (state.phase !== 'recording') return;
  sttRecoverAttempts++;
  if (sttRecoverAttempts > 5) {
    log(`stt recovery gave up after ${sttRecoverAttempts - 1} attempts`);
    showToast(t('stt.connection_failed'), 'error');
    if (engineName === 'webspeech' || engineName === 'webspeech-local') offerKeyboardSwitch();
    return;
  }
  const delay = Math.min(1000 * sttRecoverAttempts, 5000);
  log(`stt recovery #${sttRecoverAttempts} in ${delay}ms`);
  recTimers.after('sttRecover', delay, async () => {
    if (state.phase !== 'recording') return;
    const ok = await startStt({ withStream: false });
    if (!ok) recoverStt(engineName);
  });
}

function offerKeyboardSwitch() {
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  webspeechFatalCount++;
  if (!isMobile || webspeechFatalCount < 2 || switchOfferShown) return;
  switchOfferShown = true;
  const undo = () => { switchSttEngine('keyboard'); };
  undo._undoLabel = t('stt.switch_to_keyboard_action');
  import('./ui.js').then(({ showUndoToast }) => showUndoToast(t('stt.switch_to_keyboard'), undo, 8000));
}

// Settings / the high-accuracy button change state.settings.sttEngine and emit this.
on('stt:engine-changed', ({ engine }) => { switchSttEngine(engine); });

/** Swap the STT engine without touching phase or transcript. */
export async function switchSttEngine(engineName) {
  state.settings.sttEngine = engineName;
  if (state.phase !== 'recording') return;
  stopStt();
  await startStt({ withStream: false });
}

// ===== Transitions =====

export async function start() {
  if (state.phase !== 'idle') { log(`start() ignored in phase ${state.phase}`); return false; }
  state.meetingId = state.meetingId || generateId();
  state.meetingStartTime = Date.now();
  state.pausedDuration = 0;
  state.pauseStartTime = null;
  state.source = 'live';
  webspeechFatalCount = 0;
  switchOfferShown = false;
  connectedShown = false;
  sttRecoverAttempts = 0;

  const ok = await startStt({ withStream: true });
  if (!ok) {
    // Nothing started: leave no half-created meeting behind.
    state.meetingId = null;
    state.meetingStartTime = null;
    return false;
  }

  applyPhase('recording', 'start');
  afterRecordingStarted();
  emit('recording:started');
  return true;
}

export async function resume() {
  if (state.phase !== 'paused' && state.phase !== 'ended') { log(`resume() ignored in phase ${state.phase}`); return false; }
  const wasLoaded = state.source === 'loaded';

  // Fold the pause gap into pausedDuration
  if (wasLoaded) {
    const lastActivity = lastActivityTs() || state.meetingStartTime;
    state.pausedDuration += Math.max(0, Date.now() - lastActivity);
  } else if (state.pauseStartTime) {
    state.pausedDuration += Date.now() - state.pauseStartTime;
  }
  state.pauseStartTime = null;
  connectedShown = false;
  sttRecoverAttempts = 0;

  const ok = (stt && stt.isPaused) ? (stt.resume(), true) : await startStt({ withStream: !wasLoaded });
  if (!ok) {
    // keep the gap accounted from now on
    state.pauseStartTime = Date.now();
    return false;
  }

  if (wasLoaded) {
    state.loadedMeetingId = null;
    state.loadedMeetingOriginal = null;
  }
  state.source = 'live';
  applyPhase('recording', wasLoaded ? 'resume-loaded' : 'resume');
  afterRecordingStarted();
  emit('recording:started');
  return true;
}

function afterRecordingStarted() {
  // Screen-off recording: media-session keep-alive so Android keeps the tab (and mic) alive.
  if (isMobileLike()) startKeepAlive({ title: state.meetingTitle || 'Meeting AI' }).then(ok => log(`keep-alive ${ok ? 'on' : 'unavailable'}`));
  if (window.__nativeBridge?.isNative && window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'recordingStarted', title: state.meetingTitle || 'Meeting AI',
    }));
  }
  recTimers.clearAll();
  recTimers.every('clock', 1000, () => renderClock(getElapsedMs()));
  recTimers.after('maxDuration', MAX_RECORDING_MS, () => {
    pause('maxDuration');
    showToast(t('guard.max_duration'), 'warning');
  });
  hooks.onRecordingTimers?.(recTimers);
  hooks.onSessionTimers?.(sessionTimers);
  renderClock(getElapsedMs());
}

/**
 * @param {'user'|'idle'|'maxDuration'|'end'|'switch'} reason
 */
export async function pause(reason = 'user') {
  if (state.phase !== 'recording') { log(`pause(${reason}) ignored in phase ${state.phase}`); return false; }

  if (reason !== 'end' && stt?.supportsPause) stt.pause();
  else stopStt();

  if (window.__nativeBridge?.isNative && window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'recordingStopped' }));
  }
  if (state._audioRecordingActive) {
    await stopAudioRecording().catch(() => {});
    state._audioRecordingActive = false;
  }
  state.pauseStartTime = Date.now();
  clearInterim();
  recTimers.clearAll();
  stopKeepAlive();

  applyPhase('paused', reason);
  emit('recording:stopped');
  hooks.autoSave?.();
  return true;
}

/** paused → ended (after the meeting has been persisted by the caller). */
export function markEnded() {
  if (state.phase === 'recording') { log('markEnded() while recording — pausing first'); pause('end'); }
  if (state.phase !== 'paused') { log(`markEnded() ignored in phase ${state.phase}`); return false; }
  applyPhase('ended', 'finalize');
  return true;
}

/** Draft / crash recovery: idle → paused with restored content. */
export function adoptDraft(draft, source) {
  if (state.phase !== 'idle') reset();
  state.meetingId = draft.meetingId;
  state.meetingTitle = draft.meetingTitle || '';
  state.meetingStartTime = draft.meetingStartTime;
  state.pausedDuration = draft.pausedDuration || 0;
  // Everything since the draft was saved counts as pause time
  state.pauseStartTime = draft.savedAt || Date.now();
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
  state.source = 'live';

  state.transcript.forEach(line => addTranscriptLine(line));
  state.memos.forEach(memo => addMemoLine(memo));
  loadChatHistory();
  if (state.currentAnalysis) renderAnalysis(state.currentAnalysis);
  renderClock(getElapsedMs());

  const launcher = $('#launcherModal');
  if (launcher) launcher.hidden = true;

  setSessionStatusOverride(source === 'crash' ? t('draft.crash_recovered_status') : t('draft.recovered_status'));
  applyPhase('paused', `adoptDraft:${source}`);
  hooks.onSessionTimers?.(sessionTimers);
}

/** Pasted / uploaded transcript: idle → paused (source=imported). */
export function adoptImport(transcript, type) {
  if (state.phase !== 'idle') reset();
  state.meetingId = generateId();
  state.meetingStartTime = transcript[0]?.timestamp || Date.now();
  state.isImported = true;
  state.importType = type;
  state.source = 'imported';
  state.transcript = transcript;
  state.pausedDuration = 0;
  state.pauseStartTime = Date.now();
  transcript.forEach(line => addTranscriptLine(line));
  applyPhase('paused', `adoptImport:${type}`);
  hooks.autoSave?.();
}

/** Open a saved meeting read-only-ish: any → ended (source=loaded). */
export function loadMeeting(meeting) {
  reset();
  state.meetingId = meeting.id;
  state.meetingTitle = meeting.title || '';
  state.meetingStartTime = meeting.startTime || meeting.createdAt;
  state.meetingLocation = meeting.location || '';
  state.transcript = meeting.transcript || [];
  state.memos = meeting.memos || [];
  state.analysisHistory = meeting.analysisHistory || [];
  state.chatHistory = meeting.chatHistory || [];
  state.userInsights = meeting.userInsights || [];
  state.tags = meeting.tags || [];
  state.starRating = meeting.starRating || 3;
  state.categories = meeting.categories || [];
  state.participants = meeting.participants || [];
  state.analysisContext = meeting.analysisContext || '';
  state.loadedMeetingId = meeting.id;
  state.loadedMeetingOriginal = JSON.parse(JSON.stringify(meeting));
  state.source = 'loaded';
  state.pausedDuration = 0;
  state.pauseStartTime = null;

  const merged = [
    ...state.transcript.map(l => ({ ...l, _type: 'transcript' })),
    ...state.memos.map(m => ({ ...m, _type: 'memo' })),
  ].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  merged.forEach(item => (item._type === 'memo' ? addMemoLine(item) : addTranscriptLine(item)));

  const lastAnalysis = state.analysisHistory[state.analysisHistory.length - 1];
  if (lastAnalysis) {
    state.currentAnalysis = lastAnalysis;
    renderAnalysis(lastAnalysis);
  }
  loadChatHistory();
  renderClock(getElapsedMs());

  applyPhase('ended', 'loadMeeting');
}

/** any → idle. Clears content, timers, STT, and lifecycle chrome. */
export function reset() {
  stopStt();
  stopKeepAlive();
  if (state._audioRecordingActive) {
    // Fire-and-forget: the recorder finalizes the old meeting's chunks on its own.
    stopAudioRecording().catch(() => {});
  }
  recTimers.clearAll();
  sessionTimers.clearAll();
  hooks.clearDraftRecovery?.();

  state.meetingId = null;
  state.meetingStartTime = null;
  state.pausedDuration = 0;
  state.pauseStartTime = null;
  state.sttEngineName = null;
  state.isImported = false;
  state.importType = null;
  state._audioRecordingActive = false;
  state._audioRecorded = false;
  state.loadedMeetingId = null;
  state.loadedMeetingOriginal = null;
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
  state.source = 'live';
  webspeechFatalCount = 0;
  switchOfferShown = false;

  const tl = $('#transcriptList'); if (tl) tl.innerHTML = '';
  resetTranscriptEmpty();
  const ai = $('#aiSections'); if (ai) ai.innerHTML = '';
  resetAiEmpty();
  const chat = $('#chatMessages'); if (chat) chat.innerHTML = '';
  resetChatEmpty();

  hooks.onReset?.();
  const wasIdle = state.phase === 'idle';
  applyPhase('idle', 'reset');
  if (wasIdle) syncSessionUI(); // no transition fired; still redraw chrome
}

// ===== Background return: the only visibilitychange listener for the lifecycle =====
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible') return;
  if (state.phase !== 'recording') return;
  acquireWakeLock();
  if (stt && stt.isRunning) return;
  log('page visible — STT died in background, restarting');
  const ok = await startStt({ withStream: false });
  if (ok) showToast(t('stt.reconnected'), 'success');
});
