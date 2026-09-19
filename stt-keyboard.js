// @ts-check
// stt-keyboard.js - Keyboard voice-input STT engine: routes text typed (or
// voice-typed via the OS keyboard) into a textarea into the same
// onInterim/onFinal contract as the other STT engines.

export function createKeyboardEngine({ commitIdleMs = 2500 } = {}) {
  let bar = null;
  let textarea = null;
  let sendBtn = null;
  let idleTimer = null;
  let onFinalCb = null;
  let onInterimCb = null;

  let handleInput = null;
  let handleKeydown = null;
  let handleClick = null;

  function clearIdleTimer() {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  }

  function resetIdleTimer() {
    clearIdleTimer();
    idleTimer = setTimeout(() => {
      if (textarea && textarea.value.trim()) commitPending();
    }, commitIdleMs);
  }

  function commitPending() {
    clearIdleTimer();
    if (!textarea) return;
    const trimmed = textarea.value.trim();
    textarea.value = '';
    if (trimmed) onFinalCb?.(trimmed);
  }

  return {
    name: 'keyboard',
    supportsPause: true,

    start(onInterim, onFinal, onError, onReplace, onFatalError, onAudioStart) {
      bar = document.getElementById('kbSttBar');
      textarea = /** @type {HTMLTextAreaElement|null} */ (document.getElementById('kbSttInput'));
      sendBtn = document.getElementById('kbSttSend');
      if (!bar || !textarea || !sendBtn) {
        onError('keyboard input bar missing');
        return { started: false };
      }

      onFinalCb = onFinal;
      onInterimCb = onInterim;

      bar.hidden = false;
      document.body.classList.add('kb-stt-active');
      textarea.focus();
      onAudioStart?.();

      handleInput = () => {
        const value = textarea.value;
        if (value.includes('\n')) {
          const lines = value.split('\n');
          const remainder = lines.pop();
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) onFinalCb?.(trimmed);
          }
          textarea.value = remainder;
        }
        onInterimCb?.(textarea.value);
        resetIdleTimer();
      };
      handleKeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          commitPending();
        }
      };
      handleClick = () => commitPending();

      textarea.addEventListener('input', handleInput);
      textarea.addEventListener('keydown', handleKeydown);
      sendBtn.addEventListener('click', handleClick);

      return { started: true };
    },

    pause() {
      if (!textarea) return;
      commitPending();
      textarea.blur();
      textarea.disabled = true;
      if (sendBtn) sendBtn.disabled = true;
    },

    resume() {
      if (!textarea) return;
      textarea.disabled = false;
      if (sendBtn) sendBtn.disabled = false;
      textarea.focus();
    },

    stop() {
      if (!textarea) return;
      commitPending();
      clearIdleTimer();
      textarea.removeEventListener('input', handleInput);
      textarea.removeEventListener('keydown', handleKeydown);
      sendBtn?.removeEventListener('click', handleClick);
      textarea.blur();
      if (bar) bar.hidden = true;
      document.body.classList.remove('kb-stt-active');
      bar = null;
      textarea = null;
      sendBtn = null;
    },
  };
}
