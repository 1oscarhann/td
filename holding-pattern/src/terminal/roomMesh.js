import * as THREE from 'three';
import { BUILD } from '../config/palette.js';
import { M, mat } from '../render/materials.js';
import { MeshBuilder, place, rbox, disposeTree } from '../render/geom.js';
import { FLOOR_Y } from './terminalMesh.js';

const Y = FLOOR_Y;
const carpet = {
  checkin: mat(0xc9d6df, { roughness: 0.95 }),
  security: mat(0xd6d0c4, { roughness: 0.95 }),
  lounge: mat(0x9fb3c8, { roughness: 0.95 }),
};
const seatMat = mat(0x1f3a5f, { roughness: 0.6 });
const seatMat2 = mat(0x2e86ab, { roughness: 0.6 });
const beltMat = mat(0x2b2f38, { roughness: 0.4 });
const signMat = mat(BUILD.hivis, { roughness: 0.5 });
const plantMat = mat(0x5f9a58, { roughness: 0.9, flatShading: true });
const potMat = mat(0xb9b3a8, { roughness: 0.8 });

function person(mb, x, z, shirt, rotY = 0) {
  mb.add(mat(shirt, { roughness: 0.7 }), place(new THREE.CapsuleGeometry(0.27, 0.72, 3, 8), x, Y + 0.63, z, 0, rotY));
  mb.add(mat(0xd9a07b, { roughness: 0.6 }), place(new THREE.SphereGeometry(0.2, 10, 8), x, Y + 1.45, z));
}

function stanchions(mb, rows, x0, x1, z0, dz) {
  // posts and belts that make the queue snake
  for (let r = 0; r <= rows; r++) {
    const z = z0 + r * dz;
    // the gap alternates ends
    const a = r % 2 === 0 ? x0 + 1.2 : x0, b = r % 2 === 0 ? x1 : x1 - 1.2;
    for (const x of [a, b]) {
      mb.add(M.metal, place(new THREE.CylinderGeometry(0.05, 0.06, 1.0, 6), x, Y + 0.5, z));
      mb.add(M.metal, place(new THREE.CylinderGeometry(0.16, 0.18, 0.05, 10), x, Y + 0.03, z));
    }
    mb.add(beltMat, place(new THREE.BoxGeometry(b - a, 0.07, 0.03), (a + b) / 2, Y + 0.9, z));
  }
}

function buildCheckin(mb) {
  mb.add(carpet.checkin, place(new THREE.BoxGeometry(9.6, 0.04, 19.6), 0, Y + 0.02, 0));
  // back wall with sign
  mb.add(M.concrete, place(rbox(9.4, 3.6, 0.5, 0.15), 0, Y + 1.8, -9.5));
  mb.add(signMat, place(rbox(5.5, 0.9, 0.2, 0.1), -1, Y + 3.0, -9.15));
  // counter + scale belt
  mb.add(M.concrete, place(rbox(5.2, 1.15, 1.1, 0.2), -1, Y + 0.58, -6.6));
  mb.add(M.white, place(rbox(5.3, 0.1, 1.2, 0.05), -1, Y + 1.18, -6.6));
  mb.add(beltMat, place(new THREE.BoxGeometry(1.0, 0.35, 2.2), 2.4, Y + 0.25, -6.9));
  mb.add(M.dark, place(rbox(0.6, 0.45, 0.06, 0.03), -1.5, Y + 1.45, -6.9, -0.3));
  person(mb, -1, -7.9, BUILD.hivis);
  // baggage drop belt running into the wall
  mb.add(beltMat, place(new THREE.BoxGeometry(1.0, 0.5, 2.5), 3.4, Y + 0.25, -8.4));
  stanchions(mb, 6, -4.6, 0.2, -1.9, 1.6);
}

function buildSecurity(mb) {
  mb.add(carpet.security, place(new THREE.BoxGeometry(9.6, 0.04, 19.6), 0, Y + 0.02, 0));
  // walk-through arch
  mb.add(M.concrete, place(rbox(0.35, 2.4, 0.7, 0.1), -2.3, Y + 1.2, -2));
  mb.add(M.concrete, place(rbox(0.35, 2.4, 0.7, 0.1), -0.3, Y + 1.2, -2));
  mb.add(M.concrete, place(rbox(2.35, 0.35, 0.75, 0.12), -1.3, Y + 2.45, -2));
  mb.add(signMat, place(rbox(0.5, 0.15, 0.2, 0.05), -1.3, Y + 2.7, -2));
  // x-ray machine and belts
  mb.add(beltMat, place(new THREE.BoxGeometry(1.1, 0.75, 7.5), 2.2, Y + 0.38, -1.0));
  mb.add(M.concrete, place(rbox(1.7, 1.7, 2.4, 0.2), 2.2, Y + 1.0, -1.8));
  mb.add(M.dark, place(new THREE.BoxGeometry(1.2, 0.7, 2.45), 2.2, Y + 0.85, -1.8));
  mb.add(M.window, place(rbox(0.7, 0.5, 0.06, 0.03), 3.3, Y + 1.5, -3.6, 0, 0.6));
  for (let i = 0; i < 4; i++) mb.add(M.dark, place(new THREE.BoxGeometry(0.7, 0.08, 0.5), 2.2, Y + 0.8, 1.6 + i * 0.6));
  person(mb, 0.9, -3.2, 0x1f3a5f, 0);
  person(mb, 3.6, -1.2, 0x1f3a5f, 0);
  // low glass screens down the sides
  mb.add(M.glassClear, place(new THREE.BoxGeometry(0.1, 1.3, 19), -4.85, Y + 0.65, 0));
  mb.add(M.glassClear, place(new THREE.BoxGeometry(0.1, 1.3, 19), 4.85, Y + 0.65, 0));
  stanchions(mb, 5, -4.6, -0.6, 1.4, 1.5);
}

function buildLounge(mb) {
  mb.add(carpet.lounge, place(new THREE.BoxGeometry(19.6, 0.04, 19.6), 0, Y + 0.02, 0));
  for (let row = 0; row < 5; row++) {
    for (let k = 0; k < 8; k++) {
      const x = -7 + k * 2, z = -6.5 + row * 3.1;
      const m = row % 2 ? seatMat2 : seatMat;
      mb.add(m, place(rbox(0.9, 0.18, 0.85, 0.06), x, Y + 0.45, z));
      mb.add(m, place(rbox(0.9, 0.7, 0.14, 0.06), x, Y + 0.8, z - 0.42 * (row % 2 ? -1 : 1)));
      mb.add(M.metal, place(new THREE.BoxGeometry(0.08, 0.4, 0.08), x, Y + 0.2, z));
    }
  }
  // gate podium + flight screen
  mb.add(M.concrete, place(rbox(2.6, 1.15, 1.0, 0.2), 6.5, Y + 0.58, 8.4));
  mb.add(signMat, place(rbox(2.6, 0.12, 1.05, 0.05), 6.5, Y + 1.2, 8.4));
  mb.add(M.dark, place(rbox(2.2, 1.2, 0.12, 0.05), 6.5, Y + 2.6, 9.4));
  mb.add(M.metal, place(new THREE.CylinderGeometry(0.06, 0.06, 2.0, 6), 6.5, Y + 1.0, 9.4));
  person(mb, 6.5, 9.1, BUILD.hivis, Math.PI);
  // plants in the corners
  for (const [x, z] of [[-8.6, -8.6], [8.6, -8.6], [-8.6, 8.6]]) {
    mb.add(potMat, place(new THREE.CylinderGeometry(0.55, 0.45, 0.8, 10), x, Y + 0.4, z));
    mb.add(plantMat, place(new THREE.IcosahedronGeometry(0.9, 0), x, Y + 1.5, z, 0, 0, 0, 1, 1.3, 1));
  }
}

const BUILDERS = { checkin: buildCheckin, security: buildSecurity, lounge: buildLounge };

// Applies a room's placement to every part before handing it to the shared batch.
class PlacedBuilder {
  constructor(target, matrix) {
    this.target = target;
    this.matrix = matrix;
  }
  add(material, geometry) {
    geometry.applyMatrix4(this.matrix);
    return this.target.add(material, geometry);
  }
}

// Furniture for every terminal room, batched by material into a handful of
// meshes and rebuilt when rooms change.
export class RoomMeshes {
  constructor(scene, game) {
    this.game = game;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.version = -1;
  }

  update() {
    const grid = this.game.grid;
    if (this.version === grid.version) return;
    this.version = grid.version;
    for (const c of [...this.group.children]) {
      this.group.remove(c);
      disposeTree(c);
    }
    const rooms = grid.rooms;
    if (!rooms.length) return;
    const mb = new MeshBuilder();
    const m4 = new THREE.Matrix4();
    for (const r of rooms) {
      m4.makeRotationY(r.heading).setPosition(r.center.x, 0, r.center.z);
      BUILDERS[r.type](new PlacedBuilder(mb, m4.clone()));
    }
    const g = mb.build();
    g.traverse((o) => {
      if (o.isMesh && o.material.transparent) {
        o.castShadow = false;
        o.renderOrder = 3;
      }
    });
    this.group.add(g);
  }
}
