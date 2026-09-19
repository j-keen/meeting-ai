// @ts-check
// session-timers.js - Named timer group so a lifecycle owner can clear everything at once.

/**
 * @typedef {object} TimerGroup
 * @property {(name: string, ms: number, fn: () => void) => void} every  register a repeating timer (replaces same name)
 * @property {(name: string, ms: number, fn: () => void) => void} after  register a one-shot timer (replaces same name)
 * @property {(name: string) => void} clear     cancel one timer by name
 * @property {() => void} clearAll              cancel every timer in the group
 * @property {(name: string) => boolean} has    whether a timer with this name is pending
 * @property {() => string[]} names             names of pending timers
 */

/** @returns {TimerGroup} */
export function createTimerGroup() {
  /** @type {Map<string, { kind: 'interval' | 'timeout', id: any }>} */
  const active = new Map();

  function clear(name) {
    const entry = active.get(name);
    if (!entry) return;
    if (entry.kind === 'interval') clearInterval(entry.id);
    else clearTimeout(entry.id);
    active.delete(name);
  }

  return {
    every(name, ms, fn) {
      clear(name);
      active.set(name, { kind: 'interval', id: setInterval(fn, ms) });
    },
    after(name, ms, fn) {
      clear(name);
      const id = setTimeout(() => {
        active.delete(name);
        fn();
      }, ms);
      active.set(name, { kind: 'timeout', id });
    },
    clear,
    clearAll() {
      for (const name of [...active.keys()]) clear(name);
    },
    has(name) {
      return active.has(name);
    },
    names() {
      return [...active.keys()];
    },
  };
}
