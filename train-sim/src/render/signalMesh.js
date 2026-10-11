import * as THREE from 'three';
import { Aspect } from '../signals/aspects.js';
import { makeLabelTexture } from './textures.js';
import { AWS_MAGNET_DISTANCE_M } from '../sim/simulation.js';

const LAMP_COLOURS = Object.freeze({ red: 0xff2a14, yellow: 0xffaa00, green: 0x2dff73 });

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

const LENS_OFF = new THREE.Color(0x151515);
const LAMP_SPACING = 0.3;
const HEAD_BASE = 3.2; // bottom lamp height above rail (A)
const SIGNAL_LATERAL = 2.3; // post distance from track centre, on the driver's side (A)

/** Minimum size of a lit lamp's glow, in screen pixels. */
const MIN_GLOW_PX = 7;

/**
 * A colour-light signal on a post, with its AWS magnet and TPWS loops.
 */
export class SignalView {
  /**
   * @param {import('../signals/signalSystem.js').SignalState} signal
   * @param {import('./coords.js').WorldMapper} mapper
   * @param {{ offset: number, dir: 1 | -1 }} track
   * @param {THREE.Texture} glowTexture
   */
  constructor(signal, mapper, track, glowTexture) {
    this.signal = signal;
    this.group = new THREE.Group();
    this.group.name = `signal ${signal.id}`;
    const dir = track.dir;
    // UK signals stand to the left of the line they apply to.
    const lateral = track.offset - dir * SIGNAL_LATERAL;
    mapper.point(signal.position, lateral, 0, this.group.position);
    this.group.rotation.y = mapper.yawFacing(signal.position, /** @type {1 | -1} */ (-dir));

    const dark = new THREE.MeshLambertMaterial({ color: 0x1b1b1b });
    const hoodGeometry = new THREE.BoxGeometry(0.26, 0.025, 0.16);
    const lampNames = signal.aspects === '3' ? LAMPS_3 : LAMPS_4;
    const headHeight = lampNames.length * LAMP_SPACING + 0.25;

    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, HEAD_BASE + headHeight, 8), new THREE.MeshLambertMaterial({ color: 0x9a9a95 }));
    post.position.y = (HEAD_BASE + headHeight) / 2 - 0.3;
    post.position.z = -0.25;
    this.group.add(post);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, headHeight, 0.28), dark);
    head.position.y = HEAD_BASE - 0.15 + headHeight / 2;
    this.group.add(head);

    // Black backplate with a white border makes signals easier to pick out against the sky.
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, headHeight + 0.35),
      new THREE.MeshBasicMaterial({ map: makeLabelTexture([''], { bg: '#111', border: '#e8e8e8', width: 64, height: 128 }) }),
    );
    plate.position.set(0, head.position.y, -0.15);
    this.group.add(plate);

    /** @type {{ lens: THREE.Mesh, glow: THREE.Sprite, colour: THREE.Color }[]} */
    this.lamps = lampNames.map((name, i) => {
      const colour = new THREE.Color(LAMP_COLOURS[/** @type {keyof typeof LAMP_COLOURS} */ (name)]);
      const y = HEAD_BASE + i * LAMP_SPACING;
      const hood = new THREE.Mesh(hoodGeometry, dark); // visor that shades the lens from the sun
      hood.position.set(0, y + 0.12, 0.22);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.09, 16), new THREE.MeshBasicMaterial({ color: 0x151515 }));
      lens.position.set(0, y, 0.145);
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: glowTexture, color: colour, depthWrite: false, transparent: true, fog: false }),
      );
      glow.position.set(0, y, 0.3);
      glow.visible = false;
      this.group.add(hood, lens, glow);
      return { lens, glow, colour };
    });

    // Identification plate: white with black lettering, below the head.
    const idPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), new THREE.MeshBasicMaterial({ map: makeLabelTexture([signal.id], { width: 128, height: 64, font: 'bold 40px Arial, sans-serif' }) }));
    idPlate.position.set(0, HEAD_BASE - 0.55, -0.1);
    this.group.add(idPlate);

    // AWS magnet: a black ramp in the middle of the track 180 m before the signal.
    this.trackside = new THREE.Group();
    if (signal.aws !== false) {
      const magnet = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.7), new THREE.MeshLambertMaterial({ color: 0x202020 }));
      mapper.point(signal.position - dir * AWS_MAGNET_DISTANCE_M, track.offset, -0.1, magnet.position);
      magnet.rotation.y = mapper.yawFacing(signal.position, dir);
      this.trackside.add(magnet);
    }
    // TPWS train-stop loops: two flat yellow-ish boxes between the rails at the signal.
    if (signal.tpws !== false) {
      for (const offset of [-dir * 3, dir * 2]) {
        const loop = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 1.2), new THREE.MeshLambertMaterial({ color: 0xd8c040 }));
        mapper.point(signal.position + offset, track.offset, -0.13, loop.position);
        loop.rotation.y = mapper.yawFacing(signal.position, dir);
        this.trackside.add(loop);
      }
    }

    this.shown = '';
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
    // A real lamp is bright enough to read from over a kilometre; a few pixels on a monitor
    // aren't, so the glow never shrinks below a minimum on-screen size. See docs/REALISM_VS_FUN.md.
    const distance = camera.position.distanceTo(this.group.position);
    const pixelAngle = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / viewportHeight;
    const size = boostGlow ? Math.max(0.55, distance * pixelAngle * MIN_GLOW_PX) : 0.55;
    for (const lamp of this.lamps) lamp.glow.scale.set(size, size, 1);
  }
}
