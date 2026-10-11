import { Aspect, aspectBehind } from './aspects.js';

/**
 * A signal as it appears in the route file.
 * @typedef {object} SignalDef
 * @property {string} id the number on the signal's plate, e.g. "TT1"
 * @property {string} track
 * @property {number} position chainage (m)
 * @property {1 | -1} dir direction of travel the signal reads for (+1 = increasing chainage)
 * @property {'3' | '4'} [aspects] default '4'
 * @property {boolean} [aws] AWS magnet on the approach (default true)
 * @property {boolean} [tpws] TPWS train-stop loops at the signal (default true)
 */

/**
 * @typedef {SignalDef & { aspect: string, held: boolean }} SignalState
 */

/**
 * Something occupying the track, e.g. a train.
 * @typedef {object} Occupant
 * @property {number} front chainage of the leading end
 * @property {number} rear chainage of the trailing end
 */

/**
 * Automatic colour-light signalling for one track and one direction of travel.
 *
 * Each signal protects the stretch of line from itself to the next signal, plus an "overlap"
 * beyond it (a safety margin in case a train slightly overruns the next red). If anything is
 * in that stretch the signal shows red. If not, it shows one step less restrictive than the
 * next signal. That gives the familiar R → Y → YY → G pattern behind a train.
 */
export class SignalSystem {
  /**
   * @param {SignalDef[]} signals all on one track, all reading the same way
   * @param {object} [opts]
   * @param {number} [opts.overlapM] UK standard full overlap is 180 m
   * @param {'open' | 'stop'} [opts.endOfLine] 'open' = the line carries on (clear), 'stop' = buffer stops
   * @param {number} [opts.lineEnd] chainage where the modelled line ends; trains beyond it are ignored
   */
  constructor(signals, { overlapM = 180, endOfLine = 'open', lineEnd } = {}) {
    const dir = signals[0]?.dir ?? 1;
    if (signals.some((s) => (s.dir ?? 1) !== dir)) {
      throw new Error('SignalSystem: all signals must read in the same direction');
    }
    this.dir = dir;
    this.overlapM = overlapM;
    this.endOfLine = endOfLine;
    this.lineEnd = lineEnd ?? dir * Infinity;
    /** @type {SignalState[]} in the order a train meets them */
    this.signals = signals
      .map((s) => ({ ...s, aspects: s.aspects ?? '4', aspect: Aspect.RED, held: false }))
      .sort((a, b) => dir * (a.position - b.position));
    /** @type {Map<string, SignalState>} */
    this.byId = new Map(this.signals.map((s) => [s.id, s]));
  }

  /**
   * Distance along the direction of travel. Lets one piece of code handle both directions.
   * @param {number} chainage
   */
  u(chainage) {
    return this.dir * chainage;
  }

  /**
   * The stretch (in travel coordinates) that must be empty for signal i to show a proceed aspect.
   * @param {number} i
   * @returns {[number, number]}
   */
  sectionOf(i) {
    const start = this.u(this.signals[i].position);
    const next = this.signals[i + 1];
    const end = next ? this.u(next.position) + this.overlapM : this.u(this.lineEnd);
    return [start, end];
  }

  /**
   * Recalculate every aspect, working backwards from the furthest signal.
   * @param {Occupant[]} occupants
   */
  update(occupants) {
    const spans = occupants.map((o) => {
      const a = this.u(o.front);
      const b = this.u(o.rear);
      return [Math.min(a, b), Math.max(a, b)];
    });
    for (let i = this.signals.length - 1; i >= 0; i--) {
      const sig = this.signals[i];
      const [start, end] = this.sectionOf(i);
      const occupied = spans.some(([lo, hi]) => hi > start && lo < end);
      if (occupied || sig.held) {
        sig.aspect = Aspect.RED;
        continue;
      }
      const next = this.signals[i + 1];
      const nextAspect = next ? next.aspect : this.endOfLine === 'stop' ? Aspect.RED : null;
      sig.aspect = aspectBehind(nextAspect, sig.aspects);
    }
  }

  /** @param {string} id */
  aspectOf(id) {
    const sig = this.byId.get(id);
    if (!sig) throw new Error(`Unknown signal ${id}`);
    return sig.aspect;
  }

  /**
   * Hold a signal at danger (the signaller not clearing it). Used for junction routes and
   * signal failures in later milestones. Takes effect on the next update().
   * @param {string} id
   * @param {boolean} held
   */
  setHeld(id, held) {
    const sig = this.byId.get(id);
    if (!sig) throw new Error(`Unknown signal ${id}`);
    sig.held = held;
  }

  /**
   * The next signal at or ahead of a chainage, in the direction of travel.
   * @param {number} chainage
   * @returns {{ signal: SignalState, distance: number } | null}
   */
  nextSignalAhead(chainage) {
    const u0 = this.u(chainage);
    for (const signal of this.signals) {
      const d = this.u(signal.position) - u0;
      if (d >= 0) return { signal, distance: d };
    }
    return null;
  }
}
