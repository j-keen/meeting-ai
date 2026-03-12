// stt.js - STT abstraction (Web Speech API only)

import { t } from './i18n.js';

// Web Speech API engine
function createWebSpeechEngine(language) {
  let recognition = null;
  let shouldRestart = false;
  let noSpeechCount = 0;
  let restartFailCount = 0;
  let abortCount = 0;
  let lastResultTime = 0;
  let lastFinalText = '';
  let lastFinalTime = 0;

  return {
    name: 'webspeech',

    start(onInterim, onFinal, onError, onReplace) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        onError(t('stt.unsupported'));
        return;
      }

      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = language === 'ko' ? 'ko-KR' : language === 'ja' ? 'ja-JP' : language === 'zh' ? 'zh-CN' : 'en-US';

      recognition.onresult = (e) => {
        noSpeechCount = 0;
        abortCount = 0;
        lastResultTime = Date.now();
        console.log('[STT] onresult fired, results:', e.results.length, 'from index:', e.resultIndex);
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const result = e.results[i];
          const text = result[0].transcript;
          console.log(`[STT] Result[${i}] isFinal=${result.isFinal} confidence=${result[0].confidence} text="${text}"`);
          if (result.isFinal) {
            const now = Date.now();
            // Mobile browsers may send progressive final results (each a superset of the previous).
            // Detect this and replace the last line instead of creating a new one.
            if (onReplace && lastFinalText && (now - lastFinalTime) < 2000 && text.startsWith(lastFinalText)) {
              onReplace(text);
            } else {
              onFinal(text);
            }
            lastFinalText = text;
            lastFinalTime = now;
          } else {
            onInterim(text);
          }
        }
      };

      recognition.onerror = (e) => {
        console.warn('[STT] onerror:', e.error, e.message);
        if (e.error === 'no-speech') {
          noSpeechCount++;
          if (noSpeechCount >= 3) {
            noSpeechCount = 0;
            onError(t('stt.no_mic_input'));
          }
        } else if (e.error === 'aborted') {
          abortCount++;
          if (abortCount >= 5) {
            shouldRestart = false;
            abortCount = 0;
            onError(t('stt.connection_failed'));
          }
        } else {
          onError(`Speech recognition error: ${e.error}`);
        }
      };

      let audioStarted = false;
      recognition.onaudiostart = () => {
        audioStarted = true;
        console.log('[STT] Audio input started');
      };

      recognition.onspeechstart = () => {
        console.log('[STT] Speech detected');
      };

      recognition.onaudioend = () => {
        console.log('[STT] Audio input ended');
      };

      recognition.onend = () => {
        if (shouldRestart) {
          console.log('[STT] Recognition ended, restarting...');
          setTimeout(() => {
            if (!shouldRestart) return;
            try {
              recognition.start();
              restartFailCount = 0;
            } catch (err) {
              restartFailCount++;
              if (restartFailCount >= 3) {
                shouldRestart = false;
                restartFailCount = 0;
                onError(t('stt.restart_failed'));
              }
            }
          }, 300);
        } else {
          console.log('[STT] Recognition ended');
        }
      };

      shouldRestart = true;
      try {
        recognition.start();
      } catch (err) {
        onError(err.message);
      }

      // Network timeout: if no audio input within 10s, notify error
      setTimeout(() => {
        if (!audioStarted && shouldRestart) {
          onError(t('stt.network_timeout'));
        }
      }, 10000);
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

    async start({ language, onInterim, onFinal, onError, onReplace }) {
      if (isRunning) return;
      isRunning = true;

      // Check mic permission upfront
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
      } catch {
        isRunning = false;
        throw new Error(t('stt.mic_permission_denied'));
      }

      const safeFinal = (text) => {
        if (text && text.trim()) onFinal(text);
      };

      currentEngine = createWebSpeechEngine(language);
      currentEngine.start(onInterim, safeFinal, onError, onReplace);
    },

    stop() {
      currentEngine?.stop();
      currentEngine = null;
      isRunning = false;
    },

    get engineName() {
      return currentEngine?.name || 'none';
    }
  };
}
