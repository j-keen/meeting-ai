import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTimerGroup } from '../session-timers.js';

describe('createTimerGroup', () => {
  /** @type {ReturnType<typeof createTimerGroup>} */
  let timers;

  beforeEach(() => {
    vi.useFakeTimers();
    timers = createTimerGroup();
  });

  afterEach(() => {
    timers.clearAll();
    vi.useRealTimers();
  });

  it('every() registers a repeating timer that fires on the interval', () => {
    const fn = vi.fn();
    timers.every('tick', 100, fn);
    expect(timers.has('tick')).toBe(true);
    expect(timers.names()).toEqual(['tick']);
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('after() registers a one-shot timer', () => {
    const fn = vi.fn();
    timers.after('once', 50, fn);
    expect(timers.has('once')).toBe(true);
    vi.advanceTimersByTime(49);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('after() removes itself when fired', () => {
    const fn = vi.fn();
    timers.after('once', 50, fn);
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(timers.has('once')).toBe(false);
    expect(timers.names()).not.toContain('once');
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('clear() cancels one timer by name', () => {
    const fn = vi.fn();
    timers.every('tick', 100, fn);
    timers.after('later', 100, fn);
    timers.clear('tick');
    expect(timers.has('tick')).toBe(false);
    expect(timers.has('later')).toBe(true);
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('clear() on an unknown name is a no-op', () => {
    expect(() => timers.clear('missing')).not.toThrow();
    expect(timers.has('missing')).toBe(false);
  });

  it('clearAll() cancels every timer and leaves no fake timers pending', () => {
    timers.every('a', 1000, () => {});
    timers.after('b', 1000, () => {});
    timers.every('c', 500, () => {});
    expect(timers.names()).toEqual(['a', 'b', 'c']);
    expect(vi.getTimerCount()).toBe(3);
    timers.clearAll();
    expect(timers.names()).toEqual([]);
    expect(timers.has('a')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('has() and names() reflect pending timers in insertion order', () => {
    expect(timers.has('x')).toBe(false);
    expect(timers.names()).toEqual([]);
    timers.every('x', 1000, () => {});
    timers.after('y', 1000, () => {});
    expect(timers.has('x')).toBe(true);
    expect(timers.has('y')).toBe(true);
    expect(timers.has('z')).toBe(false);
    expect(timers.names()).toEqual(['x', 'y']);
  });

  it('replacing a name cancels the old timer', () => {
    const firstEvery = vi.fn();
    const secondEvery = vi.fn();
    timers.every('tick', 100, firstEvery);
    timers.every('tick', 100, secondEvery);
    expect(timers.names()).toEqual(['tick']);
    vi.advanceTimersByTime(100);
    expect(firstEvery).not.toHaveBeenCalled();
    expect(secondEvery).toHaveBeenCalledTimes(1);

    const firstAfter = vi.fn();
    const secondAfter = vi.fn();
    timers.after('once', 100, firstAfter);
    timers.after('once', 100, secondAfter);
    vi.advanceTimersByTime(100);
    expect(firstAfter).not.toHaveBeenCalled();
    expect(secondAfter).toHaveBeenCalledTimes(1);
  });
});
