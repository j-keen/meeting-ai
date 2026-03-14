// stt.js - STT abstraction (Web Speech API only)

import { t } from './i18n.js';

// Mobile debug overlay
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
let debugOverlay = null;
let debugLogs = [];
const MAX_DEBUG_LINES = 30;

function sttDebug(msg) {
  console.log(msg);
  if (!isMobile) return;

  if (!debugOverlay) {
    debugOverlay = document.createElement('div');
    debugOverlay.id = 'sttDebugOverlay';
    Object.assign(debugOverlay.style, {
      position: 'fixed', bottom: '0', left: '0', right: '0',
      maxHeight: '35vh', overflowY: 'auto', zIndex: '99999',
      background: 'rgba(0,0,0,0.85)', color: '#0f0',
      fontSize: '11px', fontFamily: 'monospace', padding: '6px',
      lineHeight: '1.4', pointerEvents: 'auto',
      borderTop: '2px solid #0f0'
    });
    // close button
    const closeBtn = document.createElement('div');
    closeBtn.textContent = '✕ CLOSE DEBUG';
    Object.assign(closeBtn.style, {
      position: 'sticky', top: '0', textAlign: 'right',
      color: '#f55', cursor: 'pointer', padding: '2px 4px',
      background: 'rgba(0,0,0,0.9)', fontWeight: 'bold'
    });
    closeBtn.addEventListener('click', () => { debugOverlay.style.display = 'none'; });
    debugOverlay.appendChild(closeBtn);
    document.body.appendChild(debugOverlay);
  }

  const now = new Date();
  const ts = `${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}.${String(now.getMilliseconds()).padStart(3,'0')}`;
  debugLogs.push(`[${ts}] ${msg}`);
  if (debugLogs.length > MAX_DEBUG_LINES) debugLogs.shift();

  // re-render (skip close button at index 0)
  while (debugOverlay.childNodes.length > 1) debugOverlay.removeChild(debugOverlay.lastChild);
  const pre = document.createElement('pre');
  pre.style.margin = '0';
  pre.style.whiteSpace = 'pre-wrap';
  pre.style.wordBreak = 'break-all';
  pre.textContent = debugLogs.join('\n');
  debugOverlay.appendChild(pre);
  debugOverlay.style.display = 'block';
  debugOverlay.scrollTop = debugOverlay.scrollHeight;
}

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
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const result = e.results[i];
          const text = result[0].transcript;
          if (result.isFinal) {
            const now = Date.now();
            const gap = lastFinalTime ? now - lastFinalTime : 0;
            // Mobile browsers may send progressive final results (each a superset of the previous).
            // Detect this and replace the last line instead of creating a new one.
            if (onReplace && lastFinalText && (now - lastFinalTime) < 2000 && text.startsWith(lastFinalText)) {
              sttDebug(`REPLACE gap=${gap}ms "${lastFinalText.slice(0,20)}" → "${text.slice(0,30)}"`);
              onReplace(text);
            } else {
              sttDebug(`FINAL gap=${gap}ms conf=${result[0].confidence.toFixed(2)} "${text.slice(0,40)}"`);
              onFinal(text);
            }
            lastFinalText = text;
            lastFinalTime = now;
          } else {
            sttDebug(`interim "${text.slice(0,40)}"`);
            onInterim(text);
          }
        }
      };

      recognition.onerror = (e) => {
        sttDebug(`ERROR: ${e.error} ${e.message || ''}`);
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
      let sessionStartTime = Date.now();
      let restartCount = 0;

      recognition.onaudiostart = () => {
        audioStarted = true;
        sttDebug('🎤 Audio started');
      };

      recognition.onspeechstart = () => {
        sttDebug('🗣️ Speech detected');
      };

      recognition.onaudioend = () => {
        const sessionDur = ((Date.now() - sessionStartTime) / 1000).toFixed(1);
        sttDebug(`🔇 Audio ended (session ${sessionDur}s)`);
      };

      recognition.onend = () => {
        const sessionDur = ((Date.now() - sessionStartTime) / 1000).toFixed(1);
        if (shouldRestart) {
          restartCount++;
          sttDebug(`🔄 RESTART #${restartCount} (session was ${sessionDur}s)`);
          setTimeout(() => {
            if (!shouldRestart) return;
            try {
              sessionStartTime = Date.now();
              recognition.start();
              restartFailCount = 0;
            } catch (err) {
              restartFailCount++;
              sttDebug(`❌ Restart failed #${restartFailCount}: ${err.message}`);
              if (restartFailCount >= 3) {
                shouldRestart = false;
                restartFailCount = 0;
                onError(t('stt.restart_failed'));
              }
            }
          }, 300);
        } else {
          sttDebug(`⏹️ Stopped (session ${sessionDur}s)`);
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

  };
}
