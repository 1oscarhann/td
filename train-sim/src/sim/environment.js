/**
 * Weather, season, time of day and how slippery the rails are.
 */

/** @typedef {'clear' | 'overcast' | 'rain' | 'fog'} Weather */
/** @typedef {'spring' | 'summer' | 'autumn' | 'winter'} Season */

/**
 * Wheel–rail adhesion (μ) by weather (A: typical published ranges; dry steel is 0.25–0.35,
 * wet 0.10–0.15, leaf contamination can fall below 0.05).
 */
export const ADHESION = Object.freeze({ clear: 0.25, overcast: 0.22, fog: 0.15, rain: 0.12 });
export const LEAF_ADHESION = Object.freeze({ dry: 0.06, wet: 0.035 });

export const WEATHER_INFO = Object.freeze({
  clear: { name: 'Clear', fogNear: 600, fogFar: 7000, cloud: 0.1 },
  overcast: { name: 'Overcast', fogNear: 400, fogFar: 4500, cloud: 0.7 },
  rain: { name: 'Rain', fogNear: 150, fogFar: 2200, cloud: 0.9 },
  fog: { name: 'Fog', fogNear: 20, fogFar: 450, cloud: 0.8 },
});

/** Solar declination by season (degrees), roughly. */
const DECLINATION = Object.freeze({ winter: -20, spring: 2, summer: 22, autumn: -6 });
const LATITUDE = 50.84;

export class Environment {
  /**
   * @param {object} [o]
   * @param {Weather} [o.weather]
   * @param {Season} [o.season]
   * @param {{ line: string, from: number, to: number }[]} [o.leafZones] tree-lined stretches (slippery in autumn)
   */
  constructor({ weather = 'clear', season = 'summer', leafZones = [] } = {}) {
    this.weather = weather;
    this.season = season;
    this.leafZones = leafZones;
  }

  get wet() {
    return this.weather === 'rain' || this.weather === 'fog';
  }

  /**
   * μ at a position.
   * @param {import('../route/network.js').TrackPos} pos
   * @param {import('../route/network.js').Network} network
   */
  adhesionAt(pos, network) {
    let mu = ADHESION[this.weather];
    if (this.season === 'autumn') {
      const line = network.track(pos.track).line.id;
      if (this.leafZones.some((z) => z.line === line && pos.s >= z.from && pos.s <= z.to)) {
        mu = Math.min(mu, this.wet ? LEAF_ADHESION.wet : LEAF_ADHESION.dry);
      }
    }
    return mu;
  }

  /**
   * Sun height above the horizon in degrees. Clock time is local; British Summer Time from spring
   * to autumn moves solar noon to about 13:00.
   * @param {number} clock seconds since midnight
   */
  sunElevation(clock) {
    const noon = this.season === 'winter' ? 12 : 13;
    const hourAngle = ((clock / 3600 - noon) * 15 * Math.PI) / 180;
    const dec = (DECLINATION[this.season] * Math.PI) / 180;
    const lat = (LATITUDE * Math.PI) / 180;
    const sin = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(hourAngle);
    return (Math.asin(sin) * 180) / Math.PI;
  }

  /**
   * Sun direction as a unit vector in map terms (x east, y north, z up).
   * @param {number} clock
   */
  sunDirection(clock) {
    const elev = (this.sunElevation(clock) * Math.PI) / 180;
    const noon = this.season === 'winter' ? 12 : 13;
    // Azimuth swings from east (morning) through south (noon) to west.
    const az = Math.PI + ((clock / 3600 - noon) / 12) * Math.PI; // radians clockwise from north
    return { x: Math.sin(az) * Math.cos(elev), y: Math.cos(az) * Math.cos(elev), z: Math.sin(elev) };
  }

  /**
   * 0 at night, 1 in full daylight, smooth through twilight.
   * @param {number} clock
   */
  daylight(clock) {
    const e = this.sunElevation(clock);
    return Math.min(1, Math.max(0, (e + 6) / 16));
  }

  /** @param {number} clock */
  isNight(clock) {
    return this.daylight(clock) < 0.25;
  }
}

/**
 * Sound the horn at whistle boards between 07:00 and 23:00; at night there's a quiet period (UK
 * Rule Book) unless someone's on the line.
 * @param {number} clock
 */
export function hornQuietPeriod(clock) {
  const h = (clock / 3600) % 24;
  return h >= 23 || h < 7;
}
