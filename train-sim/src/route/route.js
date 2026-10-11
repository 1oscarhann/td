import { mphToMps } from '../core/units.js';
import { Alignment } from './alignment.js';
import { StepProfile } from './profile.js';
import { validateRoute } from './validate.js';

export class RouteError extends Error {
  /** @param {string[]} problems */
  constructor(problems) {
    super(`Route file has problems:\n- ${problems.join('\n- ')}`);
    this.problems = problems;
  }
}

/**
 * A route loaded from JSON (format: docs/ROUTE_FORMAT.md, files: public/data/routes).
 * Positions are chainage in metres from the start of the route.
 */
export class Route {
  /** @param {any} data parsed route JSON */
  constructor(data) {
    const problems = validateRoute(data);
    if (problems.length) throw new RouteError(problems);
    this.data = data;
    this.id = /** @type {string} */ (data.id);
    this.name = /** @type {string} */ (data.name);
    this.alignment = new Alignment(data.alignment.points);
    this.length = this.alignment.length;
    this.startElevationM = data.alignment.startElevationM ?? 0;
    this.gradients = new StepProfile(
      data.gradients.map((/** @type {any} */ g) => ({ from: g.from, to: g.to, value: g.permille })),
    );
    // The lowest limit wins where restrictions overlap; anywhere unlisted gets the line speed.
    this.speedLimits = new StepProfile(
      data.speedLimits.map((/** @type {any} */ l) => ({ from: l.from, to: l.to, value: mphToMps(l.mph) })),
      { defaultValue: mphToMps(data.lineSpeedMph), combine: Math.min },
    );
    /** @type {Map<string, { id: string, name?: string, offset: number, dir: 1 | -1, conductorRail?: 'left' | 'right' }>} */
    this.tracks = new Map(data.tracks.map((/** @type {any} */ t) => [t.id, t]));
  }

  /** @param {string} url */
  static async load(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Couldn't load route ${url} (HTTP ${res.status})`);
    return new Route(await res.json());
  }

  /** @param {string} trackId */
  track(trackId) {
    const t = this.tracks.get(trackId);
    if (!t) throw new Error(`Unknown track ${trackId}`);
    return t;
  }

  /**
   * Gradient in ‰, + = rising towards increasing chainage.
   * @param {number} s
   */
  gradientAt(s) {
    return this.gradients.valueAt(s);
  }

  /** @param {number} s */
  elevationAt(s) {
    return this.startElevationM + this.gradients.integral(s) / 1000;
  }

  /** @param {number} s @returns {number} m/s */
  speedLimitAt(s) {
    return this.speedLimits.valueAt(s);
  }

  /**
   * Lowest limit anywhere under a train. The rear has to clear a restriction before you can
   * speed up again, so the limit that matters is the lowest one between rear and front.
   * @param {number} a
   * @param {number} b
   * @returns {number} m/s
   */
  speedLimitOver(a, b) {
    return this.speedLimits.minBetween(a, b);
  }

  /** @param {string} trackId */
  signalsOnTrack(trackId) {
    const dir = this.track(trackId).dir;
    return (this.data.signals ?? [])
      .filter((/** @type {any} */ s) => s.track === trackId)
      .map((/** @type {any} */ s) => ({ ...s, dir }));
  }

  /** @param {string} trackId */
  platformsOnTrack(trackId) {
    return (this.data.platforms ?? []).filter((/** @type {any} */ p) => p.track === trackId);
  }

  /**
   * The platform a whole train is standing alongside, if any.
   * @param {string} trackId
   * @param {number} a one end of the train
   * @param {number} b the other end
   */
  platformAlongside(trackId, a, b) {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    return this.platformsOnTrack(trackId).find((/** @type {any} */ p) => p.from <= lo && hi <= p.to) ?? null;
  }
}
