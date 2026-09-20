// @ts-check
// background-keepalive.js - Keep a mobile browser tab alive while recording with the screen off.
//
// Chrome on Android exempts tabs that capture the microphone or play media from freezing.
// We already capture the mic; this adds a looping near-silent <audio> element plus Media
// Session metadata so the OS shows a "Meeting AI" media notification and the page keeps
// its audio focus when the screen is locked. Must be started from a user gesture.

let audioEl = null;

/** 1 second of 8 kHz mono 8-bit PCM at a barely-nonzero level (silence is sometimes treated as "not playing"). */
function silentWavDataUri() {
  const rate = 8000;
  const samples = rate;
  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + samples, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  str(36, 'data'); v.setUint32(40, samples, true);
  const body = new Uint8Array(samples);
  for (let i = 0; i < samples; i++) body[i] = 128 + ((i % 200) < 100 ? 1 : 0); // ±1 LSB square wave
  let bin = '';
  new Uint8Array(header).forEach(b => { bin += String.fromCharCode(b); });
  body.forEach(b => { bin += String.fromCharCode(b); });
  return 'data:audio/wav;base64,' + btoa(bin);
}

export function isMobileLike() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * @param {{ title?: string }} [opts]
 * @returns {Promise<boolean>} whether the keep-alive audio is playing
 */
export async function startKeepAlive({ title = 'Meeting AI' } = {}) {
  try {
    if (!audioEl) {
      audioEl = document.createElement('audio');
      audioEl.src = silentWavDataUri();
      audioEl.loop = true;
      audioEl.volume = 0.01;
      audioEl.setAttribute('playsinline', '');
      audioEl.style.display = 'none';
      document.body.appendChild(audioEl);
    }
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title, artist: 'Recording…' });
      navigator.mediaSession.playbackState = 'playing';
      // Keep OS media controls from pausing us silently.
      for (const action of ['pause', 'stop']) {
        try { navigator.mediaSession.setActionHandler(action, () => {}); } catch { /* unsupported action */ }
      }
    }
    await audioEl.play();
    return true;
  } catch {
    return false;
  }
}

export function stopKeepAlive() {
  try {
    if (audioEl) { audioEl.pause(); audioEl.currentTime = 0; }
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'none';
      navigator.mediaSession.metadata = null;
    }
  } catch { /* ignore */ }
}

export function isKeepAliveActive() {
  return !!audioEl && !audioEl.paused;
}
