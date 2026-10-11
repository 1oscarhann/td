import { describe, expect, it } from 'vitest';
import { maxSpeedForDistance, requiredDeceleration, stoppingDistance } from '../src/physics/braking.js';
import { mphToMps } from '../src/core/units.js';

describe('braking maths', () => {
  it('v² / 2a with no delay', () => {
    // 20 m/s at 1 m/s² → 200 m
    expect(stoppingDistance(20, 1)).toBeCloseTo(200);
  });

  it('adds the distance covered while the brakes build up', () => {
    expect(stoppingDistance(20, 1, 1.5)).toBeCloseTo(230);
  });

  it('75 mph at full service (0.9 m/s²) is about 625 m before lag', () => {
    expect(stoppingDistance(mphToMps(75), 0.9)).toBeCloseTo(624.6, 0);
  });

  it('handles the edge cases', () => {
    expect(stoppingDistance(0, 1)).toBe(0);
    expect(stoppingDistance(10, 0)).toBe(Infinity);
    expect(maxSpeedForDistance(0, 1)).toBe(0);
    expect(requiredDeceleration(0, 100)).toBe(0);
    expect(requiredDeceleration(10, 0)).toBe(Infinity);
  });

  it('maxSpeedForDistance is the inverse of stoppingDistance', () => {
    for (const [v, a, t] of [
      [10, 0.5, 0],
      [33.5, 0.9, 0.7],
      [44.7, 1.2, 2],
    ]) {
      const d = stoppingDistance(v, a, t);
      expect(maxSpeedForDistance(d, a, t)).toBeCloseTo(v, 6);
    }
  });

  it('requiredDeceleration matches stoppingDistance', () => {
    const d = stoppingDistance(25, 0.6);
    expect(requiredDeceleration(25, d)).toBeCloseTo(0.6);
  });
});
