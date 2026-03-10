// stt.js - STT abstraction (Web Speech API + Vosk WASM fallback)

import { createVoskEngine } from './vosk-engine.js';

// Web Speech API engine
function createWebSpeechEngine(language) {
  let recognition = null;
  let shouldRestart = false;

  return {
    name: 'webspeech',

    start(onInterim, onFinal, onError) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        onError('Web Speech API not supported');
        return;
      }

      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = language === 'ko' ? 'ko-KR' : language === 'ja' ? 'ja-JP' : language === 'zh' ? 'zh-CN' : 'en-US';

      recognition.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const result = e.results[i];
          const text = result[0].transcript;
          if (result.isFinal) {
            onFinal(text);
          } else {
            onInterim(text);
          }
        }
      };

      recognition.onerror = (e) => {
        if (e.error !== 'no-speech' && e.error !== 'aborted') {
          onError(`Speech recognition error: ${e.error}`);
        }
      };

      recognition.onend = () => {
        if (shouldRestart) {
          try { recognition.start(); } catch {}
        }
      };

      shouldRestart = true;
      try {
        recognition.start();
      } catch (err) {
        onError(err.message);
      }
    },

    stop() {
      shouldRestart = false;
      recognition?.stop();
      recognition = null;
    }
  };
}

// Check if Web Speech API is available
function hasWebSpeechAPI() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

// Unified STT interface
export function createSTT() {
  let currentEngine = null;
  let isRunning = false;

  return {
    get isRunning() { return isRunning; },
    get engineName() { return currentEngine?.name || 'none'; },

    async start({ language, sttEngine, onInterim, onFinal, onError, onEngineReady, onModelProgress }) {
      if (isRunning) return;

      const engine = sttEngine || 'auto';

      if (engine === 'vosk') {
        // Force Vosk
        currentEngine = createVoskEngine(language, onModelProgress || null);
        await currentEngine.start(onInterim, onFinal, onError);
        if (onEngineReady) onEngineReady('vosk');
      } else if (engine === 'webspeech') {
        // Prefer Web Speech, fallback to Vosk if unsupported
        if (hasWebSpeechAPI()) {
          currentEngine = createWebSpeechEngine(language);
          currentEngine.start(onInterim, onFinal, onError);
          if (onEngineReady) onEngineReady('webspeech');
        } else {
          // Fallback to Vosk with toast notification
          if (onError) onError('Web Speech API not supported in this browser. Falling back to Vosk.');
          currentEngine = createVoskEngine(language, onModelProgress || null);
          await currentEngine.start(onInterim, onFinal, onError);
          if (onEngineReady) onEngineReady('vosk');
        }
      } else {
        // Auto: original logic
        if (hasWebSpeechAPI()) {
          currentEngine = createWebSpeechEngine(language);
          currentEngine.start(onInterim, onFinal, onError);
          if (onEngineReady) onEngineReady('webspeech');
        } else {
          currentEngine = createVoskEngine(language, onModelProgress || null);
          await currentEngine.start(onInterim, onFinal, onError);
          if (onEngineReady) onEngineReady('vosk');
        }
      }

      isRunning = true;
    },

    stop() {
      currentEngine?.stop();
      currentEngine = null;
      isRunning = false;
    }
  };
}
