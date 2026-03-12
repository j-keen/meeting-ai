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

// Deepgram Nova-3 engine (WebSocket streaming)
function createDeepgramEngine(language) {
  let ws = null;
  let audioCtx = null;
  let processor = null;
  let source = null;
  let stream = null;
  let shouldReconnect = false;
  let reconnectAttempts = 0;
  const MAX_RECONNECT = 3;
  const TARGET_SAMPLE_RATE = 16000;

  const langMap = {
    ko: 'ko',
    en: 'en',
    ja: 'ja',
    zh: 'zh',
  };

  // Convert Float32 audio samples to Int16 PCM
  function float32ToInt16(float32Array) {
    const int16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16;
  }

  // Downsample audio from source rate to target rate
  function downsample(buffer, srcRate, tgtRate) {
    if (srcRate === tgtRate) return buffer;
    const ratio = srcRate / tgtRate;
    const newLength = Math.round(buffer.length / ratio);
    const result = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
      const idx = Math.round(i * ratio);
      result[i] = buffer[idx];
    }
    return result;
  }

  function cleanupAudio() {
    if (processor) { processor.disconnect(); processor = null; }
    if (source) { source.disconnect(); source = null; }
    if (audioCtx && audioCtx.state !== 'closed') {
      audioCtx.close().catch(() => {});
      audioCtx = null;
    }
  }

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

      // API key pre-validation
      if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
        console.error('[STT:Deepgram] API key is invalid:', typeof apiKey, apiKey ? `length=${apiKey.length}` : 'empty');
        onError(t('stt.deepgram_key_missing'));
        return;
      }

      let useFallbackUrl = false;

      const connectWebSocket = () => {
        const lang = langMap[language] || 'en';
        const fullUrl = `wss://api.deepgram.com/v1/listen?model=nova-3&language=${lang}&encoding=linear16&sample_rate=${TARGET_SAMPLE_RATE}&channels=1&smart_format=true&interim_results=true&utterance_end_ms=500&vad_events=true`;
        const minimalUrl = `wss://api.deepgram.com/v1/listen?model=nova-3&language=${lang}&encoding=linear16&sample_rate=${TARGET_SAMPLE_RATE}&channels=1&smart_format=true&interim_results=true`;
        const wsUrl = useFallbackUrl ? minimalUrl : fullUrl;

        const maskedKey = `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
        console.log(`[STT:Deepgram] Connecting... key=${maskedKey} fallback=${useFallbackUrl}`);
        console.log(`[STT:Deepgram] URL: ${wsUrl}`);

        ws = new WebSocket(wsUrl, ['token', apiKey]);

        ws.onopen = () => {
          console.log('[STT:Deepgram] ✅ WebSocket connected successfully');
          reconnectAttempts = 0;
          useFallbackUrl = false;

          // Set up AudioContext for raw PCM capture
          audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          source = audioCtx.createMediaStreamSource(stream);
          processor = audioCtx.createScriptProcessor(4096, 1, 1);

          processor.onaudioprocess = (e) => {
            if (ws?.readyState === WebSocket.OPEN) {
              const float32 = e.inputBuffer.getChannelData(0);
              const downsampled = downsample(float32, audioCtx.sampleRate, TARGET_SAMPLE_RATE);
              const pcm16 = float32ToInt16(downsampled);
              ws.send(pcm16.buffer);
            }
          };

          source.connect(processor);
          processor.connect(audioCtx.destination);
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
          const maskedKey = `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
          console.error(`[STT:Deepgram] ❌ WebSocket error — readyState=${ws?.readyState} key=${maskedKey}`, e);
        };

        ws.onclose = (e) => {
          console.warn(`[STT:Deepgram] ⚠️ WebSocket closed: code=${e.code} reason="${e.reason}" wasClean=${e.wasClean}`);
          cleanupAudio();

          // On first failure, try fallback URL with minimal params
          if (shouldReconnect && !useFallbackUrl && reconnectAttempts === 0 && e.code !== 1000) {
            console.log('[STT:Deepgram] Trying fallback URL with minimal parameters...');
            useFallbackUrl = true;
            reconnectAttempts++;
            setTimeout(connectWebSocket, 500);
          } else if (shouldReconnect && reconnectAttempts < MAX_RECONNECT) {
            reconnectAttempts++;
            console.log(`[STT:Deepgram] Reconnecting... attempt ${reconnectAttempts}/${MAX_RECONNECT}`);
            setTimeout(connectWebSocket, 1000 * reconnectAttempts);
          } else if (shouldReconnect) {
            const detail = e.code !== 1000 ? ` (code=${e.code}${e.reason ? ': ' + e.reason : ''})` : '';
            onError(t('stt.connection_failed') + detail);
          }
        };
      };

      shouldReconnect = true;
      connectWebSocket();
    },

    stop() {
      shouldReconnect = false;
      cleanupAudio();
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

    async start({ language, engineType, onInterim, onFinal, onError, onEngineChange, onReplace }) {
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
            currentEngine.start(onInterim, safeFinal, onError, onReplace);
            if (onEngineChange) onEngineChange('webspeech');
          });
        } catch (err) {
          console.warn('[STT] Deepgram failed, falling back to WebSpeech:', err);
          currentEngine = createWebSpeechEngine(language);
          currentEngine.start(onInterim, safeFinal, onError, onReplace);
          if (onEngineChange) onEngineChange('webspeech');
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

    get engineName() {
      return currentEngine?.name || 'none';
    }
  };
}

// STT Comparison Mode — runs both engines simultaneously
export function startSTTComparison({ language, onResult, onError, onStatusChange }) {
  // onResult(engineName, text, isFinal)
  // onStatusChange(engineName, status) — 'connecting'|'active'|'error'

  const wsEngine = createWebSpeechEngine(language);
  const dgEngine = createDeepgramEngine(language);
  let stopped = false;

  // Start WebSpeech
  onStatusChange('webspeech', 'active');
  wsEngine.start(
    (text) => { if (!stopped) onResult('webspeech', text, false); },
    (text) => { if (!stopped) onResult('webspeech', text, true); },
    (err) => { if (!stopped) { onStatusChange('webspeech', 'error'); onError('webspeech', err); } }
  );

  // Start Deepgram
  onStatusChange('deepgram', 'connecting');
  dgEngine.start(
    (text) => { if (!stopped) { onStatusChange('deepgram', 'active'); onResult('deepgram', text, false); } },
    (text) => { if (!stopped) { onStatusChange('deepgram', 'active'); onResult('deepgram', text, true); } },
    (err) => { if (!stopped) { onStatusChange('deepgram', 'error'); onError('deepgram', err.message || String(err)); } }
  ).catch((err) => {
    if (!stopped) { onStatusChange('deepgram', 'error'); onError('deepgram', err.message || String(err)); }
  });

  // Return stop function
  return () => {
    stopped = true;
    wsEngine.stop();
    dgEngine.stop();
  };
}
