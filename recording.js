// recording.js - Recording lifecycle, STT, analysis, correction, auto-save, idle detection

import { state, on, emit } from './event-bus.js';
import { createSTT } from './stt.js';
import { analyzeTranscript, generateTags, correctSentences, generateMeetingTitle, generateFinalMinutes } from './ai.js';
import { isProxyAvailable } from './gemini-api.js';
import {
  saveMeeting, loadSettings, saveSettings,
  loadContacts, addContact, loadLocations, addLocation, loadCategories,
  loadCorrectionDict, addCorrectionEntry,
} from './storage.js';
import {
  showToast, showCenterToast, addTranscriptLine, showInterim, clearInterim,
  showAnalysisSkeletons, renderAnalysis, renderHighlights,
  updateTranscriptLineUI, removeTranscriptLineUI,
  showTranscriptConnecting, showTranscriptWaiting, hideTranscriptWaiting, resetTranscriptEmpty,
  showAiWaiting, hideAiWaiting, resetAiEmpty,
  showChatWaiting, resetChatEmpty,
  addMemoLine, getAnalysisAsText,
} from './ui.js';
import { t, getDateLocale, getAiLanguage } from './i18n.js';
import { showLauncherModal } from './launcher.js';

const $ = (sel) => document.querySelector(sel);

export function buildFullProfile() {
  return state.settings.userProfile || '';
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

// Guard: idle detection + max duration
const IDLE_WARNING_MS = 15 * 60 * 1000;
const IDLE_AUTOPAUSE_MS = 20 * 60 * 1000;
const MAX_RECORDING_MS = 6 * 60 * 60 * 1000;
let lastTranscriptTime = 0;
let idleCheckInterval = null;
let idleWarningShown = false;
let maxDurationTimeout = null;

let minutesGenerated = false;
let minutesSkipped = false;

export function generateId() {
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

export function getElapsedTimeStr() {
  if (!state.meetingStartTime) return 'unknown';
  // In loaded mode, use last transcript timestamp instead of current time
  if (state.loadedMeetingId && state.transcript.length > 0) {
    const lastTs = state.transcript[state.transcript.length - 1].timestamp;
    const diff = lastTs - state.meetingStartTime;
    const mins = Math.floor(diff / 60000);
    return t('minutes', { n: mins });
  }
  const diff = Date.now() - state.meetingStartTime;
  const mins = Math.floor(diff / 60000);
  return t('minutes', { n: mins });
}

export async function startRecording() {
  if (state.isRecording) return;
  if (state.loadedMeetingId) return; // Cannot record while a past meeting is loaded

  stt = createSTT();

  try {
    await stt.start({
      language: state.settings.language || 'ko',
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

export function stopRecording() {
  if (!state.isRecording) return;

  stt?.stop();
  stt = null;
  state.isRecording = false;
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
  $('#meetingStatus').textContent = t('record.status_paused');
  const badge = $('#sttEngineBadge');
  if (badge) badge.hidden = true;

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
      userProfile: buildFullProfile(),
      model: state.settings.geminiModel || 'gemini-2.5-flash',
      userCorrections: corrections,
    });

    // Clear corrections after they've been sent (one-shot)
    if (corrections.length > 0) {
      state.analysisCorrections = [];
    }

    state.currentAnalysis = result;
    result.transcriptLength = state.transcript.length;
    state.analysisHistory.push(result);
    renderAnalysis(result);

    // Auto-generate tags
    if (result.summary && state.tags.length === 0) {
      generateTags({
        summary: result.summary,
        transcript: state.transcript,
        model: 'gemini-2.5-flash-lite',
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
    preset: state.settings.meetingPreset || 'general',
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
  };
  const result = saveMeeting(meeting);
  if (result.warning === 'storage_high') {
    showToast(t('toast.storage_high'), 'warning');
  }
}

export function endMeeting() {
  stopRecording();
  state.meetingTitle = $('#meetingTitleInput')?.value || state.meetingTitle;
  showMinutesGenModal();
}

function showMinutesGenModal() {
  const modal = $('#minutesGenModal');
  minutesGenerated = false;
  minutesSkipped = false;

  if (!isProxyAvailable() || state.transcript.length === 0) {
    showEndMeetingModal();
    return;
  }

  modal.hidden = false;

  const handleCardClick = (model) => {
    state.settings.geminiModel = model;
    modal.hidden = true;

    // Background generation (don't await)
    generateFinalMeetingMinutes().then(() => {
      minutesGenerated = true;
      updateExportButton();
      showToast(t('toast.final_minutes_done'), 'success');
    }).catch(err => {
      showToast(t('toast.final_minutes_fail') + err.message, 'error');
      updateExportButton();
    });

    showToast(t('toast.minutes_generating_bg'), 'info');
    showEndMeetingModal();
  };

  $('#btnQualityFlash').onclick = () => handleCardClick('gemini-2.5-flash');
  $('#btnQualityPro').onclick = () => handleCardClick('gemini-2.5-pro');
  $('#btnMinutesSkip').onclick = () => { modal.hidden = true; minutesSkipped = true; showEndMeetingModal(); };
}

function updateExportButton() {
  const btn = $('#btnEndMeetingExport');
  if (!btn) return;
  const spinner = btn.querySelector('.btn-spinner');
  const textEl = btn.querySelector('.btn-export-text');

  if (minutesGenerated) {
    btn.disabled = false;
    btn.classList.remove('btn-loading');
    if (spinner) spinner.hidden = true;
    if (textEl) textEl.textContent = t('end_meeting.export_minutes');
  } else if (minutesSkipped) {
    btn.disabled = false;
    btn.classList.remove('btn-loading');
    if (spinner) spinner.hidden = true;
    if (textEl) textEl.textContent = t('end_meeting.export_transcript');
  } else {
    btn.disabled = true;
    btn.classList.add('btn-loading');
    if (spinner) spinner.hidden = false;
    if (textEl) textEl.textContent = t('end_meeting.export_generating');
  }
}

function showEndMeetingModal() {
  const modal = $('#endMeetingModal');
  modal.hidden = false;

  // Populate date/time (auto-generated from meeting start, editable)
  const meetingDate = new Date(state.meetingStartTime || Date.now());
  const datetimeInput = $('#endMeetingDatetime');
  const pad = n => String(n).padStart(2, '0');
  datetimeInput.value = `${meetingDate.getFullYear()}-${pad(meetingDate.getMonth() + 1)}-${pad(meetingDate.getDate())}T${pad(meetingDate.getHours())}:${pad(meetingDate.getMinutes())}`;

  const titleInput = $('#endMeetingTitle');
  titleInput.value = state.meetingTitle || '';

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

  // Update export button state
  updateExportButton();

  // AI title/tag generation
  const suggestionsEl = $('#aiTitleSuggestions');
  const chipsEl = $('#aiTitleChips');
  if (isProxyAvailable() && state.transcript.length > 0) {
    suggestionsEl.hidden = false;
    suggestionsEl.querySelector('.ai-suggestions-label').textContent = t('end_meeting.title_hint');
    chipsEl.innerHTML = '';

    generateMeetingTitle({
      transcript: state.transcript,
      existingTitle: state.meetingTitle,
    }).then(result => {
      if (!result) { suggestionsEl.hidden = true; return; }
      suggestionsEl.querySelector('.ai-suggestions-label').textContent = t('end_meeting.title_hint');

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

export function renderEndMeetingTags() {
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

export function updateStarRating(rating) {
  state.starRating = rating;
  document.querySelectorAll('#endMeetingStars .star-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.star) <= rating);
  });
}

export function renderEndMeetingParticipants() {
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
    const p = document.createElement('p');
    p.className = 'text-muted';
    p.style.fontSize = '11px';
    p.textContent = t('end_meeting.no_participants');
    listContainer.appendChild(p);
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

export async function finalizeEndMeeting() {
  state.meetingTitle = $('#endMeetingTitle').value.trim();
  state.meetingLocation = $('#endMeetingLocation').value.trim();
  if (state.meetingLocation) addLocation(state.meetingLocation);

  // Save datetime
  const dtVal = $('#endMeetingDatetime').value;
  if (dtVal) state.meetingStartTime = new Date(dtVal).getTime();

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

async function generateFinalMeetingMinutes() {
  showAnalysisSkeletons();

  const result = await generateFinalMinutes({
    transcript: state.transcript,
    analysisHistory: state.analysisHistory,
    meetingContext: state.settings.meetingContext,
    meetingPreset: state.settings.meetingPreset,
    elapsedTime: getElapsedTimeStr(),
    memos: state.memos,
    userProfile: buildFullProfile(),
    model: state.settings.geminiModel || 'gemini-2.5-flash',
  });

  state.currentAnalysis = result;
  result.transcriptLength = state.transcript.length;
  state.analysisHistory.push(result);
  renderAnalysis(result);
  autoSave();

  emit('analysis:complete', result);
}

export function cancelEndMeeting() {
  $('#endMeetingModal').hidden = true;
}

function showPostEndButtons() {
  // 기존 버튼이 있으면 먼저 제거 (중복 방지)
  const existingResume = $('#btnResumeMeeting');
  const existingExport = $('#btnPostExport');
  const existingNew = $('#btnNewMeeting');
  if (existingResume) existingResume.remove();
  if (existingExport) existingExport.remove();
  if (existingNew) existingNew.remove();

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
  if (resume) resume.remove();
  if (exportBtn) exportBtn.remove();
  if (newBtn) newBtn.remove();
}

export function resetMeeting() {
  state.meetingEnded = false;
  state.meetingStartTime = null;
  // Clear loaded meeting state
  state.loadedMeetingId = null;
  state.loadedMeetingOriginal = null;
  const banner = document.querySelector('#loadedMeetingBanner');
  if (banner) banner.hidden = true;
  document.body.classList.remove('loaded-mode');
  // Reset record button and hide end meeting button
  const recBtn = $('#btnRecord');
  recBtn.classList.remove('recording', 'paused');
  recBtn.querySelector('.record-label').textContent = t('record.label');
  const badge = $('#sttEngineBadge');
  if (badge) badge.hidden = true;
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
  state.analysisContext = '';
  state.analysisCorrections = [];
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
  showLauncherModal();
}
