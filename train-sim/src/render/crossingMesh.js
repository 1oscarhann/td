import * as THREE from 'three';
import { makeGlow, glowSize } from './signalMesh.js';
import { makeLabelTexture } from './textures.js';
import { makeBoard } from './scenery.js';

/**
 * A level crossing: road surface over the tracks and approach road, and for barrier crossings
 * the barrier booms (red and white), the twin flashing red road lights and amber light.
 */
export class CrossingView {
  /**
   * @param {import('../sim/crossings.js').LevelCrossing} lc
   * @param {import('./coords.js').WorldMapper} mapper
   * @param {THREE.Texture} glowTexture
   * @param {{ height: (x: number, y: number) => number } | null} ground real terrain, if any
   */
  constructor(lc, mapper, glowTexture, ground) {
    this.lc = lc;
    this.group = new THREE.Group();
    this.group.name = `crossing ${lc.name}`;
    const line = mapper.network.line(lc.def.line);
    const s = lc.def.position;
    const offsets = line.data.tracks.map((/** @type {any} */ t) => t.offset);
    const lo = Math.min(...offsets) - 3.2;
    const hi = Math.max(...offsets) + 3.2;
    const road = lc.hasBarriers || lc.type === 'UWC';
    const width = lc.type === 'FP' || lc.type === 'BW' ? 1.6 : lc.def.roadClass === 'primary' || lc.def.roadClass === 'secondary' ? 7.5 : lc.hasBarriers ? 6.5 : 3.5;
    const surface = new THREE.MeshLambertMaterial({ color: road ? 0x3e3f42 : 0x6d6253, polygonOffset: true, polygonOffsetFactor: -1 });

    // Deck over the tracks, level with the railhead.
    const deck = new THREE.Mesh(new THREE.BoxGeometry(hi - lo, 0.12, width), surface);
    mapper.point(line.id, s, (lo + hi) / 2, -0.04, deck.position);
    deck.rotation.y = mapper.yaw(line.id, s, 1) + Math.PI / 2;
    this.group.add(deck);

    // Approach roads either side (straight, across the line), sloping down to the ground.
    for (const side of [-1, 1]) {
      const len = road ? 40 : 15;
      const edge = side < 0 ? lo : hi;
      const start = mapper.point(line.id, s, edge, -0.04);
      const end = mapper.point(line.id, s, edge + side * len, -0.6);
      if (ground) end.y = ground.height(end.x, -end.z) + 0.15;
      const mid = start.clone().add(end).multiplyScalar(0.5);
      const seg = new THREE.Mesh(new THREE.BoxGeometry(width, 0.15, start.distanceTo(end)), surface);
      seg.position.copy(mid);
      seg.lookAt(end);
      this.group.add(seg);
    }

    /** @type {{ pivot: THREE.Object3D }[]} */
    this.barriers = [];
    /** @type {THREE.Sprite[][]} red lights per road-light pair: [left, right] */
    this.reds = [];
    /** @type {THREE.Sprite[]} */
    this.ambers = [];
    if (lc.hasBarriers) {
      const boomMat = new THREE.MeshLambertMaterial({ map: stripes() });
      const postMat = new THREE.MeshLambertMaterial({ color: 0xdddddd });
      const full = lc.type === 'MCB';
      for (const side of [-1, 1]) {
        const edge = (side < 0 ? lo : hi) + side * 1.5;
        // Road lights face the approaching road traffic.
        for (const across of [-1, 1]) {
          const roadSide = across * (width / 2 + 0.8);
          // Barrier on the left of each carriageway as traffic approaches; full barriers close both.
          const entrance = side * across < 0;
          if (full || entrance) {
            const base = mapper.point(line.id, s + roadSide * 1, edge, 0);
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.1, 0.35), postMat);
            post.position.copy(base).add(new THREE.Vector3(0, 0.55, 0));
            const pivot = new THREE.Object3D();
            pivot.position.copy(base).add(new THREE.Vector3(0, 1.0, 0));
            pivot.rotation.y = mapper.yaw(line.id, s, across < 0 ? 1 : -1);
            const boomLen = full ? width / 2 + 0.3 : width - 0.4;
            const boom = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, boomLen), boomMat);
            boom.position.z = boomLen / 2;
            const arm = new THREE.Object3D();
            arm.add(boom);
            pivot.add(arm);
            this.group.add(post, pivot);
            this.barriers.push({ pivot: arm });
          }
          const lights = new THREE.Group();
          const lp = mapper.point(line.id, s + roadSide * 1.35, edge + side * 0.6, 0);
          lights.position.copy(lp);
          lights.rotation.y = mapper.yaw(line.id, s, 1) + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), postMat);
          pole.position.y = 1.3;
          const backboard = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.45, 0.06), new THREE.MeshLambertMaterial({ color: 0x111111 }));
          backboard.position.set(0, 2.5, 0.05);
          const sign = makeBoard(makeLabelTexture(['STOP'], { bg: '#ffffff', fg: '#c00', width: 128, height: 64, font: 'bold 40px Arial' }), 0.6, 0.3, 1.9);
          sign.position.z = 0.04;
          lights.add(pole, backboard, sign);
          const pair = [-0.35, 0.35].map((x) => {
            const g = makeGlow(glowTexture, 0xff2010);
            g.position.set(x, 2.5, 0.15);
            lights.add(g);
            return g;
          });
          const amber = makeGlow(glowTexture, 0xffa000);
          amber.position.set(0, 2.85, 0.15);
          lights.add(amber);
          this.reds.push(pair);
          this.ambers.push(amber);
          this.group.add(lights);
        }
      }
    } else if (lc.type === 'FP' || lc.type === 'BW') {
      const sign = makeBoard(makeLabelTexture(['STOP', 'LOOK', 'LISTEN'], { bg: '#ffffff', fg: '#c00', width: 128, height: 128, font: 'bold 30px Arial' }), 0.5, 0.5, 1.4);
      mapper.point(line.id, s + 2, hi + 0.8, -0.5, sign.position);
      sign.rotation.y = mapper.yaw(line.id, s, 1) - Math.PI / 2;
      this.group.add(sign);
    }
    this.flash = 0;
  }

  /**
   * @param {number} dt
   * @param {THREE.PerspectiveCamera} camera
   * @param {number} viewportHeight
   */
  update(dt, camera, viewportHeight) {
    const lc = this.lc;
    if (!lc.hasBarriers) return;
    // Booms swing from vertical (up) to horizontal (down).
    for (const b of this.barriers) b.pivot.rotation.x = -(1 - lc.barrier) * (Math.PI / 2);
    this.flash += dt;
    const phase = Math.floor(this.flash / 0.5) % 2;
    const red = lc.redLights;
    const amber = lc.amberLight;
    const size = glowSize(camera, this.group.children[0]?.position ?? new THREE.Vector3(), viewportHeight, 0.4, 3);
    for (const [a, b] of this.reds) {
      a.visible = red && phase === 0;
      b.visible = red && phase === 1;
      a.scale.set(size, size, 1);
      b.scale.set(size, size, 1);
    }
    for (const a of this.ambers) {
      a.visible = amber;
      a.scale.set(size, size, 1);
    }
  }
}

/** Red and white stripes for barrier booms. */
let stripeTexture = /** @type {THREE.Texture | null} */ (null);
function stripes() {
  if (stripeTexture) return stripeTexture;
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 128;
  const ctx = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? '#ffffff' : '#d0201a';
    ctx.fillRect(0, i * 16, 16, 16);
  }
  stripeTexture = new THREE.CanvasTexture(c);
  stripeTexture.colorSpace = THREE.SRGBColorSpace;
  return stripeTexture;
}
