import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createKeyboardEngine } from '../stt-keyboard.js';

function buildDOM() {
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

function setValue(textarea, value) {
  textarea.value = value;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function makeCallbacks() {
  return {
    onInterim: vi.fn(),
    onFinal: vi.fn(),
    onError: vi.fn(),
    onReplace: vi.fn(),
    onFatalError: vi.fn(),
    onAudioStart: vi.fn(),
  };
}

function startEngine(engine, cb) {
  return engine.start(cb.onInterim, cb.onFinal, cb.onError, cb.onReplace, cb.onFatalError, cb.onAudioStart);
}

describe('createKeyboardEngine', () => {
  let engine;
  let cb;
  let textarea;
  let sendBtn;

  beforeEach(() => {
    buildDOM();
    engine = createKeyboardEngine({ commitIdleMs: 2500 });
    cb = makeCallbacks();
    textarea = document.getElementById('kbSttInput');
    sendBtn = document.getElementById('kbSttSend');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('exposes the expected engine shape', () => {
    expect(engine.name).toBe('keyboard');
    expect(engine.supportsPause).toBe(true);
    expect(typeof engine.start).toBe('function');
    expect(typeof engine.pause).toBe('function');
    expect(typeof engine.resume).toBe('function');
    expect(typeof engine.stop).toBe('function');
  });

  it('start() returns started:false and calls onError when the bar is missing', () => {
    document.body.innerHTML = '';
    const result = startEngine(engine, cb);
    expect(result).toEqual({ started: false });
    expect(cb.onError).toHaveBeenCalledWith('keyboard input bar missing');
  });

  it('start() unhides the bar, adds the body class, focuses the textarea, and reports audio start', () => {
    const result = startEngine(engine, cb);
    expect(result).toEqual({ started: true });
    expect(document.getElementById('kbSttBar').hidden).toBe(false);
    expect(document.body.classList.contains('kb-stt-active')).toBe(true);
    expect(document.activeElement).toBe(textarea);
    expect(cb.onAudioStart).toHaveBeenCalledTimes(1);
  });

  it('fires onInterim on every input event', () => {
    startEngine(engine, cb);
    setValue(textarea, 'hel');
    setValue(textarea, 'hello');
    expect(cb.onInterim).toHaveBeenCalledWith('hel');
    expect(cb.onInterim).toHaveBeenCalledWith('hello');
  });

  it('commits complete lines when the value contains a newline, keeping the remainder', () => {
    startEngine(engine, cb);
    setValue(textarea, 'hello\nworld');
    expect(cb.onFinal).toHaveBeenCalledWith('hello');
    expect(cb.onFinal).toHaveBeenCalledTimes(1);
    expect(textarea.value).toBe('world');
    expect(cb.onInterim).toHaveBeenLastCalledWith('world');
  });

  it('does not commit blank lines from a bare newline', () => {
    startEngine(engine, cb);
    setValue(textarea, '\n');
    expect(cb.onFinal).not.toHaveBeenCalled();
    expect(textarea.value).toBe('');
  });

  it('commits on Enter without Shift and prevents the default newline', () => {
    startEngine(engine, cb);
    setValue(textarea, 'hi there');
    const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: false, cancelable: true, bubbles: true });
    textarea.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(cb.onFinal).toHaveBeenCalledWith('hi there');
    expect(textarea.value).toBe('');
  });

  it('does not commit on Shift+Enter', () => {
    startEngine(engine, cb);
    setValue(textarea, 'hi there');
    const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, cancelable: true, bubbles: true });
    textarea.dispatchEvent(event);
    expect(cb.onFinal).not.toHaveBeenCalled();
  });

  it('commits on clicking the send button', () => {
    startEngine(engine, cb);
    setValue(textarea, 'clicked text');
    sendBtn.click();
    expect(cb.onFinal).toHaveBeenCalledWith('clicked text');
    expect(textarea.value).toBe('');
  });

  it('never commits whitespace-only text', () => {
    startEngine(engine, cb);
    setValue(textarea, '   ');
    sendBtn.click();
    expect(cb.onFinal).not.toHaveBeenCalled();
  });

  it('commits after commitIdleMs of no input while text is pending', () => {
    vi.useFakeTimers();
    startEngine(engine, cb);
    setValue(textarea, 'idle commit');
    vi.advanceTimersByTime(2500);
    expect(cb.onFinal).toHaveBeenCalledWith('idle commit');
    expect(textarea.value).toBe('');
  });

  it('does not commit on idle timeout when the field is empty', () => {
    vi.useFakeTimers();
    startEngine(engine, cb);
    setValue(textarea, '   ');
    vi.advanceTimersByTime(2500);
    expect(cb.onFinal).not.toHaveBeenCalled();
  });

  it('never calls onReplace', () => {
    startEngine(engine, cb);
    setValue(textarea, 'a\nb');
    sendBtn.click();
    expect(cb.onReplace).not.toHaveBeenCalled();
  });

  it('pause() flushes pending text, blurs, and disables the textarea', () => {
    startEngine(engine, cb);
    setValue(textarea, 'pending text');
    engine.pause();
    expect(cb.onFinal).toHaveBeenCalledWith('pending text');
    expect(textarea.disabled).toBe(true);
    expect(document.activeElement).not.toBe(textarea);
    expect(document.getElementById('kbSttBar').hidden).toBe(false);
  });

  it('resume() re-enables and focuses the textarea', () => {
    startEngine(engine, cb);
    engine.pause();
    engine.resume();
    expect(textarea.disabled).toBe(false);
    expect(document.activeElement).toBe(textarea);
  });

  it('stop() flushes remaining text, hides the bar, and removes the body class', () => {
    startEngine(engine, cb);
    setValue(textarea, 'final flush');
    engine.stop();
    expect(cb.onFinal).toHaveBeenCalledWith('final flush');
    expect(document.getElementById('kbSttBar').hidden).toBe(true);
    expect(document.body.classList.contains('kb-stt-active')).toBe(false);
  });

  it('stop() does not commit after further idle time elapses', () => {
    vi.useFakeTimers();
    startEngine(engine, cb);
    setValue(textarea, 'leftover');
    engine.stop();
    cb.onFinal.mockClear();
    vi.advanceTimersByTime(5000);
    expect(cb.onFinal).not.toHaveBeenCalled();
  });
});
