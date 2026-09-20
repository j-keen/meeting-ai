import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

class MockWorker {
  constructor(url, opts) {
    this.url = url;
    this.opts = opts;
    this.listeners = { message: [], error: [] };
    this.postMessage = vi.fn();
    MockWorker.instances.push(this);
  }
  addEventListener(type, fn) { this.listeners[type]?.push(fn); }
  removeEventListener(type, fn) {
    if (!this.listeners[type]) return;
    this.listeners[type] = this.listeners[type].filter((f) => f !== fn);
  }
  emit(type, data) {
    for (const fn of [...(this.listeners[type] || [])]) fn({ data, error: data });
  }
}
MockWorker.instances = [];

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

function mockGetUserMedia() {
  const tracks = [{ stop: vi.fn() }];
  const stream = { getTracks: () => tracks };
  navigator.mediaDevices = { getUserMedia: vi.fn().mockResolvedValue(stream) };
  return { stream, tracks };
}

function mockAudioContext() {
  const processorNode = { onaudioprocess: null, connect: vi.fn(), disconnect: vi.fn() };
  const sourceNode = { connect: vi.fn(), disconnect: vi.fn() };
  const gainNode = { gain: { value: 1 }, connect: vi.fn() };
  const ctx = {
    sampleRate: 16000,
    destination: {},
    createMediaStreamSource: vi.fn(() => sourceNode),
    createScriptProcessor: vi.fn(() => processorNode),
    createGain: vi.fn(() => gainNode),
    close: vi.fn(),
  };
  window.AudioContext = vi.fn(() => ctx);
  return { ctx, processorNode, sourceNode };
}

function feedAudio(processorNode, samples) {
  processorNode.onaudioprocess({ inputBuffer: { getChannelData: () => samples } });
}

function loudSamples(n) {
  const arr = new Float32Array(n);
  for (let i = 0; i < n; i++) arr[i] = (i % 2 === 0) ? 0.5 : -0.5;
  return arr;
}

describe('isWhisperSupported', () => {
  const originalWorker = global.Worker;
  afterEach(() => { global.Worker = originalWorker; });

  it('is false without a Worker global', async () => {
    delete global.Worker;
    vi.resetModules();
    const { isWhisperSupported } = await import('../stt-whisper.js');
    expect(isWhisperSupported()).toBe(false);
  });

  it('is true when Worker and WebAssembly exist', async () => {
    global.Worker = MockWorker;
    vi.resetModules();
    const { isWhisperSupported } = await import('../stt-whisper.js');
    expect(isWhisperSupported()).toBe(true);
  });
});

describe('createWhisperEngine', () => {
  let createWhisperEngine;
  let tracks;

  beforeEach(async () => {
    MockWorker.instances = [];
    global.Worker = MockWorker;
    vi.resetModules();
    ({ createWhisperEngine } = await import('../stt-whisper.js'));
    ({ tracks } = mockGetUserMedia());
  });

  async function startReadyEngine() {
    const { processorNode } = mockAudioContext();
    const engine = createWhisperEngine({ language: 'ko', modelId: 'onnx-community/whisper-base' });
    const cb = makeCallbacks();
    const startPromise = startEngine(engine, cb);
    await Promise.resolve();
    await Promise.resolve();
    const w = MockWorker.instances[0];
    w.emit('message', { type: 'ready' });
    const result = await startPromise;
    return { engine, cb, w, processorNode, result };
  }

  it('start() returns started:true and calls onAudioStart', async () => {
    const { result, cb } = await startReadyEngine();
    expect(result).toEqual({ started: true });
    expect(cb.onAudioStart).toHaveBeenCalledTimes(1);
  });

  it('feeding 8s of speech followed by a short pause posts one transcribe message', async () => {
    const { w, processorNode } = await startReadyEngine();
    w.postMessage.mockClear();
    feedAudio(processorNode, loudSamples(16000 * 8));
    feedAudio(processorNode, new Float32Array(16000 / 2)); // 0.5 s pause → cut on the boundary
    const transcribeCalls = w.postMessage.mock.calls.filter(([msg]) => msg.type === 'transcribe');
    expect(transcribeCalls).toHaveLength(1);
    expect(transcribeCalls[0][0].audio).toBeInstanceOf(Float32Array);
    expect(transcribeCalls[0][0].language).toBe('korean');
  });

  it('cuts continuous speech at the hard cap (2× chunkSeconds) even without a pause', async () => {
    const { w, processorNode } = await startReadyEngine();
    w.postMessage.mockClear();
    feedAudio(processorNode, loudSamples(16000 * 15));
    expect(w.postMessage.mock.calls.filter(([m]) => m.type === 'transcribe')).toHaveLength(0);
    feedAudio(processorNode, loudSamples(16000 * 2));
    expect(w.postMessage.mock.calls.filter(([m]) => m.type === 'transcribe')).toHaveLength(1);
  });

  it('calls onFinal(text) when a result message carries text', async () => {
    const { w, cb, processorNode } = await startReadyEngine();
    feedAudio(processorNode, loudSamples(16000 * 8));
    w.emit('message', { type: 'result', id: 1, text: '  hello world  ' });
    expect(cb.onFinal).toHaveBeenCalledWith('hello world');
  });

  it('does not call onFinal when the result text is empty', async () => {
    const { w, cb, processorNode } = await startReadyEngine();
    feedAudio(processorNode, loudSamples(16000 * 8));
    w.emit('message', { type: 'result', id: 1, text: '   ' });
    expect(cb.onFinal).not.toHaveBeenCalled();
  });

  it('stop() flushes the pending buffer as a final transcribe and stops mic tracks', async () => {
    const { engine, w, processorNode } = await startReadyEngine();
    w.postMessage.mockClear();
    feedAudio(processorNode, loudSamples(16000)); // 1 s of speech: well under the 8s threshold
    expect(w.postMessage).not.toHaveBeenCalled();

    engine.stop();

    const transcribeCalls = w.postMessage.mock.calls.filter(([msg]) => msg.type === 'transcribe');
    expect(transcribeCalls).toHaveLength(1);
    expect(tracks[0].stop).toHaveBeenCalledTimes(1);
  });

  it('never transcribes a chunk that held no speech (silence gating against hallucinations)', async () => {
    const { engine, w, processorNode } = await startReadyEngine();
    w.postMessage.mockClear();
    feedAudio(processorNode, new Float32Array(16000 * 2)); // 2 s of digital silence
    engine.stop();
    const transcribeCalls = w.postMessage.mock.calls.filter(([msg]) => msg.type === 'transcribe');
    expect(transcribeCalls).toHaveLength(0);
  });
});

describe('getWhisperModelStatus', () => {
  afterEach(() => { delete global.caches; });

  it('reports downloaded:false when nothing matches', async () => {
    global.caches = {
      open: vi.fn().mockResolvedValue({
        keys: vi.fn().mockResolvedValue([]),
        match: vi.fn(),
      }),
    };
    vi.resetModules();
    const { getWhisperModelStatus } = await import('../stt-whisper.js');
    const status = await getWhisperModelStatus('onnx-community/whisper-base');
    expect(status).toEqual({ downloaded: false });
  });

  it('reports downloaded:true with summed bytes when cache entries match', async () => {
    const req1 = { url: 'https://example.com/onnx-community/whisper-base/onnx/encoder_model.onnx' };
    const req2 = { url: 'https://example.com/onnx-community/whisper-base/onnx/decoder_model.onnx' };
    const cache = {
      keys: vi.fn().mockResolvedValue([req1, req2]),
      match: vi.fn((req) => Promise.resolve({
        headers: { get: () => (req === req1 ? '1000' : '2000') },
      })),
    };
    global.caches = { open: vi.fn().mockResolvedValue(cache) };
    vi.resetModules();
    const { getWhisperModelStatus } = await import('../stt-whisper.js');
    const status = await getWhisperModelStatus('onnx-community/whisper-base');
    expect(status).toEqual({ downloaded: true, bytes: 3000 });
    expect(cache.keys).toHaveBeenCalled();
    expect(cache.match).toHaveBeenCalled();
  });
});
