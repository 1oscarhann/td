import * as THREE from 'three';
import { BALANCE } from '../config/balance.js';
import { BUILD } from '../config/palette.js';
import { M, mat } from '../render/materials.js';
import { MeshBuilder, place, rbox, disposeTree } from '../render/geom.js';
import { T, DIRS } from '../world/grid.js';
import { clamp } from '../core/math.js';

const TILE = BALANCE.map.tile;
export const FLOOR_Y = 0.6;
const WALL_H = 6.4;
const ROOF_Y = 7.0;

// Terminal building: floor, glass curtain walls with concrete mullions, entrance
// doors on the south side and a roof that lifts away when you zoom in.
export class TerminalMesh {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this.group = new THREE.Group();
    this.roofGroup = new THREE.Group();
    scene.add(this.group, this.roofGroup);
    this.roofMats = [
      new THREE.MeshStandardMaterial({ color: BUILD.concrete, roughness: 0.85, transparent: true }),
      new THREE.MeshStandardMaterial({ color: 0xc4beb3, roughness: 0.85, transparent: true }),
      new THREE.MeshStandardMaterial({ color: BUILD.glass, roughness: 0.1, metalness: 0.3, transparent: true }),
      new THREE.MeshStandardMaterial({ color: 0xa9b1ba, roughness: 0.5, metalness: 0.3, transparent: true }),
    ];
    this.roofOpacity = 1;
    this.dirty = true;
    game.events.on('gridChanged', (what) => {
      if (what === 'terminal' || what === 'clear' || what === 'stand' || what === 'room' || what === 'runway') this.dirty = true;
    });
  }

  update(dt, forceOpen) {
    if (this.dirty) {
      this.dirty = false;
      this.rebuild();
    }
    const dist = this.game.camera.viewDistance();
    const want = forceOpen || dist < 520 ? 0 : 1;
    this.roofOpacity = clamp(this.roofOpacity + (want - this.roofOpacity) * Math.min(1, dt * 6), 0, 1);
    for (const m of this.roofMats) {
      m.opacity = this.roofOpacity;
      m.depthWrite = this.roofOpacity > 0.95;
    }
    this.roofGroup.visible = this.roofOpacity > 0.02;
    this.roofGroup.position.y = (1 - this.roofOpacity) * 6;
  }

  rebuild() {
    for (const g of [this.group, this.roofGroup]) {
      for (const c of [...g.children]) {
        g.remove(c);
        disposeTree(c);
      }
    }
    const grid = this.game.grid;
    const term = this.game.terminal;
    term.refresh();
    const isT = (x, z) => grid.get(x, z) === T.TERMINAL;
    const doorSet = term.doorTileSet;
    const gateDoors = term.gateDoorSides;
    const mb = new MeshBuilder();
    const roof = new MeshBuilder();
    const [roofMat, trimMat, skyMat, plantMat] = this.roofMats;
    let any = false;
    for (let tz = 0; tz < grid.H; tz++) {
      for (let tx = 0; tx < grid.W; tx++) {
        if (!isT(tx, tz)) continue;
        any = true;
        const x = grid.wx(tx), z = grid.wz(tz);
        mb.add(M.concreteDark, place(new THREE.BoxGeometry(TILE, 0.4, TILE), x, 0.15, z));
        mb.add(M.floor, place(new THREE.BoxGeometry(TILE, 0.12, TILE), x, FLOOR_Y - 0.06, z));
        // roof tile
        roof.add(roofMat, place(new THREE.BoxGeometry(TILE, 0.7, TILE), x, ROOF_Y + 0.35, z));
        if ((tx + tz * 3) % 7 === 0) roof.add(plantMat, place(rbox(3.2, 1.6, 2.4, 0.25), x + 1.5, ROOF_Y + 1.5, z - 1));
        if (tz % 2 === 0) roof.add(skyMat, place(new THREE.BoxGeometry(TILE * 0.6, 0.3, 2.2), x, ROOF_Y + 0.82, z));
        for (let d = 0; d < 4; d++) {
          const [dx, dz] = DIRS[d];
          if (isT(tx + dx, tz + dz)) continue;
          const key = grid.idx(tx, tz) * 4 + d;
          const door = d === 2 && doorSet.has(grid.idx(tx, tz));
          const gateDoor = gateDoors.has(key);
          this.wallSegment(mb, x, z, d, door, gateDoor);
          // roof overhang + fascia
          const ox = x + dx * (TILE / 2 + 0.9), oz = z + dz * (TILE / 2 + 0.9);
          roof.add(roofMat, place(new THREE.BoxGeometry(dx ? 1.8 : TILE + 3.6, 0.6, dz ? 1.8 : TILE + 3.6), ox, ROOF_Y + 0.4, oz));
          roof.add(trimMat, place(new THREE.BoxGeometry(dx ? 0.3 : TILE + 3.6, 1.1, dz ? 0.3 : TILE + 3.6), x + dx * (TILE / 2 + 1.8), ROOF_Y + 0.35, z + dz * (TILE / 2 + 1.8)));
          if (door) this.entrance(mb, x, z);
        }
      }
    }
    if (!any) return;
    const g = mb.build();
    g.traverse((o) => {
      if (o.isMesh && o.material === M.glassClear) {
        o.castShadow = false;
        o.renderOrder = 3;
      }
    });
    this.group.add(g);
    const r = roof.build();
    this.roofGroup.add(r);
  }

  wallSegment(mb, x, z, d, door, gateDoor) {
    const [dx, dz] = DIRS[d];
    const ex = x + dx * (TILE / 2 - 0.2), ez = z + dz * (TILE / 2 - 0.2);
    const along = (w, h, t) => (dx ? new THREE.BoxGeometry(t, h, w) : new THREE.BoxGeometry(w, h, t));
    // base kerb and top band
    mb.add(M.concrete, place(along(TILE, 0.7, 0.6), ex, FLOOR_Y + 0.35, ez));
    mb.add(M.concrete, place(along(TILE, 0.9, 0.6), ex, WALL_H + 0.15, ez));
    // glass
    if (gateDoor) {
      mb.add(M.glassClear, place(along(TILE * 0.32, WALL_H - 1.1, 0.25), ex + (dz ? -TILE * 0.34 : 0), FLOOR_Y + (WALL_H - 1.1) / 2 + 0.7, ez + (dx ? -TILE * 0.34 : 0)));
      mb.add(M.glassClear, place(along(TILE * 0.32, WALL_H - 1.1, 0.25), ex + (dz ? TILE * 0.34 : 0), FLOOR_Y + (WALL_H - 1.1) / 2 + 0.7, ez + (dx ? TILE * 0.34 : 0)));
      mb.add(M.concreteDark, place(along(TILE * 0.36, 1.6, 0.5), ex, WALL_H - 0.9, ez));
    } else if (!door) {
      mb.add(M.glassClear, place(along(TILE, WALL_H - 1.1, 0.25), ex, FLOOR_Y + (WALL_H - 1.1) / 2 + 0.7, ez));
    }
    // mullions
    for (let k = 0; k <= 4; k++) {
      const o = -TILE / 2 + (k * TILE) / 4;
      mb.add(M.concrete, place(new THREE.BoxGeometry(0.5, WALL_H, 0.5), ex + (dz ? o : 0), WALL_H / 2 + 0.3, ez + (dx ? o : 0)));
    }
  }

  entrance(mb, x, z) {
    const ez = z + TILE / 2;
    // sliding doors: dark frame and two glass leaves, slightly recessed
    mb.add(M.dark, place(new THREE.BoxGeometry(TILE * 0.6, 3.6, 0.35), x, FLOOR_Y + 1.8, ez - 0.1));
    mb.add(M.glass, place(new THREE.BoxGeometry(TILE * 0.26, 3.2, 0.2), x - TILE * 0.14, FLOOR_Y + 1.6, ez));
    mb.add(M.glass, place(new THREE.BoxGeometry(TILE * 0.26, 3.2, 0.2), x + TILE * 0.14, FLOOR_Y + 1.6, ez));
    mb.add(M.glassClear, place(new THREE.BoxGeometry(TILE, WALL_H - 4.9, 0.25), x, FLOOR_Y + 4.3, ez - 0.2));
    // canopy with hi-vis edge
    mb.add(M.concrete, place(rbox(TILE * 0.9, 0.45, 5, 0.15), x, 4.9, ez + 2.4));
    mb.add(M.hivis, place(rbox(TILE * 0.9, 0.5, 0.4, 0.12), x, 4.9, ez + 4.8));
    mb.add(M.metal, place(new THREE.CylinderGeometry(0.16, 0.16, 4.4, 8), x - TILE * 0.38, 2.7, ez + 4.5));
    mb.add(M.metal, place(new THREE.CylinderGeometry(0.16, 0.16, 4.4, 8), x + TILE * 0.38, 2.7, ez + 4.5));
    // kerb + mat
    mb.add(mat(0x44505e), place(new THREE.BoxGeometry(TILE * 0.5, 0.05, 2), x, FLOOR_Y + 0.03, ez - 1.2));
  }
}
