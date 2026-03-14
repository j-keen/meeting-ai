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
  analysisContext: '',
  analysisCorrections: [], // [{before, after}] — user edits to include in next analysis only
  loadedMeetingId: null,
  loadedMeetingOriginal: null,
  minutesVersions: [],
  minutesPromptConfig: { referenceDoc: '', basePromptOverride: '', userInstruction: '' },
};
