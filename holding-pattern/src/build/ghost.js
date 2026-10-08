import * as THREE from 'three';
import { BALANCE } from '../config/balance.js';

const TILE = BALANCE.map.tile;
const COLORS = {
  ok: new THREE.Color(0x4fe08a),
  warn: new THREE.Color(0xff8a5c),
  bad: new THREE.Color(0xff5a5f),
  free: new THREE.Color(0x9fd8ff),
  demo: new THREE.Color(0xf2a541),
};

// Translucent green/red tile preview, plus a direction arrow and outline.
export class Ghost {
  constructor(scene) {
    this.max = 10000;
    const geo = new THREE.BoxGeometry(TILE * 0.94, 0.6, TILE * 0.94);
    const m = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.42, depthWrite: false, toneMapped: false });
    this.tiles = new THREE.InstancedMesh(geo, m, this.max);
    this.tiles.count = 0;
    this.tiles.renderOrder = 5;
    this.tiles.frustumCulled = false;
    this.tiles.setColorAt(0, COLORS.ok);
    scene.add(this.tiles);

    const shape = new THREE.Shape();
    shape.moveTo(-1.2, -2);
    shape.lineTo(1.2, -2);
    shape.lineTo(1.2, 0.4);
    shape.lineTo(2.6, 0.4);
    shape.lineTo(0, 3);
    shape.lineTo(-2.6, 0.4);
    shape.lineTo(-1.2, 0.4);
    shape.closePath();
    const ag = new THREE.ShapeGeometry(shape);
    ag.rotateX(Math.PI / 2); // lie flat, tip toward +Z
    this.arrowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    this.arrows = [];
    for (let i = 0; i < 3; i++) {
      const a = new THREE.Mesh(ag, this.arrowMat);
      a.renderOrder = 6;
      a.visible = false;
      scene.add(a);
      this.arrows.push(a);
    }
    this._m = new THREE.Matrix4();
  }

  show(tiles, grid, y = 0.6) {
    const n = Math.min(tiles.length, this.max);
    for (let i = 0; i < n; i++) {
      const [x, z, st] = tiles[i];
      this._m.makeTranslation(grid.wx(x), y, grid.wz(z));
      this.tiles.setMatrixAt(i, this._m);
      this.tiles.setColorAt(i, COLORS[st] || COLORS.ok);
    }
    this.tiles.count = n;
    this.tiles.instanceMatrix.needsUpdate = true;
    if (this.tiles.instanceColor) this.tiles.instanceColor.needsUpdate = true;
  }

  // arrows: [{ x, z, yaw, scale }]
  showArrows(list = []) {
    this.arrows.forEach((a, i) => {
      const d = list[i];
      a.visible = !!d;
      if (!d) return;
      a.position.set(d.x, 1.2, d.z);
      a.rotation.set(0, d.yaw, 0);
      a.scale.setScalar(d.scale || 1);
    });
  }

  hide() {
    this.tiles.count = 0;
    this.showArrows([]);
  }
}
