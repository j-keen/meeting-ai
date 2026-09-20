// stt-whisper.js - In-browser Whisper STT engine (transformers.js in a module worker).
//
// Engine contract (see stt.js):
//   name: 'whisper', supportsPause: true
//   start(onInterim, onFinal, onError, onReplace, onFatalError, onAudioStart) → Promise<{ started }>
//   pause(), resume(), stop()
//
// Model download/status/delete use the browser Cache API entries transformers.js
// writes under the 'transformers-cache' cache name; the worker stays alive across
// start/stop cycles so a loaded model isn't re-downloaded.

import { t } from './i18n.js';

const CACHE_NAME = 'transformers-cache';
const TARGET_RATE = 16000;
const WHISPER_LANG = { ko: 'korean', en: 'english', ja: 'japanese', zh: 'chinese' };

export const WHISPER_MODELS = [
  // Measured 2026-09-20 on WebGPU (fp32 encoder + q4 decoder); WASM (q8) downloads roughly half.
  { id: 'onnx-community/whisper-base', label: 'Whisper Base (~150–300MB, 빠름)', sizeMB: 300 },
  { id: 'onnx-community/whisper-small', label: 'Whisper Small (~300–600MB, 한국어 정확도 권장)', sizeMB: 600 },
];

export function isWhisperSupported() {
  return typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined';
}

let worker = null;
function getWorker() {
  if (!worker) worker = new Worker('./stt-whisper.worker.js', { type: 'module' });
  return worker;
}

function requestLoad(w, modelId, onProgress) {
  return new Promise((resolve, reject) => {
    const onMessage = (e) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        onProgress?.({
          file: msg.file,
          loaded: msg.loaded,
          total: msg.total,
          percent: msg.total ? Math.round((msg.loaded / msg.total) * 100) : 0,
        });
      } else if (msg.type === 'ready') {
        cleanup();
        resolve();
      } else if (msg.type === 'error') {
        cleanup();
        reject(new Error(msg.message));
      }
    };
    const onErr = (e) => { cleanup(); reject(e.error || new Error('worker error')); };
    function cleanup() {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onErr);
    }
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onErr);
    w.postMessage({ type: 'load', modelId });
  });
}

export async function getWhisperModelStatus(modelId) {
  if (typeof caches === 'undefined') return { downloaded: false };
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    const matching = keys.filter((req) => req.url.includes(modelId));
    if (matching.length === 0) return { downloaded: false };
    let bytes = 0;
    for (const req of matching) {
      const res = await cache.match(req);
      const len = res?.headers?.get?.('content-length');
      if (len) bytes += parseInt(len, 10);
      else {
        const blob = await res?.blob?.();
        if (blob) bytes += blob.size;
      }
    }
    return { downloaded: true, bytes };
  } catch {
    return { downloaded: false };
  }
}

export function downloadWhisperModel(modelId, onProgress) {
  return requestLoad(getWorker(), modelId, onProgress);
}

export async function deleteWhisperModel(modelId) {
  worker?.postMessage({ type: 'delete', modelId });
  if (typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    await Promise.all(keys.filter((req) => req.url.includes(modelId)).map((req) => cache.delete(req)));
  } catch { /* ignore */ }
}

function toWhisperLang(language) {
  return WHISPER_LANG[language] || 'english';
}

function computeRms(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

function resampleTo16k(input, inRate) {
  if (inRate === TARGET_RATE) return Float32Array.from(input);
  const ratio = inRate / TARGET_RATE;
  const outLen = Math.max(1, Math.round(input.length / ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcIdx = i * ratio;
    const i0 = Math.floor(srcIdx);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = srcIdx - i0;
    out[i] = input[i0] + (input[i1] - input[i0]) * frac;
  }
  return out;
}

/** Drop bracketed non-speech tags ("[음악]", "(박수)", "[BLANK_AUDIO]") and empty results. */
export function cleanWhisperText(raw) {
  let text = String(raw || '');
  text = text.replace(/[[(（【][^\])）】]*[\])）】]/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  if (!/[\p{L}\p{N}]/u.test(text)) return '';
  return text;
}

export function createWhisperEngine({ language, modelId, chunkSeconds = 8 } = {}) {
  let w = null;
  let audioContext = null;
  let sourceNode = null;
  let processorNode = null;
  let stream = null;
  let buffers = [];
  let bufferedSamples = 0;
  let speechMs = 0;
  let silenceMs = 0;
  let inFlight = false;
  let paused = false;
  let stopped = false;
  let transcribeId = 0;
  let pendingResponses = 0;
  let onInterimCb = null, onFinalCb = null, onErrorCb = null, onFatalErrorCb = null;

  function concatBuffers() {
    const out = new Float32Array(bufferedSamples);
    let offset = 0;
    for (const b of buffers) { out.set(b, offset); offset += b.length; }
    return out;
  }

  function sendCurrentBuffer() {
    if (bufferedSamples === 0) return;
    // Trailing 300 ms of silence lets the decoder finish the last word cleanly.
    buffers.push(new Float32Array(TARGET_RATE * 0.3));
    bufferedSamples += TARGET_RATE * 0.3;
    const audio = concatBuffers();
    const hadSpeech = speechMs >= 300;
    buffers = [];
    bufferedSamples = 0;
    speechMs = 0;
    silenceMs = 0;
    // Whisper hallucinates on silence ("[음악]", "[모두]", "감사합니다"): never transcribe a chunk
    // that held less than 300 ms of speech-level audio.
    if (!hadSpeech) return;
    inFlight = true;
    pendingResponses++;
    onInterimCb?.(t('stt.whisper_transcribing'));
    const id = ++transcribeId;
    w.postMessage({ type: 'transcribe', id, audio, language: toWhisperLang(language) });
  }

  function maybeFlush() {
    if (bufferedSamples === 0 || inFlight) return;
    const durSec = bufferedSamples / TARGET_RATE;
    // Cut only on silence so words are not split in half:
    //  - a natural pause (≥700 ms) after at least 1 s of speech
    //  - past the soft window (chunkSeconds) at the next short pause (≥250 ms)
    //  - hard cap at 2× chunkSeconds regardless
    const pauseBoundary = silenceMs >= 900 && speechMs >= 1000;
    const softWindow = durSec >= chunkSeconds && silenceMs >= 250;
    const hardCap = durSec >= chunkSeconds * 2;
    if (pauseBoundary || softWindow || hardCap) sendCurrentBuffer();
  }

  function handleAudioProcess(e) {
    if (paused) return;
    const input = e.inputBuffer.getChannelData(0);
    const resampled = resampleTo16k(input, audioContext.sampleRate);
    buffers.push(resampled);
    bufferedSamples += resampled.length;

    const blockMs = (resampled.length / TARGET_RATE) * 1000;
    // Quiet syllable tails must not count as silence, or words get split across chunks.
    if (computeRms(resampled) < 0.006) silenceMs += blockMs;
    else { speechMs += blockMs; silenceMs = 0; }

    maybeFlush();
  }

  // Kept attached until every in-flight/queued response has arrived (even past
  // stop()) so the final flushed chunk's text isn't dropped; removed only once
  // drained, since the worker is a shared singleton across recording sessions.
  function handleWorkerMessage(e) {
    const msg = e.data;
    if (msg.type !== 'result' && msg.type !== 'error') return;
    inFlight = false;
    pendingResponses = Math.max(0, pendingResponses - 1);
    if (msg.type === 'result') {
      const text = cleanWhisperText(msg.text);
      if (text) onFinalCb?.(text);
    } else {
      onErrorCb?.(msg.message);
    }
    if (stopped) {
      if (pendingResponses === 0) w?.removeEventListener('message', handleWorkerMessage);
      return;
    }
    maybeFlush();
  }

  return {
    name: 'whisper',
    supportsPause: true,

    async start(onInterim, onFinal, onError, onReplace, onFatalError, onAudioStart) {
      onInterimCb = onInterim; onFinalCb = onFinal; onErrorCb = onError; onFatalErrorCb = onFatalError;

      if (!isWhisperSupported()) {
        onError(t('settings.whisper_unsupported'));
        return { started: false };
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        onError(err?.name === 'NotFoundError' ? t('stt.mic_not_found') : t('stt.mic_permission_denied_detail'));
        return { started: false };
      }

      w = getWorker();
      w.addEventListener('message', handleWorkerMessage);
      onInterimCb?.(t('stt.whisper_loading'));
      try {
        await requestLoad(w, modelId, () => {});
      } catch {
        w.removeEventListener('message', handleWorkerMessage);
        stream.getTracks().forEach((tr) => tr.stop());
        stream = null;
        onFatalErrorCb?.('whisper');
        return { started: false };
      }

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      try {
        audioContext = new AudioContextClass({ sampleRate: TARGET_RATE });
      } catch {
        audioContext = new AudioContextClass();
      }
      sourceNode = audioContext.createMediaStreamSource(stream);
      processorNode = audioContext.createScriptProcessor(4096, 1, 1);
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;
      sourceNode.connect(processorNode);
      processorNode.connect(silentGain);
      silentGain.connect(audioContext.destination);
      processorNode.onaudioprocess = handleAudioProcess;

      onAudioStart?.();
      return { started: true };
    },

    pause() { paused = true; },
    resume() { paused = false; },

    stop() {
      stopped = true;
      if (bufferedSamples > 0 && w) sendCurrentBuffer();
      try { processorNode?.disconnect(); } catch { /* ignore */ }
      try { sourceNode?.disconnect(); } catch { /* ignore */ }
      try { audioContext?.close(); } catch { /* ignore */ }
      try { stream?.getTracks().forEach((tr) => tr.stop()); } catch { /* ignore */ }
      if (pendingResponses === 0) w?.removeEventListener('message', handleWorkerMessage);
      audioContext = null;
      sourceNode = null;
      processorNode = null;
      stream = null;
      buffers = [];
      bufferedSamples = 0;
    },
  };
}
