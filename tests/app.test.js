// Characterization tests for app.js — pub/sub system and state object.
// All module dependencies are mocked so the DOM-heavy init() never runs.

vi.mock('../stt.js', () => ({ createSTT: vi.fn(), prefetchDeepgramToken: vi.fn() }));
vi.mock('../ai.js', () => ({
  analyzeTranscript: vi.fn(),
  getDefaultPrompt: vi.fn(),
  getPromptForType: vi.fn(() => 'default prompt'),
  generateTags: vi.fn(),
  correctSentences: vi.fn(),
  generateMeetingTitle: vi.fn(),
  generateFinalMinutes: vi.fn(),
}));
vi.mock('../gemini-api.js', () => ({
  checkProxyAvailable: vi.fn(),
  isProxyAvailable: vi.fn(),
}));
vi.mock('../recording.js', () => ({
  generateId: vi.fn(() => 'mock-id'),
  startRecording: vi.fn(),
  stopRecording: vi.fn(),
  endMeeting: vi.fn(),
  runAnalysis: vi.fn(),
  autoSave: vi.fn(),
  finalizeEndMeeting: vi.fn(),
  cancelEndMeeting: vi.fn(),
  updateStarRating: vi.fn(),
  renderEndMeetingTags: vi.fn(),
  renderEndMeetingParticipants: vi.fn(),
  runCorrection: vi.fn(),
  resetMeeting: vi.fn(),
  getElapsedTimeStr: vi.fn(),
  buildFullProfile: vi.fn(),
}));
vi.mock('../storage.js', () => ({
  saveMeeting: vi.fn(),
  listMeetings: vi.fn(() => []),
  getMeeting: vi.fn(),
  deleteMeeting: vi.fn(),
  updateMeetingTags: vi.fn(),
  loadSettings: vi.fn(() => ({})),
  saveSettings: vi.fn(),
  getStorageUsage: vi.fn(),
  loadContacts: vi.fn(() => []),
  addContact: vi.fn(),
  loadLocations: vi.fn(() => []),
  addLocation: vi.fn(),
  loadPreparedMeeting: vi.fn(),
  deletePreparedMeeting: vi.fn(),
  loadMeetingPrepPresets: vi.fn(() => []),
  loadCorrectionDict: vi.fn(() => []),
  addCorrectionEntry: vi.fn(),
}));
vi.mock('../ui.js', () => ({
  initDragResizer: vi.fn(),
  initPanelTabs: vi.fn(),
  addTranscriptLine: vi.fn(),
  showInterim: vi.fn(),
  clearInterim: vi.fn(),
  addMemoLine: vi.fn(),
  showAnalysisSkeletons: vi.fn(),
  renderAnalysis: vi.fn(),
  renderHighlights: vi.fn(),
  renderHistoryGrid: vi.fn(),
  renderMeetingViewer: vi.fn(),
  initModals: vi.fn(),
  initContextPopup: vi.fn(),
  toggleTheme: vi.fn(),
  initKeyboardShortcuts: vi.fn(),
  showToast: vi.fn(),
  updateTranscriptLineUI: vi.fn(),
  removeTranscriptLineUI: vi.fn(),
  showTranscriptConnecting: vi.fn(),
  showTranscriptWaiting: vi.fn(),
  hideTranscriptWaiting: vi.fn(),
  resetTranscriptEmpty: vi.fn(),
  showAiWaiting: vi.fn(),
  hideAiWaiting: vi.fn(),
  resetAiEmpty: vi.fn(),
  showChatWaiting: vi.fn(),
  resetChatEmpty: vi.fn(),
  updateAnalysisNav: vi.fn(),
  getAnalysisAsText: vi.fn(),
  renderAnalysisInto: vi.fn(),
}));
vi.mock('../settings.js', () => ({
  initSettings: vi.fn(),
  closeSettings: vi.fn(),
  tryCloseSettings: vi.fn(),
}));
vi.mock('../chat.js', () => ({
  initChat: vi.fn(),
  renderMarkdown: vi.fn(),
}));
vi.mock('../export-doc.js', () => ({
  exportPDF: vi.fn(),
  exportWord: vi.fn(),
}));
vi.mock('../meeting-prep.js', () => ({
  initMeetingPrepForm: vi.fn(),
  openMeetingPrepForm: vi.fn(),
  isMeetingPrepActive: vi.fn(),
}));
vi.mock('../i18n.js', () => ({
  t: vi.fn((k) => k),
  setLanguage: vi.fn(),
  setAiLanguage: vi.fn(),
  getDateLocale: vi.fn(),
  getAiLanguage: vi.fn(),
  getPromptPresets: vi.fn(() => ({})),
}));
vi.mock('../utils.js', () => ({
  escapeHtml: vi.fn((s) => s),
}));
vi.mock('../compare.js', () => ({
  openCompareModal: vi.fn(),
  runCompareAnalysis: vi.fn(),
  applyComparePromptAsDefault: vi.fn(),
}));
vi.mock('../history.js', () => ({
  refreshHistoryGrid: vi.fn(),
  refreshHistoryGridDebounced: vi.fn(),
}));

import { state, on, emit } from '../app.js';

// ---------------------------------------------------------------------------
// Pub/Sub
// ---------------------------------------------------------------------------

describe('on / emit pub-sub', () => {
  it('listener registered with on() is called when the event is emitted', () => {
    const handler = vi.fn();
    on('test:basic', handler);
    emit('test:basic');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('emit() passes data payload to the listener', () => {
    const handler = vi.fn();
    on('test:payload', handler);
    emit('test:payload', { value: 42 });
    expect(handler).toHaveBeenCalledWith({ value: 42 });
  });

  it('emit() on an event with no listeners does not throw', () => {
    expect(() => emit('event:nobody:listening')).not.toThrow();
  });

  it('multiple listeners registered for the same event all fire', () => {
    const a = vi.fn();
    const b = vi.fn();
    const c = vi.fn();
    on('test:multi', a);
    on('test:multi', b);
    on('test:multi', c);
    emit('test:multi', 'hello');
    expect(a).toHaveBeenCalledWith('hello');
    expect(b).toHaveBeenCalledWith('hello');
    expect(c).toHaveBeenCalledWith('hello');
  });

  it('on() returns an unsubscribe function', () => {
    const handler = vi.fn();
    const unsub = on('test:unsub', handler);
    expect(typeof unsub).toBe('function');
  });

  it('calling the returned unsubscribe function stops the listener from firing', () => {
    const handler = vi.fn();
    const unsub = on('test:unsub:works', handler);
    unsub();
    emit('test:unsub:works');
    expect(handler).not.toHaveBeenCalled();
  });

  it('unsubscribing one listener leaves other listeners for the same event intact', () => {
    const keep = vi.fn();
    const remove = vi.fn();
    on('test:unsub:partial', keep);
    const unsub = on('test:unsub:partial', remove);
    unsub();
    emit('test:unsub:partial');
    expect(keep).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalled();
  });

  it('a listener is not called for a different event', () => {
    const handler = vi.fn();
    on('test:isolation:A', handler);
    emit('test:isolation:B');
    expect(handler).not.toHaveBeenCalled();
  });

  it('emit() with undefined data calls listener with undefined', () => {
    const handler = vi.fn();
    on('test:undefined-data', handler);
    emit('test:undefined-data', undefined);
    expect(handler).toHaveBeenCalledWith(undefined);
  });

  it('the same listener can be registered multiple times and fires once per registration', () => {
    const handler = vi.fn();
    on('test:double-register', handler);
    on('test:double-register', handler);
    emit('test:double-register');
    expect(handler).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// State — shape and defaults
// ---------------------------------------------------------------------------

describe('state default shape', () => {
  it('state is an object', () => {
    expect(state).toBeDefined();
    expect(typeof state).toBe('object');
  });

  it('state.isRecording defaults to false', () => {
    expect(state.isRecording).toBe(false);
  });

  it('state.transcript defaults to an empty array', () => {
    expect(Array.isArray(state.transcript)).toBe(true);
    expect(state.transcript).toHaveLength(0);
  });

  it('state.settings defaults to an empty object', () => {
    expect(state.settings).toBeDefined();
    expect(typeof state.settings).toBe('object');
    expect(Array.isArray(state.settings)).toBe(false);
    expect(Object.keys(state.settings)).toHaveLength(0);
  });

  it('state.analysisHistory defaults to an empty array', () => {
    expect(Array.isArray(state.analysisHistory)).toBe(true);
    expect(state.analysisHistory).toHaveLength(0);
  });

  it('state.memos defaults to an empty array', () => {
    expect(Array.isArray(state.memos)).toBe(true);
    expect(state.memos).toHaveLength(0);
  });

  it('state.chatHistory defaults to an empty array', () => {
    expect(Array.isArray(state.chatHistory)).toBe(true);
    expect(state.chatHistory).toHaveLength(0);
  });

  it('state.tags defaults to an empty array', () => {
    expect(Array.isArray(state.tags)).toBe(true);
    expect(state.tags).toHaveLength(0);
  });

  it('state.meetingStartTime defaults to null', () => {
    expect(state.meetingStartTime).toBeNull();
  });

  it('state.meetingId defaults to null', () => {
    expect(state.meetingId).toBeNull();
  });

  it('state.currentAnalysis defaults to null', () => {
    expect(state.currentAnalysis).toBeNull();
  });

  it('state.meetingEnded defaults to false', () => {
    expect(state.meetingEnded).toBe(false);
  });

  it('state.starRating defaults to 3', () => {
    expect(state.starRating).toBe(3);
  });

  it('state has all expected top-level keys', () => {
    const expectedKeys = [
      'isRecording',
      'meetingStartTime',
      'meetingId',
      'meetingLocation',
      'transcript',
      'memos',
      'analysisHistory',
      'settings',
      'currentAnalysis',
      'chatHistory',
      'userInsights',
      'tags',
      'meetingEnded',
      'meetingTitle',
      'starRating',
      'categories',
      'participants',
      'analysisContext',
      'analysisCorrections',
    ];
    for (const key of expectedKeys) {
      expect(state, `state should have key "${key}"`).toHaveProperty(key);
    }
  });
});
