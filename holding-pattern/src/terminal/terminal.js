import { T, DIRS } from '../world/grid.js';

// Terminal layout model: connected terminal areas, entrance doors and the
// sides where jet bridges attach. Passenger routing builds on top of this.
export class Terminal {
  constructor(game) {
    this.game = game;
    this.doorTiles = []; // tile indices with an entrance on their south side
    this.doorTileSet = new Set();
    this.gateDoorSides = new Set(); // tileIdx*4 + side
    this.version = -1;
  }

  refresh() {
    const grid = this.game.grid;
    if (this.version === grid.version) return;
    this.version = grid.version;
    this.computeDoors();
  }

  computeDoors() {
    const grid = this.game.grid;
    this.gateDoorSides.clear();
    for (const s of grid.stands) {
      if (!s.gate) continue;
      const [fx, fz] = s.front;
      if (grid.get(fx, fz) !== T.TERMINAL) continue;
      this.gateDoorSides.add(grid.idx(fx, fz) * 4 + ((s.rot + 2) % 4));
    }
    // connected components
    const seen = new Int32Array(grid.W * grid.H).fill(-1);
    const comps = [];
    for (let i = 0; i < grid.type.length; i++) {
      if (grid.type[i] !== T.TERMINAL || seen[i] >= 0) continue;
      const id = comps.length;
      const tiles = [];
      const stack = [i];
      seen[i] = id;
      while (stack.length) {
        const c = stack.pop();
        tiles.push(c);
        const cx = grid.txOf(c), cz = grid.tzOf(c);
        for (const [dx, dz] of DIRS) {
          const nx = cx + dx, nz = cz + dz;
          if (!grid.inBounds(nx, nz)) continue;
          const n = grid.idx(nx, nz);
          if (grid.type[n] === T.TERMINAL && seen[n] < 0) {
            seen[n] = id;
            stack.push(n);
          }
        }
      }
      comps.push(tiles);
    }
    this.components = comps;
    this.componentOf = seen;
    this.doorTiles = [];
    for (const tiles of comps) {
      const south = tiles.filter((i) => {
        const x = grid.txOf(i), z = grid.tzOf(i);
        return grid.get(x, z + 1) !== T.TERMINAL && !this.gateDoorSides.has(i * 4 + 2);
      });
      south.sort((a, b) => grid.tzOf(b) - grid.tzOf(a) || grid.txOf(a) - grid.txOf(b));
      let doors = south.filter((i) => grid.txOf(i) % 4 === 1);
      if (!doors.length && south.length) doors = [south[Math.floor(south.length / 2)]];
      this.doorTiles.push(...doors);
    }
    this.doorTileSet = new Set(this.doorTiles);
  }
}
