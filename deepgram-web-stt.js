// deepgram-web-stt.js — Deepgram real-time STT via WebSocket (runs in WebView)

const DEEPGRAM_WS_URL = 'wss://api.deepgram.com/v1/listen';

export function createDeepgramEngine(language, apiKey) {
  let ws = null;
  let mediaStream = null;
  let audioContext = null;
  let processor = null;
  let isActive = false;

  const langMap = { ko: 'ko', en: 'en', ja: 'ja', zh: 'zh' };
  const lang = langMap[language] || 'ko';

  return {
    name: 'deepgram',

    start(onInterim, onFinal, onError, onReplace, onFatalError, onAudioStart) {
      isActive = true;

      // 1. Get microphone access
      navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 16000,
        }
      }).then(stream => {
        mediaStream = stream;
        onAudioStart?.();

        // 2. Connect to Deepgram
        const wsUrl = `${DEEPGRAM_WS_URL}?language=${lang}&model=nova-2&smart_format=true&interim_results=true&utterance_end_ms=1500&vad_events=true&encoding=linear16&sample_rate=16000&channels=1`;

        ws = new WebSocket(wsUrl, ['token', apiKey]);

        ws.onopen = () => {
          console.log('[Deepgram] Connected');

          // 3. Stream audio via AudioWorklet/ScriptProcessor
          audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
          const source = audioContext.createMediaStreamSource(stream);

          // Use ScriptProcessor (deprecated but widely supported)
          processor = audioContext.createScriptProcessor(4096, 1, 1);
          processor.onaudioprocess = (e) => {
            if (ws?.readyState === WebSocket.OPEN) {
              const float32 = e.inputBuffer.getChannelData(0);
              // Convert float32 to int16
              const int16 = new Int16Array(float32.length);
              for (let i = 0; i < float32.length; i++) {
                const s = Math.max(-1, Math.min(1, float32[i]));
                int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
              }
              ws.send(int16.buffer);
            }
          };

          source.connect(processor);
          processor.connect(audioContext.destination);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'Results' && data.channel?.alternatives?.[0]) {
              const text = data.channel.alternatives[0].transcript?.trim();
              if (text) {
                if (data.is_final) {
                  onFinal(text);
                } else {
                  onInterim(text);
                }
              }
            }
          } catch { }
        };

        ws.onerror = (e) => {
          console.error('[Deepgram] WS error:', e);
          onError('Deepgram 연결 오류');
        };

        ws.onclose = () => {
          console.log('[Deepgram] WS closed');
          if (isActive) {
            // Auto-reconnect
            setTimeout(() => {
              if (isActive) {
                console.log('[Deepgram] Reconnecting...');
                this.start(onInterim, onFinal, onError, onReplace, onFatalError, onAudioStart);
              }
            }, 1000);
          }
        };

      }).catch(err => {
        console.error('[Deepgram] Mic access failed:', err.name, err.message);
        onError('마이크 접근 실패: ' + err.name + ' - ' + err.message);
        onFatalError?.();
      });

      return { started: true };
    },

    stop() {
      isActive = false;
      if (processor) {
        processor.disconnect();
        processor = null;
      }
      if (audioContext) {
        audioContext.close().catch(() => {});
        audioContext = null;
      }
      if (mediaStream) {
        mediaStream.getTracks().forEach(t => t.stop());
        mediaStream = null;
      }
      if (ws) {
        try { ws.send(JSON.stringify({ type: 'CloseStream' })); } catch {}
        ws.close();
        ws = null;
      }
    }
  };
}
