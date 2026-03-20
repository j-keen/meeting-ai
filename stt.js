// stt.js - STT abstraction (Web Speech API)

import { t } from './i18n.js';

// Debug log storage for debug console
const debugLogs = [];
const debugListeners = [];
const MAX_DEBUG_LOGS = 500;

function sttDebug(msg) {
  console.log(msg);
  const entry = { time: Date.now(), msg };
  debugLogs.push(entry);
  if (debugLogs.length > MAX_DEBUG_LOGS) debugLogs.shift();
  for (const fn of debugListeners) fn(entry);
}

export function getDebugLogs() { return debugLogs; }
export function clearDebugLogs() { debugLogs.length = 0; }
export function onDebugLog(fn) {
  debugListeners.push(fn);
  return () => {
    const idx = debugListeners.indexOf(fn);
    if (idx >= 0) debugListeners.splice(idx, 1);
  };
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
  let sessionId = 0;
  let lastFinalSessionId = 0;
  let lastInterimText = '';
  let hadFinalSinceLastInterim = true;

  return {
    name: 'webspeech',

    start(onInterim, onFinal, onError, onReplace, onFatalError, onAudioStart) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        onError(t('stt.unsupported'));
        return { started: false };
      }

      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = language === 'ko' ? 'ko-KR' : language === 'ja' ? 'ja-JP' : language === 'zh' ? 'zh-CN' : 'en-US';

      let emptyFinalCount = 0;

      recognition.onresult = (e) => {
        noSpeechCount = 0;
        abortCount = 0;
        lastResultTime = Date.now();
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const result = e.results[i];
          let text = result[0].transcript.trim();
          if (result.isFinal) {
            // Android Chrome sometimes sends empty finals — use last interim as fallback
            if (!text && lastInterimText) {
              text = lastInterimText;
              sttDebug(`FINAL(empty→interim) "${text.slice(0,40)}"`);
            }
            // Skip completely empty finals (no interim fallback available)
            if (!text) {
              emptyFinalCount++;
              sttDebug(`FINAL(skip) empty #${emptyFinalCount}`);
              // Android: too many empty finals with no real text → abort for faster restart
              if (emptyFinalCount >= 8 && !hasResultInSession && shouldRestart && recognition) {
                sttDebug(`⚠️ Too many empty finals (${emptyFinalCount}) — aborting session`);
                try { recognition.abort(); } catch (e) { /* ignore */ }
              }
              hadFinalSinceLastInterim = true;
              continue;
            }
            // Got real text — reset counters
            emptyFinalCount = 0;
            hasResultInSession = true;
            clearWatchdog();
            const now = Date.now();
            const gap = lastFinalTime ? now - lastFinalTime : 0;
            const growWindow = 2000;
            const dedupWindow = 2000;
            const isProgressive = text.startsWith(lastFinalText);
            const isSubset = lastFinalText.startsWith(text);

            const shouldGrow = isProgressive && (now - lastFinalTime) < growWindow;
            const shouldDedup = isSubset && (now - lastFinalTime) < dedupWindow;

            if (onReplace && lastFinalText && lastFinalSessionId === sessionId && (shouldGrow || shouldDedup)) {
              const replaceType = isProgressive ? 'grow' : 'dedup';
              sttDebug(`REPLACE(${replaceType}) gap=${gap}ms "${lastFinalText.slice(0,20)}" → "${text.slice(0,30)}"`);
              if (isSubset) {
                onReplace(lastFinalText);
              } else {
                onReplace(text);
              }
            } else {
              sttDebug(`FINAL gap=${gap}ms conf=${result[0].confidence?.toFixed(2) ?? '?'} sid=${sessionId} "${text.slice(0,40)}"`);
              onFinal(text);
            }
            if (!isSubset) lastFinalText = text;
            lastFinalTime = now;
            lastFinalSessionId = sessionId;
            lastInterimText = '';
            hadFinalSinceLastInterim = true;
          } else {
            lastInterimText = text;
            hadFinalSinceLastInterim = false;
            if (text) {
              sttDebug(`interim "${text.slice(0,40)}"`);
              onInterim(text);
            }
          }
        }
      };

      recognition.onerror = (e) => {
        sttDebug(`ERROR: ${e.error} ${e.message || ''}`);
        if (e.error === 'not-allowed') {
          shouldRestart = false;
          onError(t('stt.mic_permission_denied_detail'));
          onFatalError?.();
        } else if (e.error === 'no-speech') {
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
            onFatalError?.();
          }
        } else {
          onError(`Speech recognition error: ${e.error}`);
        }
      };

      let audioStarted = false;
      let sessionStartTime = Date.now();
      let restartCount = 0;
      let speechWatchdog = null;
      let hasResultInSession = false;

      const clearWatchdog = () => {
        if (speechWatchdog) { clearTimeout(speechWatchdog); speechWatchdog = null; }
      };

      recognition.onaudiostart = () => {
        audioStarted = true;
        hasResultInSession = false;
        sttDebug('🎤 Audio started');
        onAudioStart?.();
      };

      recognition.onspeechstart = () => {
        sttDebug('🗣️ Speech detected');
        // Watchdog: if speech detected but no result within 5s, force restart
        if (!hasResultInSession) {
          clearWatchdog();
          speechWatchdog = setTimeout(() => {
            if (!hasResultInSession && shouldRestart && recognition) {
              sttDebug('⚠️ Watchdog: speech detected but no results in 5s — forcing restart');
              try { recognition.abort(); } catch (e) { /* ignore */ }
            }
          }, 5000);
        }
      };

      recognition.onaudioend = () => {
        clearWatchdog();
        const sessionDur = ((Date.now() - sessionStartTime) / 1000).toFixed(1);
        sttDebug(`🔇 Audio ended (session ${sessionDur}s)`);
      };

      recognition.onend = () => {
        const sessionDur = ((Date.now() - sessionStartTime) / 1000).toFixed(1);

        // Flush pending interim text as final before restarting
        if (lastInterimText && !hadFinalSinceLastInterim) {
          sttDebug(`💾 Flush interim on end: "${lastInterimText.slice(0,40)}"`);
          onFinal(lastInterimText);
          lastInterimText = '';
          hadFinalSinceLastInterim = true;
        }

        if (shouldRestart) {
          restartCount++;
          // Reset session state to prevent cross-session REPLACE merging
          sessionId++;
          lastFinalText = '';
          lastFinalTime = 0;
          sttDebug(`🔄 RESTART #${restartCount} sid=${sessionId} (session was ${sessionDur}s)`);
          emptyFinalCount = 0;
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
          }, 100);
        } else {
          sttDebug(`⏹️ Stopped (session ${sessionDur}s)`);
        }
      };

      shouldRestart = true;
      try {
        recognition.start();
        sttDebug('[WebSpeech] recognition.start() called');
      } catch (err) {
        sttDebug(`[WebSpeech] start() threw: ${err.message}`);
        onError(err.message);
        onFatalError?.();
      }

      // Network timeout: if no audio input within 10s, notify error
      setTimeout(() => {
        if (!audioStarted && shouldRestart) {
          onError(t('stt.network_timeout'));
        }
      }, 10000);

      return { started: true };
    },

    stop() {
      shouldRestart = false;
      if (speechWatchdog) { clearTimeout(speechWatchdog); speechWatchdog = null; }
      recognition?.stop();
      recognition = null;
    }
  };
}

// No-op for backward compatibility (Deepgram removed)
export function prefetchDeepgramToken() {}

// Unified STT interface
export function createSTT() {
  let currentEngine = null;
  let isRunning = false;
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  return {
    get isRunning() { return isRunning; },
    get engineName() { return currentEngine?.name || null; },

    async start({ language, onInterim, onFinal, onError, onReplace, onConnecting, onConnected, onRecordingStream }) {
      if (isRunning) return;
      isRunning = true;

      const safeFinal = (text) => {
        if (text && text.trim()) onFinal(text);
      };

      sttDebug(`[STT] Platform: ${isMobile ? 'mobile' : 'desktop'} (${navigator.userAgent.slice(0, 60)})`);

      if (isMobile) {
        // Mobile: getUserMedia and SpeechRecognition cannot coexist on Android
        // Skip recording stream entirely — audio recording unavailable on mobile
        currentEngine = createWebSpeechEngine(language);

        const onFatalError = () => {
          sttDebug(`[STT] Fatal engine error — resetting isRunning`);
          isRunning = false;
          currentEngine = null;
        };

        sttDebug(`[STT] Mobile: skipping getUserMedia (incompatible with SpeechRecognition)`);

        currentEngine.start(
          onInterim, safeFinal, onError, onReplace, onFatalError,
          () => onConnected?.('webspeech')
        );
      } else {
        // Desktop: Pre-check mic permission, then start engine
        let micStream = null;
        try {
          sttDebug(`[STT] Requesting mic permission`);
          micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          sttDebug(`[STT] Mic permission granted, tracks: ${micStream.getTracks().length}`);
        } catch (err) {
          isRunning = false;
          sttDebug(`[STT] Mic permission failed: ${err.name} - ${err.message}`);
          if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
            onError(t('stt.mic_not_found'));
          } else {
            onError(t('stt.mic_permission_denied_detail'));
          }
          return;
        }

        if (onRecordingStream) {
          onRecordingStream(micStream);
        } else {
          micStream.getTracks().forEach(tr => tr.stop());
        }

        currentEngine = createWebSpeechEngine(language);

        const onFatalError = () => {
          sttDebug(`[STT] Fatal engine error — resetting isRunning`);
          isRunning = false;
          currentEngine = null;
        };

        currentEngine.start(
          onInterim, safeFinal, onError, onReplace, onFatalError,
          () => onConnected?.('webspeech')
        );
      }
    },

    stop() {
      currentEngine?.stop();
      currentEngine = null;
      isRunning = false;
    },

  };
}
