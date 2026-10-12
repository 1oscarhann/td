import { mphToMps, mpsToMph } from '../core/units.js';

/** AWS magnets sit this far before their signal (UK standard 180 m, about 200 yards). */
export const AWS_MAGNET_DISTANCE_M = 180;
/** TPWS overspeed sensor distance before a signal (A). */
export const OSS_SIGNAL_M = 150;
/** TPWS overspeed sensor distance before a speed restriction (A). */
export const OSS_PSR_M = 300;
/** Whistle boards stand this far before footpath crossings (A). */
export const WHISTLE_BOARD_M = 320;

/**
 * @typedef {object} TracksideItem
 * @property {'aws' | 'tss' | 'oss' | 'speed' | 'warning' | 'whistle' | 'crossing'} kind
 * @property {string} track
 * @property {number} s
 * @property {string} [signalId] for signal equipment
 * @property {boolean} [psr] AWS for a speed restriction: always sounds the horn
 * @property {number} [setSpeed] OSS: trips above this speed (m/s)
 * @property {number} [mph] boards: the figure shown
 * @property {'left' | 'right' | null} [diverging] speed board that applies to a diverging route only
 * @property {string} [pointsId] diverging boards: which points
 * @property {string} [crossingId]
 */

/**
 * TPWS overspeed set speed at a red signal: the speed from which the emergency brake still stops
 * the train within the overlap (A: assumes 1 m/s² achieved, 60 % of a 180 m overlap).
 * @param {number} distance OSS to signal (m)
 */
export function signalOssSetSpeed(distance) {
  return Math.sqrt(2 * 1.0 * (distance + 0.6 * 180));
}

/**
 * TPWS overspeed set speed on the approach to a speed restriction: a margin above the restricted
 * speed, plus what the brakes can take off before the restriction (A).
 * @param {number} limit restricted speed (m/s)
 * @param {number} distance OSS to restriction (m)
 */
export function psrOssSetSpeed(limit, distance) {
  const margin = limit * 1.1 + mphToMps(5);
  return Math.sqrt(margin * margin + 2 * 0.9 * distance);
}

/**
 * Warning board distance for a speed reduction: braking from `from` to `to` at a gentle
 * 0.45 m/s², plus 100 m to see it and react.
 * @param {number} from m/s
 * @param {number} to m/s
 */
export function warningDistance(from, to) {
  return (from * from - to * to) / (2 * 0.45) + 100;
}

/**
 * Work out the trackside equipment from the route: AWS and TPWS for every signal, permanent
 * speed indicators at every change of limit, warning boards (with an AWS magnet and a TPWS
 * overspeed sensor) where the limit drops by a third or more, and whistle boards before
 * footpath crossings.
 *
 * @param {import('../route/network.js').Network} network
 * @param {import('../signals/signalling.js').Signalling} signalling
 * @param {any[]} crossings level crossing defs from the route
 * @returns {Map<string, TracksideItem[]>} per track, sorted in travel order
 */
export function buildTrackside(network, signalling, crossings = []) {
  /** @type {Map<string, TracksideItem[]>} */
  const byTrack = new Map();
  const add = (/** @type {TracksideItem} */ item) => {
    const t = network.track(item.track);
    // Equipment that would fall off the end of a line is simply left out.
    if (item.s < -1 || item.s > t.line.length + 1) return;
    const list = byTrack.get(item.track) ?? [];
    list.push(item);
    byTrack.set(item.track, list);
  };

  for (const sig of signalling.signals.values()) {
    const t = network.track(sig.key);
    if (sig.aws !== false) add({ kind: 'aws', track: sig.key, s: sig.s - t.dir * AWS_MAGNET_DISTANCE_M, signalId: sig.id });
    if (sig.tpws !== false) {
      add({ kind: 'tss', track: sig.key, s: sig.s, signalId: sig.id });
      add({ kind: 'oss', track: sig.key, s: sig.s - t.dir * OSS_SIGNAL_M, signalId: sig.id, setSpeed: signalOssSetSpeed(OSS_SIGNAL_M) });
    }
  }

  for (const t of network.tracks.values()) {
    const profile = t.line.speedLimits;
    let s = t.entryS;
    let before = profile.valueAt(s + t.dir * 1e-6);
    for (let i = 0; i < 500; i++) {
      const ch = profile.nextChange(s, t.dir);
      if (!ch || t.u(ch.position) > t.u(t.exitS)) break;
      const after = ch.value;
      if (after !== before) {
        add({ kind: 'speed', track: t.key, s: ch.position, mph: Math.round(mpsToMph(after)) });
        if (after < before * (2 / 3) + 0.01) {
          const warn = warningDistance(before, after);
          add({ kind: 'warning', track: t.key, s: ch.position - t.dir * warn, mph: Math.round(mpsToMph(after)) });
          add({ kind: 'aws', track: t.key, s: ch.position - t.dir * warn, psr: true });
          add({ kind: 'oss', track: t.key, s: ch.position - t.dir * OSS_PSR_M, setSpeed: psrOssSetSpeed(after, OSS_PSR_M) });
        }
      }
      before = after;
      s = ch.position + t.dir * 1e-6;
    }

    // Diverging routes: a speed board at the facing points, for the branch's limit.
    for (const p of t.facing) {
      const branch = network.track(p.other.track);
      const branchLimit = branch.line.speedLimits.valueAt(p.other.s + branch.dir * 1e-6);
      const mainLimit = profile.valueAt(p.at.s);
      if (branchLimit < mainLimit) {
        const side = divergingSide(network, p);
        add({ kind: 'speed', track: t.key, s: p.at.s - t.dir * 20, mph: Math.round(mpsToMph(branchLimit)), diverging: side, pointsId: p.id });
      }
    }
  }

  for (const lc of crossings) {
    for (const t of network.tracks.values()) {
      if (t.line.id !== lc.line) continue;
      add({ kind: 'crossing', track: t.key, s: lc.position, crossingId: lc.id });
      if (lc.whistle) add({ kind: 'whistle', track: t.key, s: lc.position - t.dir * WHISTLE_BOARD_M, crossingId: lc.id });
    }
  }

  for (const [key, list] of byTrack) {
    const t = network.track(key);
    list.sort((a, b) => t.u(a.s) - t.u(b.s));
  }
  return byTrack;
}

/**
 * Which side a diverging route goes, seen from the train: compare the branch heading a little way
 * past the points with the main line heading.
 * @param {import('../route/network.js').Network} network
 * @param {import('../route/network.js').Points} p
 * @returns {'left' | 'right'}
 */
export function divergingSide(network, p) {
  const main = network.track(p.at.track);
  const branch = network.track(p.other.track);
  const a = main.line.alignment.pointAt(p.at.s);
  const b = branch.line.alignment.pointAt(p.other.s + branch.dir * 150);
  // Main direction of travel, as a map vector.
  const dx = a.tx * main.dir;
  const dy = a.ty * main.dir;
  const cross = dx * (b.y - a.y) - dy * (b.x - a.x);
  return cross > 0 ? 'left' : 'right';
}

/**
 * Items on a stretch of track (from, to], in travel order.
 * @param {Map<string, TracksideItem[]>} byTrack
 * @param {import('../route/network.js').Network} network
 * @param {import('../route/network.js').Piece} piece
 */
export function itemsIn(byTrack, network, piece) {
  const list = byTrack.get(piece.track);
  if (!list) return [];
  const t = network.track(piece.track);
  const a = t.u(piece.from);
  const b = t.u(piece.to);
  return list.filter((item) => {
    const u = t.u(item.s);
    return u > a + 1e-9 && u <= b + 1e-9;
  });
}
