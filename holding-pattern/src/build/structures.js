import * as THREE from 'three';
import { BALANCE } from '../config/balance.js';
import { M } from '../render/materials.js';
import { MeshBuilder, place, rbox, disposeTree } from '../render/geom.js';
import { segText } from '../render/segfont.js';
import { T, DIRS } from '../world/grid.js';

const TILE = BALANCE.map.tile;
export const TARMAC_Y = 0.25; // top of taxiway / stand surface
export const RUNWAY_Y = 0.32; // top of runway surface
const PAINT_LIFT = 0.025;

// Rebuilds the meshes for runways, taxiways and stands whenever the grid changes.
export class StructureRenderer {
  constructor(scene, grid, events) {
    this.scene = scene;
    this.grid = grid;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.runwayMeshes = new Map();
    this.taxiMesh = null;
    this.dirty = true;
    events.on('gridChanged', () => (this.dirty = true));
  }

  clear() {
    for (const m of this.runwayMeshes.values()) {
      this.group.remove(m);
      disposeTree(m);
    }
    this.runwayMeshes.clear();
    this.dirty = true;
  }

  update() {
    if (!this.dirty) return;
    this.dirty = false;
    this.sync();
  }

  sync() {
    const grid = this.grid;
    const live = new Set();
    for (const r of grid.runways) {
      live.add(r.id);
      if (!this.runwayMeshes.has(r.id)) {
        const m = buildRunway(grid, r);
        this.runwayMeshes.set(r.id, m);
        this.group.add(m);
      }
    }

    for (const map of [this.runwayMeshes]) {
      for (const [id, m] of map) {
        if (!live.has(id)) {
          this.group.remove(m);
          disposeTree(m);
          map.delete(id);
        }
      }
    }
    if (this.taxiMesh) {
      this.group.remove(this.taxiMesh);
      disposeTree(this.taxiMesh);
    }
    // taxiways and every stand share one batch
    const mb = new MeshBuilder();
    buildTaxiways(grid, mb);
    for (const st of grid.stands) buildStand(grid, st, mb);
    this.taxiMesh = mb.build({ cast: false, receive: true });
    this.group.add(this.taxiMesh);
  }
}

function flat(w, d) {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  return g;
}

// ---------------------------------------------------------------------------
export function buildRunway(grid, r) {
  const len = r.length * TILE;
  const wid = BALANCE.runway.width * TILE;
  const cx = (r.start.x + r.end.x) / 2;
  const cz = (r.start.z + r.end.z) / 2;
  const y = RUNWAY_Y + PAINT_LIFT;
  // build along local +Z (landing direction), then rotate by heading
  const local = new MeshBuilder();
  local.add(M.tarmacDark, place(rbox(wid + 4, 0.5, len + 4, 0.2), 0, RUNWAY_Y - 0.27, 0));
  local.add(M.tarmac, place(rbox(wid, 0.5, len, 0.2), 0, RUNWAY_Y - 0.25, 0));
  const half = len / 2;
  // edge lines
  local.add(M.paint, place(flat(0.7, len - 2), wid / 2 - 1.1, y, 0));
  local.add(M.paint, place(flat(0.7, len - 2), -wid / 2 + 1.1, y, 0));
  for (const end of [-1, 1]) {
    const zEdge = end * half; // -half = threshold (start), +half = far end
    const inward = -end;
    // threshold bar + piano keys
    local.add(M.paint, place(flat(wid - 2, 1.4), 0, y, zEdge + inward * 1.6));
    const keyLen = Math.min(26, len * 0.05);
    for (let k = 0; k < 4; k++) {
      const off = 2.4 + k * 2.9;
      for (const s of [-1, 1]) local.add(M.paint, place(flat(1.6, keyLen), s * off, y, zEdge + inward * (3.5 + keyLen / 2)));
    }
    // numbers, readable to a plane landing in that direction
    const num = end === -1 ? r.nums[0] : r.nums[1];
    const numZ = zEdge + inward * (keyLen + 16);
    for (const g of segText(num, 13, 0.17)) {
      // text top toward -Z; for a plane rolling +Z, top should point +Z (away)
      g.rotateY(end === -1 ? Math.PI : 0);
      g.translate(0, y, numZ);
      local.add(M.paint, g);
    }
    // aiming point blocks
    if (len > 500) {
      const az = zEdge + inward * Math.min(170, len * 0.22);
      for (const s of [-1, 1]) local.add(M.paint, place(flat(3.4, 30), s * 6.5, y, az));
    }
    // touchdown pairs
    const tdz = zEdge + inward * Math.min(90, len * 0.13);
    for (const s of [-1, 1]) {
      local.add(M.paint, place(flat(1.3, 16), s * 5.2, y, tdz));
      local.add(M.paint, place(flat(1.3, 16), s * 8.2, y, tdz));
    }
  }
  // centre line dashes
  const keyLen = Math.min(26, len * 0.05);
  const start = -half + keyLen + 30;
  for (let z = start; z < half - keyLen - 30; z += 30) local.add(M.paint, place(flat(0.9, 15), 0, y, z + 7.5));
  const g = local.build({ cast: false, receive: true });
  g.position.set(cx, 0, cz);
  g.rotation.y = r.heading;
  g.userData.runwayId = r.id;
  return g;
}

// ---------------------------------------------------------------------------
export function buildTaxiways(grid, mb) {
  const W = grid.W, H = grid.H;
  const y = TARMAC_Y + PAINT_LIFT;
  const isTar = (x, z) => {
    const t = grid.get(x, z);
    return t === T.TAXI || t === T.STAND || t === T.RUNWAY;
  };
  for (let tz = 0; tz < H; tz++) {
    for (let tx = 0; tx < W; tx++) {
      if (grid.type[grid.idx(tx, tz)] !== T.TAXI) continue;
      const x = grid.wx(tx), z = grid.wz(tz);
      mb.add(M.tarmac, place(new THREE.BoxGeometry(TILE, 0.5, TILE), x, TARMAC_Y - 0.25, z));
      // centre line toward connected neighbours
      mb.add(M.paint, place(flat(0.55, 0.55), x, y, z));
      for (let d = 0; d < 4; d++) {
        const [dx, dz] = DIRS[d];
        const nx = tx + dx, nz = tz + dz;
        const nt = grid.get(nx, nz);
        let connect = nt === T.TAXI;
        if (nt === T.STAND) {
          const s = grid.structures.get(grid.owner[grid.idx(nx, nz)]);
          connect = s && s.entry === grid.idx(tx, tz);
        }
        if (nt === T.RUNWAY) connect = true;
        if (connect) {
          const lx = x + (dx * TILE) / 4, lz = z + (dz * TILE) / 4;
          mb.add(M.paint, place(flat(dx ? TILE / 2 : 0.55, dz ? TILE / 2 : 0.55), lx, y, lz));
          if (nt === T.RUNWAY) {
            // hold-short bars across the taxiway at the runway edge
            for (const k of [0.6, 1.5]) {
              const ox = x + dx * (TILE / 2 - k), oz = z + dz * (TILE / 2 - k);
              mb.add(M.paint, place(flat(dz ? TILE - 1 : 0.35, dx ? TILE - 1 : 0.35), ox, y, oz));
            }
          }
        } else if (!isTar(nx, nz)) {
          // edge line along the grass side
          const ox = x + dx * (TILE / 2 - 0.8), oz = z + dz * (TILE / 2 - 0.8);
          mb.add(M.paint, place(flat(dz ? TILE : 0.3, dx ? TILE : 0.3), ox, y, oz));
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
export function buildStand(grid, s, mb) {
  const m4 = new THREE.Matrix4().makeRotationY(s.heading).setPosition(s.center.x, 0, s.center.z);
  const local = { add: (material, g) => mb.add(material, g.applyMatrix4(m4)) };
  const size = s.n * TILE;
  const half = size / 2;
  const y = TARMAC_Y + PAINT_LIFT;
  local.add(M.tarmacLight, place(new THREE.BoxGeometry(size, 0.5, size), 0, TARMAC_Y - 0.26, 0));
  // safety box outline
  const inset = 1.6;
  const L = size - inset * 2;
  local.add(M.paint, place(flat(L, 0.35), 0, y, -half + inset));
  local.add(M.paint, place(flat(L, 0.35), 0, y, half - inset));
  local.add(M.paint, place(flat(0.35, L), -half + inset, y, 0));
  local.add(M.paint, place(flat(0.35, L), half - inset, y, 0));
  // lead-in line from back edge (-Z local) to stop bar near the front (+Z)
  const stopZ = half - 4;
  local.add(M.paint, place(flat(0.55, stopZ + half), 0, y, (stopZ - half) / 2));
  local.add(M.hivis, place(flat(5, 0.7), 0, y + 0.002, stopZ));
  // gap in the back outline where the lead-in enters
  // label
  // label near the front-left corner, always reading north-up in world space
  // remote stands paint just their number (a 7-segment S reads as a 5)
  for (const g of segText(s.gate ? s.label : String(s.number), Math.min(6, size * 0.16), 0.18)) {
    g.rotateY(-s.heading);
    g.translate(-half + 6.5, y, half - 7.5);
    local.add(M.paint, g);
  }
  // corner markers in hi-vis for the toy look
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    local.add(M.hivis, place(flat(1.4, 1.4), sx * (half - inset), y + 0.003, sz * (half - inset)));
  }
}
