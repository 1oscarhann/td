import * as THREE from 'three';
import { Aspect } from '../signals/aspects.js';
import { makeLabelTexture } from './textures.js';
import { AWS_MAGNET_DISTANCE_M, OSS_SIGNAL_M } from '../sim/trackside.js';

const LAMP_COLOURS = Object.freeze({ red: 0xff2a14, yellow: 0xffaa00, green: 0x2dff73 });
const LENS_OFF = new THREE.Color(0x151515);

/**
 * Lamp order on a UK four-aspect head, bottom to top: red, yellow, green, yellow. The two yellows
 * sit either side of the green so a double yellow reads as two clearly separate lights.
 * Three-aspect heads drop the top yellow.
 */
const LAMPS_4 = ['red', 'yellow', 'green', 'yellow'];
const LAMPS_3 = ['red', 'yellow', 'green'];

/** Which lamps (by index into the list above) each aspect lights. */
const LIT = Object.freeze({
  [Aspect.RED]: [0],
  [Aspect.YELLOW]: [1],
  [Aspect.GREEN]: [2],
  [Aspect.DOUBLE_YELLOW]: [1, 3],
});

const LAMP_SPACING = 0.3;
const HEAD_BASE = 3.2; // bottom lamp height above rail (A)
const SIGNAL_LATERAL = 2.3; // post distance from track centre, on the driver's side (A)
/** Minimum size of a lit lamp's glow, in screen pixels. */
const MIN_GLOW_PX = 7;

/**
 * A glow sprite for a lamp: keeps a minimum on-screen size so distant lamps stay readable.
 * @param {THREE.Texture} tex
 * @param {THREE.ColorRepresentation} colour
 */
export function makeGlow(tex, colour) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: colour, depthWrite: false, transparent: true, fog: false }));
  s.visible = false;
  return s;
}

/**
 * Screen-size-aware sprite scale.
 * @param {THREE.PerspectiveCamera} camera
 * @param {THREE.Vector3} at
 * @param {number} viewportHeight
 * @param {number} realSize
 * @param {number} minPx
 */
export function glowSize(camera, at, viewportHeight, realSize, minPx) {
  const distance = camera.position.distanceTo(at);
  const pixelAngle = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / viewportHeight;
  return Math.max(realSize, distance * pixelAngle * minPx);
}

/**
 * A colour-light signal on a post, with its route indicator (feathers) if it's a junction
 * signal, its AWS magnet and TPWS loops.
 */
export class SignalView {
  /**
   * @param {import('../signals/signalling.js').SignalState} signal
   * @param {import('./coords.js').WorldMapper} mapper
   * @param {THREE.Texture} glowTexture
   */
  constructor(signal, mapper, glowTexture) {
    this.signal = signal;
    const track = mapper.network.track(signal.key);
    const dir = track.dir;
    this.group = new THREE.Group();
    this.group.name = `signal ${signal.id}`;
    // UK signals stand to the left of the line they apply to.
    mapper.onTrack({ track: signal.key, s: signal.s }, -dir * SIGNAL_LATERAL, 0, this.group.position);
    this.group.rotation.y = mapper.yawOnTrack({ track: signal.key, s: signal.s }, true);

    const dark = new THREE.MeshLambertMaterial({ color: 0x1b1b1b });
    const lampNames = signal.aspects === '3' ? LAMPS_3 : LAMPS_4;
    const headHeight = lampNames.length * LAMP_SPACING + 0.25;
    const featherHeight = signal.feather ? 1.6 : 0;

    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, HEAD_BASE + headHeight + featherHeight, 8), new THREE.MeshLambertMaterial({ color: 0x9a9a95 }));
    post.position.y = (HEAD_BASE + headHeight + featherHeight) / 2 - 0.3;
    post.position.z = -0.25;
    this.group.add(post);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, headHeight, 0.28), dark);
    head.position.y = HEAD_BASE - 0.15 + headHeight / 2;
    this.group.add(head);
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, headHeight + 0.35),
      new THREE.MeshBasicMaterial({ map: makeLabelTexture([''], { bg: '#111', border: '#e8e8e8', width: 64, height: 128 }) }),
    );
    plate.position.set(0, head.position.y, -0.15);
    this.group.add(plate);

    const hoodGeometry = new THREE.BoxGeometry(0.26, 0.025, 0.16);
    /** @type {{ lens: THREE.Mesh, glow: THREE.Sprite, colour: THREE.Color }[]} */
    this.lamps = lampNames.map((name, i) => {
      const colour = new THREE.Color(LAMP_COLOURS[/** @type {keyof typeof LAMP_COLOURS} */ (name)]);
      const y = HEAD_BASE + i * LAMP_SPACING;
      const hood = new THREE.Mesh(hoodGeometry, dark);
      hood.position.set(0, y + 0.12, 0.22);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.09, 16), new THREE.MeshBasicMaterial({ color: 0x151515 }));
      lens.position.set(0, y, 0.145);
      const glow = makeGlow(glowTexture, colour);
      glow.position.set(0, y, 0.3);
      this.group.add(hood, lens, glow);
      return { lens, glow, colour };
    });

    // Route indicator: five white lamps in a line at 45°, above the head, on the side the
    // route goes (a "feather"). Unlit unless the diverging route is set and the signal is off.
    /** @type {THREE.Sprite[]} */
    this.feather = [];
    if (signal.feather) {
      const sign = signal.feather.side === 'left' ? -1 : 1;
      // The head faces back towards the train (its +z points at the driver), so the driver's
      // left is the head's −x, exactly as for a camera looking down −z.
      const sx = sign;
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 0.1), dark);
      base.position.set(sx * 0.5, HEAD_BASE + headHeight + 0.55, -0.05);
      this.group.add(base);
      for (let i = 0; i < 5; i++) {
        const glow = makeGlow(glowTexture, 0xfff6dc);
        glow.position.set(sx * (0.1 + i * 0.22), HEAD_BASE + headHeight + i * 0.22, 0.12);
        this.group.add(glow);
        this.feather.push(glow);
      }
    }

    const idPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), new THREE.MeshBasicMaterial({ map: makeLabelTexture([signal.id], { width: 128, height: 64, font: 'bold 40px Arial, sans-serif' }) }));
    idPlate.position.set(0, HEAD_BASE - 0.55, -0.1);
    this.group.add(idPlate);

    // AWS magnet 180 m before; TPWS loops at the signal and the overspeed loops before it.
    this.trackside = new THREE.Group();
    const at = (/** @type {number} */ s, /** @type {THREE.Object3D} */ obj, /** @type {number} */ h) => {
      mapper.onTrack({ track: signal.key, s }, 0, h, obj.position);
      obj.rotation.y = mapper.yawOnTrack({ track: signal.key, s });
      this.trackside.add(obj);
    };
    if (signal.aws !== false) at(signal.s - dir * AWS_MAGNET_DISTANCE_M, new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.7), new THREE.MeshLambertMaterial({ color: 0x202020 })), -0.1);
    if (signal.tpws !== false) {
      const loopMat = new THREE.MeshLambertMaterial({ color: 0xd8c040 });
      for (const off of [-dir * 3, dir * 2, -dir * OSS_SIGNAL_M, -dir * (OSS_SIGNAL_M + 12)]) at(signal.s + off, new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 1.2), loopMat), -0.13);
    }
    this.shown = '';
    this.featherShown = false;
  }

  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {number} viewportHeight pixels
   * @param {boolean} boostGlow keep lamps at least MIN_GLOW_PX wide however far away they are
   */
  update(camera, viewportHeight, boostGlow) {
    const aspect = this.signal.aspect;
    if (aspect !== this.shown) {
      this.shown = aspect;
      const lit = LIT[aspect] ?? [];
      this.lamps.forEach((lamp, i) => {
        const on = lit.includes(i);
        /** @type {THREE.MeshBasicMaterial} */ (lamp.lens.material).color.copy(on ? lamp.colour : LENS_OFF);
        lamp.glow.visible = on;
      });
    }
    const featherOn = !!this.signal.featherLit;
    if (featherOn !== this.featherShown) {
      this.featherShown = featherOn;
      for (const g of this.feather) g.visible = featherOn;
    }
    // A real lamp is bright enough to read from over a kilometre; a few pixels on a monitor
    // aren't, so the glow never shrinks below a minimum on-screen size. See docs/REALISM_VS_FUN.md.
    const size = boostGlow ? glowSize(camera, this.group.position, viewportHeight, 0.55, MIN_GLOW_PX) : 0.55;
    for (const lamp of this.lamps) lamp.glow.scale.set(size, size, 1);
    const fs = boostGlow ? glowSize(camera, this.group.position, viewportHeight, 0.3, 3) : 0.3;
    for (const g of this.feather) g.scale.set(fs, fs, 1);
  }
}
