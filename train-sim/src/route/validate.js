import { Alignment } from './alignment.js';

const isNum = (/** @type {unknown} */ v) => typeof v === 'number' && Number.isFinite(v);
const CLOCK = /^\d{1,2}:\d{2}(:\d{2})?$/;

/**
 * Check a route file (version 2: lines, tracks and points) and list every problem in plain
 * English. Empty list = OK. Runs in the browser and in Node (tools/validate-route.mjs).
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
  check(data.version === 2, 'version: must be 2 (lines/tracks/points format)');
  check(typeof data.id === 'string' && data.id, 'id: missing');
  check(typeof data.name === 'string' && data.name, 'name: missing');

  /** @type {Map<string, number>} line id → length */
  const lines = new Map();
  /** @type {Set<string>} "line/track" */
  const tracks = new Set();
  if (!Array.isArray(data.lines) || data.lines.length === 0) errors.push('lines: need at least one line');
  for (const [i, line] of (data.lines ?? []).entries()) {
    const where = `lines[${i}] (${line.id})`;
    check(typeof line.id === 'string' && !lines.has(line.id), `${where}.id: missing or used twice`);
    let length = 0;
    try {
      length = new Alignment(line.alignment?.points).length;
    } catch (err) {
      errors.push(`${where}.alignment.points: ${/** @type {Error} */ (err).message}`);
    }
    lines.set(line.id, length);
    check(isNum(line.lineSpeedMph) && line.lineSpeedMph > 0, `${where}.lineSpeedMph: must be a positive number`);
    const onLine = (/** @type {unknown} */ s) => isNum(s) && /** @type {number} */ (s) >= -1 && /** @type {number} */ (s) <= length + 1;
    for (const [name, key, [min, max]] of /** @type {[string, string, [number, number]][]} */ ([
      ['gradients', 'permille', [-40, 40]],
      ['speedLimits', 'mph', [5, 125]],
    ])) {
      for (const [j, seg] of (line[name] ?? []).entries()) {
        check(onLine(seg.from) && onLine(seg.to) && seg.to > seg.from, `${where}.${name}[${j}]: needs 0 ≤ from < to ≤ ${Math.round(length)}`);
        check(isNum(seg[key]) && seg[key] >= min && seg[key] <= max, `${where}.${name}[${j}].${key}: must be between ${min} and ${max}`);
      }
    }
    for (const end of ['start', 'end']) {
      const v = line.ends?.[end] ?? 'open';
      check(['open', 'buffers', 'junction'].includes(v), `${where}.ends.${end}: open, buffers or junction`);
    }
    for (const [j, t] of (line.tracks ?? []).entries()) {
      const key = `${line.id}/${t.id}`;
      check(typeof t.id === 'string' && !tracks.has(key), `${where}.tracks[${j}].id: missing or used twice`);
      check(isNum(t.offset), `${key}.offset: must be a number`);
      check(t.dir === 1 || t.dir === -1, `${key}.dir: must be 1 or -1`);
      tracks.add(key);
    }
  }

  const pos = (/** @type {any} */ p, /** @type {string} */ where) => {
    if (!p) {
      errors.push(`${where}: missing`);
      return;
    }
    const key = `${p.line}/${p.track}`;
    check(tracks.has(key), `${where}: unknown track "${key}"`);
    const len = lines.get(p.line) ?? 0;
    check(isNum(p.position) && p.position >= -1 && p.position <= len + 1, `${where}.position: must be on line ${p.line} (0..${Math.round(len)})`);
  };

  const pointIds = new Set();
  for (const [i, p] of (data.points ?? []).entries()) {
    const where = `points[${i}] (${p.id})`;
    check(typeof p.id === 'string' && !pointIds.has(p.id), `${where}.id: missing or used twice`);
    pointIds.add(p.id);
    check(p.type === 'facing' || p.type === 'trailing', `${where}.type: facing or trailing`);
    pos(p.at, `${where}.at`);
    pos(p.other, `${where}.other`);
    for (const key of p.crosses ?? []) {
      check(tracks.has(key) && key.split('/')[0] === p.at?.line, `${where}.crosses: "${key}" must be a track on line ${p.at?.line}`);
    }
  }

  const signalIds = new Set();
  for (const [i, sig] of (data.signals ?? []).entries()) {
    const where = `signals[${i}] (${sig.id})`;
    check(typeof sig.id === 'string' && sig.id, `signals[${i}].id: missing`);
    check(!signalIds.has(sig.id), `${where}: id used twice`);
    signalIds.add(sig.id);
    pos(sig, where);
    check(sig.aspects === undefined || sig.aspects === '3' || sig.aspects === '4', `${where}.aspects: "3" or "4"`);
    if (sig.feather) check(pointIds.has(sig.feather.points), `${where}.feather.points: unknown points "${sig.feather.points}"`);
  }

  const stationIds = new Set((data.stations ?? []).map((/** @type {any} */ s) => s.id));
  const platformIds = new Set();
  for (const [i, p] of (data.platforms ?? []).entries()) {
    const where = `platforms[${i}] (${p.id})`;
    check(typeof p.id === 'string' && !platformIds.has(p.id), `${where}.id: missing or used twice`);
    platformIds.add(p.id);
    check(tracks.has(`${p.line}/${p.track}`), `${where}: unknown track "${p.line}/${p.track}"`);
    check(isNum(p.from) && isNum(p.to) && p.to > p.from, `${where}: needs from < to`);
    check(p.side === 'left' || p.side === 'right', `${where}.side: "left" or "right"`);
    if (p.station) check(stationIds.has(p.station), `${where}.station: unknown station "${p.station}"`);
    for (const m of p.stopMarkers ?? []) {
      check(isNum(m.position) && m.position >= p.from - 0.5 && m.position <= p.to + 0.5, `${where}: stop marker ${m.cars}-car is off the platform`);
    }
  }

  for (const [i, lc] of (data.levelCrossings ?? []).entries()) {
    const where = `levelCrossings[${i}] (${lc.id})`;
    check(lines.has(lc.line), `${where}.line: unknown line "${lc.line}"`);
    check(['MCB', 'AHB', 'FP', 'BW', 'UWC'].includes(lc.type), `${where}.type: MCB, AHB, FP, BW or UWC`);
    check(isNum(lc.position), `${where}.position: must be a number`);
  }

  if (!Array.isArray(data.services) || data.services.length === 0) errors.push('services: need at least one drivable service');
  for (const [i, s] of (data.services ?? []).entries()) {
    const where = `services[${i}] (${s.id})`;
    check(Array.isArray(s.calls) && s.calls.length >= 2, `${where}.calls: need an origin and a destination`);
    for (const [j, c] of (s.calls ?? []).entries()) {
      check(platformIds.has(c.platform), `${where}.calls[${j}].platform: unknown platform "${c.platform}"`);
      if (c.arr !== undefined) check(CLOCK.test(c.arr), `${where}.calls[${j}].arr: "HH:MM:SS"`);
      if (c.dep !== undefined) check(CLOCK.test(c.dep), `${where}.calls[${j}].dep: "HH:MM:SS"`);
    }
    for (const id of Object.keys(s.plan ?? {})) check(pointIds.has(id), `${where}.plan: unknown points "${id}"`);
  }

  for (const [i, t] of (data.traffic ?? []).entries()) {
    const where = `traffic[${i}] (${t.id})`;
    pos(t.entry, `${where}.entry`);
    for (const c of t.calls ?? []) check(platformIds.has(c.platform), `${where}: unknown platform "${c.platform}"`);
    for (const id of Object.keys(t.plan ?? {})) check(pointIds.has(id), `${where}.plan: unknown points "${id}"`);
  }
  return errors;
}
