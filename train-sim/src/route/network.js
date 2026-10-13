import { mphToMps } from '../core/units.js';
import { Alignment } from './alignment.js';
import { StepProfile } from './profile.js';

/**
 * The railway as a network of lines, tracks and points.
 *
 * - A **line** is a route on the map with its own chainage (metres from its start), alignment,
 *   gradients and speed limits. The main line runs Chichester → Ford → Arundel → Amberley; branches
 *   (Bognor Regis, Littlehampton, the coast line east of Arundel Junction) start at their junction.
 * - A **track** is one running line on a line ("main/UP"). UK double track is worked one way per
 *   track, so every track has a travel direction: dir +1 runs towards increasing chainage.
 * - **Points** join tracks. Facing points (met head-on) choose a way: normal = stay on this track,
 *   reverse = turn onto the branch. Trailing points are where a branch track joins: to come off the
 *   branch they must be reverse; to run along the main track past them they must be normal.
 *
 * Everything that moves (trains, signal sections, look-ahead) uses `walk()` to follow the tracks.
 */

/** @param {string} line @param {string} track */
export const trackKey = (line, track) => `${line}/${track}`;

/**
 * @typedef {object} TrackPos
 * @property {string} track track key, e.g. "main/UP"
 * @property {number} s chainage on that track's line
 */

/**
 * @typedef {object} Piece a stretch of one track, in travel order: from → to
 * @property {string} track
 * @property {number} from
 * @property {number} to
 */

export class Line {
  /** @param {any} data */
  constructor(data) {
    this.id = /** @type {string} */ (data.id);
    this.name = data.name ?? data.id;
    this.data = data;
    this.alignment = new Alignment(data.alignment.points);
    this.length = this.alignment.length;
    this.startElevationM = data.alignment.startElevationM ?? 0;
    this.gradients = new StepProfile((data.gradients ?? []).map((/** @type {any} */ g) => ({ from: g.from, to: g.to, value: g.permille })));
    this.lineSpeed = mphToMps(data.lineSpeedMph ?? 75);
    this.speedLimits = new StepProfile(
      (data.speedLimits ?? []).map((/** @type {any} */ l) => ({ from: l.from, to: l.to, value: mphToMps(l.mph) })),
      { defaultValue: this.lineSpeed, combine: Math.min },
    );
    /** @type {{ start: 'open' | 'buffers' | 'junction', end: 'open' | 'buffers' | 'junction' }} */
    this.ends = { start: data.ends?.start ?? 'open', end: data.ends?.end ?? 'open' };
  }

  /** @param {number} s */
  elevationAt(s) {
    return this.startElevationM + this.gradients.integral(s) / 1000;
  }

  /** @param {number} s gradient in ‰, + rising towards increasing chainage */
  gradientAt(s) {
    return this.gradients.valueAt(s);
  }
}

export class Track {
  /**
   * @param {Line} line
   * @param {any} data
   */
  constructor(line, data) {
    this.line = line;
    this.id = /** @type {string} */ (data.id);
    this.key = trackKey(line.id, this.id);
    this.name = data.name ?? this.key;
    this.offset = /** @type {number} */ (data.offset);
    /** @type {1 | -1} */
    this.dir = data.dir;
    this.conductorRail = data.conductorRail ?? 'right';
    /** @type {Points[]} facing points where trains on this track can turn off */
    this.facing = [];
    /** @type {Points[]} trailing points where another track joins this one */
    this.merges = [];
    /** @type {Points | null} trailing points this track runs into at its far end */
    this.exitPoints = null;
    /** @type {Points | null} facing points this track starts from (a branch's first metres) */
    this.entryPoints = null;
  }

  /** Chainage where trains enter this track (its travel start). */
  get entryS() {
    return this.dir > 0 ? 0 : this.line.length;
  }

  /** Chainage where trains leave it (its travel end). */
  get exitS() {
    return this.dir > 0 ? this.line.length : 0;
  }

  /** What's at the travel end: open line, buffer stops, or a junction. */
  get exitType() {
    return this.dir > 0 ? this.line.ends.end : this.line.ends.start;
  }

  /** What's at the travel start. */
  get entryType() {
    return this.dir > 0 ? this.line.ends.start : this.line.ends.end;
  }

  /**
   * Distance along the direction of travel. Lets one piece of code handle both directions.
   * @param {number} s
   */
  u(s) {
    return this.dir * s;
  }
}

export class Points {
  /** @param {any} data */
  constructor(data) {
    this.id = /** @type {string} */ (data.id);
    this.name = data.name ?? data.id;
    this.junction = data.junction ?? '';
    /** @type {'facing' | 'trailing'} */
    this.type = data.type;
    /** Facing: where trains on `at.track` choose. Trailing: where the branch joins `at.track`. */
    this.at = /** @type {TrackPos} */ ({ track: trackKey(data.at.line, data.at.track), s: data.at.position });
    /** Facing: where reverse leads. Trailing: the track (and its end) that joins here. */
    this.other = /** @type {TrackPos} */ ({ track: trackKey(data.other.line, data.other.track), s: data.other.position });
    /** @type {'N' | 'R'} */
    this.initial = data.initial ?? 'N';
    /** @type {'N' | 'R'} current position, as detected */
    this.state = this.initial;
    /** @type {'N' | 'R' | null} where it's moving to, if moving */
    this.moving = null;
    this.movingUntil = 0;
    /** Which train (by id) the signaller set it for. */
    this.setFor = /** @type {string | null} */ (null);
    /**
     * Tracks the reverse route crosses on the flat (a diamond), at the same chainage as `at`:
     * a train taking it cuts across the other line, so the two can't both be signalled.
     * @type {TrackPos[]}
     */
    this.diamonds = (data.crosses ?? []).map((/** @type {string} */ key) => ({ track: key, s: data.at.position }));
  }

  get detected() {
    return this.moving === null;
  }
}

/**
 * @typedef {object} WalkOptions
 * @property {(p: Points) => 'N' | 'R'} [decide] how to take facing points (default: as they lie)
 * @property {(piece: Piece, walkedBefore: number) => boolean | void} [onPiece] return true to stop
 * @property {(p: Points, required: 'N' | 'R', distance: number) => void} [onPoints]
 */

/**
 * @typedef {object} WalkResult
 * @property {string} track
 * @property {number} s
 * @property {number} walked
 * @property {null | 'open' | 'buffers'} end what stopped the walk early, if anything
 * @property {boolean} stopped onPiece asked to stop
 */

export class Network {
  /** @param {any} data route JSON (version 2) */
  constructor(data) {
    /** @type {Map<string, Line>} */
    this.lines = new Map();
    /** @type {Map<string, Track>} */
    this.tracks = new Map();
    for (const lineData of data.lines) {
      const line = new Line(lineData);
      this.lines.set(line.id, line);
      for (const t of lineData.tracks) {
        const track = new Track(line, t);
        this.tracks.set(track.key, track);
      }
    }
    /** @type {Map<string, Points>} */
    this.points = new Map();
    for (const p of data.points ?? []) {
      const points = new Points(p);
      this.points.set(points.id, points);
      const at = this.track(points.at.track);
      const other = this.track(points.other.track);
      if (points.type === 'facing') {
        at.facing.push(points);
        other.entryPoints = points;
      } else {
        at.merges.push(points);
        other.exitPoints = points;
      }
    }
    /** @type {Map<string, { points: Points, s: number }[]>} diamonds on each track */
    this.diamonds = new Map();
    for (const p of this.points.values()) {
      for (const d of p.diamonds) {
        const crossed = this.track(d.track);
        if (crossed.line !== this.track(p.at.track).line) throw new Error(`Points ${p.id}: a diamond must be on the same line as the points`);
        this.diamonds.set(d.track, [...(this.diamonds.get(d.track) ?? []), { points: p, s: d.s }]);
      }
    }
    for (const t of this.tracks.values()) {
      t.facing.sort((a, b) => t.u(a.at.s) - t.u(b.at.s));
      t.merges.sort((a, b) => t.u(a.at.s) - t.u(b.at.s));
    }
    /** Bumped whenever any points finish moving, so cached routes can be recomputed. */
    this.version = 0;
  }

  /** Put every set of points back to how the route file has it (for a fresh run). */
  reset() {
    for (const p of this.points.values()) {
      p.state = p.initial;
      p.moving = null;
      p.movingUntil = 0;
      p.setFor = null;
    }
    this.version++;
  }

  /** @param {string} key */
  track(key) {
    const t = this.tracks.get(key);
    if (!t) throw new Error(`Unknown track ${key}`);
    return t;
  }

  /** @param {string} id */
  line(id) {
    const l = this.lines.get(id);
    if (!l) throw new Error(`Unknown line ${id}`);
    return l;
  }

  /**
   * The nearest thing strictly ahead of travel coordinate u0 on a track: facing points, a
   * trailing junction, or the end of the track.
   * @param {Track} track
   * @param {number} u0
   * @returns {{ u: number, kind: 'facing' | 'merge' | 'exit', points?: Points }}
   */
  nextEvent(track, u0) {
    const ahead = (/** @type {Points} */ p) => track.u(p.at.s) > u0 + 1e-9;
    const facing = track.facing.find(ahead);
    const merge = track.merges.find(ahead);
    /** @type {{ u: number, kind: 'facing' | 'merge' | 'exit', points?: Points }} */
    let next = { u: Math.max(u0, track.u(track.exitS)), kind: 'exit' };
    if (facing && track.u(facing.at.s) < next.u) next = { u: track.u(facing.at.s), kind: 'facing', points: facing };
    if (merge && track.u(merge.at.s) < next.u) next = { u: track.u(merge.at.s), kind: 'merge', points: merge };
    return next;
  }

  /**
   * Follow the tracks forward from a position for `distance` metres.
   * @param {string} key
   * @param {number} s
   * @param {number} distance
   * @param {WalkOptions} [opts]
   * @returns {WalkResult}
   */
  walk(key, s, distance, { decide = (p) => p.state, onPiece, onPoints } = {}) {
    let track = this.track(key);
    let pos = s;
    let remaining = Math.max(0, distance);
    let walked = 0;
    for (let guard = 0; guard < 1000; guard++) {
      const u0 = track.u(pos);
      const next = this.nextEvent(track, u0);
      const gap = next.u - u0;
      if (gap > remaining) {
        const to = pos + track.dir * remaining;
        const stop = onPiece?.({ track: track.key, from: pos, to }, walked);
        return { track: track.key, s: to, walked: walked + remaining, end: null, stopped: !!stop };
      }
      const to = track.dir * next.u;
      if (gap > 0 && onPiece?.({ track: track.key, from: pos, to }, walked)) {
        return { track: track.key, s: to, walked: walked + gap, end: null, stopped: true };
      }
      walked += gap;
      remaining -= gap;
      pos = to;
      if (next.kind === 'facing') {
        const p = /** @type {Points} */ (next.points);
        const way = decide(p);
        onPoints?.(p, way, walked);
        if (way === 'R') {
          track = this.track(p.other.track);
          pos = p.other.s;
        }
      } else if (next.kind === 'merge') {
        onPoints?.(/** @type {Points} */ (next.points), 'N', walked);
      } else if (track.exitType === 'junction' && track.exitPoints) {
        const p = track.exitPoints;
        onPoints?.(p, 'R', walked);
        track = this.track(p.at.track);
        pos = p.at.s;
      } else {
        return { track: track.key, s: pos, walked, end: track.exitType === 'buffers' ? 'buffers' : 'open', stopped: false };
      }
    }
    throw new Error('Network.walk: too many steps (a loop in the track data?)');
  }

  /**
   * Distance along the tracks from one position to another, following the points as set (or as
   * `decide` says). Null if `to` isn't reached within `max` metres.
   * @param {TrackPos} from
   * @param {TrackPos} to
   * @param {number} max
   * @param {WalkOptions['decide']} [decide]
   */
  distanceTo(from, to, max, decide) {
    if (from.track === to.track) {
      const t = this.track(from.track);
      const d = t.u(to.s) - t.u(from.s);
      if (d >= 0 && d <= max && !t.facing.some((p) => t.u(p.at.s) > t.u(from.s) && t.u(p.at.s) < t.u(to.s) && (decide ?? ((q) => q.state))(p) === 'R')) {
        return d;
      }
    }
    /** @type {number | null} */
    let found = null;
    this.walk(from.track, from.s, max, {
      decide,
      onPiece: (piece, before) => {
        if (piece.track !== to.track) return false;
        const t = this.track(piece.track);
        const a = t.u(piece.from);
        const b = t.u(piece.to);
        const u = t.u(to.s);
        if (u >= a - 1e-9 && u <= b + 1e-9) {
          found = before + (u - a);
          return true;
        }
        return false;
      },
    });
    return found;
  }

  /**
   * Speed limit (m/s) at a position.
   * @param {TrackPos} pos
   */
  speedLimitAt(pos) {
    return this.track(pos.track).line.speedLimits.valueAt(pos.s);
  }

  /**
   * Gradient (‰) in the direction of travel.
   * @param {TrackPos} pos
   */
  gradientAt(pos) {
    const t = this.track(pos.track);
    return t.dir * t.line.gradientAt(pos.s);
  }

  /**
   * Lowest speed limit across some pieces of track (e.g. under a whole train).
   * @param {Piece[]} pieces
   */
  speedLimitOver(pieces) {
    let min = Infinity;
    for (const p of pieces) min = Math.min(min, this.track(p.track).line.speedLimits.minBetween(p.from, p.to));
    return min;
  }

  /**
   * The next place ahead where the speed limit changes, following the current points.
   * @param {TrackPos} pos
   * @param {number} lookahead metres
   * @returns {{ distance: number, value: number } | null}
   */
  nextSpeedChange(pos, lookahead) {
    let current = this.speedLimitAt(pos);
    /** @type {{ distance: number, value: number } | null} */
    let found = null;
    this.walk(pos.track, pos.s, lookahead, {
      onPiece: (piece, before) => {
        const t = this.track(piece.track);
        const profile = t.line.speedLimits;
        // After a junction the new line's limit applies from the first metre.
        const atStart = profile.valueAt(piece.from + t.dir * 1e-6);
        if (atStart !== current) {
          found = { distance: before, value: atStart };
          return true;
        }
        let s = piece.from;
        for (let i = 0; i < 100; i++) {
          const ch = profile.nextChange(s, t.dir);
          if (!ch || t.u(ch.position) > t.u(piece.to) + 1e-9) return false;
          if (ch.value !== current) {
            found = { distance: before + Math.abs(ch.position - piece.from), value: ch.value };
            return true;
          }
          s = ch.position + t.dir * 1e-6;
        }
        return false;
      },
    });
    return found;
  }
}
