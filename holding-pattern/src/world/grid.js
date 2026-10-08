import { BALANCE } from '../config/balance.js';

export const T = { EMPTY: 0, RUNWAY: 1, TAXI: 2, STAND: 3, TERMINAL: 4, BLOCKED: 5 };

// Facing directions: 0 north (-z), 1 east (+x), 2 south (+z), 3 west (-x)
export const DIRS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

// The tile map plus a registry of placed structures. Pure data, no rendering.
export class Grid {
  constructor(events) {
    this.events = events;
    this.W = BALANCE.map.width;
    this.H = BALANCE.map.height;
    this.tile = BALANCE.map.tile;
    this.type = new Uint8Array(this.W * this.H);
    this.owner = new Int32Array(this.W * this.H).fill(-1);
    this.room = new Int32Array(this.W * this.H).fill(-1);
    this.structures = new Map();
    this.nextId = 1;
    this.standNumbers = { stand: 0, gate: 0 };
    this.version = 0;
  }

  reset() {
    this.type.fill(0);
    this.owner.fill(-1);
    this.room.fill(-1);
    this.structures.clear();
    this.nextId = 1;
    this.standNumbers = { stand: 0, gate: 0 };
    this.version++;
  }

  idx(tx, tz) {
    return tz * this.W + tx;
  }
  txOf(i) {
    return i % this.W;
  }
  tzOf(i) {
    return (i / this.W) | 0;
  }
  inBounds(tx, tz) {
    return tx >= 0 && tz >= 0 && tx < this.W && tz < this.H;
  }
  get(tx, tz) {
    return this.inBounds(tx, tz) ? this.type[this.idx(tx, tz)] : T.BLOCKED;
  }

  // world centre of a tile
  wx(tx) {
    return (tx - this.W / 2 + 0.5) * this.tile;
  }
  wz(tz) {
    return (tz - this.H / 2 + 0.5) * this.tile;
  }
  tileAt(x, z) {
    return { tx: Math.floor(x / this.tile + this.W / 2), tz: Math.floor(z / this.tile + this.H / 2) };
  }

  changed(what) {
    this.version++;
    this.events.emit('gridChanged', what);
  }

  addStructure(s) {
    s.id = s.id ?? this.nextId++;
    this.nextId = Math.max(this.nextId, s.id + 1);
    this.structures.set(s.id, s);
    return s;
  }

  ofKind(kind) {
    const out = [];
    for (const s of this.structures.values()) if (s.kind === kind) out.push(s);
    return out;
  }

  get runways() {
    return this.ofKind('runway');
  }
  get stands() {
    return this.ofKind('stand');
  }
  get rooms() {
    return this.ofKind('room');
  }

  // ---- runways -------------------------------------------------------
  // centre line from (sx,sz) to (ex,ez) inclusive, axis-aligned, width 3
  runwayTiles(sx, sz, ex, ez) {
    const tiles = [];
    const half = (BALANCE.runway.width - 1) / 2;
    if (sz === ez) {
      const a = Math.min(sx, ex), b = Math.max(sx, ex);
      for (let x = a; x <= b; x++) for (let o = -half; o <= half; o++) tiles.push([x, sz + o]);
    } else {
      const a = Math.min(sz, ez), b = Math.max(sz, ez);
      for (let z = a; z <= b; z++) for (let o = -half; o <= half; o++) tiles.push([sx + o, z]);
    }
    return tiles;
  }

  placeRunway(sx, sz, ex, ez, cost, id) {
    const horizontal = sz === ez;
    const length = (horizontal ? Math.abs(ex - sx) : Math.abs(ez - sz)) + 1;
    const r = this.addStructure({
      id,
      kind: 'runway',
      sx, sz, ex, ez,
      horizontal,
      length,
      cost,
    });
    for (const [x, z] of this.runwayTiles(sx, sz, ex, ez)) {
      const i = this.idx(x, z);
      this.type[i] = T.RUNWAY;
      this.owner[i] = r.id;
    }
    this.decorateRunway(r);
    this.changed('runway');
    return r;
  }

  // derived geometry: direction, threshold world points, heading, numbers
  decorateRunway(r) {
    const dx = Math.sign(r.ex - r.sx), dz = Math.sign(r.ez - r.sz);
    r.dir = { x: dx, z: dz };
    r.start = { x: this.wx(r.sx), z: this.wz(r.sz) };
    r.end = { x: this.wx(r.ex), z: this.wz(r.ez) };
    // runway surface extends half a tile beyond the end tile centres
    r.thr = { x: r.start.x - (dx * this.tile) / 2, z: r.start.z - (dz * this.tile) / 2 };
    r.far = { x: r.end.x + (dx * this.tile) / 2, z: r.end.z + (dz * this.tile) / 2 };
    r.heading = Math.atan2(dx, dz); // yaw for planes rolling along it
    const deg = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
    const n1 = Math.round(deg / 10) || 36;
    const n2 = ((n1 + 18 - 1) % 36) + 1;
    r.name = `${String(n1).padStart(2, '0')}/${String(n2).padStart(2, '0')}`;
    r.nums = [String(n1).padStart(2, '0'), String(n2).padStart(2, '0')];
    r.lengthM = r.length * this.tile;
  }

  // index along the runway (0 at the start end) for a tile, or -1
  runwayIndex(r, tx, tz) {
    return r.horizontal ? (tx - r.sx) * r.dir.x : (tz - r.sz) * r.dir.z;
  }
  // world point on the centre line at index i (tile centre)
  runwayPoint(r, i) {
    return { x: r.start.x + r.dir.x * i * this.tile, z: r.start.z + r.dir.z * i * this.tile };
  }

  // ---- stands ----------------------------------------------------------
  standFootprint(tx, tz, n) {
    const out = [];
    for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) out.push([tx + x, tz + z]);
    return out;
  }

  // tile behind the back edge centre (where the taxiway must be) and the tile
  // beyond the front edge centre (the terminal, for gates)
  standLinks(tx, tz, n, rot) {
    const c = (n - 1) / 2;
    const cx = tx + c, cz = tz + c;
    const [fx, fz] = DIRS[rot];
    const reach = c + 1;
    return {
      cx, cz,
      entry: [cx - fx * reach, cz - fz * reach],
      front: [cx + fx * reach, cz + fz * reach],
    };
  }

  placeStand(tx, tz, size, rot, gate, cost, id, number) {
    const n = BALANCE.stands.size[size];
    const links = this.standLinks(tx, tz, n, rot);
    const key = gate ? 'gate' : 'stand';
    const num = number ?? ++this.standNumbers[key];
    this.standNumbers[key] = Math.max(this.standNumbers[key], num);
    const s = this.addStructure({
      id,
      kind: 'stand',
      gate,
      size,
      n,
      tx, tz,
      rot,
      cost,
      number: num,
      label: `${gate ? 'G' : 'S'}${num}`,
      entry: this.idx(links.entry[0], links.entry[1]),
      front: links.front,
    });
    for (const [x, z] of this.standFootprint(tx, tz, n)) {
      const i = this.idx(x, z);
      this.type[i] = T.STAND;
      this.owner[i] = s.id;
    }
    this.decorateStand(s);
    this.changed('stand');
    return s;
  }

  decorateStand(s) {
    const c = (s.n - 1) / 2;
    s.center = { x: this.wx(s.tx + c), z: this.wz(s.tz + c) };
    const [fx, fz] = DIRS[s.rot];
    s.fwd = { x: fx, z: fz };
    s.heading = Math.atan2(fx, fz);
    s.half = (s.n * this.tile) / 2;
    s.entryPoint = { x: this.wx(this.txOf(s.entry)), z: this.wz(this.tzOf(s.entry)) };
    s.backEdge = { x: s.center.x - fx * s.half, z: s.center.z - fz * s.half };
    s.frontEdge = { x: s.center.x + fx * s.half, z: s.center.z + fz * s.half };
  }

  // ---- terminal rooms ----------------------------------------------------
  roomSize(type, rot) {
    const r = BALANCE.rooms[type];
    return rot % 2 === 0 ? { w: r.w, h: r.h } : { w: r.h, h: r.w };
  }

  placeRoom(type, tx, tz, rot, cost, id) {
    const { w, h } = this.roomSize(type, rot);
    const room = this.addStructure({ id, kind: 'room', type, tx, tz, w, h, rot, cost });
    for (let z = 0; z < h; z++)
      for (let x = 0; x < w; x++) {
        this.room[this.idx(tx + x, tz + z)] = room.id;
      }
    this.decorateRoom(room);
    this.changed('room');
    return room;
  }

  decorateRoom(r) {
    r.center = { x: this.wx(r.tx) + ((r.w - 1) * this.tile) / 2, z: this.wz(r.tz) + ((r.h - 1) * this.tile) / 2 };
    const [fx, fz] = DIRS[r.rot];
    r.fwd = { x: fx, z: fz };
    r.heading = Math.atan2(fx, fz);
  }

  // ---- removal ------------------------------------------------------------
  removeStructure(id) {
    const s = this.structures.get(id);
    if (!s) return null;
    this.structures.delete(id);
    if (s.kind === 'room') {
      for (let i = 0; i < this.room.length; i++) if (this.room[i] === id) this.room[i] = -1;
    } else {
      for (let i = 0; i < this.owner.length; i++) {
        if (this.owner[i] === id) {
          this.owner[i] = -1;
          this.type[i] = T.EMPTY;
        }
      }
    }
    this.changed(s.kind);
    return s;
  }

  setTiles(list, type) {
    for (const [x, z] of list) {
      const i = this.idx(x, z);
      this.type[i] = type;
      this.owner[i] = -1;
    }
    this.changed(type === T.TAXI ? 'taxiway' : 'terminal');
  }

  clearTiles(list) {
    for (const [x, z] of list) {
      const i = this.idx(x, z);
      this.type[i] = T.EMPTY;
      this.owner[i] = -1;
    }
    this.changed('clear');
  }

  countType(type) {
    let n = 0;
    for (let i = 0; i < this.type.length; i++) if (this.type[i] === type) n++;
    return n;
  }
}
