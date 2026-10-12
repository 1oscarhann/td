import * as THREE from 'three';
import { makeGlow, glowSize } from './signalMesh.js';

const CAR_WIDTH = 2.8;
const CAR_HEIGHT = 3.75;
const BODY_FLOOR = 0.25; // gap under the body above the rail

/**
 * Another train, drawn as a rake of box cars in a Southern-style livery (white body, dark green
 * lower band, yellow ends), with white headlights at the front and red tail lights at the back.
 * Each car is placed on the track separately, so trains bend through junctions and curves.
 */
export class TrainView {
  /**
   * @param {import('../sim/vehicle.js').Vehicle} vehicle
   * @param {THREE.Texture} glowTexture
   */
  constructor(vehicle, glowTexture) {
    this.vehicle = vehicle;
    this.cars = vehicle.spec.cars;
    this.carLength = vehicle.spec.lengthM / this.cars;
    this.group = new THREE.Group();
    this.group.name = `train ${vehicle.id}`;
    const body = new THREE.MeshLambertMaterial({ color: 0xeeeeea });
    const band = new THREE.MeshLambertMaterial({ color: 0x1d4d2c });
    const roof = new THREE.MeshLambertMaterial({ color: 0x6b6b6b });
    const yellow = new THREE.MeshLambertMaterial({ color: 0xf5c400 });
    const windowMat = new THREE.MeshLambertMaterial({ color: 0x1a2028 });
    const len = this.carLength - 0.6;
    const shellGeo = new THREE.BoxGeometry(CAR_WIDTH, CAR_HEIGHT - 0.5, len);
    const bandGeo = new THREE.BoxGeometry(CAR_WIDTH + 0.02, 0.7, len);
    const roofGeo = new THREE.BoxGeometry(CAR_WIDTH - 0.3, 0.5, len);
    const windowGeo = new THREE.BoxGeometry(CAR_WIDTH + 0.02, 0.8, len - 3);

    /** @type {THREE.Group[]} */
    this.carGroups = [];
    for (let i = 0; i < this.cars; i++) {
      const car = new THREE.Group();
      const shell = new THREE.Mesh(shellGeo, body);
      shell.position.y = BODY_FLOOR + (CAR_HEIGHT - 0.5) / 2;
      const lower = new THREE.Mesh(bandGeo, band);
      lower.position.y = BODY_FLOOR + 0.6;
      const top = new THREE.Mesh(roofGeo, roof);
      top.position.y = BODY_FLOOR + CAR_HEIGHT - 0.25;
      const windows = new THREE.Mesh(windowGeo, windowMat);
      windows.position.y = BODY_FLOOR + 2.1;
      car.add(shell, lower, top, windows);
      this.carGroups.push(car);
      this.group.add(car);
    }
    /** @type {THREE.Sprite[]} */
    this.lamps = [];
    const endZ = len / 2 + 0.01;
    // Front (car 0, +z) and back (last car, −z): yellow panel and lamps.
    for (const [carIndex, z, colour] of /** @type {[number, number, number][]} */ ([
      [0, endZ, 0xfff4d6],
      [this.cars - 1, -endZ, 0xff2010],
    ])) {
      const car = this.carGroups[carIndex];
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(CAR_WIDTH - 0.2, 1.6), yellow);
      panel.position.set(0, BODY_FLOOR + 1.3, z);
      if (z < 0) panel.rotation.y = Math.PI;
      car.add(panel);
      for (const x of [-0.9, 0.9]) {
        const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.1, 12), new THREE.MeshBasicMaterial({ color: colour }));
        lamp.position.set(x, BODY_FLOOR + 0.9, z + Math.sign(z) * 0.01);
        if (z < 0) lamp.rotation.y = Math.PI;
        const glow = makeGlow(glowTexture, colour);
        glow.visible = true;
        glow.position.set(x, BODY_FLOOR + 0.9, z + Math.sign(z) * 0.12);
        car.add(lamp, glow);
        this.lamps.push(glow);
      }
    }
  }

  /**
   * @param {number} alpha interpolation between the last two physics steps
   * @param {import('./coords.js').WorldMapper} mapper
   * @param {THREE.PerspectiveCamera} camera
   * @param {number} viewportHeight
   */
  update(alpha, mapper, camera, viewportHeight) {
    const v = this.vehicle;
    // Draw where it was part-way through the last step, so motion stays smooth at any frame rate.
    const lag = (1 - alpha) * v.speed * (1 / 60);
    this.carGroups.forEach((car, i) => {
      const pos = v.path.behind(lag + (i + 0.5) * this.carLength);
      mapper.onTrack(pos, 0, 0, car.position);
      car.rotation.y = mapper.yawOnTrack(pos);
    });
    const size = glowSize(camera, this.carGroups[0].position, viewportHeight, 0.35, 3);
    for (const g of this.lamps) g.scale.set(size, size, 1);
    this.group.visible = camera.position.distanceTo(this.carGroups[0].position) < 9000;
  }
}
