import { BALANCE } from '../config/balance.js';
import { T, DIRS } from '../world/grid.js';
import { FlowFields, CELL } from '../pathfinding/flowField.js';

const TILE = BALANCE.map.tile;

// Terminal layout model: connected terminal areas, entrance doors, the walk
// grid and flow fields passengers follow, room runtime (queues, desks, seats)
// and where each stand's passengers board.
export class Terminal {
  constructor(game) {
    this.game = game;
    this.doorTiles = []; // tile indices with an entrance on their south side
    this.doorTileSet = new Set();
    this.gateDoorSides = new Set(); // tileIdx*4 + side
    this.version = -1;
    this.fields = new FlowFields(game);
    this.roomRt = new Map(); // roomId -> runtime
    this.standDoors = new Map(); // standId -> door info
  }

  reset() {
    this.roomRt.clear();
    this.standDoors.clear();
    this.version = -1;
  }

  refresh() {
    const grid = this.game.grid;
    if (this.version === grid.version) return false;
    this.version = grid.version;
    this.computeDoors();
    this.fields.rebuild(this);
    this.syncRooms();
    this.computeStandDoors();
    this.game.events.emit('terminalChanged');
    return true;
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
        return grid.get(x, z + 1) !== T.TERMINAL && !this.gateDoorSides.has(i * 4 + 2) && grid.room[i] < 0;
      });
      south.sort((a, b) => grid.tzOf(b) - grid.tzOf(a) || grid.txOf(a) - grid.txOf(b));
      let doors = south.filter((i) => grid.txOf(i) % 4 === 1);
      if (!doors.length && south.length) doors = [south[Math.floor(south.length / 2)]];
      this.doorTiles.push(...doors);
    }
    this.doorTileSet = new Set(this.doorTiles);
    // world points just outside each entrance
    this.doorPoints = this.doorTiles.map((i) => ({ tile: i, x: grid.wx(grid.txOf(i)), z: grid.wz(grid.tzOf(i)) + TILE / 2 + 2.5, inX: grid.wx(grid.txOf(i)), inZ: grid.wz(grid.tzOf(i)) + TILE / 2 - 2.5 }));
  }

  // ---- rooms -----------------------------------------------------------------------
  syncRooms() {
    const grid = this.game.grid;
    const live = new Set();
    for (const r of grid.rooms) {
      live.add(r.id);
      if (!this.roomRt.has(r.id)) this.roomRt.set(r.id, this.makeRuntime(r));
      else this.roomRt.get(r.id).room = r;
    }
    for (const [id, rt] of this.roomRt) {
      if (!live.has(id)) {
        this.roomRt.delete(id);
        this.game.events.emit('roomRemoved', rt);
      }
    }
  }

  // local (x, z) in a room's frame (+z toward its front) -> world
  roomToWorld(r, lx, lz) {
    const fx = r.fwd.x, fz = r.fwd.z;
    // right vector in our yaw convention: (cos h, -sin h) where fwd = (sin h, cos h)
    const rx = fz, rz = -fx;
    return { x: r.center.x + rx * lx + fx * lz, z: r.center.z + rz * lx + fz * lz };
  }

  makeRuntime(r) {
    const rt = { room: r, type: r.type, queue: [], serving: null, timer: 0, served: 0 };
    const W = (lx, lz) => this.roomToWorld(r, lx, lz);
    if (r.type === 'checkin') {
      rt.service = W(-1, -5.0);
      rt.slots = [];
      for (let row = 0; row < 7; row++) for (let k = 0; k < 4; k++) rt.slots.push(W(row % 2 === 0 ? -1 - k * 1.15 : -4.45 + k * 1.15, -2.7 + row * 1.6));
      rt.overflow = (k) => W(-2.6, 11.2 + k * 1.1);
      rt.entry = W(-2.6, 11);
      rt.exitPath = [W(1.6, -5.0), W(3.6, -3.5), W(3.6, 9.5), W(3.6, 11.5)];
      rt.portal = this.portalCells(r, 'front');
    } else if (r.type === 'security') {
      rt.service = W(-1.3, -2.0);
      rt.slots = [];
      rt.slots.push(W(-1.3, 0.6));
      for (let row = 0; row < 5; row++) for (let k = 0; k < 4; k++) rt.slots.push(W(row % 2 === 0 ? -1.3 - k * 1.1 : -4.6 + k * 1.1, 2.2 + row * 1.5));
      rt.overflow = (k) => W(-2.6, 11.2 + k * 1.1);
      rt.entry = W(-2.6, 11);
      rt.exitPath = [W(-1.3, -6.5), W(-1.3, -11.5)];
      rt.portal = this.portalCells(r, 'front');
      rt.exitPortal = this.portalCells(r, 'back');
    } else {
      rt.seats = [];
      for (let row = 0; row < 5; row++) for (let k = 0; k < 8; k++) rt.seats.push({ ...W(-7 + k * 2, -6.5 + row * 3.1), taken: null });
      rt.cells = this.fields.cellsOfTiles(r.tx, r.tz, r.w, r.h);
    }
    return rt;
  }

  portalCells(r, which) {
    const grid = this.game.grid;
    const [fx, fz] = DIRS[r.rot];
    const cx = r.tx + (r.w - 1) / 2, cz = r.tz + (r.h - 1) / 2;
    const reach = (Math.max(r.w, r.h) - 1) / 2 + 1;
    const s = which === 'front' ? 1 : -1;
    const tx = Math.round(cx + fx * reach * s), tz = Math.round(cz + fz * reach * s);
    if (grid.get(tx, tz) !== T.TERMINAL || grid.room[grid.idx(tx, tz)] >= 0) return [];
    // the two cells of that tile touching the room
    const cells = [];
    for (const [ox, oz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const c = { cx: tx * 2 + ox, cz: tz * 2 + oz };
      const wx = (c.cx - grid.W + 0.5) * CELL, wz = (c.cz - grid.H + 0.5) * CELL;
      const toRoom = (r.center.x - wx) * fx * s + (r.center.z - wz) * fz * s;
      cells.push({ ...c, d: toRoom });
    }
    cells.sort((a, b) => b.d - a.d);
    return cells.slice(2).map((c) => this.fields.cellIdx(c.cx, c.cz));
  }

  roomsOf(type) {
    return [...this.roomRt.values()].filter((rt) => rt.type === type);
  }

  // ---- stands ---------------------------------------------------------------------
  // where a stand's passengers leave the terminal (gate door or nearest wall)
  computeStandDoors() {
    const grid = this.game.grid;
    this.standDoors.clear();
    for (const s of grid.stands) {
      let door = null;
      if (s.gate && grid.get(s.front[0], s.front[1]) === T.TERMINAL && grid.room[grid.idx(s.front[0], s.front[1])] < 0) {
        const left = { x: Math.cos(s.heading), z: -Math.sin(s.heading) };
        const wall = { x: s.frontEdge.x + left.x * 3.4, z: s.frontEdge.z + left.z * 3.4 };
        const cells = this.fields.cellsNear(wall.x - s.fwd.x * -2.5, wall.z - s.fwd.z * -2.5, 1);
        door = { kind: 'gate', wall, inside: { x: wall.x + s.fwd.x * 2.5, z: wall.z + s.fwd.z * 2.5 }, cells };
      } else {
        // nearest walkable wall cell to the stand's front
        const best = this.fields.nearestWalkable(s.frontEdge.x, s.frontEdge.z, 260);
        if (best) {
          const c = this.fields.cellCenter(best);
          door = { kind: 'remote', wall: { x: c.x, z: c.z }, inside: { x: c.x, z: c.z }, cells: [best] };
        }
      }
      if (door && door.cells.length) this.standDoors.set(s.id, door);
    }
  }

  standDoor(s) {
    return this.standDoors.get(s.id) || null;
  }

  // The lounge nearest (by walking) to a stand's door
  loungeFor(s) {
    const door = this.standDoor(s);
    if (!door) return null;
    const field = this.fields.get(`stand:${s.id}`, door.cells);
    let best = null, bd = Infinity;
    for (const rt of this.roomsOf('lounge')) {
      let d = Infinity;
      for (const c of rt.cells) d = Math.min(d, field[c]);
      if (d < bd) {
        bd = d;
        best = rt;
      }
    }
    return best;
  }

  // seconds to walk from a lounge to a stand's door (plus the apron or bridge)
  walkTime(lounge, stand) {
    const door = stand && this.standDoor(stand);
    if (!door) return 20;
    let d = 30;
    if (lounge) {
      const f = this.fields.get(`stand:${stand.id}`, door.cells);
      const c = this.fields.cellOf(lounge.room.center.x, lounge.room.center.z);
      if (c >= 0 && Number.isFinite(f[c])) d = f[c];
    }
    if (door.kind === 'remote') d += Math.hypot(stand.center.x - door.wall.x, stand.center.z - door.wall.z);
    else d += 20;
    return d / (BALANCE.passengers.walkSpeed * 0.95);
  }

  // Can departing passengers get from an entrance through check-in and
  // security to a lounge?
  departureRouteOk() {
    this.refresh();
    if (!this.doorTiles.length) return 'No terminal';
    const ci = this.roomsOf('checkin'), se = this.roomsOf('security'), lo = this.roomsOf('lounge');
    if (!ci.length) return 'No check-in desk';
    if (!se.length) return 'No security lane';
    if (!lo.length) return 'No gate lounge';
    const spawn = this.fields.cellsNear(this.doorPoints[0].inX, this.doorPoints[0].inZ, 0);
    if (!spawn.length) return 'Entrance blocked';
    const okTo = (rt, cells) => cells.length && Number.isFinite(this.fields.get(`portal:${rt.room.id}`, cells)[spawn[0]]);
    if (!ci.some((rt) => okTo(rt, rt.portal))) return "Can't reach check-in";
    if (!se.some((rt) => okTo(rt, rt.portal))) return "Can't reach security";
    return null;
  }
}
