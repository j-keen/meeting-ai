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

  return {
    name: 'webspeech',

    start(onInterim, onFinal, onError) {
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
            onFinal(text);
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

// Deepgram Nova-3 engine (WebSocket streaming)
function createDeepgramEngine(language) {
  let ws = null;
  let mediaRecorder = null;
  let stream = null;
  let shouldReconnect = false;
  let reconnectAttempts = 0;
  const MAX_RECONNECT = 3;

  const langMap = {
    ko: 'ko',
    en: 'en',
    ja: 'ja',
    zh: 'zh',
  };

  return {
    name: 'deepgram',

    async start(onInterim, onFinal, onError) {
      // Fetch API key and mic permission in parallel for faster startup
      let apiKey;
      try {
        const [tokenResult, micResult] = await Promise.all([
          fetch('/api/stt-token').then(async (resp) => {
            if (!resp.ok) throw new Error('Failed to get STT token');
            return (await resp.json()).key;
          }),
          navigator.mediaDevices.getUserMedia({ audio: true }),
        ]);
        apiKey = tokenResult;
        stream = micResult;
      } catch (err) {
        // Clean up mic if token failed but mic succeeded
        if (stream) { stream.getTracks().forEach(track => track.stop()); stream = null; }
        const msg = err.message?.includes('token') ? t('stt.deepgram_key_missing') : t('stt.mic_permission_denied');
        onError(msg);
        return;
      }

      const connectWebSocket = () => {
        const lang = langMap[language] || 'en';
        const wsUrl = `wss://api.deepgram.com/v1/listen?model=nova-3&language=${lang}&smart_format=true&punctuate=true&numerals=true&interim_results=true&utterance_end_ms=500&vad_events=true`;

        ws = new WebSocket(wsUrl, ['token', apiKey]);

        ws.onopen = () => {
          console.log('[STT:Deepgram] WebSocket connected');
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

          mediaRecorder.start(100); // Send chunks every 100ms for lower latency
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
                  onFinal(text);
                } else {
                  onInterim(text);
                }
              } else {
                onInterim(text);
              }
            }
          } catch (err) {
            console.warn('[STT:Deepgram] Parse error:', err);
          }
        };

        ws.onerror = (e) => {
          console.error('[STT:Deepgram] WebSocket error:', e);
        };

        ws.onclose = (e) => {
          console.log('[STT:Deepgram] WebSocket closed:', e.code, e.reason);
          if (shouldReconnect && reconnectAttempts < MAX_RECONNECT) {
            reconnectAttempts++;
            console.log(`[STT:Deepgram] Reconnecting... attempt ${reconnectAttempts}`);
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

    async start({ language, engineType, onInterim, onFinal, onError, onEngineChange }) {
      if (isRunning) return;
      isRunning = true;

      // For webspeech, check mic permission upfront
      if (!engineType || engineType === 'webspeech') {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach(track => track.stop());
        } catch {
          isRunning = false;
          throw new Error(t('stt.mic_permission_denied'));
        }
      }

      const safeFinal = (text) => {
        if (text && text.trim()) onFinal(text);
      };

      if (engineType === 'deepgram') {
        currentEngine = createDeepgramEngine(language);
        try {
          await currentEngine.start(onInterim, safeFinal, (err) => {
            // On Deepgram error, fall back to WebSpeech
            console.warn('[STT] Deepgram error, falling back to WebSpeech:', err);
            currentEngine = createWebSpeechEngine(language);
            currentEngine.start(onInterim, safeFinal, onError);
            if (onEngineChange) onEngineChange('webspeech');
          });
        } catch (err) {
          console.warn('[STT] Deepgram failed, falling back to WebSpeech:', err);
          currentEngine = createWebSpeechEngine(language);
          currentEngine.start(onInterim, safeFinal, onError);
          if (onEngineChange) onEngineChange('webspeech');
        }
      } else {
        currentEngine = createWebSpeechEngine(language);
        currentEngine.start(onInterim, safeFinal, onError);
      }
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
