// pcm-worklet.js - AudioWorkletProcessor that batches mono Float32 input into ~100 ms
// Int16 PCM chunks. Runs on the audio rendering thread, so capture keeps flowing while
// the page is in the background (main-thread timers are throttled there).

class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunkSize = Math.round(sampleRate / 10); // 100 ms
    this.buffer = new Int16Array(this.chunkSize);
    this.offset = 0;
    this.enabled = true;
    this.port.onmessage = (e) => {
      if (e.data === 'pause') this.enabled = false;
      else if (e.data === 'resume') this.enabled = true;
    };
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0] || !this.enabled) return true;
    const channel = input[0];
    for (let i = 0; i < channel.length; i++) {
      const s = Math.max(-1, Math.min(1, channel[i]));
      this.buffer[this.offset++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this.offset >= this.chunkSize) {
        this.port.postMessage(this.buffer.buffer.slice(0));
        this.offset = 0;
      }
    }
    return true;
  }
}

registerProcessor('pcm-capture', PcmCaptureProcessor);
