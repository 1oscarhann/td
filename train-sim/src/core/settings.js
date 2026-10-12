/**
 * Player settings and best scores, saved in localStorage via the store.
 */

/**
 * @typedef {object} Settings
 * @property {number} version
 * @property {'mph' | 'kmh'} speedUnits UK railways use mph; km/h is there if you prefer it
 * @property {'hold' | 'vigilance' | 'off'} dsdMode how the dead man's handle works (see safety/dsd.js)
 * @property {number} volume 0..1
 * @property {boolean} assistOverlay show next signal, gradient and stopping info (stands in for route knowledge)
 * @property {boolean} cameraSway gentle cab movement
 * @property {boolean} signalGlow keep distant signal lamps readable (see render/signalMesh.js)
 * @property {number} fov vertical field of view in degrees
 * @property {boolean} spadEndsRun passing a red signal ends the run, as it would a real driver's shift
 * @property {'off' | 'rare' | 'normal' | 'frequent'} failures random signal/crossing failures and trespassers
 * @property {boolean} announcements on-train PA announcements (speech)
 * @property {Record<string, string[]>} bindings keyboard bindings that differ from the defaults
 */

/** @type {Readonly<Settings>} */
export const DEFAULT_SETTINGS = Object.freeze({
  version: 1,
  speedUnits: 'mph',
  dsdMode: 'hold',
  volume: 0.7,
  assistOverlay: true,
  cameraSway: true,
  signalGlow: true,
  fov: 50,
  spadEndsRun: false,
  failures: 'rare',
  announcements: true,
  bindings: {},
});

export const SETTING_CHOICES = Object.freeze({
  speedUnits: ['mph', 'kmh'],
  dsdMode: ['hold', 'vigilance', 'off'],
  failures: ['off', 'rare', 'normal', 'frequent'],
});

/**
 * Merge whatever was saved with the defaults, dropping anything invalid.
 * @param {unknown} raw
 * @returns {Settings}
 */
export function sanitizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return s;
  const r = /** @type {Record<string, unknown>} */ (raw);
  for (const [key, choices] of Object.entries(SETTING_CHOICES)) {
    if (choices.includes(/** @type {string} */ (r[key]))) s[key] = r[key];
  }
  for (const key of ['assistOverlay', 'cameraSway', 'signalGlow', 'spadEndsRun', 'announcements']) {
    if (typeof r[key] === 'boolean') s[key] = r[key];
  }
  if (typeof r.volume === 'number' && r.volume >= 0 && r.volume <= 1) s.volume = r.volume;
  if (typeof r.fov === 'number' && r.fov >= 40 && r.fov <= 90) s.fov = r.fov;
  if (r.bindings && typeof r.bindings === 'object') {
    /** @type {Record<string, string[]>} */
    const b = {};
    for (const [action, codes] of Object.entries(r.bindings)) {
      if (Array.isArray(codes) && codes.every((c) => typeof c === 'string')) b[action] = codes.slice(0, 3);
    }
    s.bindings = b;
  }
  return s;
}

/** @param {import('./storage.js').Store} store */
export function loadSettings(store) {
  return sanitizeSettings(store.load('settings', null));
}

/**
 * @param {import('./storage.js').Store} store
 * @param {Settings} settings
 */
export function saveSettings(store, settings) {
  return store.save('settings', settings);
}

/**
 * @typedef {object} ScoreEntry
 * @property {number} score
 * @property {string} date ISO timestamp
 * @property {number} timeS run time in sim seconds
 * @property {number} stopErrorM
 */

/**
 * @param {import('./storage.js').Store} store
 * @param {string} routeId
 * @returns {ScoreEntry[]}
 */
export function loadScores(store, routeId) {
  const all = store.load('scores', {});
  const list = all && typeof all === 'object' ? all[routeId] : null;
  return Array.isArray(list) ? list : [];
}

/**
 * Add a score and keep the best `keep`.
 * @param {import('./storage.js').Store} store
 * @param {string} routeId
 * @param {ScoreEntry} entry
 * @param {number} [keep]
 * @returns {{ scores: ScoreEntry[], rank: number }} rank is 1-based, 0 if it didn't make the list
 */
export function recordScore(store, routeId, entry, keep = 10) {
  const all = store.load('scores', {});
  const safe = all && typeof all === 'object' ? all : {};
  const list = [...(Array.isArray(safe[routeId]) ? safe[routeId] : []), entry]
    .sort((a, b) => b.score - a.score)
    .slice(0, keep);
  store.save('scores', { ...safe, [routeId]: list });
  return { scores: list, rank: list.indexOf(entry) + 1 };
}
