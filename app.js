// app.js - Initialization and event wiring

import { state, on, emit } from './event-bus.js';
export { state, on, emit }; // re-export for backward compatibility

import { checkProxyAvailable } from './gemini-api.js';
import {
  getMeeting, deleteMeeting, updateMeetingTags,
  loadSettings, saveSettings, getStorageUsage,
  addContact, loadCategories,
  addCorrectionEntry,
} from './storage.js';
import {
  initDragResizer, initPanelTabs, addTranscriptLine,
  addMemoLine, renderAnalysis, renderHighlights,
  renderMeetingViewer, renderInboxPreview,
  initModals, initContextPopup, toggleTheme, initKeyboardShortcuts,
  showToast, showCenterToast, updateTranscriptLineUI, removeTranscriptLineUI,
  getAnalysisAsText,
} from './ui.js';
import { refreshHistoryGrid, refreshHistoryGridDebounced } from './history.js';
import { initSettings, closeSettings, tryCloseSettings } from './settings.js';
import { initChat, loadChatHistory, renderMarkdown } from './chat.js';
import { initMeetingPrepForm, openMeetingPrepForm, isMeetingPrepActive } from './meeting-prep.js';
import { t, setLanguage, setAiLanguage, getDateLocale, getAiLanguage } from './i18n.js';
import { refineSectionContent, getDefaultMinutesPrompt } from './ai.js';
import { parseMarkdownBlocks, blocksToMarkdown } from './ui/analysis.js';
import { handleExport, handleExportMeeting, getExportContent, downloadFile } from './export-md.js';
import { exportPDF, exportWord } from './export-doc.js';
import { showLauncherModal } from './launcher.js';
import { openCompareModal, runCompareAnalysis, applyComparePromptAsDefault } from './compare.js';
import {
  generateId, startRecording, stopRecording, endMeeting,
  runAnalysis, autoSave, finalizeEndMeeting, cancelEndMeeting,
  updateStarRating, renderEndMeetingTags, renderEndMeetingParticipants,
  runCorrection, resetMeeting, getElapsedTimeStr, regenerateMinutes,
  checkDraftRecovery,
} from './recording.js';
import { prefetchDeepgramToken } from './stt.js';

const $ = (sel) => document.querySelector(sel);

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
  initMeetingPrepForm();

  // Check if Vertex AI proxy is available (for keyless operation)
  checkProxyAvailable();

  // Pre-fetch Deepgram token on mobile for faster STT start
  prefetchDeepgramToken();

  // ===== Draft Recovery =====
  checkDraftRecovery();

  // ===== Launcher Modal =====
  if (!state.isRecording) {
    showLauncherModal();
  }

  // ===== Event Bindings =====

  // Record button
  $('#btnRecord').addEventListener('click', () => emit('recording:toggle'));
  on('recording:toggle', async () => {
    if (state.loadedMeetingId) {
      showToast(t('loaded.recording_block'), 'warning');
      return;
    }
    if (state.isRecording) stopRecording();
    else await startRecording();
  });

  // End meeting (with confirmation)
  $('#btnEndMeeting').addEventListener('click', () => endMeeting());

  // Analyze now (with 10s cooldown)
  let lastManualAnalysisTime = 0;
  const btnAnalyzeNow = $('#btnAnalyzeNow');
  btnAnalyzeNow.addEventListener('click', () => {
    const now = Date.now();
    if (now - lastManualAnalysisTime < 10000) {
      showToast(t('toast.analyze_cooldown'), 'warning');
      return;
    }
    lastManualAnalysisTime = now;
    btnAnalyzeNow.disabled = true;
    let remaining = 10;
    const origText = btnAnalyzeNow.textContent;
    const cooldownTimer = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(cooldownTimer);
        btnAnalyzeNow.disabled = false;
        btnAnalyzeNow.textContent = origText;
      } else {
        btnAnalyzeNow.textContent = `${remaining}s`;
      }
    }, 1000);
    runAnalysis();
  });

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


  // Meeting title input binding
  $('#meetingTitleInput')?.addEventListener('input', (e) => {
    state.meetingTitle = e.target.value;
  });

  // End Meeting Modal events
  $('#btnEndMeetingSave').addEventListener('click', () => finalizeEndMeeting());
  $('#btnEndMeetingCancel').addEventListener('click', () => cancelEndMeeting());
  $('#btnEndMeetingExport').addEventListener('click', () => {
    if ($('#btnEndMeetingExport').disabled) {
      showCenterToast(t('toast.minutes_still_generating'));
      return;
    }
    // If minutes exist, show preview modal; otherwise show export modal (transcript only)
    if (state.currentAnalysis?.markdown) {
      openMinutesPreview();
    } else {
      $('#exportModal').hidden = false;
    }
  });

  // Star rating clicks
  document.querySelectorAll('#endMeetingStars .star-btn').forEach(btn => {
    btn.addEventListener('click', () => updateStarRating(parseInt(btn.dataset.star)));
  });

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

  // Minutes Preview Modal
  initMinutesPreview();

  // Inbox badge
  const inboxBadge = $('#inboxBadge');
  function updateInboxBadge() {
    const count = state.transcript.filter(l => l.bookmarked).length + (state.memos?.length || 0);
    if (count > 0) {
      inboxBadge.textContent = count;
      inboxBadge.hidden = false;
      inboxBadge.classList.remove('inbox-badge-pulse');
      void inboxBadge.offsetWidth; // reflow to retrigger animation
      inboxBadge.classList.add('inbox-badge-pulse');
    } else {
      inboxBadge.hidden = true;
    }
  }

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
    updateInboxBadge();
  };
  memoInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addMemo(); });
  $('#btnAddMemo').addEventListener('click', addMemo);

  // Memo placeholder
  (() => {
    const input = $('#memoInput');
    const ph = $('#memoPlaceholder');
    ph.textContent = t('memo.placeholder.0');
    input.addEventListener('focus', () => { ph.style.display = 'none'; });
    input.addEventListener('blur', () => { if (!input.value) ph.style.display = ''; });
  })();

  // Panel hint rotation
  (() => {
    const INTERVAL = 3500;
    const FADE = 300;
    const configs = [
      { el: document.querySelector('#panelLeft .panel-hint'), key: 'hint.transcript_edit', count: 5 },
      { el: document.querySelector('#panelCenter .panel-hint'), key: 'hint.analysis_edit', count: 5 },
    ];
    configs.forEach(({ el, key, count }) => {
      if (!el) return;
      let idx = 0;
      setInterval(() => {
        el.classList.add('fade-out');
        setTimeout(() => {
          idx = (idx + 1) % count;
          el.textContent = t(key + '.' + idx);
          el.classList.remove('fade-out');
        }, FADE);
      }, INTERVAL);
    });
  })();

  // Memo from chat
  on('memo:fromChat', ({ text }) => {
    const memo = { id: generateId(), text, timestamp: Date.now() };
    state.memos.push(memo);
    addMemoLine(memo);
    emit('memo:add', memo);
    updateInboxBadge();
  });

  // Memo delete
  on('memo:delete', ({ id }) => {
    state.memos = state.memos.filter(m => m.id !== id);
    const el = document.querySelector(`.transcript-line[data-id="${id}"]`);
    if (el) el.remove();
    updateInboxBadge();
  });

  // Analysis rerun from chat
  on('analysis:rerun', () => runAnalysis());

  // Toast from other modules
  on('toast', ({ message, type }) => showToast(message, type || 'success'));

  // Export
  $('#btnExport').addEventListener('click', () => { $('#exportModal').hidden = false; });
  document.querySelectorAll('.export-fmt-btn').forEach(btn => {
    btn.addEventListener('click', () => handleExport(btn.dataset.format, btn));
  });

  // Highlights
  $('#btnBookmarks').addEventListener('click', () => {
    const searchInput = $('#inboxSearchInput');
    if (searchInput) searchInput.value = '';
    const countEl = $('#inboxSearchCount');
    if (countEl) countEl.textContent = '';
    renderHighlights('all');
    $('#highlightsModal').hidden = false;
  });
  document.querySelectorAll('.highlights-tabs .btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.highlights-tabs .btn').forEach(b => b.classList.remove('tab-active'));
      e.target.classList.add('tab-active');
      const searchTerm = $('#inboxSearchInput')?.value || '';
      renderHighlights(e.target.dataset.tab, searchTerm);
    });
  });

  // Inbox search input
  $('#inboxSearchInput')?.addEventListener('input', (e) => {
    const activeTab = document.querySelector('.highlights-tabs .tab-active')?.dataset.tab || 'all';
    renderHighlights(activeTab, e.target.value);
  });

  // Inbox preview dropdown on hover
  (() => {
    const wrap = document.querySelector('.inbox-btn-wrap');
    const dropdown = $('#inboxPreviewDropdown');
    if (!wrap || !dropdown) return;
    let hoverTimeout = null;

    wrap.addEventListener('mouseenter', () => {
      clearTimeout(hoverTimeout);
      const hasItems = renderInboxPreview();
      if (hasItems) dropdown.hidden = false;
    });

    wrap.addEventListener('mouseleave', () => {
      hoverTimeout = setTimeout(() => { dropdown.hidden = true; }, 150);
    });

    $('#inboxPreviewViewAll')?.addEventListener('click', () => {
      dropdown.hidden = true;
      const searchInput = $('#inboxSearchInput');
      if (searchInput) searchInput.value = '';
      const countEl = $('#inboxSearchCount');
      if (countEl) countEl.textContent = '';
      renderHighlights('all');
      $('#highlightsModal').hidden = false;
    });
  })();


  // Analysis user corrections (one-shot for next analysis)
  on('analysis:userCorrections', (corrections) => {
    state.analysisCorrections.push(...corrections);
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
      updateInboxBadge();
    }
  });

  on('transcript:delete', ({ id }) => {
    state.transcript = state.transcript.filter(l => l.id !== id);
    removeTranscriptLineUI(id);
  });

  on('transcript:edit', ({ id, text, original }) => {
    // Register user correction to the global correction dictionary
    if (original && text && original !== text) {
      addCorrectionEntry(original, text);
    }
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

  // ===== Load past meeting into home screen =====
  on('meeting:load', ({ id }) => {
    if (state.isRecording) {
      showToast(t('loaded.recording_block'), 'warning');
      return;
    }
    const meeting = getMeeting(id);
    if (!meeting) return;

    // Reset current state
    resetMeeting();

    // Restore all fields from saved meeting
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

    // Set loaded mode
    state.loadedMeetingId = id;
    state.loadedMeetingOriginal = JSON.parse(JSON.stringify(meeting));

    // Render transcript + memos merged by timestamp
    const merged = [
      ...state.transcript.map(l => ({ ...l, _type: 'transcript' })),
      ...state.memos.map(m => ({ ...m, _type: 'memo' })),
    ].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    merged.forEach(item => {
      if (item._type === 'memo') addMemoLine(item);
      else addTranscriptLine(item);
    });

    // Render latest analysis
    const lastAnalysis = state.analysisHistory[state.analysisHistory.length - 1];
    if (lastAnalysis) {
      state.currentAnalysis = lastAnalysis;
      renderAnalysis(lastAnalysis);
    }

    // Load chat history
    loadChatHistory();

    // Show meeting timer with loaded meeting duration
    if (state.meetingStartTime && state.transcript.length > 0) {
      const lastTs = state.transcript[state.transcript.length - 1].timestamp;
      const diff = lastTs - state.meetingStartTime;
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      $('#meetingTimer').textContent =
        `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    // Show title input
    const titleInput = $('#meetingTitleInput');
    if (titleInput) {
      titleInput.hidden = false;
      titleInput.value = state.meetingTitle;
    }

    // Show banner
    const banner = $('#loadedMeetingBanner');
    $('#loadedBannerTitle').textContent = state.meetingTitle || t('history.untitled');
    $('#loadedBannerDate').textContent = new Date(state.meetingStartTime).toLocaleDateString();
    banner.hidden = false;
    document.body.classList.add('loaded-mode');
    $('#meetingStatus').textContent = t('history.load');

    // Close history & viewer modals
    $('#historyModal').hidden = true;
    $('#viewerModal').hidden = true;
    updateInboxBadge();
  });

  // Banner close -> save dialog
  $('#loadedBannerClose').addEventListener('click', () => closeLoadedMeeting());

  // Save modal buttons
  $('#btnLoadedOverwrite').addEventListener('click', () => {
    autoSave();
    showToast(t('loaded.saved'), 'success');
    $('#loadedSaveModal').hidden = true;
    resetMeeting();
  });
  $('#btnLoadedSaveCopy').addEventListener('click', () => {
    state.meetingId = generateId(); // new ID = new copy
    autoSave();
    showToast(t('loaded.saved_copy'), 'success');
    $('#loadedSaveModal').hidden = true;
    resetMeeting();
  });
  $('#btnLoadedDiscard').addEventListener('click', () => {
    showToast(t('loaded.discarded'), 'info');
    $('#loadedSaveModal').hidden = true;
    resetMeeting();
  });

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
    const modal = $('#launcherModal');
    if (modal) modal.hidden = true;
    openMeetingPrepForm();
  });

  on('meetingPrep:complete', async (config) => {
    // Apply meeting prep settings
    if (config.meetingType) {
      state.settings.meetingPreset = config.meetingType;
      saveSettings({ meetingPreset: config.meetingType });
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

    // Attendees → state.participants
    if (config.attendees?.length) {
      state.participants = config.attendees;
    }

    // Reference + files + notes → state.analysisContext
    const parts = [];
    if (config.referenceAnalysis) {
      parts.push('[Reference: Previous Meeting]\n' + config.referenceAnalysis);
    }
    if (config.attachedFiles?.length) {
      config.attachedFiles.forEach(f => parts.push(`[File: ${f.name}]\n${f.content}`));
    }
    if (parts.length) {
      state.analysisContext = parts.join('\n\n');
    }

    // Start recording
    await startRecording();
  });

  // beforeunload auto-save (skip in loaded mode to avoid overwriting)
  window.addEventListener('beforeunload', () => {
    if (state.meetingId && !state.loadedMeetingId) autoSave();
  });

  // Storage usage check
  const usage = getStorageUsage();
  if (usage.ratio > 0.8) {
    showToast(t('toast.storage_usage', { pct: (usage.ratio * 100).toFixed(0) }), 'warning');
  }
}

// ===== Close Loaded Meeting =====
function closeLoadedMeeting() {
  if (!state.loadedMeetingId) return;
  const orig = state.loadedMeetingOriginal;

  // Detect changes
  const hasChanges =
    (state.chatHistory || []).length !== (orig.chatHistory || []).length ||
    (state.analysisHistory || []).length !== (orig.analysisHistory || []).length ||
    (state.memos || []).length !== (orig.memos || []).length ||
    (state.userInsights || []).length !== (orig.userInsights || []).length ||
    state.meetingTitle !== (orig.title || '');

  if (!hasChanges) {
    showToast(t('loaded.no_changes'), 'info');
    resetMeeting();
    return;
  }

  // Show save confirmation modal
  $('#loadedSaveModal').hidden = false;
}

// ===== Demo Data =====
function demoUpdateTimer() {
  if (!state.meetingStartTime) return;
  const diff = Date.now() - state.meetingStartTime;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  $('#meetingTimer').textContent =
    `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

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

  demoUpdateTimer();
  setInterval(demoUpdateTimer, 1000);

  $('#meetingStatus').textContent = 'Demo Mode';
  showToast('Demo data loaded - 65 transcript lines', 'success');
  updateInboxBadge();
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
  updateInboxBadge();
}

// ===== Minutes Preview Modal =====

function renderMinutesBlocks(container, markdown) {
  container.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'ai-markdown-content';

  const blocks = parseMarkdownBlocks(markdown);

  blocks.forEach((block, index) => {
    const blockEl = document.createElement('div');
    blockEl.className = 'ai-block';
    blockEl.dataset.blockIndex = index;
    blockEl.innerHTML = renderMarkdown(block.raw);

    // Edit button (shown on hover via CSS)
    const editBtn = document.createElement('button');
    editBtn.className = 'ai-block-edit-btn';
    editBtn.innerHTML = '&#x270E;';
    editBtn.title = t('block_edit.edit');
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (div.querySelector('.ai-block.editing')) return;
      startMinutesBlockEdit(blockEl, block, index, blocks, div);
    });
    blockEl.appendChild(editBtn);

    // AI refinement button for ## headings
    if (block.type === 'heading' && /^## /.test(block.raw)) {
      const aiBtn = document.createElement('button');
      aiBtn.className = 'section-action-btn';
      aiBtn.title = 'AI';
      aiBtn.textContent = 'AI';
      blockEl.appendChild(aiBtn);
    }

    div.appendChild(blockEl);
  });

  container.appendChild(div);
  return blocks;
}

function startMinutesBlockEdit(blockEl, block, index, blocks, containerDiv) {
  const originalRaw = block.raw;
  let done = false;
  blockEl.classList.add('editing');
  containerDiv.classList.add('has-editing-block');

  const textarea = document.createElement('textarea');
  textarea.className = 'ai-block-textarea';
  textarea.value = originalRaw;

  const toolbar = document.createElement('div');
  toolbar.className = 'ai-block-toolbar';

  const hintSpan = document.createElement('span');
  hintSpan.className = 'ai-block-hint';
  hintSpan.textContent = t('block_edit.hint');

  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'ai-block-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-xs';
  cancelBtn.dataset.action = 'cancel';
  cancelBtn.title = t('block_edit.cancel');
  cancelBtn.textContent = '\u2715';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-xs btn-primary';
  saveBtn.dataset.action = 'save';
  saveBtn.title = t('block_edit.done');
  saveBtn.textContent = '\u2713';

  actionsDiv.appendChild(cancelBtn);
  actionsDiv.appendChild(saveBtn);
  toolbar.appendChild(hintSpan);
  toolbar.appendChild(actionsDiv);

  blockEl.innerHTML = '';
  blockEl.appendChild(textarea);
  blockEl.appendChild(toolbar);
  textarea.focus();

  const autoResize = () => {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  };
  textarea.addEventListener('input', autoResize);
  requestAnimationFrame(autoResize);

  const reattachEditBtn = () => {
    const editBtn = document.createElement('button');
    editBtn.className = 'ai-block-edit-btn';
    editBtn.innerHTML = '&#x270E;';
    editBtn.title = t('block_edit.edit');
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (containerDiv.querySelector('.ai-block.editing')) return;
      startMinutesBlockEdit(blockEl, block, index, blocks, containerDiv);
    });
    blockEl.appendChild(editBtn);

    // Re-add AI button for headings
    if (block.type === 'heading' && /^## /.test(block.raw)) {
      const aiBtn = document.createElement('button');
      aiBtn.className = 'section-action-btn';
      aiBtn.title = 'AI';
      aiBtn.textContent = 'AI';
      blockEl.appendChild(aiBtn);
    }
  };

  const removeOutsideListener = () => {
    document.removeEventListener('mousedown', onOutsideClick, true);
  };

  const cancel = () => {
    if (done) return;
    done = true;
    removeOutsideListener();
    blockEl.classList.remove('editing');
    containerDiv.classList.remove('has-editing-block');
    blockEl.innerHTML = renderMarkdown(originalRaw);
    reattachEditBtn();
  };

  const save = () => {
    if (done) return;
    const newRaw = textarea.value.trim();
    if (!newRaw || newRaw === originalRaw) { cancel(); return; }

    done = true;
    removeOutsideListener();

    block.raw = newRaw;
    blocks[index] = block;

    const newMarkdown = blocksToMarkdown(blocks);
    if (state.currentAnalysis) {
      state.currentAnalysis.markdown = newMarkdown;
      state.currentAnalysis.summary = newMarkdown;
      autoSave();
    }

    blockEl.classList.remove('editing');
    containerDiv.classList.remove('has-editing-block');
    blockEl.innerHTML = renderMarkdown(newRaw);
    reattachEditBtn();
  };

  toolbar.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'cancel') cancel();
    if (action === 'save') save();
  });

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cancel();
    if (e.key === 's' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
  });

  const onOutsideClick = (e) => {
    if (!blockEl.contains(e.target)) save();
  };
  requestAnimationFrame(() => {
    document.addEventListener('mousedown', onOutsideClick, true);
  });
}

function saveMinutesVersion() {
  const markdown = state.currentAnalysis?.markdown;
  if (!markdown) return;
  const model = state.settings.geminiModel || 'gemini-2.5-flash';
  state.minutesVersions.push({ markdown, timestamp: Date.now(), model });
  if (state.minutesVersions.length > 10) state.minutesVersions.shift();
}

function updateVersionBadge() {
  const btn = $('#btnMinutesVersions');
  const badge = $('#minutesVersionBadge');
  const count = state.minutesVersions.length;
  btn.hidden = count === 0;
  badge.textContent = count;
}

function openMinutesPreview() {
  const modal = $('#minutesPreviewModal');
  const content = $('#minutesPreviewContent');
  const markdown = state.currentAnalysis?.markdown || '';

  renderMinutesBlocks(content, markdown);

  // Show generated model badge
  const badge = $('#minutesGeneratedBadge');
  const genModel = state.currentAnalysis?.generatedModel;
  if (genModel) {
    const modelLabel = genModel.includes('pro') ? 'Pro' : 'Flash';
    badge.textContent = t('minutes_preview.generated_with', { model: modelLabel });
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }

  updateVersionBadge();
  modal.hidden = false;
}

function initMinutesPreview() {
  const modal = $('#minutesPreviewModal');
  const content = $('#minutesPreviewContent');

  // ── Regenerate button (popover) ──
  const regenBtn = $('#btnMinutesRegenerate');
  let currentRegenPopover = null;
  regenBtn.addEventListener('click', () => {
    if (currentRegenPopover) { currentRegenPopover.remove(); currentRegenPopover = null; return; }

    // Close export popover if open
    const existingExport = modal.querySelector('.export-popover');
    if (existingExport) { existingExport.remove(); }

    const tmpl = document.getElementById('tmplRegenPopover');
    const popover = tmpl.content.cloneNode(true).firstElementChild;

    // Apply i18n
    popover.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });

    // Pre-select current model
    const currentModel = state.settings.geminiModel || 'gemini-2.5-flash';
    popover.querySelectorAll('.regen-model-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.regenModel === currentModel);
      btn.addEventListener('click', () => {
        popover.querySelectorAll('.regen-model-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Confirm button
    popover.querySelector('.regen-confirm-btn').addEventListener('click', async () => {
      const activeBtn = popover.querySelector('.regen-model-btn.active');
      const model = activeBtn?.dataset.regenModel || 'gemini-2.5-flash';

      popover.remove();
      currentRegenPopover = null;

      saveMinutesVersion();
      modal.hidden = true;
      showToast(t('toast.minutes_generating_bg'), 'info');

      try {
        await regenerateMinutes(model, '', state.minutesPromptConfig);
        showToast(t('toast.final_minutes_done'), 'success');
        openMinutesPreview();
      } catch (err) {
        showToast(t('toast.final_minutes_fail') + err.message, 'error');
      }
    });

    regenBtn.parentElement.style.position = 'relative';
    regenBtn.parentElement.appendChild(popover);
    currentRegenPopover = popover;

    const closeRegen = (ev) => {
      if (!popover.contains(ev.target) && ev.target !== regenBtn) {
        popover.remove();
        currentRegenPopover = null;
        document.removeEventListener('click', closeRegen);
      }
    };
    setTimeout(() => document.addEventListener('click', closeRegen), 0);
  });

  // ── Export button ──
  const exportBtn = $('#btnMinutesExport');
  let currentExportPopover = null;
  exportBtn.addEventListener('click', () => {
    if (currentExportPopover) { currentExportPopover.remove(); currentExportPopover = null; return; }

    // Close regen popover if open
    if (currentRegenPopover) { currentRegenPopover.remove(); currentRegenPopover = null; }

    const tmpl = document.getElementById('tmplExportPopover');
    const popover = tmpl.content.cloneNode(true).firstElementChild;

    // Apply i18n
    popover.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });

    exportBtn.parentElement.style.position = 'relative';
    exportBtn.parentElement.appendChild(popover);
    currentExportPopover = popover;

    popover.querySelectorAll('[data-preview-format]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const format = btn.dataset.previewFormat;
        const markdown = state.currentAnalysis?.markdown || '';
        const dateStr = new Date().toISOString().slice(0, 10);
        const filename = `minutes-${dateStr}`;

        if (format === 'clipboard') {
          try { await navigator.clipboard.writeText(markdown); showToast(t('export.copied'), 'success'); }
          catch { showToast(t('export.copy_fail'), 'error'); }
        } else if (format === 'pdf') {
          btn.disabled = true;
          try { await exportPDF(markdown, `${filename}.pdf`); }
          catch (err) { showToast(err.message, 'error'); }
          finally { btn.disabled = false; }
        } else if (format === 'docx') {
          btn.disabled = true;
          try { await exportWord(markdown, `${filename}.docx`); }
          catch (err) { showToast(err.message, 'error'); }
          finally { btn.disabled = false; }
        }
        popover.remove();
        currentExportPopover = null;
      });
    });

    const closeExport = (ev) => {
      if (!popover.contains(ev.target) && ev.target !== exportBtn) {
        popover.remove();
        currentExportPopover = null;
        document.removeEventListener('click', closeExport);
      }
    };
    setTimeout(() => document.addEventListener('click', closeExport), 0);
  });

  // ── Prompt edit button ──
  const promptEditBtn = $('#btnMinutesPromptEdit');
  promptEditBtn.addEventListener('click', () => {
    const tmpl = document.getElementById('tmplPromptEditModal');
    const overlay = tmpl.content.cloneNode(true).firstElementChild;

    // Apply i18n
    overlay.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    overlay.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
    });

    // Fill current values
    const cfg = state.minutesPromptConfig;
    overlay.querySelector('#promptReference').value = cfg.referenceDoc || '';
    overlay.querySelector('#promptBaseOverride').value = cfg.basePromptOverride || getDefaultMinutesPrompt();
    overlay.querySelector('#promptInstruction').value = cfg.userInstruction || '';

    // Collapsible sections
    overlay.querySelectorAll('.prompt-section-header').forEach(header => {
      header.addEventListener('click', () => {
        const section = header.closest('.prompt-section');
        section.classList.toggle('collapsed');
      });
    });

    // Presets
    const presetSelect = overlay.querySelector('#promptPresetSelect');
    const presets = state.settings.minutesPromptPresets || [];
    presets.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      presetSelect.appendChild(opt);
    });

    presetSelect.addEventListener('change', () => {
      const preset = presets.find(p => p.id === presetSelect.value);
      if (!preset) return;
      overlay.querySelector('#promptReference').value = preset.referenceDoc || '';
      overlay.querySelector('#promptBaseOverride').value = preset.basePromptOverride || '';
      overlay.querySelector('#promptInstruction').value = preset.userInstruction || '';
    });

    // Save preset
    overlay.querySelector('#btnSavePreset').addEventListener('click', () => {
      const name = prompt(t('minutes_preview.preset_name'));
      if (!name) return;
      const newPreset = {
        id: generateId(),
        name,
        referenceDoc: overlay.querySelector('#promptReference').value,
        basePromptOverride: overlay.querySelector('#promptBaseOverride').value,
        userInstruction: overlay.querySelector('#promptInstruction').value,
      };
      presets.push(newPreset);
      saveSettings({ minutesPromptPresets: presets });
      state.settings.minutesPromptPresets = presets;
      const opt = document.createElement('option');
      opt.value = newPreset.id;
      opt.textContent = newPreset.name;
      presetSelect.appendChild(opt);
      showToast(t('minutes_preview.preset_saved'), 'success');
    });

    // Apply
    overlay.querySelector('#btnApplyPrompt').addEventListener('click', () => {
      state.minutesPromptConfig = {
        referenceDoc: overlay.querySelector('#promptReference').value.trim(),
        basePromptOverride: overlay.querySelector('#promptBaseOverride').value.trim(),
        userInstruction: overlay.querySelector('#promptInstruction').value.trim(),
      };
      overlay.remove();
      showToast(t('minutes_preview.apply'), 'success');
    });

    // Close
    overlay.querySelector('.prompt-edit-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    document.body.appendChild(overlay);
  });

  // ── Versions button ──
  const versionsBtn = $('#btnMinutesVersions');
  let currentVersionPopover = null;
  versionsBtn.addEventListener('click', () => {
    if (currentVersionPopover) { currentVersionPopover.remove(); currentVersionPopover = null; return; }

    const tmpl = document.getElementById('tmplVersionListPopover');
    const popover = tmpl.content.cloneNode(true).firstElementChild;
    const list = popover.querySelector('#versionListItems');

    state.minutesVersions.forEach((ver, idx) => {
      const item = document.createElement('div');
      item.className = 'version-item';
      const time = new Date(ver.timestamp).toLocaleTimeString(getDateLocale(), { hour: '2-digit', minute: '2-digit' });
      const modelLabel = ver.model.includes('pro') ? 'Pro' : 'Flash';
      item.innerHTML = `<span>${time} — ${modelLabel}</span>`;
      const restoreBtn = document.createElement('button');
      restoreBtn.className = 'btn btn-xs';
      restoreBtn.textContent = t('minutes_preview.version_restore');
      restoreBtn.addEventListener('click', () => {
        saveMinutesVersion();
        if (state.currentAnalysis) {
          state.currentAnalysis.markdown = ver.markdown;
          state.currentAnalysis.summary = ver.markdown;
          autoSave();
        }
        popover.remove();
        currentVersionPopover = null;
        openMinutesPreview();
      });
      item.appendChild(restoreBtn);
      list.appendChild(item);
    });

    versionsBtn.parentElement.style.position = 'relative';
    versionsBtn.parentElement.appendChild(popover);
    currentVersionPopover = popover;

    const closeVersions = (ev) => {
      if (!popover.contains(ev.target) && ev.target !== versionsBtn) {
        popover.remove();
        currentVersionPopover = null;
        document.removeEventListener('click', closeVersions);
      }
    };
    setTimeout(() => document.addEventListener('click', closeVersions), 0);
  });

  // ── Section AI refinement — event delegation ──
  content.addEventListener('click', (e) => {
    const actionBtn = e.target.closest('.section-action-btn');
    if (!actionBtn) return;

    content.querySelectorAll('.section-action-popover').forEach(p => p.remove());

    const blockEl = actionBtn.closest('.ai-block');
    if (!blockEl) return;

    const tmpl = document.getElementById('sectionActionPopover');
    const popover = tmpl.content.cloneNode(true).firstElementChild;

    popover.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    popover.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
    });

    blockEl.appendChild(popover);

    popover.addEventListener('click', async (ev) => {
      const actionEl = ev.target.closest('[data-section-action]');
      if (!actionEl) return;

      const action = actionEl.dataset.sectionAction;
      let instruction = '';
      const lang = getAiLanguage();

      if (action === 'detail') {
        instruction = lang === 'ko' ? '이 섹션을 더 자세하고 구체적으로 확장하세요.' : 'Expand this section with more detail and specifics.';
      } else if (action === 'summarize') {
        instruction = lang === 'ko' ? '이 섹션을 간결하게 요약하세요.' : 'Summarize this section concisely.';
      } else if (action === 'custom') {
        const input = popover.querySelector('input');
        instruction = input?.value?.trim();
        if (!instruction) return;
      }

      popover.remove();

      const headingIdx = parseInt(blockEl.dataset.blockIndex);
      const fullMarkdown = state.currentAnalysis?.markdown || '';
      const blocks = parseMarkdownBlocks(fullMarkdown);

      // Find section range: from this heading to next heading
      let endIdx = blocks.length;
      for (let i = headingIdx + 1; i < blocks.length; i++) {
        if (blocks[i].type === 'heading' && /^## /.test(blocks[i].raw)) { endIdx = i; break; }
      }
      const sectionBlocks = blocks.slice(headingIdx, endIdx);
      const sectionMarkdown = sectionBlocks.map(b => b.raw).join('\n\n');

      blockEl.classList.add('section-loading');
      const scrollTop = content.scrollTop;

      try {
        const refined = await refineSectionContent({ fullMarkdown, sectionMarkdown, instruction, lang });

        // Replace blocks in range
        const newSectionBlocks = parseMarkdownBlocks(refined);
        blocks.splice(headingIdx, endIdx - headingIdx, ...newSectionBlocks);

        const newMarkdown = blocksToMarkdown(blocks);
        if (state.currentAnalysis) {
          state.currentAnalysis.markdown = newMarkdown;
          autoSave();
        }

        renderMinutesBlocks(content, newMarkdown);
        content.scrollTop = scrollTop;
        showToast(t('minutes_preview.section_refined'), 'success');
      } catch (err) {
        blockEl.classList.remove('section-loading');
        showToast(t('minutes_preview.section_refine_fail') + ' ' + err.message, 'error');
      }
    });

    const closePopover = (ev) => {
      if (!popover.contains(ev.target) && ev.target !== actionBtn) {
        popover.remove();
        document.removeEventListener('click', closePopover);
      }
    };
    setTimeout(() => document.addEventListener('click', closePopover), 0);
  });
}

document.addEventListener('DOMContentLoaded', init);
