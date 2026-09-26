// recording.js - Recording lifecycle, STT, analysis, correction, auto-save, idle detection

import { state, emit } from './event-bus.js';
import { modelFor } from './models.js';
import { hasRecording, getCurrentRecordingSize, deleteRecording } from './audio-recorder.js';
import * as session from './meeting-session.js';
import { initSessionUI } from './session-ui.js';
import { escapeHtml } from './utils.js';
import { analyzeTranscript, correctSentences, generateMeetingTitle, generateFinalMinutes, suggestMeetingMetadata } from './ai.js';
import { isAiAvailable } from './gemini-api.js';
import {
  saveMeeting, getMeeting, deleteMeeting,
  loadContacts, loadLocations, addLocation,
  getLocationFrequency, linkMeetings,
  loadCorrectionDict,
} from './storage.js';
import {
  showToast, showCenterToast, showWhisperToast,
  showAnalysisSkeletons, renderAnalysis,
  updateTranscriptLineUI,
  showAiWaiting, showChatWaiting,
} from './ui.js';
import { t, getDateLocale } from './i18n.js';
import { confirmDialog } from './ui/dialogs.js';
import { showLauncherModal } from './launcher.js';

const $ = (sel) => document.querySelector(sel);

export function buildFullProfile() {
  return state.settings.userProfile || '';
}

// ===== Core Logic =====
let isAnalyzing = false;
let isCorrecting = false;
let charsSinceLastAnalysis = 0;
let linesSinceLastAnalysis = 0;
let charsSinceLastCorrection = 0;

// Guard: idle detection (max duration lives in meeting-session.js)
const IDLE_WARNING_MS = 15 * 60 * 1000;
const IDLE_AUTOPAUSE_MS = 20 * 60 * 1000;
const MAX_RECORDING_MS = 6 * 60 * 60 * 1000;
let lastTranscriptTime = 0;
let idleWarningShown = false;

export const generateId = session.generateId;
const getTotalPausedMs = session.getTotalPausedMs;

// ===== Lifecycle wiring =====
// meeting-session.js owns phase / STT / timers / chrome. This file keeps analysis,
// correction, persistence and the end-meeting modal, and plugs in through hooks.
session.configureSession({
  onFinalLine: (line) => {
    checkCharThreshold(line.text);
    lastTranscriptTime = Date.now();
    idleWarningShown = false;
  },
  onReplaceLine: () => { lastTranscriptTime = Date.now(); },
  autoSave: () => autoSave(),
  clearDraftRecovery: () => clearDraftRecovery(),
  onRecordingTimers: (timers) => {
    timers.every('autoSave', 30000, () => autoSave());
    timers.every('idle', 60000, () => checkIdle());
    timers.every('audioSize', 10000, () => updateAudioRecBadge());
    startAutoAnalysis(timers);
    startAiCorrection();
    lastTranscriptTime = Date.now();
    idleWarningShown = false;
    updateAudioRecBadge();
  },
  onSessionTimers: (timers) => {
    timers.every('draft', 15000, () => { saveDraft(); saveActiveSession(); });
  },
});

initSessionUI({
  onResume: async () => {
    if (state.source === 'loaded') {
      if (!(await confirmDialog({ message: t('loaded.resume_confirm'), confirmText: t('dialog.resume') }))) return;
      showToast(t('loaded.resumed'), 'info');
      await resumeFromLoaded();
    } else {
      await resumeMeeting();
    }
  },
  onNew: () => resetMeeting(),
  onDocGen: () => emit('docGenerator:open'),
  onEditInfo: () => {
    const m = getMeeting(state.loadedMeetingId);
    if (m) showEndMeetingModal(m);
  },
});

// ===== Draft Recovery (sessionStorage + localStorage crash recovery) =====
const DRAFT_KEY = 'meeting-ai-draft';
const ACTIVE_SESSION_KEY = 'meeting-ai-active-session';

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
  session.sessionTimers.clear('draft');
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
      ${isCrashRecovery ? `<button class="btn btn-sm" id="btnDraftSaveEnd">${t('draft.save_and_end')}</button>` : ''}
      <button class="draft-recovery-close" id="btnDraftDismiss" type="button" aria-label="${t('a11y.close')}" title="${t('a11y.close')}">&times;</button>
    </div>
  `;
  // In normal flow right under the app header (pushes content down) so it never
  // covers the logo / timer / header buttons. app.js holds back the start-up
  // launcher while it's shown; dismissing hides the banner (the draft stays
  // saved and is offered again on the next reload) and opens the launcher.
  const header = document.querySelector('.header');
  if (header) header.after(banner);
  else document.body.prepend(banner);
  $('#btnDraftDismiss').onclick = () => {
    banner.remove();
    if (!state.isRecording) showLauncherModal();
  };

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
  session.adoptDraft(draft, source);
  // Multi-tab lock: mark this tab as owning this meeting
  sessionStorage.setItem('meeting-ai-tab-' + state.meetingId, '1');
  showToast(source === 'crash' ? t('toast.crash_recovered') : t('toast.draft_recovered'), 'success');
}

export function getElapsedTimeStr() {
  if (!state.meetingStartTime) return 'unknown';
  const mins = Math.floor(session.getElapsedMs() / 60000);
  return t('minutes', { n: mins });
}

function afterRecordingStarted() {
  showAiWaiting(state.settings.analysisCharThreshold || 1000);
  showChatWaiting();
  // No "recording started" toast: the bottom bar's recording state says it.
}

/** Resume a meeting opened from history (source=loaded). */
export async function resumeFromLoaded() {
  if (state.phase === 'recording' || !state.loadedMeetingId) return;
  if (await session.resume()) afterRecordingStarted();
}

/** REC button: start a new meeting, or resume the paused/ended one. */
export async function startRecording() {
  if (state.phase === 'recording') return;
  if (state.loadedMeetingId) return; // use resumeFromLoaded()
  const ok = state.phase === 'idle' ? await session.start() : await session.resume();
  if (ok) afterRecordingStarted();
}

/** Open a saved meeting into the workspace (source=loaded). */
export function loadMeeting(meeting) {
  session.loadMeeting(meeting);
}

/** paused → ended once the meeting has been persisted by the caller. */
export function markEnded() {
  session.markEnded();
}

/** Pasted / uploaded transcript becomes a paused meeting. */
export function adoptImport(transcript, type) {
  session.adoptImport(transcript, type);
}

/** Pause (the REC button's second click). Kept under its historical name. */
export async function stopRecording() {
  await session.pause('user');
}

async function resumeMeeting() {
  // The bottom bar switching back to its red recording state is the confirmation.
  await session.resume();
}

function checkIdle() {
  if (state.phase !== 'recording') return;
  const idleMs = Date.now() - lastTranscriptTime;
  if (idleMs >= IDLE_AUTOPAUSE_MS) {
    session.pause('idle');
    showToast(t('guard.idle_auto_stopped'), 'warning');
  } else if (idleMs >= IDLE_WARNING_MS && !idleWarningShown) {
    idleWarningShown = true;
    showToast(t('guard.idle_warning'), 'warning');
  }
}

function startAutoAnalysis(timers) {
  if (!state.settings.autoAnalysis) return;
  charsSinceLastAnalysis = 0;
  linesSinceLastAnalysis = 0;
  charsSinceLastCorrection = 0;
  // 10-minute fallback timer: run analysis if at least 3 lines accumulated
  timers.every('autoAnalysis', 10 * 60 * 1000, () => {
    if (state.phase === 'recording' && linesSinceLastAnalysis >= 3) runAnalysis();
  });
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
}

// AI sentence correction (triggered by char threshold in checkCharThreshold)
function startAiCorrection() {
  charsSinceLastCorrection = 0;
}

export async function runCorrection(uncorrectedOnly) {
  if (isCorrecting || !isAiAvailable()) return;
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
        model: modelFor('correction'),
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
  if (!isAiAvailable()) {
    showToast(t('toast.ai_unavailable'), 'warning');
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
      model: modelFor('analysis'), // live analysis: light tier (runs every ~1000 chars)
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
    hasAudio: !!(state._audioRecordingActive || state._audioRecorded),
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

async function proceedEndMeeting() {
  emit('meeting:ending');
  await session.pause('end');
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
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
          <button class="btn" id="btnEndConfirmCancel">${t('end_confirm.cancel')}</button>
          <button class="btn btn-primary" id="btnEndConfirmOk">${t('end_confirm.confirm')}</button>
        </div>
        <button class="btn btn-discard" id="btnEndConfirmDiscard" style="margin-top:12px;"><svg class="icon-16" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg><span>${t('discard.button')}</span></button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#btnEndConfirmCancel').onclick = () => overlay.remove();
  overlay.querySelector('#btnEndConfirmOk').onclick = () => {
    overlay.remove();
    onConfirm();
  };
  overlay.querySelector('#btnEndConfirmDiscard').onclick = () => {
    overlay.remove();
    discardMeeting();
  };
  // Clicking overlay background closes
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}


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
  if (!isEditMode && isAiAvailable() && state.transcript.length > 0) {
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
  // "0 B" is noise — keep the badge hidden until there is real audio.
  badge.classList.toggle('is-empty', size <= 0);
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
  if (isEditMode || !(state._audioRecordingActive || state._audioRecorded)) {
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
  const dlLabel = $('#btnEndMeetingAudioDownloadLabel') || dlBtn;
  if (dlBtn) {
    dlBtn.onclick = async () => {
      const title = $('#endMeetingTitle')?.value?.trim() || state.meetingTitle || 'recording';
      const ok = await downloadAudioFile(state.meetingId, title);
      if (!ok) { showToast(t('end_meeting.audio_not_found'), 'warning'); return; }
      dlLabel.textContent = '✓ ' + t('end_meeting.audio_downloaded');
      dlBtn.disabled = true;
      setTimeout(() => {
        dlLabel.textContent = t('end_meeting.download_audio');
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

  // Generate Minutes button (minutes always run on the heavy tier — no model picker)
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
      // Start generation after a tick (to allow state to settle)
      setTimeout(() => emit('minutes:generate'), 100);
    };
  } else {
    genBtn.onclick = () => emit('minutes:generate');
  }

  // Determine transcript for checking
  const transcript = isEditMode
    ? (getMeeting(state._editMeetingId)?.transcript || [])
    : state.transcript;

  // Hide generate button if no proxy or no transcript
  if (!isAiAvailable() || transcript.length === 0) {
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
  if (!isAiAvailable() || transcript.length === 0) {
    docGenBtn.hidden = true;
  }

  // Discard (delete everything, no save) — only for the live meeting, not for editing a saved one
  if (!isEditMode) {
    const discardBtn = document.createElement('button');
    discardBtn.className = 'btn btn-discard';
    discardBtn.id = 'btnDiscardMeeting';
    discardBtn.innerHTML = '<svg class="icon-16" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
    discardBtn.append(Object.assign(document.createElement('span'), { textContent: t('discard.button') }));
    discardBtn.onclick = () => discardMeeting();
    actions.append(discardBtn);
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
    item.innerHTML = `<span style="color:var(--accent)">+ </span><span>${t('end_meeting.add_location') || 'Add'} "<strong>${escapeHtml(query.trim())}</strong>"</span>`;
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
  if (isAiAvailable() && hasUncorrected && state.transcript.length > 0) {
    await runCorrection(false);
  }

  session.markEnded();
  autoSave();
  clearDraftRecovery();

  // Auto-download audio if enabled
  if (state.settings.audioAutoDownload && (state._audioRecordingActive || state._audioRecorded)) {
    const title = state.meetingTitle || 'recording';
    await downloadAudioFile(state.meetingId, title);
  }

  // Close modal and show toast
  footer.classList.remove('save-progress-state');
  if (body) body.classList.remove('disabled-form');
  $('#endMeetingModal').hidden = true;
  showCenterToast(t('end_meeting.save_complete'));
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
    model: modelFor('minutes'),
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

// `model` is kept for callers; minutes always run on the heavy tier (models.js).
export async function regenerateMinutes(model, template, promptConfig = {}) {
  await generateFinalMeetingMinutes(template, promptConfig);
}

export function cancelEndMeeting() {
  $('#endMeetingModal').hidden = true;
}

// ===== Discard (cancel the whole meeting, nothing is kept) =====

/** Ask for confirmation, then delete transcript, memos, analyses, autosaves, draft and audio. */
export function discardMeeting() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay end-confirm-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:420px;">
      <div class="modal-body" style="padding:24px;text-align:center;">
        <p style="font-size:1.05rem;margin-bottom:6px;">${t('discard.title')}</p>
        <p style="color:var(--danger);font-size:0.9rem;margin-bottom:4px;">${t('discard.warning')}</p>
        <p style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:16px;">
          ${t('discard.stats', { lines: state.transcript.length, memos: state.memos.length })}
        </p>
        <div style="display:flex;gap:8px;justify-content:center;">
          <button class="btn" id="btnDiscardCancel">${t('discard.cancel')}</button>
          <button class="btn btn-danger" id="btnDiscardOk" style="border:1px solid var(--danger);">${t('discard.confirm')}</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#btnDiscardCancel').onclick = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#btnDiscardOk').onclick = async () => {
    overlay.remove();
    await performDiscard();
  };
}

async function performDiscard() {
  const id = state.meetingId;
  $('#endMeetingModal').hidden = true;
  if (state.phase === 'recording') await session.pause('end');
  clearDraftRecovery();
  if (id) {
    try { deleteMeeting(id); } catch { /* nothing saved yet */ }
    try { await deleteRecording(id); } catch { /* no audio */ }
    if (window.deleteMeetingWithSync) window.deleteMeetingWithSync(id);
    try { sessionStorage.removeItem('meeting-ai-tab-' + id); } catch { /* ignore */ }
  }
  resetMeeting();
  window.dispatchEvent(new CustomEvent('meetingai:cloud-sync')); // refresh history grid
  showToast(t('toast.meeting_discarded'), 'success');
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

export function resetMeeting(skipLauncher = false) {
  session.reset();
  if (!skipLauncher) showLauncherModal();
}
