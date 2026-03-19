// audio-recorder.js - Audio recording with IndexedDB storage (P-5)

const DB_NAME = 'meeting-ai-audio';
const DB_VERSION = 1;
const CHUNK_STORE = 'chunks';
const RECORDING_STORE = 'recordings';

let db = null;
let mediaRecorder = null;
let currentSessionId = null;
let chunkIndex = 0;
let recordingStream = null;

// ===== IndexedDB Setup =====
export async function initAudioDB() {
  if (db) return db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains(CHUNK_STORE)) {
        const store = d.createObjectStore(CHUNK_STORE, { autoIncrement: true });
        store.createIndex('sessionId', 'sessionId', { unique: false });
      }
      if (!d.objectStoreNames.contains(RECORDING_STORE)) {
        d.createObjectStore(RECORDING_STORE, { keyPath: 'sessionId' });
      }
    };
    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

function getDB() {
  if (!db) throw new Error('Audio DB not initialized');
  return db;
}

// ===== Preferred MIME type =====
function getPreferredMimeType() {
  const types = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'];
  for (const t of types) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

// ===== Recording =====
export function startAudioRecording(sessionId, stream) {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    console.warn('[AudioRecorder] Already recording');
    return;
  }

  currentSessionId = sessionId;
  chunkIndex = 0;
  recordingStream = stream;

  const mimeType = getPreferredMimeType();
  const options = mimeType ? { mimeType } : {};
  mediaRecorder = new MediaRecorder(stream, options);

  mediaRecorder.ondataavailable = async (e) => {
    if (e.data.size > 0 && currentSessionId) {
      try {
        const d = getDB();
        const tx = d.transaction(CHUNK_STORE, 'readwrite');
        tx.objectStore(CHUNK_STORE).add({
          sessionId: currentSessionId,
          chunkIndex: chunkIndex++,
          blob: e.data,
          timestamp: Date.now(),
        });
      } catch (err) {
        console.error('[AudioRecorder] Failed to save chunk:', err);
      }
    }
  };

  mediaRecorder.onerror = (e) => {
    console.error('[AudioRecorder] Error:', e.error);
  };

  // Record in 10-second chunks
  mediaRecorder.start(10000);
  console.log(`[AudioRecorder] Started recording session: ${sessionId}, mimeType: ${mediaRecorder.mimeType}`);
}

export async function stopAudioRecording() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return;

  const sessionId = currentSessionId;
  const mimeType = mediaRecorder.mimeType;

  return new Promise((resolve) => {
    mediaRecorder.onstop = async () => {
      // Stop all tracks
      if (recordingStream) {
        recordingStream.getTracks().forEach(tr => tr.stop());
        recordingStream = null;
      }
      mediaRecorder = null;

      // Merge chunks into final recording
      try {
        const blob = await mergeChunks(sessionId, mimeType);
        if (blob) {
          await saveRecording(sessionId, blob, mimeType);
          await deleteChunks(sessionId);
          console.log(`[AudioRecorder] Saved recording: ${sessionId}, size: ${blob.size}`);
        }
      } catch (err) {
        console.error('[AudioRecorder] Failed to merge chunks:', err);
      }
      resolve();
    };

    mediaRecorder.stop();
  });
}

async function mergeChunks(sessionId, mimeType) {
  const d = getDB();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(CHUNK_STORE, 'readonly');
    const store = tx.objectStore(CHUNK_STORE);
    const index = store.index('sessionId');
    const req = index.getAll(sessionId);
    req.onsuccess = () => {
      const chunks = req.result;
      if (chunks.length === 0) { resolve(null); return; }
      chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
      const blobs = chunks.map(c => c.blob);
      resolve(new Blob(blobs, { type: mimeType || 'audio/webm' }));
    };
    req.onerror = () => reject(req.error);
  });
}

async function saveRecording(sessionId, blob, mimeType) {
  const d = getDB();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(RECORDING_STORE, 'readwrite');
    tx.objectStore(RECORDING_STORE).put({
      sessionId,
      blob,
      mimeType: mimeType || 'audio/webm',
      size: blob.size,
      createdAt: Date.now(),
    });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteChunks(sessionId) {
  const d = getDB();
  return new Promise((resolve) => {
    const tx = d.transaction(CHUNK_STORE, 'readwrite');
    const store = tx.objectStore(CHUNK_STORE);
    const index = store.index('sessionId');
    const req = index.openCursor(sessionId);
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = resolve;
  });
}

// ===== Retrieval =====
export async function getRecording(sessionId) {
  try {
    const d = getDB();
    return new Promise((resolve) => {
      const tx = d.transaction(RECORDING_STORE, 'readonly');
      const req = tx.objectStore(RECORDING_STORE).get(sessionId);
      req.onsuccess = () => {
        const rec = req.result;
        resolve(rec ? rec.blob : null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function hasRecording(sessionId) {
  try {
    const d = getDB();
    return new Promise((resolve) => {
      const tx = d.transaction(RECORDING_STORE, 'readonly');
      const req = tx.objectStore(RECORDING_STORE).count(sessionId);
      req.onsuccess = () => resolve(req.result > 0);
      req.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

export async function deleteRecording(sessionId) {
  try {
    const d = getDB();
    // Delete from recordings store
    await new Promise((resolve) => {
      const tx = d.transaction(RECORDING_STORE, 'readwrite');
      tx.objectStore(RECORDING_STORE).delete(sessionId);
      tx.oncomplete = resolve;
    });
    // Also clean up any orphan chunks
    await deleteChunks(sessionId);
  } catch (err) {
    console.error('[AudioRecorder] Delete failed:', err);
  }
}

// ===== Storage Info =====
export async function getAudioStorageInfo() {
  try {
    const d = getDB();
    return new Promise((resolve) => {
      const tx = d.transaction(RECORDING_STORE, 'readonly');
      const store = tx.objectStore(RECORDING_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        const recordings = req.result;
        const totalSize = recordings.reduce((sum, r) => sum + (r.size || 0), 0);
        resolve({ totalSize, count: recordings.length });
      };
      req.onerror = () => resolve({ totalSize: 0, count: 0 });
    });
  } catch {
    return { totalSize: 0, count: 0 };
  }
}

// ===== Cleanup =====
export async function cleanupOldAudio(retentionDays) {
  if (!retentionDays || retentionDays <= 0) return 0;
  try {
    const d = getDB();
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    return new Promise((resolve) => {
      const tx = d.transaction(RECORDING_STORE, 'readwrite');
      const store = tx.objectStore(RECORDING_STORE);
      const req = store.openCursor();
      let deleted = 0;
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          if (cursor.value.createdAt < cutoff) {
            cursor.delete();
            deleted++;
          }
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve(deleted);
    });
  } catch {
    return 0;
  }
}

// ===== Crash Recovery =====
export async function recoverChunks(sessionId) {
  try {
    const d = getDB();
    return new Promise((resolve) => {
      const tx = d.transaction(CHUNK_STORE, 'readonly');
      const index = tx.objectStore(CHUNK_STORE).index('sessionId');
      const req = index.getAll(sessionId);
      req.onsuccess = () => {
        const chunks = req.result;
        if (chunks.length === 0) { resolve(null); return; }
        chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
        const blobs = chunks.map(c => c.blob);
        const mimeType = 'audio/webm'; // best guess
        resolve(new Blob(blobs, { type: mimeType }));
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}
