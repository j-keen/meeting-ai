import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isSupported, acquire, release, isHeld } from '../wake-lock.js';

function makeSentinel() {
  const listeners = {};
  return {
    released: false,
    addEventListener: vi.fn((type, cb) => { listeners[type] = cb; }),
    release: vi.fn(async function () {
      this.released = true;
      listeners.release?.();
    }),
    _fireRelease: () => listeners.release?.(),
  };
}

describe('wake-lock', () => {
  const originalWakeLock = navigator.wakeLock;

  afterEach(async () => {
    await release();
    if (originalWakeLock === undefined) {
      // @ts-ignore
      delete navigator.wakeLock;
    } else {
      // @ts-ignore
      navigator.wakeLock = originalWakeLock;
    }
  });

  describe('when unsupported', () => {
    beforeEach(() => {
      // @ts-ignore
      delete navigator.wakeLock;
    });

    it('isSupported returns false', () => {
      expect(isSupported()).toBe(false);
    });

    it('acquire resolves false', async () => {
      await expect(acquire()).resolves.toBe(false);
    });
  });

  describe('when supported and request succeeds', () => {
    let sentinel;
    beforeEach(() => {
      sentinel = makeSentinel();
      // @ts-ignore
      navigator.wakeLock = { request: vi.fn(async () => sentinel) };
    });

    it('isSupported returns true', () => {
      expect(isSupported()).toBe(true);
    });

    it('acquire returns true and isHeld becomes true', async () => {
      await expect(acquire()).resolves.toBe(true);
      expect(isHeld()).toBe(true);
    });

    it('a second acquire does not request again', async () => {
      await acquire();
      await acquire();
      expect(navigator.wakeLock.request).toHaveBeenCalledTimes(1);
    });

    it('release clears isHeld', async () => {
      await acquire();
      await release();
      expect(isHeld()).toBe(false);
    });

    it('the sentinel release event clears the held reference', async () => {
      await acquire();
      sentinel._fireRelease();
      expect(isHeld()).toBe(false);
    });
  });

  describe('when the request rejects', () => {
    beforeEach(() => {
      // @ts-ignore
      navigator.wakeLock = { request: vi.fn(async () => { throw new DOMException('denied', 'NotAllowedError'); }) };
    });

    it('acquire resolves false without throwing', async () => {
      await expect(acquire()).resolves.toBe(false);
      expect(isHeld()).toBe(false);
    });
  });
});
