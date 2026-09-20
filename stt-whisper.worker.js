// stt-whisper.worker.js - module Worker running transformers.js Whisper inference.
// Message protocol (see stt-whisper.js):
//   main→worker  {type:'load', modelId} | {type:'transcribe', id, audio, language} | {type:'delete'}
//   worker→main  {type:'progress', file, loaded, total} | {type:'ready'} | {type:'result', id, text} | {type:'error', message}

import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3/dist/transformers.min.js';

env.allowLocalModels = false;

let transcriber = null;
let loadedModelId = null;
const queue = [];
let processing = false;

function progressCallback(data) {
  if (data.status === 'progress') {
    self.postMessage({ type: 'progress', file: data.file, loaded: data.loaded, total: data.total });
  }
}

async function loadModel(modelId) {
  if (transcriber && loadedModelId === modelId) {
    self.postMessage({ type: 'ready' });
    return;
  }
  transcriber = null;
  const device = self.navigator?.gpu ? 'webgpu' : 'wasm';
  // WebGPU: fp32 encoder (accuracy) + q4 decoder (size); WASM: q8 everywhere.
  const dtype = device === 'webgpu' ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : 'q8';
  try {
    transcriber = await pipeline('automatic-speech-recognition', modelId, { device, dtype, progress_callback: progressCallback });
  } catch {
    transcriber = await pipeline('automatic-speech-recognition', modelId, { device, progress_callback: progressCallback });
  }
  loadedModelId = modelId;
  self.postMessage({ type: 'ready' });
}

async function processQueue() {
  if (processing) return;
  processing = true;
  while (queue.length) {
    const job = queue.shift();
    try {
      const result = await transcriber(job.audio, { language: job.language });
      const text = Array.isArray(result) ? result.map((r) => r.text).join(' ') : (result?.text || '');
      self.postMessage({ type: 'result', id: job.id, text });
    } catch (err) {
      self.postMessage({ type: 'error', message: err?.message || String(err) });
    }
  }
  processing = false;
}

self.onmessage = async (e) => {
  const msg = e.data;
  if (msg.type === 'load') {
    try {
      await loadModel(msg.modelId);
    } catch (err) {
      self.postMessage({ type: 'error', message: err?.message || String(err) });
    }
  } else if (msg.type === 'transcribe') {
    if (!transcriber) {
      self.postMessage({ type: 'error', message: 'model not loaded' });
      return;
    }
    queue.push({ id: msg.id, audio: msg.audio, language: msg.language });
    processQueue();
  } else if (msg.type === 'delete') {
    if (msg.modelId === loadedModelId || !msg.modelId) {
      transcriber = null;
      loadedModelId = null;
    }
  }
};
