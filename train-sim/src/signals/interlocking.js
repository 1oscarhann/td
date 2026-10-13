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

    // Which way does the nearest train want each set of points? A train heading for a diamond
    // wants the points whose reverse route crosses it left normal.
    /** @type {Map<string, { state: 'N' | 'R', distance: number, train: string }>} */
    const wants = new Map();
    for (const t of trains) {
      const want = (/** @type {import('../route/network.js').Points} */ p, /** @type {'N' | 'R'} */ state, /** @type {number} */ distance) => {
        const w = wants.get(p.id);
        if (!w || distance < w.distance) wants.set(p.id, { state, distance, train: t.id });
      };
      this.network.walk(t.front.track, t.front.s, this.lookaheadM, {
        decide: (p) => t.plan.get(p.id) ?? 'N',
        onPoints: want,
        onPiece: (piece, before) => {
          const diamonds = this.network.diamonds.get(piece.track);
          if (!diamonds) return;
          const track = this.network.track(piece.track);
          const a = track.u(piece.from);
          const b = track.u(piece.to);
          for (const d of diamonds) {
            const u = track.u(d.s);
            if (u >= a && u <= b) want(d.points, 'N', before + (u - a));
          }
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
      if (this.isLocked(p, trains, want.train, want.state)) continue;
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
   * @param {'N' | 'R'} [to] where they'd move to
   */
  isLocked(p, trains, forTrain, to = p.state === 'N' ? 'R' : 'N') {
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
    if (to === 'R') {
      for (const d of p.diamonds) if (this.diamondInUse(p, d, trains, forTrain)) return true;
    }
    return false;
  }

  /**
   * Is the line a diamond crosses in use, so its points mustn't be reversed across it? A train on
   * or next to it, one past its last signal before it, or one approaching a signal that's been
   * cleared over it.
   * @param {import('../route/network.js').Points} p
   * @param {import('../route/network.js').TrackPos} d
   * @param {TrainRouting[]} trains
   * @param {string} [forTrain]
   */
  diamondInUse(p, d, trains, forTrain) {
    const track = this.network.track(d.track);
    const signals = this.signalling.byTrack.get(d.track) ?? [];
    for (const t of trains) {
      const onIt = t.body.some((piece) => piece.track === d.track && Math.min(piece.from, piece.to) - TRACK_LOCK_M <= d.s && Math.max(piece.from, piece.to) + TRACK_LOCK_M >= d.s);
      if (onIt) return true;
      if (t.id === forTrain || t.front.track !== d.track) continue;
      const front = track.u(t.front.s);
      const toDiamond = track.u(d.s) - front;
      if (toDiamond < 0 || toDiamond > 2 * APPROACH_LOCK_M) continue;
      if (!signals.some((sig) => track.u(sig.s) > front && track.u(sig.s) <= track.u(d.s))) return true;
    }
    for (const sig of signals) {
      if (sig.aspect === Aspect.RED) continue;
      if (!this.signalling.section(sig).diamonds.some((x) => x.points === p)) continue;
      for (const t of trains) {
        if (t.id === forTrain || t.front.track !== sig.key) continue;
        const dist = track.u(sig.s) - track.u(t.front.s);
        if (dist >= 0 && dist <= APPROACH_LOCK_M) return true;
      }
    }
    return false;
  }
}
