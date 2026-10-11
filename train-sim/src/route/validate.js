import { Alignment } from './alignment.js';

const isNum = (/** @type {unknown} */ v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Check a route file and list every problem in plain English. Empty list = OK.
 * Runs in the browser (before loading) and in Node (tools/validate-route.mjs).
 * @param {any} data
 * @returns {string[]}
 */
export function validateRoute(data) {
  /** @type {string[]} */
  const errors = [];
  const check = (/** @type {unknown} */ ok, /** @type {string} */ message) => {
    if (!ok) errors.push(message);
  };
  if (!data || typeof data !== 'object') return ['Route file must contain a JSON object'];

  check(typeof data.id === 'string' && data.id, 'id: missing');
  check(typeof data.name === 'string' && data.name, 'name: missing');
  check(isNum(data.lineSpeedMph) && data.lineSpeedMph > 0, 'lineSpeedMph: must be a positive number');

  let length = 0;
  try {
    length = new Alignment(data.alignment?.points).length;
  } catch (err) {
    errors.push(`alignment.points: ${/** @type {Error} */ (err).message}`);
  }
  const onLine = (/** @type {unknown} */ s) => isNum(s) && /** @type {number} */ (s) >= 0 && /** @type {number} */ (s) <= length;

  /** @type {Map<string, any>} */
  const tracks = new Map();
  if (!Array.isArray(data.tracks) || data.tracks.length === 0) errors.push('tracks: need at least one track');
  for (const [i, t] of (data.tracks ?? []).entries()) {
    check(typeof t.id === 'string', `tracks[${i}].id: missing`);
    check(!tracks.has(t.id), `tracks[${i}].id: "${t.id}" is used twice`);
    check(isNum(t.offset), `tracks[${i}] (${t.id}).offset: must be a number`);
    check(t.dir === 1 || t.dir === -1, `tracks[${i}] (${t.id}).dir: must be 1 or -1`);
    tracks.set(t.id, t);
  }

  const checkSegments = (/** @type {string} */ name, /** @type {string} */ valueKey, /** @type {[number, number]} */ [min, max]) => {
    if (!Array.isArray(data[name])) {
      errors.push(`${name}: must be a list`);
      return;
    }
    for (const [i, seg] of data[name].entries()) {
      const where = `${name}[${i}]`;
      check(onLine(seg.from) && onLine(seg.to) && seg.to > seg.from, `${where}: needs 0 ≤ from < to ≤ ${Math.round(length)}`);
      check(isNum(seg[valueKey]) && seg[valueKey] >= min && seg[valueKey] <= max, `${where}.${valueKey}: must be between ${min} and ${max}`);
    }
  };
  checkSegments('gradients', 'permille', [-40, 40]); // steeper than 1 in 25 is a typo
  checkSegments('speedLimits', 'mph', [5, 125]);

  const knownTrack = (/** @type {string} */ id, /** @type {string} */ where) => {
    check(tracks.has(id), `${where}.track: unknown track "${id}"`);
    return tracks.get(id);
  };

  const signalIds = new Set();
  for (const [i, sig] of (data.signals ?? []).entries()) {
    const where = `signals[${i}] (${sig.id})`;
    check(typeof sig.id === 'string' && sig.id, `signals[${i}].id: missing`);
    check(!signalIds.has(sig.id), `${where}: id used twice`);
    signalIds.add(sig.id);
    knownTrack(sig.track, where);
    check(onLine(sig.position), `${where}.position: must be on the line (0..${Math.round(length)})`);
    check(sig.aspects === undefined || sig.aspects === '3' || sig.aspects === '4', `${where}.aspects: "3" or "4"`);
  }

  const platformIds = new Set();
  for (const [i, p] of (data.platforms ?? []).entries()) {
    const where = `platforms[${i}] (${p.id})`;
    check(typeof p.id === 'string' && !platformIds.has(p.id), `${where}.id: missing or used twice`);
    platformIds.add(p.id);
    knownTrack(p.track, where);
    check(onLine(p.from) && onLine(p.to) && p.to > p.from, `${where}: needs 0 ≤ from < to ≤ ${Math.round(length)}`);
    check(p.side === 'left' || p.side === 'right', `${where}.side: "left" or "right"`);
    for (const m of p.stopMarkers ?? []) {
      check(isNum(m.position) && m.position >= p.from && m.position <= p.to, `${where}: stop marker ${m.cars}-car is off the platform`);
    }
  }

  const player = data.trains?.player;
  if (!player) errors.push('trains.player: missing');
  else {
    knownTrack(player.track, 'trains.player');
    check(onLine(player.frontPosition), 'trains.player.frontPosition: must be on the line');
  }
  for (const [i, t] of (data.trains?.ai ?? []).entries()) {
    knownTrack(t.track, `trains.ai[${i}]`);
    check(onLine(t.frontPosition), `trains.ai[${i}].frontPosition: must be on the line`);
  }

  if (data.objective) {
    check(platformIds.has(data.objective.platform), `objective.platform: unknown platform "${data.objective.platform}"`);
  }
  return errors;
}
