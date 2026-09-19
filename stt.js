// stt.js - STT engines + selection.
//
// Engine contract (all engines):
//   name: string
//   supportsPause?: boolean          → pause()/resume() keep the engine alive
//   start(onInterim, onFinal, onError, onReplace, onFatalError, onAudioStart) → { started: boolean } | Promise<{ started }>
//   pause?(), resume?(), stop()
//
// Engines:
//   'native'     WebView bridge → the phone's own speech recognizer (window.__nativeBridge)
//   'keyboard'   the phone keyboard's voice typing into a textarea (stt-keyboard.js)
//   'webspeech'  browser SpeechRecognition (cloud, or on-device when Chrome offers it)

import { t } from './i18n.js';
import { createKeyboardEngine } from './stt-keyboard.js';

const DEBUG_KEY = 'meeting-ai-stt-debug';
let debugEnabled = null;
function sttDebug(msg) {
  if (debugEnabled === null) {
    try { debugEnabled = localStorage.getItem(DEBUG_KEY) === '1'; } catch { debugEnabled = false; }
  }
  if (debugEnabled) console.log(msg);
}

const LANG_TAGS = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', zh: 'zh-CN' };
export function toLangTag(language) {
  return LANG_TAGS[language] || 'en-US';
}

export function isMobileUA() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * Pick the engine for the current device + settings. Pure; unit-testable.
 * @returns {'native'|'keyboard'|'webspeech'}
 */
export function resolveEngine(settings = {}, env = {}) {
  const hasNative = env.hasNative ?? !!window.__nativeBridge?.isNative;
  const hasSpeech = env.hasSpeech ?? !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  if (hasNative) return 'native';
  const pref = settings.sttEngine;
  if (pref && pref !== 'auto') return pref === 'keyboard' ? 'keyboard' : 'webspeech';
  if (!hasSpeech) return 'keyboard';
  return 'webspeech';
}

// ===== Chrome on-device recognition (Chrome 138+) =====
async function configureOnDevice(SR, recognition, langTag, settings) {
  if (settings.sttOnDevice === 'off') return false;
  try {
    if (typeof SR.available !== 'function') return false;
    let avail = await SR.available({ langs: [langTag], processLocally: true });
    if (avail === 'downloadable' && settings.sttOnDeviceInstall && typeof SR.install === 'function') {
      const installed = await SR.install({ langs: [langTag], processLocally: true });
      avail = installed ? 'available' : avail;
    }
    if (avail === 'available') {
      recognition.processLocally = true;
      return true;
    }
  } catch (err) {
    sttDebug(`[STT] on-device check failed: ${err.message}`);
  }
  return false;
}

// ===== Web Speech API engine =====
function createWebSpeechEngine(language, settings = {}) {
  let recognition = null;
  let shouldRestart = false;
  let noSpeechCount = 0;
  let restartFailCount = 0;
  let abortCount = 0;
  let lastFinalText = '';
  let lastFinalTime = 0;
  let sessionId = 0;
  let lastFinalSessionId = 0;
  let lastInterimText = '';
  let hadFinalSinceLastInterim = true;
  let speechWatchdog = null;
  let hasResultInSession = false;
  let onDevice = false;

  const clearWatchdog = () => {
    if (speechWatchdog) { clearTimeout(speechWatchdog); speechWatchdog = null; }
  };

  return {
    name: 'webspeech',
    get variant() { return onDevice ? 'webspeech-local' : 'webspeech'; },

    async start(onInterim, onFinal, onError, onReplace, onFatalError, onAudioStart) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        onError(t('stt.unsupported'));
        return { started: false };
      }

      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      const langTag = toLangTag(language);
      recognition.lang = langTag;
      onDevice = await configureOnDevice(SpeechRecognition, recognition, langTag, settings);

      let emptyFinalCount = 0;
      let audioStarted = false;
      let sessionStartTime = Date.now();
      let restartCount = 0;

      recognition.onresult = (e) => {
        noSpeechCount = 0;
        abortCount = 0;
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const result = e.results[i];
          let text = result[0].transcript.trim();
          if (result.isFinal) {
            // Android Chrome sometimes sends empty finals — use last interim as fallback
            if (!text && lastInterimText) {
              text = lastInterimText;
              sttDebug(`FINAL(empty→interim) "${text.slice(0, 40)}"`);
            }
            if (!text) {
              emptyFinalCount++;
              sttDebug(`FINAL(skip) empty #${emptyFinalCount}`);
              if (emptyFinalCount >= 8 && !hasResultInSession && shouldRestart && recognition) {
                sttDebug(`⚠️ Too many empty finals (${emptyFinalCount}) — aborting session`);
                try { recognition.abort(); } catch { /* ignore */ }
              }
              hadFinalSinceLastInterim = true;
              continue;
            }
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
              sttDebug(`REPLACE(${isProgressive ? 'grow' : 'dedup'}) gap=${gap}ms "${lastFinalText.slice(0, 20)}" → "${text.slice(0, 30)}"`);
              onReplace(isSubset ? lastFinalText : text);
            } else {
              sttDebug(`FINAL gap=${gap}ms sid=${sessionId} "${text.slice(0, 40)}"`);
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
            if (text) onInterim(text);
          }
        }
      };

      recognition.onerror = (e) => {
        sttDebug(`ERROR: ${e.error} ${e.message || ''}`);
        if (e.error === 'not-allowed') {
          shouldRestart = false;
          onError(t('stt.mic_permission_denied_detail'));
          onFatalError?.(this.variant);
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
            onFatalError?.(this.variant);
          }
        } else if (e.error === 'network' || e.error === 'audio-capture') {
          onError(`Speech recognition error: ${e.error}`);
          // Repeated network/capture failures are what break Android Chrome in the field
          if (++restartFailCount >= 3) {
            shouldRestart = false;
            onFatalError?.(this.variant);
          }
        } else {
          onError(`Speech recognition error: ${e.error}`);
        }
      };

      recognition.onaudiostart = () => {
        audioStarted = true;
        hasResultInSession = false;
        sttDebug('🎤 Audio started');
        onAudioStart?.();
      };

      recognition.onspeechstart = () => {
        // Watchdog: speech detected but no result within 5s → force restart
        if (!hasResultInSession) {
          clearWatchdog();
          speechWatchdog = setTimeout(() => {
            if (!hasResultInSession && shouldRestart && recognition) {
              sttDebug('⚠️ Watchdog: speech detected but no results in 5s — forcing restart');
              try { recognition.abort(); } catch { /* ignore */ }
            }
          }, 5000);
        }
      };

      recognition.onaudioend = () => clearWatchdog();

      recognition.onend = () => {
        const sessionDur = ((Date.now() - sessionStartTime) / 1000).toFixed(1);
        // Flush pending interim text as final before restarting
        if (lastInterimText && !hadFinalSinceLastInterim) {
          sttDebug(`💾 Flush interim on end: "${lastInterimText.slice(0, 40)}"`);
          onFinal(lastInterimText);
          lastInterimText = '';
          hadFinalSinceLastInterim = true;
        }
        if (!shouldRestart) { sttDebug(`⏹️ Stopped (session ${sessionDur}s)`); return; }

        restartCount++;
        sessionId++;
        lastFinalText = '';
        lastFinalTime = 0;
        emptyFinalCount = 0;
        sttDebug(`🔄 RESTART #${restartCount} sid=${sessionId} (session was ${sessionDur}s)`);
        setTimeout(() => {
          if (!shouldRestart || !recognition) return;
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
              onFatalError?.(this.variant);
            }
          }
        }, 100);
      };

      shouldRestart = true;
      try {
        recognition.start();
      } catch (err) {
        onError(err.message);
        onFatalError?.(this.variant);
        return { started: false };
      }

      // Network timeout: if no audio input within 10s, notify
      setTimeout(() => {
        if (!audioStarted && shouldRestart) onError(t('stt.network_timeout'));
      }, 10000);

      return { started: true };
    },

    stop() {
      shouldRestart = false;
      clearWatchdog();
      try { recognition?.stop(); } catch { /* ignore */ }
      recognition = null;
    },
  };
}

// ===== Native bridge engine (React Native WebView → device recognizer) =====
function createNativeBridgeEngine(language) {
  const bridge = () => window.__nativeBridge;
  return {
    name: 'native',
    supportsPause: true,
    start(onInterim, onFinal, onError, onReplace, onFatalError, onAudioStart) {
      const b = bridge();
      if (!b) return { started: false };
      b.sttCallbacks = {
        onInterim,
        onFinal: (text) => { if (text?.trim()) onFinal(text); },
        onError,
        onConnected: () => onAudioStart?.(),
      };
      b.startSTT(language);
      return { started: true };
    },
    pause() { bridge()?.pauseSTT?.(); },
    resume() { bridge()?.resumeSTT?.(language); },
    stop() {
      const b = bridge();
      if (!b) return;
      b.stopSTT?.();
      b.sttCallbacks = {};
    },
  };
}

// ===== Keyboard voice-input engine =====
function loadKeyboardEngine(settings) {
  return createKeyboardEngine({ commitIdleMs: settings.keyboardCommitMs || 2500 });
}

// ===== Unified STT interface =====
export function createSTT() {
  let engine = null;
  let isRunning = false;
  let isPaused = false;

  return {
    get isRunning() { return isRunning && !isPaused; },
    get isPaused() { return isPaused; },
    get engineName() { return engine?.variant || engine?.name || null; },
    get supportsPause() { return !!engine?.supportsPause; },

    /**
     * @returns {Promise<boolean>} whether an engine started. On false the error has
     * already been reported through onError.
     */
    async start({ language, settings, onInterim, onFinal, onError, onReplace, onFatalError, onConnecting, onConnected, onRecordingStream }) {
      if (isRunning) return true;
      const cfg = settings || {};
      const which = resolveEngine(cfg);
      sttDebug(`[STT] engine=${which} platform=${isMobileUA() ? 'mobile' : 'desktop'}`);

      const safeFinal = (text) => { if (text && text.trim()) onFinal(text); };
      const fatal = (variant) => {
        sttDebug('[STT] fatal engine error — resetting');
        isRunning = false;
        isPaused = false;
        engine = null;
        onFatalError?.(variant || which);
      };

      // Keyboard engine must focus its textarea inside the user gesture: no awaits before start().
      if (which === 'keyboard') {
        engine = loadKeyboardEngine(cfg);
      } else if (which === 'native') {
        engine = createNativeBridgeEngine(language);
      } else {
        // Desktop browsers: grab the mic once so audio recording can share the stream.
        // Mobile: getUserMedia and SpeechRecognition cannot coexist on Android.
        if (!isMobileUA()) {
          let micStream = null;
          try {
            micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          } catch (err) {
            sttDebug(`[STT] Mic permission failed: ${err.name} - ${err.message}`);
            if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') onError(t('stt.mic_not_found'));
            else onError(t('stt.mic_permission_denied_detail'));
            return false;
          }
          if (onRecordingStream) onRecordingStream(micStream);
          else micStream.getTracks().forEach(tr => tr.stop());
        }
        engine = createWebSpeechEngine(language, cfg);
      }

      onConnecting?.();
      const started = await engine.start(
        onInterim, safeFinal, onError, onReplace, fatal,
        () => onConnected?.(engine?.variant || engine?.name || which),
      );
      if (!started?.started) {
        engine = null;
        return false;
      }
      isRunning = true;
      isPaused = false;
      return true;
    },

    pause() {
      if (!engine?.supportsPause || !isRunning || isPaused) return;
      engine.pause();
      isPaused = true;
    },

    resume() {
      if (!engine?.supportsPause || !isPaused) return;
      engine.resume();
      isPaused = false;
    },

    stop() {
      engine?.stop();
      engine = null;
      isRunning = false;
      isPaused = false;
    },
  };
}
