import * as THREE from 'three';
import { M } from '../render/materials.js';
import { MeshBuilder, place, rbox, disposeTree } from '../render/geom.js';
import { T } from '../world/grid.js';
import { smooth, clamp, lerp } from '../core/math.js';

const ROT_H = 4.4; // rotunda floor height

// One jet bridge per gate: a rotunda by the terminal wall and a telescoping
// tunnel whose cab swings out to the parked plane's front-left door.
class JetBridge {
  constructor(scene, stand) {
    this.stand = stand;
    this.t = 0; // 0 parked .. 1 docked
    this.target = 0;
    this.door = null;
    const s = stand;
    const left = { x: Math.cos(s.heading), z: -Math.sin(s.heading) };
    this.left = left;
    // rotunda just outside the wall, a little left of the stand centre line
    this.base = { x: s.frontEdge.x + left.x * 3.4 - s.fwd.x * 2.6, z: s.frontEdge.z + left.z * 3.4 - s.fwd.z * 2.6 };
    this.group = new THREE.Group();
    // rotunda + column + corridor to the wall
    const mb = new MeshBuilder();
    mb.add(M.concrete, place(new THREE.CylinderGeometry(0.6, 0.7, ROT_H - 0.3, 10), 0, (ROT_H - 0.3) / 2, 0));
    mb.add(M.concrete, place(new THREE.CylinderGeometry(2.1, 2.1, 0.5, 16), 0, ROT_H - 0.1, 0));
    mb.add(M.glass, place(new THREE.CylinderGeometry(2.0, 2.0, 2.2, 16), 0, ROT_H + 1.25, 0));
    mb.add(M.concrete, place(new THREE.CylinderGeometry(2.2, 2.1, 0.45, 16), 0, ROT_H + 2.5, 0));
    mb.add(M.concrete, place(rbox(3, 2.9, 3.4, 0.2), 0, ROT_H + 1.2, 0));
    const fixed = mb.build();
    fixed.position.set(this.base.x, 0, this.base.z);
    // corridor from the rotunda into the terminal wall
    const cor = new MeshBuilder();
    cor.add(M.concrete, place(rbox(2.8, 3, 3.2, 0.25), 0, ROT_H + 1.2, 1.6));
    cor.add(M.glass, place(new THREE.BoxGeometry(2.9, 1.0, 3.0), 0, ROT_H + 1.5, 1.6));
    const corridor = cor.build();
    corridor.position.copy(fixed.position);
    corridor.rotation.y = s.heading;
    this.group.add(fixed, corridor);
    // tunnel (unit length along +z, scaled) + inner telescope + cab
    const tun = new MeshBuilder();
    tun.add(M.concrete, place(new THREE.BoxGeometry(2.7, 2.7, 1), 0, 0, 0.5));
    tun.add(M.glass, place(new THREE.BoxGeometry(2.75, 0.9, 0.98), 0, 0.35, 0.5));
    tun.add(M.hivis, place(new THREE.BoxGeometry(2.76, 0.18, 1), 0, -1.05, 0.5));
    this.tunnel = tun.build();
    const inner = new MeshBuilder();
    inner.add(M.concrete, place(new THREE.BoxGeometry(2.45, 2.45, 1), 0, 0, 0.5));
    this.inner = inner.build();
    const cab = new MeshBuilder();
    cab.add(M.concrete, place(rbox(3.2, 2.9, 2.6, 0.3), 0, 0, 0));
    cab.add(M.dark, place(new THREE.BoxGeometry(2.4, 2.4, 0.3), 0, -0.1, 1.25));
    cab.add(M.glass, place(new THREE.BoxGeometry(3.25, 0.8, 1.8), 0, 0.5, -0.2));
    // support leg + wheel bogie
    cab.add(M.metal, place(new THREE.CylinderGeometry(0.18, 0.18, 1, 8), 0, -2, -0.6));
    this.cab = cab.build();
    this.leg = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1, 8), M.metal);
    this.bogie = new THREE.Mesh(rbox(1.8, 0.7, 1.2, 0.2), M.dark);
    this.leg.castShadow = this.bogie.castShadow = true;
    this.group.add(this.tunnel, this.inner, this.cab, this.leg, this.bogie);
    scene.add(this.group);
    this.endPos = new THREE.Vector3();
    this.update(0, true);
  }

  get docked() {
    return this.target === 1 && this.t > 0.98;
  }

  dock(doorWorld) {
    this.door = doorWorld;
    this.target = 1;
  }

  retract() {
    this.target = 0;
  }

  // rotunda centre (start of the tunnel) at floor height
  startPoint() {
    return new THREE.Vector3(this.base.x, ROT_H + 0.15, this.base.z);
  }

  endPoint(out) {
    const s = this.stand;
    const parked = new THREE.Vector3(this.base.x + this.left.x * 3.5 - s.fwd.x * 6.5, ROT_H - 0.6, this.base.z + this.left.z * 3.5 - s.fwd.z * 6.5);
    if (!this.door) return out.copy(parked);
    const docked = new THREE.Vector3(this.door.x + this.door.ox * 2.6, this.door.y - 1.25, this.door.z + this.door.oz * 2.6);
    return out.copy(parked).lerp(docked, smooth(clamp(this.t, 0, 1)));
  }

  // points a passenger follows from the terminal wall to the cab
  walkPoints() {
    const a = this.startPoint();
    const b = this.endPoint(new THREE.Vector3());
    return [
      { x: a.x, z: a.z, y: a.y },
      { x: b.x, z: b.z, y: b.y + 0.15 },
    ];
  }

  update(dt, force = false) {
    const prev = this.t;
    this.t = clamp(this.t + (this.target - this.t > 0 ? 1 : -1) * dt * 0.28, 0, 1);
    if (Math.abs(this.target - this.t) < 0.005) this.t = this.target;
    if (!force && prev === this.t) return;
    const a = this.startPoint();
    const b = this.endPoint(this.endPos);
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.hypot(dx, dz, dy);
    const yaw = Math.atan2(dx, dz);
    const pitch = -Math.atan2(dy, Math.hypot(dx, dz));
    const mid = new THREE.Vector3(a.x, a.y + 1.2, a.z);
    const outer = len * 0.58;
    this.tunnel.position.copy(mid);
    this.tunnel.rotation.set(pitch, yaw, 0, 'YXZ');
    this.tunnel.scale.set(1, 1, Math.max(0.5, outer));
    this.inner.position.copy(mid);
    this.inner.rotation.copy(this.tunnel.rotation);
    this.inner.scale.set(1, 1, Math.max(0.5, len - 0.8));
    // cab faces the plane (perpendicular to the fuselage when docked)
    this.cab.position.set(b.x, b.y + 1.2, b.z);
    const faceYaw = this.door ? Math.atan2(-this.door.ox, -this.door.oz) : yaw;
    this.cab.rotation.y = lerp(yaw, yaw + wrap(faceYaw - yaw), smooth(this.t));
    const legH = b.y - 0.2;
    this.leg.position.set(b.x - Math.sin(yaw) * 1.2, legH / 2 + 0.4, b.z - Math.cos(yaw) * 1.2);
    this.leg.scale.set(1, Math.max(0.5, legH - 0.4), 1);
    this.bogie.position.set(this.leg.position.x, 0.6, this.leg.position.z);
    this.bogie.rotation.y = yaw;
  }

  dispose(scene) {
    scene.remove(this.group);
    disposeTree(this.group);
  }
}

function wrap(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class JetBridges {
  constructor(game) {
    this.game = game;
    this.map = new Map();
    this.version = -1;
    game.events.on('turnaroundStart', (ta) => {
      const jb = ta.stand && this.forStand(ta.stand.id);
      if (jb) jb.dock(ta.plane.doorWorld());
    });
    game.events.on('turnaroundPhase', (ta, phase) => {
      if (phase === 'ready') this.forStand(ta.stand?.id)?.retract();
    });
    game.events.on('pushback', (plane, stand) => stand && this.forStand(stand.id)?.retract());
  }

  forStand(id) {
    return this.map.get(id) || null;
  }

  sync() {
    const grid = this.game.grid;
    if (this.version === grid.version) return;
    this.version = grid.version;
    const live = new Set();
    for (const s of grid.stands) {
      if (!s.gate || grid.get(s.front[0], s.front[1]) !== T.TERMINAL) continue;
      live.add(s.id);
      if (!this.map.has(s.id)) this.map.set(s.id, new JetBridge(this.game.renderer.scene, s));
    }
    for (const [id, jb] of this.map) {
      if (!live.has(id)) {
        jb.dispose(this.game.renderer.scene);
        this.map.delete(id);
      }
    }
  }

  update(dt) {
    this.sync();
    for (const jb of this.map.values()) jb.update(dt);
  }

  clear() {
    for (const jb of this.map.values()) jb.dispose(this.game.renderer.scene);
    this.map.clear();
    this.version = -1;
  }
}

