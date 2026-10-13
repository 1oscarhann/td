import { Aspect } from './aspects.js';

/**
 * @typedef {object} TrainRouting what the interlocking needs to know about a train
 * @property {string} id
 * @property {import('../route/network.js').TrackPos} front
 * @property {import('../route/network.js').Piece[]} body
 * @property {Map<string, 'N' | 'R'>} plan which way to take each set of facing points (default normal)
 */

/** How long points take to move (s). */
export const POINTS_THROW_S = 5;
/** Points this close to a train's body can't move under it (m). */
const TRACK_LOCK_M = 40;
/** A cleared route can't be pulled from a train this close to its signal (m). */
const APPROACH_LOCK_M = 1600;

/**
 * The signaller and interlocking, automated: sets the points for each train's booked route as it
 * approaches, first come first served, and refuses to move points that are under a train or on a
 * route already cleared for an approaching train.
 */
export class Interlocking {
  /**
   * @param {import('../route/network.js').Network} network
   * @param {import('./signalling.js').Signalling} signalling
   * @param {{ lookaheadM?: number }} [opts]
   */
  constructor(network, signalling, { lookaheadM = 3500 } = {}) {
    this.network = network;
    this.signalling = signalling;
    this.lookaheadM = lookaheadM;
  }

  /**
   * @param {number} time sim seconds
   * @param {TrainRouting[]} trains
   * @returns {{ points: string, to: 'N' | 'R', for: string }[]} points that started moving
   */
  update(time, trains) {
    for (const p of this.network.points.values()) {
      if (p.moving && time >= p.movingUntil) {
        p.state = p.moving;
        p.moving = null;
        this.network.version++;
      }
    }

    // Which way does the nearest train want each set of points?
    /** @type {Map<string, { state: 'N' | 'R', distance: number, train: string }>} */
    const wants = new Map();
    for (const t of trains) {
      this.network.walk(t.front.track, t.front.s, this.lookaheadM, {
        decide: (p) => t.plan.get(p.id) ?? 'N',
        onPoints: (p, required, distance) => {
          const w = wants.get(p.id);
          if (!w || distance < w.distance) wants.set(p.id, { state: required, distance, train: t.id });
        },
      });
    }

    /** @type {{ points: string, to: 'N' | 'R', for: string }[]} */
    const moved = [];
    for (const [id, want] of wants) {
      const p = /** @type {import('../route/network.js').Points} */ (this.network.points.get(id));
      if (p.moving || p.state === want.state) {
        if (!p.moving) p.setFor = want.train;
        continue;
      }
      if (this.isLocked(p, trains, want.train)) continue;
      p.moving = want.state;
      p.movingUntil = time + POINTS_THROW_S;
      p.setFor = want.train;
      moved.push({ points: id, to: want.state, for: want.train });
    }
    return moved;
  }

  /**
   * Can't move: a train is on or next to them, or a signal is cleared over them for a train
   * that's approaching it. Approach locking protects other trains, not the one asking for the
   * change: a train that finds a junction signal cleared the wrong way for it (say, after a
   * resume, or because nobody had asked for the junction yet) gets its own route instead.
   * @param {import('../route/network.js').Points} p
   * @param {TrainRouting[]} trains
   * @param {string} [forTrain] the train that wants them moved
   */
  isLocked(p, trains, forTrain) {
    const near = (/** @type {import('../route/network.js').Piece} */ piece, /** @type {import('../route/network.js').TrackPos} */ at) => {
      if (piece.track !== at.track) return false;
      const lo = Math.min(piece.from, piece.to) - TRACK_LOCK_M;
      const hi = Math.max(piece.from, piece.to) + TRACK_LOCK_M;
      return at.s >= lo && at.s <= hi;
    };
    for (const t of trains) {
      if (t.body.some((piece) => near(piece, p.at) || near(piece, p.other))) return true;
    }
    for (const sig of this.signalling.signals.values()) {
      if (sig.aspect === Aspect.RED) continue;
      const sec = this.signalling.section(sig);
      if (!sec.points.some((x) => x.points === p)) continue;
      const track = this.network.track(sig.key);
      for (const t of trains) {
        if (t.id === forTrain || t.front.track !== sig.key) continue;
        const d = track.u(sig.s) - track.u(t.front.s);
        if (d >= 0 && d <= APPROACH_LOCK_M) return true;
      }
    }
    return false;
  }
}
