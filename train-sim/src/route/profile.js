/**
 * A value that changes in steps along the line, such as speed limits or gradients.
 *
 * Built from segments { from, to, value }. Where segments overlap, `combine` decides which value
 * wins (for speed limits, the lowest). Anywhere not covered gets `defaultValue`.
 * Internally it's a sorted list of "from here on, the value is X" breakpoints.
 */
export class StepProfile {
  /**
   * @param {{ from: number, to: number, value: number }[]} segments
   * @param {{ defaultValue?: number, combine?: (a: number, b: number) => number }} [opts]
   */
  constructor(segments, { defaultValue = 0, combine = (_a, b) => b } = {}) {
    const cuts = new Set();
    for (const seg of segments) {
      if (!(seg.to > seg.from)) throw new Error(`Profile segment needs to > from (got ${seg.from}..${seg.to})`);
      cuts.add(seg.from);
      cuts.add(seg.to);
    }
    const sorted = [...cuts].sort((a, b) => a - b);
    /** @type {number[]} */
    this.starts = [-Infinity];
    /** @type {number[]} */
    this.values = [defaultValue];
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      const probe = b === undefined ? a + 1 : (a + b) / 2;
      /** @type {number | undefined} */
      let value;
      for (const seg of segments) {
        if (seg.from <= probe && probe < seg.to) value = value === undefined ? seg.value : combine(value, seg.value);
      }
      value ??= defaultValue;
      if (value !== this.values[this.values.length - 1]) {
        this.starts.push(a);
        this.values.push(value);
      }
    }
  }

  /**
   * Index of the breakpoint in force at s.
   * @param {number} s
   */
  indexAt(s) {
    let lo = 0;
    let hi = this.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.starts[mid] <= s) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /** @param {number} s */
  valueAt(s) {
    return this.values[this.indexAt(s)];
  }

  /**
   * Lowest value anywhere between a and b (inclusive).
   * @param {number} a
   * @param {number} b
   */
  minBetween(a, b) {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    let i = this.indexAt(lo);
    let min = this.values[i];
    while (++i < this.starts.length && this.starts[i] <= hi) min = Math.min(min, this.values[i]);
    return min;
  }

  /**
   * The next place after s, travelling in direction dir, where the value changes.
   * @param {number} s
   * @param {1 | -1} [dir]
   * @returns {{ position: number, value: number } | null}
   */
  nextChange(s, dir = 1) {
    const i = this.indexAt(s);
    if (dir > 0) {
      return i + 1 < this.starts.length ? { position: this.starts[i + 1], value: this.values[i + 1] } : null;
    }
    return i > 0 ? { position: this.starts[i], value: this.values[i - 1] } : null;
  }

  /**
   * Area under the profile from 0 to s (negative if s < 0). For a gradient profile in ‰,
   * integral(s) / 1000 is the height gained.
   * @param {number} s
   */
  integral(s) {
    const lo = Math.min(0, s);
    const hi = Math.max(0, s);
    let total = 0;
    for (let i = 0; i < this.starts.length; i++) {
      const a = Math.max(lo, this.starts[i]);
      const b = Math.min(hi, this.starts[i + 1] ?? Infinity);
      if (b > a) total += (b - a) * this.values[i];
    }
    return s >= 0 ? total : 0 - total; // 0 - 0 is +0, unlike -0
  }
}
