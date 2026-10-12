/**
 * Elevation lookups from the cached terrain tiles (terrarium encoding:
 * height = R × 256 + G + B / 256 − 32768 metres).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';

export class Dem {
  /**
   * @param {string} dir tile cache folder
   * @param {number} zoom
   */
  constructor(dir, zoom) {
    this.dir = dir;
    this.zoom = zoom;
    /** @type {Map<string, Float32Array | null>} */
    this.tiles = new Map();
    this.n = 2 ** zoom;
  }

  /** @param {number} x @param {number} y */
  tile(x, y) {
    const key = `${x}/${y}`;
    if (!this.tiles.has(key)) {
      const file = join(this.dir, `${this.zoom}-${x}-${y}.png`);
      if (!existsSync(file)) {
        this.tiles.set(key, null);
      } else {
        const png = PNG.sync.read(readFileSync(file));
        const h = new Float32Array(png.width * png.height);
        for (let i = 0; i < h.length; i++) {
          const r = png.data[i * 4];
          const g = png.data[i * 4 + 1];
          const b = png.data[i * 4 + 2];
          h[i] = r * 256 + g + b / 256 - 32768;
        }
        this.tiles.set(key, h);
      }
    }
    return this.tiles.get(key) ?? null;
  }

  /**
   * Height in metres above sea level, bilinear between pixels. Null outside the cached tiles.
   * @param {number} lat
   * @param {number} lon
   */
  height(lat, lon) {
    const fx = ((lon + 180) / 360) * this.n * 256;
    const r = (lat * Math.PI) / 180;
    const fy = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * this.n * 256;
    const px = Math.floor(fx - 0.5);
    const py = Math.floor(fy - 0.5);
    const tx = fx - 0.5 - px;
    const ty = fy - 0.5 - py;
    const at = (/** @type {number} */ x, /** @type {number} */ y) => {
      const t = this.tile(Math.floor(x / 256), Math.floor(y / 256));
      if (!t) return null;
      return t[(y % 256) * 256 + (x % 256)];
    };
    const a = at(px, py);
    const b = at(px + 1, py);
    const c = at(px, py + 1);
    const d = at(px + 1, py + 1);
    if (a === null || b === null || c === null || d === null) return null;
    return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
  }
}
