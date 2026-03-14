// stt.js - STT abstraction (Web Speech API + Deepgram for mobile)

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
  let sessionId = 0;
  let lastFinalSessionId = 0;
  let lastInterimText = '';
  let hadFinalSinceLastInterim = true;

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
          let text = result[0].transcript.trim();
          if (result.isFinal) {
            // Android Chrome sometimes sends empty finals — use last interim as fallback
            if (!text && lastInterimText) {
              text = lastInterimText;
              sttDebug(`FINAL(empty→interim) "${text.slice(0,40)}"`);
            }
            // Skip completely empty finals (no interim fallback available)
            if (!text) {
              sttDebug(`FINAL(skip) empty, no interim fallback`);
              hadFinalSinceLastInterim = true;
              continue;
            }
            const now = Date.now();
            const gap = lastFinalTime ? now - lastFinalTime : 0;
            // Mobile browsers may send progressive final results (each a superset of the previous).
            // Detect this and replace the last line instead of creating a new one.
            // Only REPLACE within the same session to prevent cross-session merging after restart.
            const growWindow = isMobile ? 3000 : 2000;    // progressive growth (짧게)
            const dedupWindow = isMobile ? 10000 : 2000;  // duplicate filtering (길게)
            const isProgressive = text.startsWith(lastFinalText);  // text grew
            const isSubset = lastFinalText.startsWith(text);  // text is same or shorter (re-sent)

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
          }, isMobile ? 50 : 300);
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

// Deepgram Nova-2 engine (WebSocket streaming, used on mobile)
function createDeepgramEngine(language) {
  let ws = null;
  let mediaRecorder = null;
  let stream = null;
  let shouldReconnect = false;
  let reconnectAttempts = 0;
  const MAX_RECONNECT = 3;

  const langMap = { ko: 'ko', en: 'en', ja: 'ja', zh: 'zh' };

  return {
    name: 'deepgram',

    async start(onInterim, onFinal, onError) {
      // Fetch API key from server
      let apiKey;
      try {
        const resp = await fetch('/api/stt-token');
        if (!resp.ok) throw new Error('Failed to get STT token');
        const data = await resp.json();
        apiKey = data.key;
      } catch (err) {
        onError(t('stt.deepgram_key_missing'));
        return;
      }

      // Get microphone stream
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        onError(t('stt.mic_permission_denied'));
        return;
      }

      const connectWebSocket = () => {
        const lang = langMap[language] || 'en';
        const wsUrl = `wss://api.deepgram.com/v1/listen?model=nova-2&language=${lang}&smart_format=true&interim_results=true&utterance_end_ms=1000&vad_events=true&encoding=opus&sample_rate=48000`;

        ws = new WebSocket(wsUrl, ['token', apiKey]);

        ws.onopen = () => {
          sttDebug('[STT:Deepgram] WebSocket connected');
          reconnectAttempts = 0;

          // Start MediaRecorder to capture audio
          mediaRecorder = new MediaRecorder(stream, {
            mimeType: 'audio/webm;codecs=opus',
          });

          mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0 && ws?.readyState === WebSocket.OPEN) {
              ws.send(e.data);
            }
          };

          mediaRecorder.start(250); // Send chunks every 250ms
        };

        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data);
            if (msg.type === 'Results' && msg.channel?.alternatives?.[0]) {
              const alt = msg.channel.alternatives[0];
              const text = alt.transcript;
              if (!text) return;

              if (msg.is_final) {
                if (msg.speech_final) {
                  sttDebug(`[STT:Deepgram] FINAL "${text.slice(0,40)}"`);
                  onFinal(text);
                } else {
                  sttDebug(`[STT:Deepgram] interim(final) "${text.slice(0,40)}"`);
                  onInterim(text);
                }
              } else {
                onInterim(text);
              }
            }
          } catch (err) {
            sttDebug(`[STT:Deepgram] Parse error: ${err}`);
          }
        };

        ws.onerror = (e) => {
          sttDebug(`[STT:Deepgram] WebSocket error`);
        };

        ws.onclose = (e) => {
          sttDebug(`[STT:Deepgram] WebSocket closed: ${e.code} ${e.reason}`);
          if (shouldReconnect && reconnectAttempts < MAX_RECONNECT) {
            reconnectAttempts++;
            sttDebug(`[STT:Deepgram] Reconnecting... attempt ${reconnectAttempts}`);
            setTimeout(connectWebSocket, 1000 * reconnectAttempts);
          } else if (shouldReconnect) {
            onError(t('stt.connection_failed'));
          }
        };
      };

      shouldReconnect = true;
      connectWebSocket();
    },

    stop() {
      shouldReconnect = false;
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      }
      mediaRecorder = null;
      if (ws) {
        ws.close();
        ws = null;
      }
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
      }
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

      if (isMobile) {
        currentEngine = createDeepgramEngine(language);
        try {
          await currentEngine.start(onInterim, safeFinal, (err) => {
            // Deepgram error → Web Speech fallback
            sttDebug(`Deepgram error, fallback to WebSpeech: ${err}`);
            onError(err + ' ' + t('stt.fallback_webspeech'));
            currentEngine = createWebSpeechEngine(language);
            currentEngine.start(onInterim, safeFinal, onError, onReplace);
          });
        } catch (err) {
          sttDebug(`Deepgram failed, fallback: ${err}`);
          currentEngine = createWebSpeechEngine(language);
          currentEngine.start(onInterim, safeFinal, onError, onReplace);
        }
      } else {
        currentEngine = createWebSpeechEngine(language);
        currentEngine.start(onInterim, safeFinal, onError, onReplace);
      }
    },

    stop() {
      currentEngine?.stop();
      currentEngine = null;
      isRunning = false;
    },

  };
}
