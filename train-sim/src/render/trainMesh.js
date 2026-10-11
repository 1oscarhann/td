import * as THREE from 'three';

const CAR_WIDTH = 2.8;
const CAR_HEIGHT = 3.75;
const BODY_FLOOR = 0.25; // gap under the body above the rail
const MIN_LAMP_PX = 4;

/**
 * Another train, drawn as a rake of simple box cars in a Southern-style livery (white body, dark
 * green lower band, yellow warning panels on the ends, red tail lights at the back).
 */
export class TrainView {
  /**
   * @param {{ lengthM: number }} train
   * @param {THREE.Texture} glowTexture
   * @param {number} [cars]
   */
  constructor(train, glowTexture, cars = 4) {
    this.cars = cars;
    this.carLength = train.lengthM / cars;
    this.group = new THREE.Group();
    this.group.name = 'other train';
    const body = new THREE.MeshLambertMaterial({ color: 0xeeeeea });
    const band = new THREE.MeshLambertMaterial({ color: 0x1d4d2c });
    const roof = new THREE.MeshLambertMaterial({ color: 0x6b6b6b });
    const yellow = new THREE.MeshLambertMaterial({ color: 0xf5c400 });
    const windowMat = new THREE.MeshLambertMaterial({ color: 0x1a2028 });

    /** @type {THREE.Group[]} */
    this.carGroups = [];
    for (let i = 0; i < cars; i++) {
      const car = new THREE.Group();
      const len = this.carLength - 0.6; // small gap between cars
      const shell = new THREE.Mesh(new THREE.BoxGeometry(CAR_WIDTH, CAR_HEIGHT - 0.5, len), body);
      shell.position.y = BODY_FLOOR + (CAR_HEIGHT - 0.5) / 2;
      const lower = new THREE.Mesh(new THREE.BoxGeometry(CAR_WIDTH + 0.02, 0.7, len), band);
      lower.position.y = BODY_FLOOR + 0.6;
      const top = new THREE.Mesh(new THREE.BoxGeometry(CAR_WIDTH - 0.3, 0.5, len), roof);
      top.position.y = BODY_FLOOR + CAR_HEIGHT - 0.25;
      const windows = new THREE.Mesh(new THREE.BoxGeometry(CAR_WIDTH + 0.02, 0.8, len - 3), windowMat);
      windows.position.y = BODY_FLOOR + 2.1;
      car.add(shell, lower, top, windows);
      this.carGroups.push(car);
      this.group.add(car);
    }

    // Yellow end panels and tail lamps on the rear of the last car (the end we'll be looking at).
    const last = this.carGroups[cars - 1];
    const endZ = -(this.carLength - 0.6) / 2 - 0.01;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(CAR_WIDTH - 0.2, 1.6), yellow);
    panel.position.set(0, BODY_FLOOR + 1.3, endZ);
    panel.rotation.y = Math.PI;
    last.add(panel);
    /** @type {THREE.Sprite[]} */
    this.tailGlows = [];
    for (const x of [-0.9, 0.9]) {
      const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.1, 12), new THREE.MeshBasicMaterial({ color: 0xff2010 }));
      lamp.position.set(x, BODY_FLOOR + 0.9, endZ - 0.01);
      lamp.rotation.y = Math.PI;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: 0xff2010, depthWrite: false, transparent: true, fog: false }));
      glow.position.copy(lamp.position).add(new THREE.Vector3(0, 0, -0.1));
      last.add(lamp, glow);
      this.tailGlows.push(glow);
    }
    this.tmp = new THREE.Vector3();
  }

  /**
   * @param {{ position: number, prevPosition: number, dir: 1 | -1 }} train
   * @param {number} alpha interpolation between the last two physics steps
   * @param {import('./coords.js').WorldMapper} mapper
   * @param {number} lateral track centre offset
   * @param {THREE.PerspectiveCamera} camera
   * @param {number} viewportHeight
   */
  update(train, alpha, mapper, lateral, camera, viewportHeight) {
    const front = train.prevPosition + (train.position - train.prevPosition) * alpha;
    this.carGroups.forEach((car, i) => {
      const centre = front - train.dir * (i + 0.5) * this.carLength;
      mapper.point(centre, lateral, 0, car.position);
      car.rotation.y = mapper.yawFacing(centre, train.dir);
    });
    const distance = camera.position.distanceTo(this.carGroups[this.cars - 1].position);
    const pixelAngle = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / viewportHeight;
    const size = Math.max(0.4, distance * pixelAngle * MIN_LAMP_PX);
    for (const g of this.tailGlows) g.scale.set(size, size, 1);
    this.group.visible = distance < 7000;
  }
}
