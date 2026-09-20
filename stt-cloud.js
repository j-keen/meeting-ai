// @ts-check
// stt-cloud.js - High-accuracy cloud STT engine: OpenAI Realtime transcription over WebSocket.
//
// Auth: a personal OpenAI key from settings is used directly (it is already in this browser);
// otherwise the server mints a short-lived secret at /api/realtime-token from OPENAI_API_KEY.
// Audio: mic → AudioContext @ 24 kHz → PCM16 → base64 `input_audio_buffer.append`.
// Server VAD closes each utterance; deltas → onInterim, completed → onFinal.
// Verified 2026-09-20 against the GA Realtime API (subprotocol auth, no beta header).

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
  let active = false;
  let paused = false;
  let reconnects = 0;
  let interim = '';
  let cb = /** @type {any} */ ({});

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
    if (!res.ok || !data.value) throw new Error(data.error || `realtime token error (${res.status})`);
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
      if (!active) return;
      if (reconnects >= 3) {
        cb.onError?.('Cloud STT: connection lost');
        cb.onFatalError?.('cloud');
        return;
      }
      reconnects++;
      setTimeout(() => { if (active && !ws) connect().catch(err => cb.onError?.(`Cloud STT: ${err.message}`)); }, 1000 * reconnects);
    };
  }

  function startAudio(mediaStream) {
    ctx = new (window.AudioContext || /** @type {any} */ (window).webkitAudioContext)({ sampleRate: SAMPLE_RATE });
    const source = ctx.createMediaStreamSource(mediaStream);
    processor = ctx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (e) => {
      if (paused || !ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: floatToPcm16Base64(e.inputBuffer.getChannelData(0)) }));
    };
    source.connect(processor);
    processor.connect(ctx.destination);
  }

  return {
    name: 'cloud',
    supportsPause: true,

    async start(onInterim, onFinal, onError, onReplace, onFatalError, onAudioStart) {
      cb = { onInterim, onFinal, onError, onFatalError, onConnected: onAudioStart };
      active = true;
      paused = false;
      interim = '';
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        active = false;
        onError?.(`Cloud STT: microphone unavailable (${err.name})`);
        onFatalError?.('cloud');
        return { started: false };
      }
      try {
        await connect();
      } catch (err) {
        active = false;
        stream.getTracks().forEach(t => t.stop());
        stream = null;
        onError?.(`Cloud STT: ${err.message}`);
        onFatalError?.('cloud');
        return { started: false };
      }
      startAudio(stream);
      return { started: true };
    },

    pause() { paused = true; },
    resume() { paused = false; },

    stop() {
      active = false;
      paused = false;
      if (processor) { try { processor.disconnect(); } catch { /* ignore */ } processor = null; }
      if (ctx) { ctx.close().catch(() => {}); ctx = null; }
      if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
      if (ws) {
        const s = ws; ws = null;
        try { s.close(); } catch { /* ignore */ }
      }
      interim = '';
    },
  };
}
