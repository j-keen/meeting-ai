import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCloudEngine, CLOUD_STT_MODELS } from '../stt-cloud.js';

class FakeSocket {
  static instances = [];
  constructor(url, protocols) {
    this.url = url;
    this.protocols = protocols;
    this.readyState = 0;
    this.sent = [];
    FakeSocket.instances.push(this);
  }
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; this.onclose?.({}); }
  open() { this.readyState = 1; this.onopen?.(); }
  message(obj) { this.onmessage?.({ data: JSON.stringify(obj) }); }
}
FakeSocket.OPEN = 1;

class FakeProcessor {
  connect() {}
  disconnect() {}
}
class FakeAudioContext {
  constructor(opts) { this.sampleRate = opts?.sampleRate; this.destination = {}; }
  createMediaStreamSource() { return { connect() {} }; }
  createScriptProcessor() { const p = new FakeProcessor(); FakeAudioContext.lastProcessor = p; return p; }
  close() { return Promise.resolve(); }
}

function fakeStream() {
  const track = { stop: vi.fn() };
  return { getTracks: () => [track], track };
}

describe('createCloudEngine', () => {
  let stream;
  beforeEach(() => {
    FakeSocket.instances = [];
    stream = fakeStream();
    global.WebSocket = FakeSocket;
    window.AudioContext = FakeAudioContext;
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: vi.fn(async () => stream) }, configurable: true });
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ value: 'ek_test' }) }));
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('uses the personal key directly and configures the session on open', async () => {
    const engine = createCloudEngine({ language: 'ko', model: 'gpt-4o-transcribe', getPersonalKey: () => 'sk-personal' });
    const onAudioStart = vi.fn();
    const p = engine.start(vi.fn(), vi.fn(), vi.fn(), null, vi.fn(), onAudioStart);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    const ws = FakeSocket.instances[0];
    expect(ws.url).toContain('intent=transcription');
    expect(ws.protocols).toEqual(['realtime', 'openai-insecure-api-key.sk-personal']);
    expect(global.fetch).not.toHaveBeenCalled();
    ws.open();
    const res = await p;
    expect(res.started).toBe(true);
    expect(onAudioStart).toHaveBeenCalled();
    const update = ws.sent.find(m => m.type === 'session.update');
    expect(update.session.audio.input.transcription).toEqual({ model: 'gpt-4o-transcribe', language: 'ko' });
    expect(update.session.audio.input.format.rate).toBe(24000);
  });

  it('mints a server token when there is no personal key', async () => {
    const engine = createCloudEngine({ language: 'en' });
    const p = engine.start(vi.fn(), vi.fn(), vi.fn(), null, vi.fn(), vi.fn());
    for (let i = 0; i < 6; i++) await Promise.resolve();
    expect(global.fetch).toHaveBeenCalledWith('/api/realtime-token', expect.objectContaining({ method: 'POST' }));
    const ws = FakeSocket.instances[0];
    expect(ws.protocols[1]).toBe('openai-insecure-api-key.ek_test');
    ws.open();
    await p;
  });

  it('routes deltas to onInterim and completed transcripts to onFinal; stop closes everything', async () => {
    const engine = createCloudEngine({ getPersonalKey: () => 'k' });
    const onInterim = vi.fn(); const onFinal = vi.fn();
    const p = engine.start(onInterim, onFinal, vi.fn(), null, vi.fn(), vi.fn());
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    const ws = FakeSocket.instances[0]; ws.open(); await p;
    ws.message({ type: 'conversation.item.input_audio_transcription.delta', delta: '안녕' });
    ws.message({ type: 'conversation.item.input_audio_transcription.delta', delta: '하세요' });
    expect(onInterim).toHaveBeenLastCalledWith('안녕하세요');
    ws.message({ type: 'conversation.item.input_audio_transcription.completed', transcript: ' 안녕하세요 ' });
    expect(onFinal).toHaveBeenCalledWith('안녕하세요');
    ws.message({ type: 'conversation.item.input_audio_transcription.completed', transcript: '' });
    expect(onFinal).toHaveBeenCalledTimes(1);
    engine.stop();
    expect(stream.track.stop).toHaveBeenCalled();
    expect(ws.readyState).toBe(3);
  });

  it('reports a fatal error when the microphone is unavailable', async () => {
    navigator.mediaDevices.getUserMedia = vi.fn(async () => { const e = new Error('denied'); e.name = 'NotAllowedError'; throw e; });
    const engine = createCloudEngine({ getPersonalKey: () => 'k' });
    const onError = vi.fn(); const onFatal = vi.fn();
    const res = await engine.start(vi.fn(), vi.fn(), onError, null, onFatal, vi.fn());
    expect(res.started).toBe(false);
    expect(onError).toHaveBeenCalled();
    expect(onFatal).toHaveBeenCalledWith('cloud', 'permanent'); // denied mic: retrying can't help
  });

  it('never brings up a zombie engine when stopped while waiting for the mic', async () => {
    let release;
    navigator.mediaDevices.getUserMedia = vi.fn(() => new Promise(r => { release = r; }));
    const engine = createCloudEngine({ getPersonalKey: () => 'k' });
    const onFinal = vi.fn(); const onFatal = vi.fn();
    const p = engine.start(vi.fn(), onFinal, vi.fn(), null, onFatal, vi.fn());
    engine.stop();          // the session restarted STT meanwhile
    release(stream);
    const res = await p;
    expect(res.started).toBe(false);
    expect(FakeSocket.instances.length).toBe(0);
    expect(stream.track.stop).toHaveBeenCalled();
    expect(onFatal).not.toHaveBeenCalled();
  });

  describe('liveness / recovery', () => {
    const chunk = () => FakeAudioContext.lastProcessor.onaudioprocess({ inputBuffer: { getChannelData: () => new Float32Array(8) } });
    async function started(opts = {}) {
      const engine = createCloudEngine({ getPersonalKey: () => 'k', ...opts });
      const onFatal = vi.fn();
      const p = engine.start(vi.fn(), vi.fn(), vi.fn(), null, onFatal, vi.fn());
      for (let i = 0; i < 8; i++) await Promise.resolve();
      FakeSocket.instances[0].open();
      await p;
      return { engine, onFatal };
    }
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('keeps retrying when a reconnect attempt itself fails, then hands over to the session', async () => {
      const { engine, onFatal } = await started({ getPersonalKey: undefined });
      global.fetch = vi.fn(async () => { throw new Error('offline'); });
      FakeSocket.instances[0].close();
      for (let i = 0; i < 12; i++) {
        chunk();
        await vi.advanceTimersByTimeAsync(1000);
      }
      expect(global.fetch.mock.calls.length).toBeGreaterThanOrEqual(3); // retried, not stuck after one failure
      await vi.advanceTimersByTimeAsync(30000);
      expect(onFatal).toHaveBeenCalledWith('cloud', 'connection lost');
      engine.stop();
    });

    it('reconnects after a dropped socket once the network is back', async () => {
      const { engine, onFatal } = await started();
      FakeSocket.instances[0].close();
      chunk();
      await vi.advanceTimersByTimeAsync(1100);
      expect(FakeSocket.instances.length).toBe(2);
      FakeSocket.instances[1].open();
      chunk();
      expect(FakeSocket.instances[1].sent.some(m => m.type === 'input_audio_buffer.append')).toBe(true);
      expect(onFatal).not.toHaveBeenCalled();
      engine.stop();
    });

    it('restarts the engine when audio capture stalls (suspended AudioContext / dead mic)', async () => {
      const { onFatal } = await started();
      chunk();
      await vi.advanceTimersByTimeAsync(14000);
      expect(onFatal).toHaveBeenCalledWith('cloud', 'audio stalled');
      expect(stream.track.stop).toHaveBeenCalled();
    });

    it('does not treat a user pause as a stall', async () => {
      const { engine, onFatal } = await started();
      engine.pause();
      await vi.advanceTimersByTimeAsync(60000);
      expect(onFatal).not.toHaveBeenCalled();
      engine.resume();
      chunk();
      await vi.advanceTimersByTimeAsync(3000);
      expect(onFatal).not.toHaveBeenCalled();
      engine.stop();
    });

    it('a socket stuck in CONNECTING is dropped and retried', async () => {
      const { engine, onFatal } = await started();
      FakeSocket.instances[0].close();
      for (let i = 0; i < 22; i++) { chunk(); await vi.advanceTimersByTimeAsync(1000); } // #2 never opens
      expect(FakeSocket.instances.length).toBeGreaterThanOrEqual(3);
      expect(onFatal).not.toHaveBeenCalled();
      engine.stop();
    });

    it('returning from a freeze gives the audio a grace period instead of an instant restart', async () => {
      const { engine, onFatal } = await started();
      chunk();
      vi.setSystemTime(Date.now() + 60000); // page frozen: clock jumps, no chunks, no timers
      engine.ensureAlive();
      await vi.advanceTimersByTimeAsync(2100); // first overdue health tick
      expect(onFatal).not.toHaveBeenCalled();
      engine.stop();
    });

    it('ensureAlive reconnects immediately when the socket is gone', async () => {
      const { engine } = await started();
      FakeSocket.instances[0].close();
      engine.ensureAlive();
      await vi.advanceTimersByTimeAsync(0);
      expect(FakeSocket.instances.length).toBe(2);
      engine.stop();
    });
  });

  it('falls back to the default model for unknown ids', async () => {
    const engine = createCloudEngine({ model: 'nope', getPersonalKey: () => 'k' });
    const p = engine.start(vi.fn(), vi.fn(), vi.fn(), null, vi.fn(), vi.fn());
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    const ws = FakeSocket.instances[0]; ws.open(); await p;
    expect(ws.sent[0].session.audio.input.transcription.model).toBe(CLOUD_STT_MODELS[0]);
  });
});
