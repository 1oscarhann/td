import { Network } from './network.js';
import { validateRoute } from './validate.js';

export class RouteError extends Error {
  /** @param {string[]} problems */
  constructor(problems) {
    super(`Route file has problems:\n- ${problems.slice(0, 20).join('\n- ')}${problems.length > 20 ? `\n…and ${problems.length - 20} more` : ''}`);
    this.problems = problems;
  }
}

/**
 * A route loaded from JSON (format: docs/ROUTE_FORMAT.md, files: public/data/routes): the track
 * network plus stations, platforms, signals, level crossings, services and scenery.
 */
export class Route {
  /**
   * @param {any} data parsed route JSON
   * @param {string} [baseUrl] where to load companion files (terrain, buildings) from
   */
  constructor(data, baseUrl = '') {
    const problems = validateRoute(data);
    if (problems.length) throw new RouteError(problems);
    this.data = data;
    this.baseUrl = baseUrl;
    this.id = /** @type {string} */ (data.id);
    this.name = /** @type {string} */ (data.name);
    this.network = new Network(data);
    /** @type {Map<string, any>} */
    this.platforms = new Map((data.platforms ?? []).map((/** @type {any} */ p) => [p.id, p]));
    /** @type {Map<string, any>} */
    this.stations = new Map((data.stations ?? []).map((/** @type {any} */ s) => [s.id, s]));
    /** @type {any[]} */
    this.services = data.services;
  }

  /** @param {string} url */
  static async load(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Couldn't load route ${url} (HTTP ${res.status})`);
    return new Route(await res.json(), new URL('.', url).href);
  }

  /** @param {string} id */
  service(id) {
    const s = this.services.find((x) => x.id === id);
    if (!s) throw new Error(`Unknown service ${id}`);
    return s;
  }

  /** @param {string} id */
  platform(id) {
    const p = this.platforms.get(id);
    if (!p) throw new Error(`Unknown platform ${id}`);
    return p;
  }

  /**
   * Where the front of a train of `cars` cars stops at a platform: its stop marker, or just short
   * of the far end if there isn't one for that length.
   * @param {string} platformId
   * @param {number} cars
   * @returns {import('./network.js').TrackPos}
   */
  stopFor(platformId, cars) {
    const p = this.platform(platformId);
    const track = this.network.track(`${p.line}/${p.track}`);
    const markers = p.stopMarkers ?? [];
    const exact = markers.find((/** @type {any} */ m) => m.cars === cars);
    const fallback = markers.find((/** @type {any} */ m) => m.cars >= cars);
    const s = (exact ?? fallback)?.position ?? (track.dir > 0 ? p.to - 5 : p.from + 5);
    return { track: track.key, s };
  }

  /** Display name of a station id. @param {string} id */
  stationName(id) {
    return this.stations.get(id)?.name ?? id;
  }
}
