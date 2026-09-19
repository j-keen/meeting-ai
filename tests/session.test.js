import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { fakeStt, createSTT } = vi.hoisted(() => {
  const fakeStt = {
    cb: null,
    isRunning: false,
    isPaused: false,
    supportsPause: false,
    start: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
  };
  fakeStt.start.mockImplementation(async (cb) => {
    fakeStt.cb = cb;
    fakeStt.isRunning = true;
    fakeStt.isPaused = false;
    return true;
  });
  fakeStt.stop.mockImplementation(() => {
    fakeStt.isRunning = false;
    fakeStt.isPaused = false;
  });
  fakeStt.pause.mockImplementation(() => {
    if (!fakeStt.supportsPause) return;
    fakeStt.isPaused = true;
    fakeStt.isRunning = false;
  });
  fakeStt.resume.mockImplementation(() => {
    if (!fakeStt.supportsPause) return;
    fakeStt.isPaused = false;
    fakeStt.isRunning = true;
  });
  return {
    fakeStt,
    createSTT: vi.fn(() => fakeStt),
  };
});

vi.mock('../stt.js', () => ({ createSTT }));

vi.mock('../ui.js', () => ({
  showToast: vi.fn(),
  showInterim: vi.fn(),
  clearInterim: vi.fn(),
  addTranscriptLine: vi.fn(),
  addMemoLine: vi.fn(),
  renderAnalysis: vi.fn(),
  updateTranscriptLineUI: vi.fn(),
  showTranscriptConnecting: vi.fn(),
  showTranscriptWaiting: vi.fn(),
  resetTranscriptEmpty: vi.fn(),
  resetAiEmpty: vi.fn(),
  resetChatEmpty: vi.fn(),
  showUndoToast: vi.fn(),
}));

vi.mock('../i18n.js', () => ({ t: (k) => k }));

vi.mock('../chat.js', () => ({ loadChatHistory: vi.fn() }));

vi.mock('../audio-recorder.js', () => ({
  startAudioRecording: vi.fn(),
  stopAudioRecording: vi.fn(async () => {}),
}));

vi.mock('../wake-lock.js', () => ({
  isSupported: vi.fn(() => false),
  acquire: vi.fn(async () => false),
  release: vi.fn(async () => {}),
  isHeld: vi.fn(() => false),
}));

import {
  start,
  resume,
  pause,
  markEnded,
  adoptDraft,
  adoptImport,
  loadMeeting,
  reset,
  getElapsedMs,
  getTotalPausedMs,
  buildSttCallbacks,
  configureSession,
  recTimers,
  sessionTimers,
} from '../meeting-session.js';
import { state, on } from '../event-bus.js';

const T0 = Date.parse('2024-06-01T12:00:00.000Z');

function buildSessionDOM() {
  document.body.className = '';
  document.body.innerHTML = `
    <button id="btnRecord"><span class="record-label">REC</span></button>
    <div id="meetingPill"><span id="meetingStatus"></span></div>
    <button id="btnEndMeeting"></button>
    <span id="meetingTimer">00:00:00</span>
    <span id="sttEngineBadge"></span>
    <span id="audioRecBadge"></span>
    <input id="meetingTitleInput" />
    <div id="loadedMeetingBanner" hidden>
      <span id="loadedBannerTitle"></span>
      <span id="loadedBannerDate"></span>
    </div>
    <div id="transcriptList"></div>
    <div id="aiSections"></div>
    <div id="chatMessages"></div>
  `;
}

function restoreFakeStt() {
  fakeStt.cb = null;
  fakeStt.isRunning = false;
  fakeStt.isPaused = false;
  fakeStt.supportsPause = false;
  fakeStt.start.mockReset();
  fakeStt.stop.mockReset();
  fakeStt.pause.mockReset();
  fakeStt.resume.mockReset();
  fakeStt.start.mockImplementation(async (cb) => {
    fakeStt.cb = cb;
    fakeStt.isRunning = true;
    fakeStt.isPaused = false;
    return true;
  });
  fakeStt.stop.mockImplementation(() => {
    fakeStt.isRunning = false;
    fakeStt.isPaused = false;
  });
  fakeStt.pause.mockImplementation(() => {
    if (!fakeStt.supportsPause) return;
    fakeStt.isPaused = true;
    fakeStt.isRunning = false;
  });
  fakeStt.resume.mockImplementation(() => {
    if (!fakeStt.supportsPause) return;
    fakeStt.isPaused = false;
    fakeStt.isRunning = true;
  });
  createSTT.mockClear();
}

const transitions = [];
/** @type {(() => void) | null} */
let unsubTransitions = null;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  buildSessionDOM();
  restoreFakeStt();
  configureSession({
    onFinalLine: vi.fn(),
    onReplaceLine: vi.fn(),
    autoSave: vi.fn(),
    onRecordingTimers: undefined,
    onSessionTimers: undefined,
    clearDraftRecovery: vi.fn(),
    onReset: vi.fn(),
  });
  reset();
  unsubTransitions?.();
  transitions.length = 0;
  unsubTransitions = on('session:transition', (e) => {
    transitions.push({ from: e.from, to: e.to, reason: e.reason });
  });
});

afterEach(() => {
  unsubTransitions?.();
  unsubTransitions = null;
  reset();
  recTimers.clearAll();
  sessionTimers.clearAll();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('transition table', () => {
  it('from idle: start → recording and emits session:transition', async () => {
    const ok = await start();
    expect(ok).toBe(true);
    expect(state.phase).toBe('recording');
    expect(transitions).toEqual([{ from: 'idle', to: 'recording', reason: 'start' }]);
  });

  it('from idle: resume/pause/markEnded are no-ops (phase unchanged, no timers)', async () => {
    const timerCount = vi.getTimerCount();
    expect(await resume()).toBe(false);
    expect(await pause()).toBe(false);
    expect(markEnded()).toBe(false);
    expect(state.phase).toBe('idle');
    expect(transitions).toEqual([]);
    expect(recTimers.names()).toEqual([]);
    expect(sessionTimers.names()).toEqual([]);
    expect(vi.getTimerCount()).toBe(timerCount);
  });

  it('from recording: pause → paused', async () => {
    await start();
    transitions.length = 0;
    const ok = await pause();
    expect(ok).toBe(true);
    expect(state.phase).toBe('paused');
    expect(transitions).toEqual([{ from: 'recording', to: 'paused', reason: 'user' }]);
  });

  it('from recording: start is a no-op and does not change meetingId', async () => {
    await start();
    const meetingId = state.meetingId;
    expect(meetingId).toBeTruthy();
    transitions.length = 0;
    const ok = await start();
    expect(ok).toBe(false);
    expect(state.phase).toBe('recording');
    expect(state.meetingId).toBe(meetingId);
    expect(transitions).toEqual([]);
  });

  it('from paused: resume → recording', async () => {
    await start();
    await pause();
    transitions.length = 0;
    const ok = await resume();
    expect(ok).toBe(true);
    expect(state.phase).toBe('recording');
    expect(transitions).toEqual([{ from: 'paused', to: 'recording', reason: 'resume' }]);
  });

  it('from paused: markEnded → ended', async () => {
    await start();
    await pause();
    transitions.length = 0;
    const ok = markEnded();
    expect(ok).toBe(true);
    expect(state.phase).toBe('ended');
    expect(transitions).toEqual([{ from: 'paused', to: 'ended', reason: 'finalize' }]);
  });

  it('from ended: resume → recording', async () => {
    await start();
    await pause();
    markEnded();
    transitions.length = 0;
    const ok = await resume();
    expect(ok).toBe(true);
    expect(state.phase).toBe('recording');
    expect(transitions).toEqual([{ from: 'ended', to: 'recording', reason: 'resume' }]);
  });

  it('from ended: reset → idle', async () => {
    await start();
    await pause();
    markEnded();
    transitions.length = 0;
    reset();
    expect(state.phase).toBe('idle');
    expect(transitions).toEqual([{ from: 'ended', to: 'idle', reason: 'reset' }]);
  });
});

describe('pause accounting', () => {
  it('excludes pause gaps from elapsed time and recovers crash drafts', async () => {
    await start();
    vi.advanceTimersByTime(60_000);
    await pause();
    vi.advanceTimersByTime(120_000);
    await resume();
    vi.advanceTimersByTime(60_000);

    expect(getElapsedMs()).toBe(120_000);
    expect(state.pausedDuration).toBe(120_000);

    await pause();
    const snapshot = {
      meetingId: state.meetingId,
      meetingTitle: state.meetingTitle,
      meetingStartTime: state.meetingStartTime,
      pausedDuration: getTotalPausedMs(),
      savedAt: Date.now(),
      transcript: [...state.transcript],
    };
    reset();
    adoptDraft(snapshot, 'crash');
    expect(state.phase).toBe('paused');
    expect(transitions.at(-1)).toEqual({ from: 'idle', to: 'paused', reason: 'adoptDraft:crash' });

    vi.advanceTimersByTime(30_000);
    await resume();
    expect(state.pausedDuration).toBe(150_000);
    expect(getElapsedMs()).toBe(120_000);
  });
});

describe('callback parity', () => {
  it('buildSttCallbacks with/without stream share the same key set', () => {
    const withStream = buildSttCallbacks({ withStream: true });
    const withoutStream = buildSttCallbacks({ withStream: false });
    expect(Object.keys(withStream).sort()).toEqual(Object.keys(withoutStream).sort());
  });

  it('onFinal pushes a transcript line and calls onFinalLine; onReplace updates the last line only', () => {
    const onFinalLine = vi.fn();
    const onReplaceLine = vi.fn();
    configureSession({ onFinalLine, onReplaceLine });
    const cbs = buildSttCallbacks({ withStream: false });

    cbs.onFinal('hello');
    expect(state.transcript).toHaveLength(1);
    expect(state.transcript[0].text).toBe('hello');
    expect(onFinalLine).toHaveBeenCalledTimes(1);
    expect(onFinalLine).toHaveBeenCalledWith(state.transcript[0]);
    const firstId = state.transcript[0].id;

    cbs.onFinal('second');
    expect(state.transcript).toHaveLength(2);

    cbs.onReplace('second-updated');
    expect(state.transcript).toHaveLength(2);
    expect(state.transcript[0].text).toBe('hello');
    expect(state.transcript[0].id).toBe(firstId);
    expect(state.transcript[1].text).toBe('second-updated');
    expect(onReplaceLine).toHaveBeenCalledTimes(1);
    expect(onReplaceLine).toHaveBeenCalledWith(state.transcript[1]);
  });
});

describe('timers', () => {
  it('registers rec timers on start, leaves only session timers after pause, and clears all on reset', async () => {
    configureSession({
      onRecordingTimers: (timers) => {
        timers.every('analysis', 5000, () => {});
      },
      onSessionTimers: (timers) => {
        timers.every('draft', 10_000, () => {});
      },
    });

    await start();
    expect(recTimers.names()).toEqual(expect.arrayContaining(['clock', 'maxDuration', 'analysis']));
    expect(sessionTimers.names()).toEqual(['draft']);

    await pause();
    expect(recTimers.names()).toEqual([]);
    expect(sessionTimers.names()).toEqual(['draft']);
    expect(vi.getTimerCount()).toBe(sessionTimers.names().length);

    reset();
    expect(recTimers.names()).toEqual([]);
    expect(sessionTimers.names()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('start() failure', () => {
  it('keeps phase idle and clears meetingId/meetingStartTime when stt.start resolves false', async () => {
    fakeStt.start.mockResolvedValueOnce(false);
    const ok = await start();
    expect(ok).toBe(false);
    expect(state.phase).toBe('idle');
    expect(state.meetingId).toBeNull();
    expect(state.meetingStartTime).toBeNull();
    expect(transitions).toEqual([]);
    expect(recTimers.names()).toEqual([]);
  });
});

describe('background return', () => {
  it('restarts STT on visibilitychange when recording but the engine is not running', async () => {
    await start();
    expect(createSTT).toHaveBeenCalledTimes(1);
    expect(state.phase).toBe('recording');

    fakeStt.isRunning = false;
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(createSTT).toHaveBeenCalledTimes(2);
    expect(state.phase).toBe('recording');
  });
});

describe('loadMeeting', () => {
  it('sets ended/loaded and resume() folds the gap since the last transcript timestamp', async () => {
    const lastTs = T0 + 10_000;
    loadMeeting({
      id: 'hist-1',
      title: 'Old meeting',
      startTime: T0,
      transcript: [{ id: 'l1', text: 'hello', timestamp: lastTs }],
      memos: [],
    });
    expect(state.phase).toBe('ended');
    expect(state.source).toBe('loaded');
    expect(state.loadedMeetingId).toBe('hist-1');
    expect(transitions.at(-1)).toEqual({ from: 'idle', to: 'ended', reason: 'loadMeeting' });

    vi.setSystemTime(lastTs + 45_000);
    await resume();
    expect(state.phase).toBe('recording');
    expect(state.loadedMeetingId).toBeNull();
    expect(state.source).toBe('live');
    expect(state.pausedDuration).toBe(45_000);
    expect(transitions.at(-1)).toEqual({ from: 'ended', to: 'recording', reason: 'resume-loaded' });
  });
});

describe('adoptImport', () => {
  it("sets phase paused, source imported, and copies the transcript", () => {
    const transcript = [
      { id: '1', text: 'a', timestamp: T0 },
      { id: '2', text: 'b', timestamp: T0 + 1000 },
    ];
    adoptImport(transcript, 'imported');
    expect(state.phase).toBe('paused');
    expect(state.source).toBe('imported');
    expect(state.transcript).toHaveLength(2);
    expect(state.transcript.map((l) => l.text)).toEqual(['a', 'b']);
    expect(transitions).toEqual([{ from: 'idle', to: 'paused', reason: 'adoptImport:imported' }]);
  });
});
