import * as THREE from 'three';
import { BALANCE } from '../config/balance.js';
import { M, mat } from '../render/materials.js';
import { rbox, place, MeshBuilder } from '../render/geom.js';
import { mulberry32 } from '../core/math.js';

const TILE = BALANCE.map.tile;
const HW = (BALANCE.map.width * TILE) / 2;
const HH = (BALANCE.map.height * TILE) / 2;

// Everything outside the buildable board: road, car park, fence, trees,
// farm fields, distant hills and the control tower. Static and instanced.
export class Scenery {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    const rng = mulberry32(42);
    this.rng = rng;
    this.buildFields();
    this.buildRoad();
    this.buildCarPark();
    this.buildFence();
    this.buildTrees();
    this.buildHills();
    this.tower = this.buildTower();
  }

  buildFields() {
    const rng = this.rng;
    const tones = [0x9cc583, 0x86b66f, 0xa9cf8c, 0xc9cf7e, 0x93bd78, 0xb5c97a];
    const mb = new MeshBuilder();
    for (let i = 0; i < 70; i++) {
      const ang = rng() * Math.PI * 2;
      const r = 900 + rng() * 3500;
      const x = Math.cos(ang) * r * 1.3;
      const z = Math.sin(ang) * r;
      if (Math.abs(x) < HW + 120 && Math.abs(z) < HH + 160) continue;
      const w = 180 + rng() * 420, d = 140 + rng() * 360;
      const g = new THREE.PlaneGeometry(w, d);
      place(g, x, -0.3 + rng() * 0.05, z, -Math.PI / 2, 0, rng() * 0.6 - 0.3);
      mb.add(mat(tones[(rng() * tones.length) | 0], { roughness: 0.95 }), g);
    }
    const g = mb.build({ cast: false });
    g.traverse((o) => (o.receiveShadow = true));
    this.group.add(g);
  }

  buildRoad() {
    const z = HH + 48;
    this.roadZ = z;
    const mb = new MeshBuilder();
    mb.add(M.road, place(new THREE.BoxGeometry(9000, 0.3, 16), 0, -0.2, z));
    // pavement strips
    mb.add(M.concrete, place(new THREE.BoxGeometry(9000, 0.4, 2.5), 0, -0.15, z - 9.2));
    mb.add(M.concrete, place(new THREE.BoxGeometry(9000, 0.4, 2.5), 0, -0.15, z + 9.2));
    for (let x = -4400; x < 4400; x += 14) {
      mb.add(M.paint, place(new THREE.PlaneGeometry(6, 0.45), x, 0.0, z, -Math.PI / 2));
    }
    // access road into the car park
    mb.add(M.road, place(new THREE.BoxGeometry(14, 0.3, 30), 60, -0.2, z - 22));
    const g = mb.build({ cast: false });
    this.group.add(g);
  }

  buildCarPark() {
    const rng = this.rng;
    const z0 = HH + 14, x0 = -140, w = 300, d = 22;
    const lot = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), M.road);
    lot.position.set(x0 + w / 2, -0.18, z0 + d / 2);
    lot.receiveShadow = true;
    this.group.add(lot);
    const lines = new MeshBuilder();
    for (let x = x0 + 4; x < x0 + w - 2; x += 4.5) lines.add(M.paint, place(new THREE.PlaneGeometry(0.25, 7), x, -0.02, z0 + 5, -Math.PI / 2));
    for (let x = x0 + 4; x < x0 + w - 2; x += 4.5) lines.add(M.paint, place(new THREE.PlaneGeometry(0.25, 7), x, -0.02, z0 + d - 5, -Math.PI / 2));
    this.group.add(lines.build({ cast: false }));

    // parked cars: two instanced meshes (body + cabin)
    const colors = [0xe4572e, 0x2e86ab, 0xf7f5ef, 0x3b3b58, 0xffd23f, 0x7bc67b, 0xc0392b, 0x9aa3ad, 0x1f3a5f];
    const slots = [];
    for (let x = x0 + 6.25; x < x0 + w - 4; x += 4.5) {
      if (rng() < 0.72) slots.push([x, z0 + 5]);
      if (rng() < 0.6) slots.push([x, z0 + d - 5]);
    }
    const body = new THREE.InstancedMesh(rbox(1.9, 1.0, 4.3, 0.35), mat(0xffffff, { roughness: 0.4 }), slots.length);
    const cabin = new THREE.InstancedMesh(rbox(1.7, 0.75, 2.3, 0.3), M.window, slots.length);
    const m4 = new THREE.Matrix4();
    const c = new THREE.Color();
    slots.forEach(([x, z], i) => {
      const flip = rng() < 0.5 ? 0 : Math.PI;
      m4.makeRotationY(flip).setPosition(x, 0.65, z);
      body.setMatrixAt(i, m4);
      body.setColorAt(i, c.setHex(colors[(rng() * colors.length) | 0]));
      m4.makeRotationY(flip).setPosition(x, 1.45, z + (flip ? 0.2 : -0.2));
      cabin.setMatrixAt(i, m4);
    });
    body.castShadow = cabin.castShadow = true;
    body.receiveShadow = true;
    this.group.add(body, cabin);
  }

  buildFence() {
    const posts = [];
    const step = 12;
    const off = 8;
    for (let x = -HW - off; x <= HW + off; x += step) posts.push([x, -HH - off], [x, HH + off]);
    for (let z = -HH - off + step; z < HH + off; z += step) posts.push([-HW - off, z], [HW + off, z]);
    const post = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 6), M.metal, posts.length);
    const m4 = new THREE.Matrix4();
    posts.forEach(([x, z], i) => post.setMatrixAt(i, m4.makeTranslation(x, 1.2, z)));
    this.group.add(post);
    const rail = new MeshBuilder();
    const L = (HW + off) * 2, D = (HH + off) * 2;
    for (const y of [1.0, 2.3]) {
      rail.add(M.metal, place(new THREE.BoxGeometry(L, 0.06, 0.06), 0, y, -HH - off));
      rail.add(M.metal, place(new THREE.BoxGeometry(L, 0.06, 0.06), 0, y, HH + off));
      rail.add(M.metal, place(new THREE.BoxGeometry(0.06, 0.06, D), -HW - off, y, 0));
      rail.add(M.metal, place(new THREE.BoxGeometry(0.06, 0.06, D), HW + off, y, 0));
    }
    this.group.add(rail.build({ cast: false }));
  }

  buildTrees() {
    const rng = this.rng;
    const spots = [];
    const ok = (x, z) => {
      if (Math.abs(x) < HW + 22 && Math.abs(z) < HH + 22) return false;
      if (Math.abs(z - this.roadZ) < 16) return false;
      if (x > -150 && x < 170 && z > HH && z < HH + 40) return false; // car park
      if (x > -560 && x < -470 && z > HH && z < HH + 40) return false; // tower
      return true;
    };
    // tree lines hugging the fence and scattered copses further out
    for (let i = 0; i < 520; i++) {
      const side = (rng() * 4) | 0;
      const along = rng() * 2 - 1;
      const out = 26 + rng() * 70;
      let x, z;
      if (side === 0) { x = along * (HW + 80); z = -HH - out; }
      else if (side === 1) { x = along * (HW + 80); z = HH + out + 30; }
      else if (side === 2) { x = -HW - out; z = along * (HH + 80); }
      else { x = HW + out; z = along * (HH + 80); }
      if (ok(x, z)) spots.push([x, z, 0.8 + rng() * 0.7]);
    }
    for (let c = 0; c < 60; c++) {
      const ang = rng() * Math.PI * 2;
      const r = 850 + rng() * 2600;
      const cx = Math.cos(ang) * r * 1.25, cz = Math.sin(ang) * r;
      const n = 6 + ((rng() * 18) | 0);
      for (let i = 0; i < n; i++) {
        const x = cx + (rng() - 0.5) * 120, z = cz + (rng() - 0.5) * 120;
        if (ok(x, z)) spots.push([x, z, 0.9 + rng() * 0.9]);
      }
    }
    const crowns = [
      { geo: new THREE.IcosahedronGeometry(4.2, 0), mat: M.treeA, y: 7.5, sy: 1.15 },
      { geo: new THREE.ConeGeometry(4, 10, 7), mat: M.treeC, y: 8.5, sy: 1 },
      { geo: new THREE.DodecahedronGeometry(4.6, 0), mat: M.treeB, y: 7.2, sy: 0.95 },
    ];
    const per = crowns.map(() => []);
    for (const s of spots) per[(rng() * crowns.length) | 0].push(s);
    const trunkGeo = new THREE.CylinderGeometry(0.45, 0.65, 5, 6);
    trunkGeo.translate(0, 2.5, 0);
    const trunks = new THREE.InstancedMesh(trunkGeo, M.trunk, spots.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const pos = new THREE.Vector3();
    let ti = 0;
    crowns.forEach((cr, k) => {
      const list = per[k];
      const im = new THREE.InstancedMesh(cr.geo, cr.mat, list.length);
      list.forEach(([x, z, s], i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * 6.28);
        sc.set(s, s * cr.sy, s);
        pos.set(x, cr.y * s, z);
        im.setMatrixAt(i, m4.compose(pos, q, sc));
        sc.set(s, s, s);
        pos.set(x, 0, z);
        trunks.setMatrixAt(ti++, m4.compose(pos, q, sc));
      });
      im.castShadow = true;
      im.receiveShadow = true;
      this.group.add(im);
    });
    trunks.castShadow = true;
    this.group.add(trunks);
  }

  buildHills() {
    const rng = this.rng;
    const tones = [0x8cbf7d, 0x7fb373, 0x9ac889];
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2 + rng() * 0.3;
      const r = 4800 + rng() * 2500;
      const g = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
      const m = new THREE.Mesh(g, mat(tones[i % 3], { roughness: 1, flatShading: false }));
      m.position.set(Math.cos(ang) * r, -2, Math.sin(ang) * r);
      m.scale.set(900 + rng() * 900, 120 + rng() * 260, 700 + rng() * 700);
      m.rotation.y = rng() * 3;
      this.group.add(m);
    }
  }

  buildTower() {
    const g = new THREE.Group();
    const mb = new MeshBuilder();
    const H = 38;
    mb.add(M.concrete, place(new THREE.CylinderGeometry(2.6, 3.4, H, 16), 0, H / 2, 0));
    mb.add(M.concreteDark, place(new THREE.CylinderGeometry(3.6, 3.6, 0.8, 16), 0, H * 0.55, 0));
    mb.add(M.concrete, place(new THREE.CylinderGeometry(6.4, 3.2, 3, 8), 0, H + 1.5, 0));
    mb.add(M.glass, place(new THREE.CylinderGeometry(7.0, 6.2, 5, 8), 0, H + 5.5, 0));
    // window mullions
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      mb.add(M.dark, place(new THREE.BoxGeometry(0.35, 5.2, 0.35), Math.sin(a) * 6.6, H + 5.5, Math.cos(a) * 6.6));
    }
    mb.add(M.dark, place(new THREE.CylinderGeometry(7.8, 7.4, 1.2, 8), 0, H + 8.6, 0));
    mb.add(M.concrete, place(new THREE.CylinderGeometry(3.6, 7.2, 1.4, 8), 0, H + 9.8, 0));
    mb.add(M.metal, place(new THREE.CylinderGeometry(0.2, 0.2, 9, 6), 0, H + 15, 0));
    mb.add(M.red, place(new THREE.SphereGeometry(0.5, 10, 8), 0, H + 19.6, 0));
    // base building
    mb.add(M.concrete, place(rbox(26, 7, 16, 1), 6, 3.5, 4));
    mb.add(M.glass, place(new THREE.BoxGeometry(26.2, 2.2, 16.2), 6, 4.2, 4));
    mb.add(M.concreteDark, place(rbox(27, 0.8, 17, 0.3), 6, 7.2, 4));
    g.add(mb.build());
    // radar dish on a little mast, spins
    const dish = new THREE.Group();
    const dmb = new MeshBuilder();
    dmb.add(M.white, place(new THREE.BoxGeometry(6.5, 1.4, 0.4), 0, 0, 0));
    dmb.add(M.metal, place(new THREE.BoxGeometry(0.6, 0.6, 1.4), 0, -0.4, 0.5));
    dish.add(dmb.build());
    dish.position.set(6, 9.4, 4);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 2.4, 8), M.metal);
    mast.position.set(6, 8, 4);
    g.add(mast, dish);
    g.position.set(-510, 0, HH + 24);
    g.rotation.y = 0.3;
    g.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.scene.add(g);
    this.dish = dish;
    return g;
  }

  update(dt) {
    this.dish.rotation.y += dt * 1.6;
  }
}

