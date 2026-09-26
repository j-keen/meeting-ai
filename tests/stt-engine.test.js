import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../i18n.js', () => ({ t: (k) => k }));

import { resolveEngine, createSTT } from '../stt.js';

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function buildKeyboardDOM() {
  document.body.innerHTML = '';
  document.body.className = '';

  const bar = document.createElement('div');
  bar.className = 'kb-stt-bar';
  bar.id = 'kbSttBar';
  bar.hidden = true;

  const textarea = document.createElement('textarea');
  textarea.id = 'kbSttInput';

  const sendBtn = document.createElement('button');
  sendBtn.id = 'kbSttSend';

  bar.appendChild(textarea);
  bar.appendChild(sendBtn);
  document.body.appendChild(bar);
}

function makeStartCallbacks(overrides = {}) {
  return {
    language: 'en',
    settings: {},
    onInterim: vi.fn(),
    onFinal: vi.fn(),
    onError: vi.fn(),
    onReplace: vi.fn(),
    onFatalError: vi.fn(),
    onConnecting: vi.fn(),
    onConnected: vi.fn(),
    onRecordingStream: vi.fn(),
    ...overrides,
  };
}

describe('resolveEngine', () => {
  it('returns cloud on every platform whenever the cloud engine is available, ignoring stored prefs', () => {
    expect(resolveEngine({}, { hasNative: false, hasSpeech: true, isMobile: false, hasCloud: true })).toBe('cloud');
    expect(resolveEngine({ sttEngine: 'auto' }, { hasNative: true, hasSpeech: true, isMobile: true, hasCloud: true })).toBe('cloud');
    expect(resolveEngine({ sttEngine: 'webspeech' }, { hasNative: false, hasSpeech: true, hasCloud: true })).toBe('cloud');
    expect(resolveEngine({ sttEngine: 'keyboard' }, { hasNative: false, hasSpeech: false, hasCloud: true })).toBe('cloud');
    expect(resolveEngine({ sttEngine: 'whisper' }, { hasNative: false, hasSpeech: true, hasCloud: true })).toBe('cloud');
  });

  describe('fallback when the cloud engine is unavailable', () => {
    it('prefers native, then web speech, then keyboard', () => {
      expect(resolveEngine({}, { hasNative: true, hasCloud: false })).toBe('native');
      expect(resolveEngine({ sttEngine: 'auto' }, { hasNative: false, hasSpeech: true, hasCloud: false })).toBe('webspeech');
      expect(resolveEngine({}, { hasNative: false, hasSpeech: false, hasCloud: false })).toBe('keyboard');
    });

    it('does not pick cloud for an old stored cloud pref', () => {
      expect(resolveEngine({ sttEngine: 'cloud' }, { hasNative: false, hasSpeech: true, hasCloud: false })).toBe('webspeech');
    });

    it('still honors an old explicit keyboard / whisper / webspeech pref', () => {
      expect(resolveEngine({ sttEngine: 'keyboard' }, { hasNative: true, hasCloud: false })).toBe('keyboard');
      expect(resolveEngine({ sttEngine: 'whisper' }, { hasNative: false, hasSpeech: true, hasCloud: false })).toBe('whisper');
      expect(resolveEngine({ sttEngine: 'webspeech' }, { hasNative: true, hasSpeech: false, hasCloud: false })).toBe('native');
      expect(resolveEngine({ sttEngine: 'webspeech' }, { hasNative: false, hasSpeech: false, hasCloud: false })).toBe('webspeech');
    });
  });
});

describe('createSTT', () => {
  const originalUA = navigator.userAgent;
  const originalSR = window.SpeechRecognition;
  const originalWebkitSR = window.webkitSpeechRecognition;
  const originalBridge = window.__nativeBridge;
  const originalMediaDevices = navigator.mediaDevices;

  beforeEach(() => {
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
    delete window.__nativeBridge;
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      get: () => DESKTOP_UA,
    });
  });

  afterEach(() => {
    const sttBar = document.getElementById('kbSttBar');
    if (sttBar) sttBar.hidden = true;
    document.body.className = '';
    document.body.innerHTML = '';

    if (originalSR === undefined) delete window.SpeechRecognition;
    else window.SpeechRecognition = originalSR;
    if (originalWebkitSR === undefined) delete window.webkitSpeechRecognition;
    else window.webkitSpeechRecognition = originalWebkitSR;
    if (originalBridge === undefined) delete window.__nativeBridge;
    else window.__nativeBridge = originalBridge;

    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      get: () => originalUA,
    });
    if (originalMediaDevices) {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: originalMediaDevices,
      });
    }
    vi.restoreAllMocks();
  });

  it('keyboard engine starts, commits on Enter, and stop() hides the bar', async () => {
    buildKeyboardDOM();
    const cbs = makeStartCallbacks({ settings: { sttEngine: 'keyboard' } });
    const stt = createSTT();
    const ok = await stt.start(cbs);
    expect(ok).toBe(true);
    expect(cbs.onConnected).toHaveBeenCalledWith('keyboard');
    expect(document.getElementById('kbSttBar').hidden).toBe(false);

    const textarea = document.getElementById('kbSttInput');
    textarea.value = 'hello from keyboard';
    textarea.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      shiftKey: false,
      cancelable: true,
      bubbles: true,
    }));
    expect(cbs.onFinal).toHaveBeenCalledWith('hello from keyboard');

    stt.stop();
    expect(document.getElementById('kbSttBar').hidden).toBe(true);
  });

  it('webspeech on desktop returns false and calls onError when getUserMedia is NotAllowedError', async () => {
    const err = new Error('Permission denied');
    err.name = 'NotAllowedError';
    const getUserMedia = vi.fn(async () => { throw err; });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });

    const cbs = makeStartCallbacks({ settings: { sttEngine: 'webspeech' } });
    const stt = createSTT();
    const ok = await stt.start(cbs);
    expect(ok).toBe(false);
    expect(getUserMedia).toHaveBeenCalled();
    expect(cbs.onError).toHaveBeenCalled();
  });

  it('webspeech: a recognizer that goes silent (no events) is aborted, then handed to the session', async () => {
    vi.useFakeTimers();
    const instances = [];
    class FakeSR {
      constructor() { this.abort = vi.fn(); this.stop = vi.fn(); this.start = vi.fn(); instances.push(this); }
    }
    window.SpeechRecognition = FakeSR;
    Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => 'Mozilla/5.0 (Linux; Android 14) Chrome/140 Mobile' });
    const cbs = makeStartCallbacks({ settings: { sttEngine: 'webspeech', sttOnDevice: 'off' } });
    const onFatalError = vi.fn();
    const stt = createSTT();
    expect(await stt.start({ ...cbs, onFatalError })).toBe(true);
    const rec = instances[0];

    // Normal Android churn keeps it alive: events well inside the window.
    for (let i = 0; i < 6; i++) { await vi.advanceTimersByTimeAsync(10000); rec.onend?.(); }
    expect(rec.abort).not.toHaveBeenCalled();

    // Then total silence from the recognizer: abort first…
    await vi.advanceTimersByTimeAsync(31000);
    expect(rec.abort).toHaveBeenCalled();
    expect(onFatalError).not.toHaveBeenCalled();
    // …and if nothing comes back after the abort, the session gets a fatal to restart it.
    await vi.advanceTimersByTimeAsync(10000);
    expect(onFatalError).toHaveBeenCalled();
    expect(stt.isRunning).toBe(false);
    vi.useRealTimers();
  });
});
