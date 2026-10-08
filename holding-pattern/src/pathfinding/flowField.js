import { BALANCE } from '../config/balance.js';
import { T } from '../world/grid.js';
import { MinHeap } from './heap.js';

export const CELL = BALANCE.map.tile / 2; // walk grid: 2x2 cells per tile

// Walk grid over terminal floor plus shared distance fields, one per
// destination (an entrance, a desk's queue, a lounge, a gate door...). Every
// passenger heading the same way reads the same field, so walking costs a few
// array lookups per passenger instead of a path search each.
export class FlowFields {
  constructor(game) {
    this.game = game;
    this.W = BALANCE.map.width * 2;
    this.H = BALANCE.map.height * 2;
    this.walk = new Uint8Array(this.W * this.H);
    this.cache = new Map();
    this.version = 0;
  }

  cellIdx(cx, cz) {
    return cz * this.W + cx;
  }

  cellOf(x, z) {
    const cx = Math.floor(x / CELL + this.W / 2), cz = Math.floor(z / CELL + this.H / 2);
    if (cx < 0 || cz < 0 || cx >= this.W || cz >= this.H) return -1;
    return cz * this.W + cx;
  }

  cellCenter(i) {
    const cx = i % this.W, cz = (i / this.W) | 0;
    return { x: (cx - this.W / 2 + 0.5) * CELL, z: (cz - this.H / 2 + 0.5) * CELL };
  }

  rebuild() {
    const grid = this.game.grid;
    this.walk.fill(0);
    for (let tz = 0; tz < grid.H; tz++) {
      for (let tx = 0; tx < grid.W; tx++) {
        const i = grid.idx(tx, tz);
        if (grid.type[i] !== T.TERMINAL) continue;
        const r = grid.room[i];
        if (r >= 0 && grid.structures.get(r)?.type !== 'lounge') continue;
        for (let oz = 0; oz < 2; oz++) for (let ox = 0; ox < 2; ox++) this.walk[this.cellIdx(tx * 2 + ox, tz * 2 + oz)] = 1;
      }
    }
    this.cache.clear();
    this.version++;
  }

  cellsOfTiles(tx, tz, w, h) {
    const out = [];
    for (let z = tz * 2; z < (tz + h) * 2; z++) for (let x = tx * 2; x < (tx + w) * 2; x++) out.push(this.cellIdx(x, z));
    return out;
  }

  cellsNear(x, z, radius = 0) {
    const c = this.cellOf(x, z);
    if (c < 0) return [];
    if (this.walk[c]) return [c];
    if (!radius) return [];
    const n = this.nearestWalkable(x, z, radius * CELL * 2);
    return n !== null ? [n] : [];
  }

  nearestWalkable(x, z, maxDist = 200) {
    const c0 = this.cellOf(x, z);
    const cx0 = Math.floor(x / CELL + this.W / 2), cz0 = Math.floor(z / CELL + this.H / 2);
    if (c0 >= 0 && this.walk[c0]) return c0;
    const R = Math.ceil(maxDist / CELL);
    let best = null, bd = Infinity;
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        const cx = cx0 + dx, cz = cz0 + dz;
        if (cx < 0 || cz < 0 || cx >= this.W || cz >= this.H) continue;
        const i = this.cellIdx(cx, cz);
        if (!this.walk[i]) continue;
        const d = dx * dx + dz * dz;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
    }
    return best;
  }

  // distance field (metres) to any of `targets`, cached by key
  get(key, targets) {
    let f = this.cache.get(key);
    if (f && f.version === this.version) return f.dist;
    const dist = new Float32Array(this.W * this.H).fill(Infinity);
    const heap = new MinHeap();
    for (const t of targets) {
      if (t < 0) continue;
      dist[t] = 0;
      heap.push(0, t);
    }
    const W = this.W, H = this.H, walk = this.walk;
    const D = CELL * Math.SQRT2;
    while (heap.size) {
      const c = heap.pop();
      const d0 = dist[c];
      const cx = c % W, cz = (c / W) | 0;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = cx + dx, nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
          const n = nz * W + nx;
          if (!walk[n]) continue;
          if (dx && dz && (!walk[cz * W + nx] || !walk[nz * W + cx])) continue; // no corner cutting
          const nd = d0 + (dx && dz ? D : CELL);
          if (nd < dist[n]) {
            dist[n] = nd;
            heap.push(nd, n);
          }
        }
      }
    }
    this.cache.set(key, { dist, version: this.version });
    return dist;
  }

  // Next waypoint (cell centre) downhill from (x, z), or null when arrived /
  // unreachable. Writes into `out`.
  step(field, x, z, out) {
    const c = this.cellOf(x, z);
    if (c < 0) return null;
    const d0 = field[c];
    if (d0 === 0) return null;
    const W = this.W;
    const cx = c % W, cz = (c / W) | 0;
    let best = -1, bd = d0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= W || nz >= this.H) continue;
        const n = nz * W + nx;
        if (field[n] < bd) {
          if (dx && dz && !(Number.isFinite(field[cz * W + nx]) && Number.isFinite(field[nz * W + cx]))) continue;
          bd = field[n];
          best = n;
        }
      }
    }
    if (best < 0) return null;
    out.x = (best % W - W / 2 + 0.5) * CELL;
    out.z = (((best / W) | 0) - this.H / 2 + 0.5) * CELL;
    out.d = bd;
    return out;
  }
}
