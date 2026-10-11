import { describe, expect, it } from 'vitest';
import { advanceAccumulator } from '../src/core/loop.js';
import { createStore } from '../src/core/storage.js';
import { DEFAULT_SETTINGS, loadScores, loadSettings, recordScore, sanitizeSettings, saveSettings } from '../src/core/settings.js';
import { formatClock, parseClock, oneInToPermille, mpsToMph, mphToMps } from '../src/core/units.js';

describe('fixed-timestep accumulator', () => {
  const DT = 1 / 60;

  /** Simulate `seconds` of frames at `fps` and count physics steps. */
  function stepsFor(fps, seconds) {
    let acc = 0;
    let steps = 0;
    for (let i = 0; i < Math.round(fps * seconds); i++) {
      const r = advanceAccumulator(acc, 1 / fps, DT);
      acc = r.accumulator;
      steps += r.steps;
    }
    return steps;
  }

  it('runs the same number of physics steps at any frame rate', () => {
    expect(stepsFor(30, 10)).toBe(600);
    expect(stepsFor(60, 10)).toBe(600);
    expect(stepsFor(144, 10)).toBeGreaterThanOrEqual(599);
    expect(stepsFor(144, 10)).toBeLessThanOrEqual(600);
  });

  it('caps a huge stall so the game does not freeze catching up', () => {
    expect(advanceAccumulator(0, 30, DT).steps).toBe(15); // 0.25 s cap
  });

  it('runs no steps while paused', () => {
    expect(advanceAccumulator(0, 0, DT).steps).toBe(0);
  });

  it('reports how far into the next step we are, for smooth rendering', () => {
    const r = advanceAccumulator(0, DT * 1.5, DT);
    expect(r.steps).toBe(1);
    expect(r.alpha).toBeCloseTo(0.5);
  });
});

describe('units', () => {
  it('converts the railway way', () => {
    expect(mphToMps(100)).toBeCloseTo(44.704);
    expect(mpsToMph(mphToMps(75))).toBeCloseTo(75);
    expect(oneInToPermille(200)).toBe(5);
  });

  it('formats the clock', () => {
    expect(formatClock(parseClock('09:05:30'))).toBe('09:05:30');
    expect(formatClock(86400 + 61)).toBe('00:01:01');
  });
});

describe('storage and settings', () => {
  function fakeStorage() {
    const data = new Map();
    return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), data };
  }

  it('round-trips settings and ignores junk', () => {
    const store = createStore(fakeStorage());
    expect(loadSettings(store)).toEqual(DEFAULT_SETTINGS);
    saveSettings(store, { ...DEFAULT_SETTINGS, dsdMode: 'vigilance', volume: 0.2 });
    expect(loadSettings(store)).toMatchObject({ dsdMode: 'vigilance', volume: 0.2 });
    expect(sanitizeSettings({ dsdMode: 'nap', volume: 9, fov: 'wide', speedUnits: 'kmh' })).toEqual({ ...DEFAULT_SETTINGS, speedUnits: 'kmh' });
  });

  it('survives storage that throws (private browsing)', () => {
    const broken = {
      getItem() {
        throw new Error('SecurityError');
      },
      setItem() {
        throw new Error('QuotaExceededError');
      },
    };
    const store = createStore(broken);
    expect(store.save('x', 1)).toBe(false);
    expect(store.load('x', 0)).toBe(1); // kept in memory for this session
  });

  it('works with no storage at all', () => {
    const store = createStore(null);
    store.save('k', { a: 1 });
    expect(store.load('k', null)).toEqual({ a: 1 });
  });

  it('keeps the best scores per route, highest first', () => {
    const store = createStore(fakeStorage());
    const entry = (score) => ({ score, date: '2026-10-11T09:00:00Z', timeS: 300, stopErrorM: 1 });
    recordScore(store, 'test-track', entry(500));
    recordScore(store, 'test-track', entry(900));
    const { rank } = recordScore(store, 'test-track', entry(700));
    expect(rank).toBe(2);
    expect(loadScores(store, 'test-track').map((s) => s.score)).toEqual([900, 700, 500]);
    expect(loadScores(store, 'other-route')).toEqual([]);
    for (let i = 0; i < 12; i++) recordScore(store, 'test-track', entry(i));
    expect(loadScores(store, 'test-track')).toHaveLength(10);
  });
});
