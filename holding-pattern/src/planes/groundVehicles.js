import * as THREE from 'three';
import { BALANCE } from '../config/balance.js';
import { M, mat } from '../render/materials.js';
import { MeshBuilder, place, rbox } from '../render/geom.js';
import { T, DIRS } from '../world/grid.js';
import { TARMAC_Y } from '../build/structures.js';
import { clamp, dampAngle } from '../core/math.js';

const TILE = BALANCE.map.tile;

// ---------------------------------------------------------------------------
// Models (built once, instanced as plain meshes sharing geometry)
const MODELS = {};
function wheels(mb, w, l, r = 0.38, y = 0.38) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.add(M.tyre, place(new THREE.CylinderGeometry(r, r, 0.3, 12), sx * (w / 2), y, sz * (l / 2 - r - 0.15), 0, 0, Math.PI / 2));
}
function model(type) {
  if (MODELS[type]) return MODELS[type];
  const mb = new MeshBuilder();
  if (type === 'tug') {
    mb.add(M.hivis, place(rbox(1.7, 1.0, 2.6, 0.25), 0, 0.85, 0));
    mb.add(M.dark, place(rbox(1.4, 0.75, 1.0, 0.18), 0, 1.65, -0.5));
    mb.add(M.white, place(rbox(1.5, 0.12, 1.15, 0.05), 0, 2.07, -0.5));
    wheels(mb, 1.7, 2.6);
  } else if (type === 'cart') {
    mb.add(M.metal, place(rbox(1.6, 0.35, 2.2, 0.12), 0, 0.7, 0));
    mb.add(M.dark, place(new THREE.BoxGeometry(0.08, 0.08, 1.2), 0, 0.6, 1.6));
    const bagCols = [0x1f3a5f, 0xc0392b, 0x2b2b2b, 0x7bc67b, 0xf7f5ef, 0xa06cd5];
    for (let i = 0; i < 4; i++) mb.add(mat(bagCols[i % bagCols.length], { roughness: 0.6 }), place(rbox(0.65, 0.45, 0.45, 0.08), (i % 2) * 0.72 - 0.36, 1.12, Math.floor(i / 2) * 0.7 - 0.35, 0, i * 0.3, 0));
    wheels(mb, 1.5, 2.2, 0.28, 0.28);
  } else if (type === 'fuel') {
    mb.add(M.dark, place(rbox(2.3, 0.5, 7.2, 0.15), 0, 0.75, 0));
    mb.add(M.hivis, place(rbox(2.3, 1.7, 1.9, 0.3), 0, 1.6, 2.6));
    mb.add(M.dark, place(rbox(2.0, 0.7, 0.4, 0.12), 0, 2.0, 3.5));
    mb.add(M.white, place(new THREE.CylinderGeometry(1.0, 1.0, 4.6, 18), 0, 1.95, -1.0, Math.PI / 2, 0, 0));
    mb.add(M.hivis, place(new THREE.CylinderGeometry(1.02, 1.02, 0.35, 18), 0, 1.95, -1.0, Math.PI / 2, 0, 0));
    wheels(mb, 2.2, 7.2, 0.45, 0.45);
  } else if (type === 'push') {
    mb.add(M.hivis, place(rbox(2.6, 0.9, 4.4, 0.3), 0, 0.75, 0));
    mb.add(M.dark, place(rbox(1.2, 0.7, 1.0, 0.15), 0.6, 1.5, -1.4));
    mb.add(M.dark, place(new THREE.BoxGeometry(0.3, 0.3, 1.2), 0, 0.6, 2.6));
    wheels(mb, 2.5, 4.4, 0.42, 0.42);
  } else if (type === 'stairs') {
    mb.add(M.hivis, place(rbox(1.8, 0.5, 4.5, 0.12), 0, 0.6, 0));
    for (let i = 0; i < 6; i++) mb.add(M.metal, place(new THREE.BoxGeometry(1.2, 0.08, 0.38), 0, 0.9 + i * 0.36, -1.2 + i * 0.42));
    mb.add(M.metal, place(new THREE.BoxGeometry(0.06, 2.6, 0.06), 0.62, 1.9, 0.2, -0.7, 0, 0));
    mb.add(M.metal, place(new THREE.BoxGeometry(0.06, 2.6, 0.06), -0.62, 1.9, 0.2, -0.7, 0, 0));
    wheels(mb, 1.7, 4.5, 0.3, 0.3);
  }
  const g = mb.build();
  MODELS[type] = g;
  return g;
}

function instance(type) {
  const src = model(type);
  const g = new THREE.Group();
  for (const c of src.children) {
    const m = new THREE.Mesh(c.geometry, c.material);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

// ---------------------------------------------------------------------------
class Vehicle {
  constructor(sys, type, x, z, yaw) {
    this.sys = sys;
    this.type = type;
    this.mesh = instance(type);
    this.pos = new THREE.Vector3(x, TARMAC_Y, z);
    this.yaw = yaw;
    this.speed = type === 'push' ? 5 : 7.5;
    this.path = [];
    this.pathI = 0;
    this.state = 'drive';
    this.carts = [];
    if (type === 'tug') {
      for (let i = 0; i < 2; i++) {
        const c = instance('cart');
        const p = new THREE.Vector3(x - Math.sin(yaw) * (3.4 + i * 3), TARMAC_Y, z - Math.cos(yaw) * (3.4 + i * 3));
        this.carts.push({ mesh: c, pos: p, yaw });
        sys.scene.add(c);
      }
    }
    sys.scene.add(this.mesh);
    this.sync();
  }

  drive(points, then) {
    this.path = points;
    this.pathI = 0;
    this.state = 'drive';
    this.onArrive = then;
  }

  blocked() {
    // give way to aircraft moving on the ground ahead of us
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    for (const p of this.sys.game.planes.values()) {
      if (p.alt > 1 || p.state === 'parked') continue;
      const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > p.halfLen + 16) continue;
      if ((dx * fx + dz * fz) / (d || 1) > 0.35) return true;
    }
    return false;
  }

  update(dt) {
    if (this.state === 'drive') {
      const t = this.path[this.pathI];
      if (!t) {
        this.state = 'idle';
        const cb = this.onArrive;
        this.onArrive = null;
        cb?.(this);
      } else if (!this.blocked()) {
        const dx = t.x - this.pos.x, dz = t.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        const want = Math.atan2(dx, dz);
        this.yaw = dampAngle(this.yaw, want, 6, dt);
        const step = Math.min(d, this.speed * dt * (this.pathI === this.path.length - 1 ? clamp(d / 6, 0.3, 1) : 1));
        this.pos.x += Math.sin(this.yaw) * step;
        this.pos.z += Math.cos(this.yaw) * step;
        if (d < 1.2) this.pathI++;
        if (this.pathI >= this.path.length && t.yaw !== undefined) this.yaw = t.yaw;
      }
    }
    // carts trail behind on a tow bar
    let lead = { pos: this.pos, yaw: this.yaw, back: 1.6 };
    for (const c of this.carts) {
      const hx = lead.pos.x - Math.sin(lead.yaw) * lead.back, hz = lead.pos.z - Math.cos(lead.yaw) * lead.back;
      const dx = hx - c.pos.x, dz = hz - c.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      c.yaw = Math.atan2(dx, dz);
      c.pos.x = hx - (dx / d) * 1.5;
      c.pos.z = hz - (dz / d) * 1.5;
      lead = { pos: c.pos, yaw: c.yaw, back: 1.4 };
    }
    this.sync();
  }

  sync() {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    for (const c of this.carts) {
      c.mesh.position.copy(c.pos);
      c.mesh.rotation.y = c.yaw;
    }
  }

  dispose() {
    this.sys.scene.remove(this.mesh);
    for (const c of this.carts) this.sys.scene.remove(c.mesh);
  }
}

// ---------------------------------------------------------------------------
// Ground crew: baggage tug + carts and a fuel truck drive out from the apron
// by the terminal to every parked plane; a pushback tug pushes departures.
export class GroundVehicles {
  constructor(game) {
    this.game = game;
    this.scene = game.renderer.scene;
    this.list = [];
    this.pushers = new Map(); // planeId -> vehicle
    this.stairs = new Map(); // planeId -> mesh
    game.events.on('turnaroundPhase', (ta, phase) => {
      if (phase === 'ready' || phase === 'board') this.release(ta);
    });
    game.events.on('pushback', (plane) => this.startPushback(plane));
    game.events.on('planeState', (plane, s, prev) => {
      if (prev === 'pushback') this.endPushback(plane);
    });
    game.events.on('turnaroundStart', (ta) => this.placeStairs(ta));
    game.events.on('planeRemoved', (plane) => this.cleanup(plane));
  }

  // tarmac tiles next to the terminal where crews are based
  isDepot(tx, tz) {
    const grid = this.game.grid;
    for (const [dx, dz] of DIRS) if (grid.get(tx + dx, tz + dz) === T.TERMINAL) return true;
    return false;
  }

  // BFS over tarmac from the stand to the nearest depot tile; returns world points
  routeFromDepot(stand) {
    const grid = this.game.grid;
    const isTar = (x, z) => {
      const t = grid.get(x, z);
      return t === T.TAXI || t === T.STAND;
    };
    const start = [];
    for (const [x, z] of grid.standFootprint(stand.tx, stand.tz, stand.n)) start.push(grid.idx(x, z));
    const prev = new Map();
    const q = [...start];
    for (const s of start) prev.set(s, -1);
    let found = -1;
    while (q.length) {
      const c = q.shift();
      const cx = grid.txOf(c), cz = grid.tzOf(c);
      if (this.isDepot(cx, cz) && grid.owner[c] !== stand.id) {
        found = c;
        break;
      }
      if (this.isDepot(cx, cz) && grid.owner[c] === stand.id && stand.gate) {
        found = c;
        break;
      }
      for (const [dx, dz] of DIRS) {
        const nx = cx + dx, nz = cz + dz;
        if (!isTar(nx, nz)) continue;
        const n = grid.idx(nx, nz);
        if (prev.has(n)) continue;
        prev.set(n, c);
        q.push(n);
      }
    }
    if (found < 0) return null;
    const pts = [];
    let c = found;
    while (c !== -1) {
      pts.push({ x: grid.wx(grid.txOf(c)), z: grid.wz(grid.tzOf(c)) });
      c = prev.get(c);
    }
    return pts; // depot first, ending on the stand
  }

  // local plane point -> world
  planePoint(plane, lx, lz) {
    const s = Math.sin(plane.yaw), c = Math.cos(plane.yaw);
    // local +x is the plane's left: (cos yaw, -sin yaw); local +z forward
    return { x: plane.pos.x + c * lx + s * lz, z: plane.pos.z - s * lx + c * lz };
  }

  dispatch(ta) {
    const plane = ta.plane;
    const stand = ta.stand;
    const info = { reachable: false, reached: false, list: [] };
    ta.vehicles = info;
    if (!stand) return;
    const route = this.routeFromDepot(stand);
    if (!route) return;
    info.reachable = true;
    const spec = plane.spec;
    const spots = [
      { type: 'tug', p: this.planePoint(plane, -(spec.R + 3.6), -plane.halfLen * 0.3), yaw: plane.yaw },
      { type: 'fuel', p: this.planePoint(plane, spec.wing.half * 0.42, spec.wing.z - 3), yaw: plane.yaw + Math.PI },
    ];
    let arrived = 0;
    for (const sp of spots) {
      const start = route[0];
      const v = new Vehicle(this, sp.type, start.x + (Math.random() - 0.5) * 3, start.z + (Math.random() - 0.5) * 3, 0);
      this.list.push(v);
      info.list.push(v);
      const pts = route.slice(1, -1).concat([{ x: sp.p.x, z: sp.p.z, yaw: sp.yaw }]);
      v.home = route[0];
      v.back = route.slice(0, -1).reverse();
      v.drive(pts, () => {
        arrived++;
        if (arrived >= spots.length) info.reached = true;
      });
    }
  }

  release(ta) {
    const info = ta.vehicles;
    if (!info || info.released) return;
    info.released = true;
    for (const v of info.list) {
      v.drive([...v.back.slice(1), v.home], () => (v.done = true));
    }
  }

  placeStairs(ta) {
    const plane = ta.plane;
    const stand = ta.stand;
    if (!stand || (stand.gate && this.game.jetbridges.forStand(stand.id))) return;
    const d = plane.doorWorld();
    const g = instance('stairs');
    g.position.set(d.x + d.ox * 2.6, TARMAC_Y, d.z + d.oz * 2.6);
    g.rotation.y = Math.atan2(-d.ox, -d.oz);
    g.scale.y = clamp((d.y - TARMAC_Y) / 3.0, 0.6, 1.4);
    this.scene.add(g);
    this.stairs.set(plane.id, g);
  }

  startPushback(plane) {
    const st = this.stairs.get(plane.id);
    if (st) {
      this.scene.remove(st);
      this.stairs.delete(plane.id);
    }
    const v = new Vehicle(this, 'push', plane.pos.x, plane.pos.z, plane.yaw + Math.PI);
    v.state = 'attached';
    v.plane = plane;
    this.list.push(v);
    this.pushers.set(plane.id, v);
  }

  endPushback(plane) {
    const v = this.pushers.get(plane.id);
    if (!v) return;
    this.pushers.delete(plane.id);
    v.plane = null;
    // drive off sideways then back to the apron edge
    const side = this.planePoint(plane, 14, plane.halfLen + 10);
    const stand = this.game.grid.structures.get(plane.standId);
    const route = stand ? this.routeFromDepot(stand) : null;
    const pts = [{ x: side.x, z: side.z }];
    if (route) pts.push(route[0]);
    v.drive(pts, () => (v.done = true));
  }

  cleanup(plane) {
    const v = this.pushers.get(plane.id);
    if (v) {
      v.done = true;
      this.pushers.delete(plane.id);
    }
    const st = this.stairs.get(plane.id);
    if (st) {
      this.scene.remove(st);
      this.stairs.delete(plane.id);
    }
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const v = this.list[i];
      if (v.state === 'attached' && v.plane) {
        const p = v.plane;
        const nose = this.planePoint(p, 0, p.halfLen + 2.8);
        v.pos.set(nose.x, TARMAC_Y, nose.z);
        v.yaw = p.yaw + Math.PI;
        v.sync();
      } else v.update(dt);
      if (v.done) {
        v.dispose();
        this.list.splice(i, 1);
      }
    }
  }

  clear() {
    for (const v of this.list) v.dispose();
    this.list.length = 0;
    this.pushers.clear();
    for (const g of this.stairs.values()) this.scene.remove(g);
    this.stairs.clear();
  }
}

