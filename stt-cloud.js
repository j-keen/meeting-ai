// @ts-check
// stt-cloud.js - High-accuracy cloud STT engine: OpenAI Realtime transcription over WebSocket.
//
// Auth: a personal OpenAI key from settings is used directly (it is already in this browser);
// otherwise the server mints a short-lived secret at /api/realtime-token from OPENAI_API_KEY.
// Audio: mic → AudioContext @ 24 kHz → PCM16 → base64 `input_audio_buffer.append`.
// Server VAD closes each utterance; deltas → onInterim, completed → onFinal.
// Verified 2026-09-20 against the GA Realtime API (subprotocol auth, no beta header).

import { t } from './i18n.js';

const WS_URL = 'wss://api.openai.com/v1/realtime?intent=transcription';
const SAMPLE_RATE = 24000;
export const CLOUD_STT_MODELS = ['gpt-4o-mini-transcribe', 'gpt-4o-transcribe'];

/**
 * @param {{ language?: string, model?: string, getPersonalKey?: () => string }} opts
 */
export function createCloudEngine({ language = 'ko', model = CLOUD_STT_MODELS[0], getPersonalKey = () => '' } = {}) {
  /** @type {WebSocket | null} */ let ws = null;
  /** @type {MediaStream | null} */ let stream = null;
  /** @type {AudioContext | null} */ let ctx = null;
  /** @type {ScriptProcessorNode | null} */ let processor = null;
  /** @type {AudioWorkletNode | null} */ let worklet = null;
  let active = false;
  let paused = false;
  let reconnects = 0;
  let interim = '';
  let captureMode = 'none';
  let cb = /** @type {any} */ ({});
  let reconnectTimer = null;
  let healthTimer = null;
  let lastChunkAt = 0;          // last PCM chunk from the capture node (flows even in silence)
  let dead = false;             // handed to the session for a full restart; ignore late events

  // Liveness thresholds. Audio chunks arrive every ~100 ms, so a gap this long means the
  // AudioContext was suspended/interrupted or the mic track died.
  const AUDIO_STALL_RESUME_MS = 4000;
  const AUDIO_STALL_FATAL_MS = 12000;
  const MAX_BUFFERED_BYTES = 2 * 1024 * 1024; // ~40 s of audio stuck in the socket → reconnect
  const MAX_RECONNECTS = 5;

  const lang = ['ko', 'en', 'ja', 'zh'].includes(language) ? language : 'ko';
  const sttModel = CLOUD_STT_MODELS.includes(model) ? model : CLOUD_STT_MODELS[0];

  async function getSecret() {
    const personal = (getPersonalKey() || '').trim();
    if (personal) return personal;
    const res = await fetch('/api/realtime-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: sttModel, language: lang }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.value) {
      const msg = String(data.error || '');
      if (res.status === 404 || /not configured/i.test(msg)) throw new Error(t('stt.cloud_no_key'));
      if (res.status === 429) throw new Error(t('stt.cloud_rate_limited'));
      throw new Error(msg || `realtime token error (${res.status})`);
    }
    return data.value;
  }

  function floatToPcm16Base64(float32) {
    const int16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    let bin = '';
    const bytes = new Uint8Array(int16.buffer);
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, /** @type {any} */ (bytes.subarray(i, i + 0x8000)));
    }
    return btoa(bin);
  }

  async function connect() {
    const secret = await getSecret();
    const socket = new WebSocket(WS_URL, ['realtime', `openai-insecure-api-key.${secret}`]);
    ws = socket;

    socket.onopen = () => {
      reconnects = 0;
      // Personal-key sessions start unconfigured: set model/language/VAD explicitly.
      socket.send(JSON.stringify({
        type: 'session.update',
        session: {
          type: 'transcription',
          audio: {
            input: {
              format: { type: 'audio/pcm', rate: SAMPLE_RATE },
              transcription: { model: sttModel, language: lang },
              turn_detection: { type: 'server_vad', silence_duration_ms: 700 },
            },
          },
        },
      }));
      cb.onConnected?.();
    };

    socket.onmessage = (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      switch (msg.type) {
        case 'conversation.item.input_audio_transcription.delta':
          interim += msg.delta || '';
          if (interim.trim()) cb.onInterim?.(interim);
          break;
        case 'conversation.item.input_audio_transcription.completed': {
          const text = (msg.transcript || interim || '').trim();
          interim = '';
          if (text) cb.onFinal?.(text);
          break;
        }
        case 'error':
          cb.onError?.(`Cloud STT: ${msg.error?.message || 'unknown error'}`);
          break;
        default:
          break;
      }
    };

    socket.onerror = () => { /* onclose follows; reconnect logic lives there */ };

    socket.onclose = () => {
      if (ws !== socket) return; // superseded
      ws = null;
      scheduleReconnect();
    };
  }

  /**
   * Reconnect with backoff. A failed attempt (e.g. the token fetch fails while the phone
   * is between networks) schedules the next one instead of silently leaving the engine
   * without a socket; after MAX_RECONNECTS the session restarts the whole engine.
   */
  function scheduleReconnect(delayMs) {
    if (!active || dead || ws || reconnectTimer) return;
    if (reconnects >= MAX_RECONNECTS) { giveUp('connection lost'); return; }
    reconnects++;
    const delay = delayMs ?? Math.min(1000 * reconnects, 5000);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (!active || dead || ws) return;
      connect().catch(() => scheduleReconnect());
    }, delay);
  }

  /** Hand over to the session (meeting-session.js recoverStt), which starts a fresh engine. */
  function giveUp(reason) {
    if (dead || !active) return;
    dead = true;
    teardown();
    cb.onFatalError?.('cloud', reason);
  }

  function bytesToBase64(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, /** @type {any} */ (bytes.subarray(i, i + 0x8000)));
    }
    return btoa(bin);
  }

  function sendPcm(base64) {
    lastChunkAt = Date.now();
    if (paused || !ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: base64 }));
  }

  function resumeCtx() {
    if (!ctx || ctx.state === 'running' || ctx.state === 'closed') return;
    try { ctx.resume?.()?.catch?.(() => {}); } catch { /* ignore */ }
  }

  /** Periodic liveness check: suspended audio, dead mic, missing or stalled socket. */
  function checkHealth() {
    if (!active || dead || paused) return;
    const stalledFor = Date.now() - lastChunkAt;
    resumeCtx();
    if (stalledFor > AUDIO_STALL_FATAL_MS) { giveUp('audio stalled'); return; }
    if (stalledFor > AUDIO_STALL_RESUME_MS) { try { ctx?.resume?.()?.catch?.(() => {}); } catch { /* ignore */ } }
    if (!ws) scheduleReconnect();
    else if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount > MAX_BUFFERED_BYTES) {
      // Network is stalled: frames pile up locally. Drop the socket; onclose reconnects.
      try { ws.close(); } catch { /* ignore */ }
    }
  }

  function teardown() {
    if (healthTimer) { clearInterval(healthTimer); healthTimer = null; }
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if (worklet) { try { worklet.port.onmessage = null; worklet.disconnect(); } catch { /* ignore */ } worklet = null; }
    if (processor) { try { processor.onaudioprocess = null; processor.disconnect(); } catch { /* ignore */ } processor = null; }
    if (ctx) { ctx.close().catch(() => {}); ctx = null; }
    if (stream) { stream.getTracks().forEach(tr => { tr.onended = null; tr.stop(); }); stream = null; }
    if (ws) {
      const s = ws; ws = null;
      try { s.close(); } catch { /* ignore */ }
    }
    interim = '';
  }

  async function startAudio(mediaStream) {
    ctx = new (window.AudioContext || /** @type {any} */ (window).webkitAudioContext)({ sampleRate: SAMPLE_RATE });
    const source = ctx.createMediaStreamSource(mediaStream);
    // Preferred: AudioWorklet — runs on the audio thread, so capture continues while the
    // tab is in the background / the screen is off (main-thread ScriptProcessor is throttled).
    if (ctx.audioWorklet && typeof ctx.audioWorklet.addModule === 'function') {
      try {
        await ctx.audioWorklet.addModule('./pcm-worklet.js');
        worklet = new AudioWorkletNode(ctx, 'pcm-capture', { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 1 });
        worklet.port.onmessage = (e) => sendPcm(bytesToBase64(new Uint8Array(e.data)));
        source.connect(worklet);
        return 'worklet';
      } catch { /* fall back below */ }
    }
    processor = ctx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (e) => sendPcm(floatToPcm16Base64(e.inputBuffer.getChannelData(0)));
    source.connect(processor);
    processor.connect(ctx.destination);
    return 'scriptprocessor';
  }

  return {
    name: 'cloud',
    supportsPause: true,

    async start(onInterim, onFinal, onError, onReplace, onFatalError, onAudioStart) {
      cb = { onInterim, onFinal, onError, onFatalError, onConnected: onAudioStart };
      active = true;
      paused = false;
      dead = false;
      reconnects = 0;
      interim = '';
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        active = false;
        onError?.(t('stt.cloud_mic_unavailable', { reason: err.name }));
        onFatalError?.('cloud');
        return { started: false };
      }
      try {
        await connect();
      } catch (err) {
        active = false;
        stream.getTracks().forEach(t => t.stop());
        stream = null;
        onError?.(t('stt.cloud_error', { message: err.message }));
        onFatalError?.('cloud');
        return { started: false };
      }
      captureMode = await startAudio(stream);
      // The OS can take the mic away (another app, a call) — restart the engine.
      stream.getAudioTracks?.().forEach(tr => { tr.onended = () => giveUp('mic ended'); });
      // Suspended/interrupted audio (calls, other media, screen lock on some phones).
      if (ctx) ctx.onstatechange = () => { if (active && !paused) resumeCtx(); };
      lastChunkAt = Date.now();
      healthTimer = setInterval(checkHealth, 2000);
      return { started: true };
    },

    get captureMode() { return captureMode; },
    pause() { paused = true; worklet?.port.postMessage('pause'); },
    resume() {
      paused = false;
      lastChunkAt = Date.now();
      worklet?.port.postMessage('resume');
      resumeCtx();
    },

    /** Called when the page becomes visible again: revive audio and the socket right away. */
    ensureAlive() {
      if (!active || dead || paused) return;
      resumeCtx();
      if (!ws) {
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
        scheduleReconnect(0);
      }
    },

    stop() {
      active = false;
      paused = false;
      teardown();
    },
  };
}
