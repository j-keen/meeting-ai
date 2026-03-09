// stt.js - STT abstraction (Web Speech API)

import { getActiveSpeaker } from './speakers.js';

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
            const speaker = getActiveSpeaker();
            onFinal(text, speaker?.id || null);
          } else {
            onInterim(text, null);
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

// Unified STT interface
export function createSTT() {
  let currentEngine = null;
  let isRunning = false;

  return {
    get isRunning() { return isRunning; },
    get engineName() { return currentEngine?.name || 'none'; },

    async start({ language, onInterim, onFinal, onError }) {
      if (isRunning) return;

      currentEngine = createWebSpeechEngine(language);
      currentEngine.start(onInterim, onFinal, onError);
      isRunning = true;
    },

    stop() {
      currentEngine?.stop();
      currentEngine = null;
      isRunning = false;
    }
  };
}
