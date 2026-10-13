import { Aspect, aspectBehind } from './aspects.js';

/**
 * A signal as it appears in the route file.
 * @typedef {object} SignalDef
 * @property {string} id plate number, e.g. "CH12"
 * @property {string} line
 * @property {string} track
 * @property {number} position chainage on its line
 * @property {'3' | '4'} [aspects] default '4'
 * @property {boolean} [aws] AWS magnet on the approach (default true)
 * @property {boolean} [tpws] TPWS loops (default true)
 * @property {{ points: string, state: 'N' | 'R', side: 'left' | 'right' }} [feather] route indicator: lit when the route goes this way over these points
 * @property {boolean} [approachControl] held at red until a train is close, when the feathered route is set (slows trains for a diverging junction)
 * @property {string} [kind] 'auto' | 'controlled' | 'starting' | 'protecting' (informational)
 */

/**
 * @typedef {SignalDef & {
 *   key: string, s: number, aspect: string, featherLit: null | 'left' | 'right',
 *   held: Set<string>, failed: boolean, approachHeld: boolean
 * }} SignalState
 */

/**
 * @typedef {object} Section
 * @property {import('../route/network.js').Piece[]} pieces from this signal to the next
 * @property {import('../route/network.js').Piece[]} overlap beyond the next signal
 * @property {SignalState | null} next
 * @property {null | 'open' | 'buffers'} end what lies beyond if there's no next signal
 * @property {{ points: import('../route/network.js').Points, state: 'N' | 'R' }[]} points every set of points the route crosses, and the way it needs them
 * @property {{ points: import('../route/network.js').Points, track: string, s: number }[]} diamonds flat crossings on the section or overlap, and the points whose reverse route uses them
 */

/** A train this close to a diamond is on it (m). */
const DIAMOND_CLEAR_M = 15;

/** Furthest we look for the next signal (m). Beyond this the line counts as open. */
const MAX_SECTION_M = 15000;

/**
 * Colour-light signalling over the whole network.
 *
 * Each signal protects the line from itself to the next signal along the route as the points
 * are set, plus an overlap beyond it. It shows red if anything is in that stretch, if any points
 * on it are moving or set against the route, or if something (a level crossing, the signaller, a
 * failure) is holding it. Otherwise it shows one step less restrictive than the next signal.
 */
export class Signalling {
  /**
   * @param {import('../route/network.js').Network} network
   * @param {SignalDef[]} defs
   * @param {{ overlapM?: number, approachReleaseM?: number }} [opts]
   */
  constructor(network, defs, { overlapM = 180, approachReleaseM = 250 } = {}) {
    this.network = network;
    this.overlapM = overlapM;
    this.approachReleaseM = approachReleaseM;
    /** @type {Map<string, SignalState>} */
    this.signals = new Map();
    /** @type {Map<string, SignalState[]>} per track, in the order trains meet them */
    this.byTrack = new Map();
    for (const d of defs) {
      const key = `${d.line}/${d.track}`;
      network.track(key); // throws if the track doesn't exist
      /** @type {SignalState} */
      const sig = {
        ...d,
        aspects: d.aspects ?? '4',
        key,
        s: d.position,
        aspect: Aspect.RED,
        featherLit: null,
        held: new Set(),
        failed: false,
        approachHeld: false,
      };
      if (this.signals.has(sig.id)) throw new Error(`Signal ${sig.id} is defined twice`);
      this.signals.set(sig.id, sig);
      const list = this.byTrack.get(key) ?? [];
      list.push(sig);
      this.byTrack.set(key, list);
    }
    for (const [key, list] of this.byTrack) {
      const t = network.track(key);
      list.sort((a, b) => t.u(a.s) - t.u(b.s));
    }
    /** @type {Map<string, { version: number, section: Section }>} */
    this.cache = new Map();
  }

  /** @param {string} id */
  get(id) {
    const sig = this.signals.get(id);
    if (!sig) throw new Error(`Unknown signal ${id}`);
    return sig;
  }

  /** @param {string} id */
  aspectOf(id) {
    return this.get(id).aspect;
  }

  /**
   * The first signal on a piece of track, after its start (or at it, if `inclusive`).
   * @param {import('../route/network.js').Piece} piece
   * @param {boolean} [inclusive]
   * @returns {SignalState | null}
   */
  firstSignalIn(piece, inclusive = false) {
    const list = this.byTrack.get(piece.track);
    if (!list) return null;
    const t = this.network.track(piece.track);
    const a = t.u(piece.from);
    const b = t.u(piece.to);
    for (const sig of list) {
      const u = t.u(sig.s);
      if ((inclusive ? u >= a - 1e-9 : u > a + 1e-9) && u <= b + 1e-9) return sig;
    }
    return null;
  }

  /**
   * The stretch a signal protects, following the points as they lie now.
   * @param {SignalState} sig
   * @returns {Section}
   */
  section(sig) {
    const cached = this.cache.get(sig.id);
    if (cached && cached.version === this.network.version) return cached.section;
    /** @type {Section} */
    const section = { pieces: [], overlap: [], next: null, end: null, points: [], diamonds: [] };
    const res = this.network.walk(sig.key, sig.s, MAX_SECTION_M, {
      onPiece: (piece) => {
        const next = this.firstSignalIn(piece);
        if (next) {
          section.pieces.push({ ...piece, to: next.s });
          section.next = next;
          return true;
        }
        section.pieces.push(piece);
        return false;
      },
      onPoints: (points, state) => section.points.push({ points, state }),
    });
    if (section.next) {
      const next = section.next;
      this.network.walk(next.key, next.s, this.overlapM, {
        onPiece: (piece) => {
          section.overlap.push(piece);
        },
        onPoints: (points, state) => section.points.push({ points, state }),
      });
    } else {
      section.end = res.end ?? 'open';
    }
    for (const piece of [...section.pieces, ...section.overlap]) {
      const lo = Math.min(piece.from, piece.to);
      const hi = Math.max(piece.from, piece.to);
      for (const d of this.network.diamonds.get(piece.track) ?? []) {
        if (d.s >= lo - 1 && d.s <= hi + 1) section.diamonds.push({ points: d.points, track: piece.track, s: d.s });
      }
    }
    this.cache.set(sig.id, { version: this.network.version, section });
    return section;
  }

  /**
   * Recalculate every aspect.
   * @param {Map<string, [number, number][]>} occupancy per track key, chainage intervals with trains on them
   * @param {import('../route/network.js').TrackPos[]} fronts the fronts of all trains, for approach control
   */
  update(occupancy, fronts = []) {
    /** @type {Map<string, string>} */
    const done = new Map();
    const occupied = (/** @type {import('../route/network.js').Piece[]} */ pieces) =>
      pieces.some((p) => {
        const spans = occupancy.get(p.track);
        if (!spans) return false;
        const lo = Math.min(p.from, p.to);
        const hi = Math.max(p.from, p.to);
        return spans.some(([a, b]) => b > lo && a < hi);
      });

    const occupiedNear = (/** @type {string} */ track, /** @type {number} */ s) =>
      (occupancy.get(track) ?? []).some(([a, b]) => b > s - DIAMOND_CLEAR_M && a < s + DIAMOND_CLEAR_M);

    /** @param {SignalState} sig @returns {string} */
    const resolve = (sig) => {
      const known = done.get(sig.id);
      if (known) return known;
      done.set(sig.id, Aspect.RED); // guards against loops in the data
      const sec = this.section(sig);
      const featherSet = !!sig.feather && sec.points.some((x) => x.points.id === sig.feather?.points && x.state === sig.feather?.state);
      let red =
        sig.failed ||
        sig.held.size > 0 ||
        occupied(sec.pieces) ||
        occupied(sec.overlap) ||
        sec.points.some(({ points, state }) => !points.detected || points.state !== state) ||
        // A diamond ahead that another route is set (or being set) across.
        sec.diamonds.some((d) => d.points.state === 'R' || !d.points.detected) ||
        // Our route cuts across another line on the flat: that line must be clear there.
        sec.points.some(({ points, state }) => state === 'R' && points.diamonds.some((d) => occupiedNear(d.track, d.s)));
      sig.approachHeld = false;
      if (!red && sig.approachControl && featherSet) {
        const near = fronts.some((f) => {
          if (f.track !== sig.key) return false;
          const t = this.network.track(f.track);
          const d = t.u(sig.s) - t.u(f.s);
          return d >= 0 && d <= this.approachReleaseM;
        });
        if (!near) {
          red = true;
          sig.approachHeld = true;
        }
      }
      let aspect = Aspect.RED;
      if (!red) {
        const beyond = sec.next ? resolve(sec.next) : sec.end === 'buffers' ? Aspect.RED : null;
        aspect = aspectBehind(beyond, sig.aspects);
      }
      sig.aspect = aspect;
      sig.featherLit = aspect !== Aspect.RED && featherSet && sig.feather ? sig.feather.side : null;
      done.set(sig.id, aspect);
      return aspect;
    };
    for (const sig of this.signals.values()) resolve(sig);
  }

  /**
   * Signals ahead of a position along the route as currently set.
   * @param {import('../route/network.js').TrackPos} pos
   * @param {number} maxDistance
   * @param {number} [limit]
   * @returns {{ signal: SignalState, distance: number }[]}
   */
  signalsAhead(pos, maxDistance, limit = 2) {
    /** @type {{ signal: SignalState, distance: number }[]} */
    const found = [];
    let first = true;
    this.network.walk(pos.track, pos.s, maxDistance, {
      onPiece: (piece, before) => {
        const t = this.network.track(piece.track);
        const list = this.byTrack.get(piece.track) ?? [];
        const a = t.u(piece.from);
        const b = t.u(piece.to);
        for (const sig of list) {
          const u = t.u(sig.s);
          if ((first ? u >= a - 1e-9 : u > a + 1e-9) && u <= b + 1e-9) {
            found.push({ signal: sig, distance: before + (u - a) });
            if (found.length >= limit) return true;
          }
        }
        first = false;
        return false;
      },
    });
    return found;
  }

  /**
   * The next signal ahead, or null.
   * @param {import('../route/network.js').TrackPos} pos
   * @param {number} [maxDistance]
   */
  nextSignalAhead(pos, maxDistance = 5000) {
    return this.signalsAhead(pos, maxDistance, 1)[0] ?? null;
  }

  /**
   * Hold or release a signal at danger for a named reason ("lc:Woodgate", "signaller").
   * @param {string} id
   * @param {string} reason
   * @param {boolean} on
   */
  hold(id, reason, on) {
    const sig = this.get(id);
    if (on) sig.held.add(reason);
    else sig.held.delete(reason);
  }
}
