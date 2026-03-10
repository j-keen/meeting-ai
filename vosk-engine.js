// vosk-engine.js - Vosk WASM offline STT engine

const VOSK_CDN = 'https://cdn.jsdelivr.net/npm/vosk-browser@0.0.8/dist/vosk.js';

const VOSK_MODELS = {
  ko: { url: 'https://alphacephei.com/vosk/models/vosk-model-small-ko-0.22.zip', name: 'vosk-model-small-ko-0.22' },
  en: { url: 'https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip', name: 'vosk-model-small-en-us-0.15' },
};

// ===== Dynamic script loader =====
function loadVoskLib() {
  return new Promise((resolve, reject) => {
    if (window.Vosk) { resolve(window.Vosk); return; }
    const script = document.createElement('script');
    script.src = VOSK_CDN;
    script.onload = () => {
      if (window.Vosk) resolve(window.Vosk);
      else reject(new Error('Vosk library loaded but window.Vosk not found'));
    };
    script.onerror = () => reject(new Error('Failed to load Vosk library'));
    document.head.appendChild(script);
  });
}

// ===== IndexedDB helpers =====
const DB_NAME = 'vosk-model-cache';
const STORE_NAME = 'models';
const DB_VERSION = 1;

function openModelDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getModelFromCache(name) {
  const db = await openModelDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(name);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function saveModelToCache(name, data) {
  const db = await openModelDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(data, name);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ===== Model download with progress =====
async function downloadModelWithProgress(url, onProgress) {
  // Use server proxy to avoid CORS issues with alphacephei.com
  // Vercel: /api/vosk-model, local server.js: /proxy/vosk-model
  const proxyUrl = `/api/vosk-model?url=${encodeURIComponent(url)}`;
  let response;
  try {
    response = await fetch(proxyUrl);
    if (!response.ok) throw new Error('proxy failed');
  } catch {
    // Fallback: try local dev server proxy
    try {
      response = await fetch(`/proxy/vosk-model?url=${encodeURIComponent(url)}`);
    } catch {
      // Last resort: direct fetch (may fail due to CORS)
      response = await fetch(url);
    }
  }
  if (!response.ok) throw new Error(`Model download failed: ${response.status}`);

  const contentLength = response.headers.get('content-length');
  const total = contentLength ? parseInt(contentLength, 10) : 0;
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total > 0 && onProgress) {
      onProgress(Math.round((received / total) * 100));
    }
  }

  const blob = new Blob(chunks);
  return await blob.arrayBuffer();
}

// ===== Pre-download & cache check =====
export async function isModelCached(language) {
  const modelInfo = VOSK_MODELS[language] || VOSK_MODELS.en;
  const data = await getModelFromCache(modelInfo.name);
  return !!data;
}

export async function predownloadModel(language, onProgress) {
  const modelInfo = VOSK_MODELS[language] || VOSK_MODELS.en;
  const cached = await getModelFromCache(modelInfo.name);
  if (cached) return; // already cached
  await loadVoskLib();
  if (onProgress) onProgress(0);
  const modelData = await downloadModelWithProgress(modelInfo.url, onProgress);
  await saveModelToCache(modelInfo.name, modelData);
  if (onProgress) onProgress(100);
}

// ===== Main engine factory =====
export function createVoskEngine(language, onProgress) {
  let model = null;
  let recognizer = null;
  let audioContext = null;
  let mediaStream = null;
  let scriptNode = null;

  const modelInfo = VOSK_MODELS[language] || VOSK_MODELS.en;

  return {
    name: 'vosk',

    async start(onInterim, onFinal, onError) {
      try {
        // 1. Load Vosk library
        const Vosk = await loadVoskLib();

        // 2. Check cache, download if needed
        let modelData = await getModelFromCache(modelInfo.name);
        if (!modelData) {
          if (onProgress) onProgress(0);
          modelData = await downloadModelWithProgress(modelInfo.url, onProgress);
          await saveModelToCache(modelInfo.name, modelData);
          if (onProgress) onProgress(100);
        }

        // 3. Create model from ArrayBuffer
        // vosk-browser expects a URL path; create a Blob URL from the zip data
        const modelBlob = new Blob([modelData], { type: 'application/zip' });
        const modelUrl = URL.createObjectURL(modelBlob);

        model = await Vosk.createModel(modelUrl);
        URL.revokeObjectURL(modelUrl);

        // 4. Create recognizer
        recognizer = new model.KaldiRecognizer(16000);

        recognizer.on('result', (msg) => {
          const text = msg?.result?.text;
          if (text) onFinal(text);
        });

        recognizer.on('partialresult', (msg) => {
          const partial = msg?.result?.partial;
          if (partial) onInterim(partial);
        });

        // 5. Get microphone audio
        mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            channelCount: 1,
          },
        });

        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(mediaStream);
        const bufferSize = 4096;
        scriptNode = audioContext.createScriptProcessor(bufferSize, 1, 1);

        scriptNode.onaudioprocess = (e) => {
          recognizer.acceptWaveform(e.inputBuffer);
        };

        source.connect(scriptNode);
        scriptNode.connect(audioContext.destination);

      } catch (err) {
        onError(`Vosk STT error: ${err.message}`);
      }
    },

    stop() {
      if (scriptNode) {
        scriptNode.disconnect();
        scriptNode = null;
      }
      if (audioContext) {
        audioContext.close().catch(() => {});
        audioContext = null;
      }
      if (mediaStream) {
        mediaStream.getTracks().forEach(t => t.stop());
        mediaStream = null;
      }
      if (recognizer) {
        recognizer.remove();
        recognizer = null;
      }
      if (model) {
        model.terminate();
        model = null;
      }
    },
  };
}
