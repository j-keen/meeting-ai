// event-bus.js - Shared state and pub/sub event system

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
/**
 * Meeting lifecycle is a single explicit phase (see meeting-session.js):
 *   'idle' | 'recording' | 'paused' | 'ended'
 * `source` says where the current meeting content came from:
 *   'live' | 'loaded' (opened from history) | 'imported' (pasted / uploaded)
 * `isRecording` and `meetingEnded` are kept as derived accessors for existing
 * readers; the only intended writer of `phase` is meeting-session.js.
 */
export const state = {
  phase: 'idle',
  source: 'live',
  pausedDuration: 0,
  pauseStartTime: null,
  sttEngineName: null,
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
  meetingTitle: '',
  starRating: 3,
  categories: [],
  participants: [],
  analysisContext: '',
  analysisCorrections: [], // [{before, after}] — user edits to include in next analysis only
  isImported: false,
  importType: null, // 'imported' | 'uploaded' | null
  loadedMeetingId: null,
  loadedMeetingOriginal: null,
  minutesVersions: [],
  minutesPromptConfig: { referenceDoc: '', basePromptOverride: '', userInstruction: '' },
  aiTitleCached: null, // { titles: string[], tags: string[] } | null
  aiMetadataCached: null, // { participants: string[], tags: string[], categories: string[] } | null
  documents: [], // [{ id, title, content, createdAt, updatedAt }]
};

function setPhase(to, reason) {
  const from = state.phase;
  if (from === to) return;
  state.phase = to;
  emit('session:transition', { from, to, reason });
}

Object.defineProperties(state, {
  isRecording: {
    enumerable: true,
    get() { return this.phase === 'recording'; },
    // Legacy writers: prefer meeting-session.js start()/pause().
    set(v) { setPhase(v ? 'recording' : (this.phase === 'recording' ? 'paused' : this.phase), 'legacy-isRecording'); },
  },
  meetingEnded: {
    enumerable: true,
    get() { return this.phase === 'ended'; },
    // Legacy writers: prefer meeting-session.js markEnded()/resume().
    set(v) {
      if (v) setPhase('ended', 'legacy-meetingEnded');
      else if (this.phase === 'ended') setPhase('paused', 'legacy-meetingEnded');
    },
  },
});
