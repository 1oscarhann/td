/**
 * Unit helpers. Everything inside the sim is SI (metres, seconds, kilograms, newtons).
 * UK railways work in miles per hour and "1 in N" gradients, so we convert at the edges
 * (route data files and the HUD).
 */

/** Metres per second in one mile per hour. */
export const MPS_PER_MPH = 0.44704;

/** Standard gravity, m/s². */
export const G = 9.80665;

/** @param {number} mph */
export const mphToMps = (mph) => mph * MPS_PER_MPH;

/** @param {number} mps */
export const mpsToMph = (mps) => mps / MPS_PER_MPH;

/** @param {number} mps */
export const mpsToKmh = (mps) => mps * 3.6;

/**
 * "1 in N" gradient to per-mille (‰, metres of climb per 1000 m). 1 in 200 = 5‰.
 * @param {number} n
 */
export const oneInToPermille = (n) => 1000 / n;

/**
 * @param {number} v
 * @param {number} lo
 * @param {number} hi
 */
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Move `current` towards `target` by at most `maxDelta`.
 * @param {number} current
 * @param {number} target
 * @param {number} maxDelta
 */
export function approach(current, target, maxDelta) {
  if (current < target) return Math.min(target, current + maxDelta);
  return Math.max(target, current - maxDelta);
}

/**
 * "09:05:30" → seconds since midnight.
 * @param {string} text
 */
export function parseClock(text) {
  const [h = 0, m = 0, s = 0] = String(text).split(':').map(Number);
  return h * 3600 + m * 60 + s;
}

/**
 * Seconds since midnight → "HH:MM:SS" (wraps at 24 h).
 * @param {number} seconds
 */
export function formatClock(seconds) {
  const t = ((Math.floor(seconds) % 86400) + 86400) % 86400;
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

/**
 * A fixed number, or a random one from a [min, max] range.
 * @param {number | [number, number]} value
 * @param {() => number} [rng]
 */
export function pickInRange(value, rng = Math.random) {
  if (Array.isArray(value)) return value[0] + (value[1] - value[0]) * rng();
  return value;
}
