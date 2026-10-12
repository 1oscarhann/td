import * as THREE from 'three';
import { WEATHER_INFO } from '../sim/environment.js';

const DAY_TOP = new THREE.Color(0x6f9fd8);
const DAY_HORIZON = new THREE.Color(0xc9dbe8);
const DUSK_HORIZON = new THREE.Color(0xe9a46e);
const NIGHT_TOP = new THREE.Color(0x03060f);
const NIGHT_HORIZON = new THREE.Color(0x0c1220);
const GREY_TOP = new THREE.Color(0x8a96a3);
const GREY_HORIZON = new THREE.Color(0xb3b9be);

/**
 * Lighting, sky, fog and rain, driven by the clock, season and weather.
 */
export class Atmosphere {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Mesh} sky the sky dome (with userData.paint)
   */
  constructor(scene, sky) {
    this.scene = scene;
    this.sky = sky;
    this.hemi = new THREE.HemisphereLight(0xcfe3ff, 0x4d5b33, 1.6);
    this.sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
    scene.add(this.hemi, this.sun, this.sun.target);
    this.fog = new THREE.Fog(DAY_HORIZON, 500, 7000);
    scene.fog = this.fog;
    this.top = new THREE.Color();
    this.horizon = new THREE.Color();
    this.lastKey = '';

    // Rain: short streaks in a box that follows the camera.
    const count = 5000;
    const pos = new Float32Array(count * 6);
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 80;
      const y = Math.random() * 40;
      const z = (Math.random() - 0.5) * 80;
      pos.set([x, y, z, x + 0.05, y - 0.7, z], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xaab4c0, transparent: true, opacity: 0.35 }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    scene.add(this.rain);
    this.rainOffset = 0;
  }

  /**
   * @param {import('../sim/environment.js').Environment} env
   * @param {number} clock seconds since midnight
   * @param {THREE.Camera} camera
   * @param {number} dt
   * @returns {{ daylight: number }}
   */
  update(env, clock, camera, dt) {
    const daylight = env.daylight(clock);
    const info = WEATHER_INFO[env.weather];
    const elev = env.sunElevation(clock);
    // Repaint the sky only when it has visibly changed.
    const key = `${env.weather}:${Math.round(daylight * 40)}:${Math.round(elev)}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      const dusk = Math.max(0, 1 - Math.abs(elev - 2) / 9) * (1 - info.cloud);
      this.top.copy(NIGHT_TOP).lerp(DAY_TOP, daylight).lerp(GREY_TOP.clone().multiplyScalar(0.25 + 0.75 * daylight), info.cloud * 0.8);
      this.horizon.copy(NIGHT_HORIZON).lerp(DAY_HORIZON, daylight).lerp(DUSK_HORIZON, dusk * 0.7).lerp(GREY_HORIZON.clone().multiplyScalar(0.2 + 0.8 * daylight), info.cloud * 0.8);
      /** @type {(top: THREE.Color, horizon: THREE.Color) => void} */ (this.sky.userData.paint)(this.top, this.horizon);
      this.fog.color.copy(this.horizon);
      this.hemi.intensity = 0.15 + 1.5 * daylight * (1 - info.cloud * 0.35);
      this.hemi.color.set(0xcfe3ff).lerp(new THREE.Color(0x6a7890), 1 - daylight);
      this.sun.intensity = 2.4 * Math.max(0, daylight - 0.1) * (1 - info.cloud * 0.85);
      this.sun.color.set(0xfff1dc).lerp(new THREE.Color(0xffb27a), dusk);
    }
    // Fog distance by weather; night shortens how far you can see.
    this.fog.near = info.fogNear;
    this.fog.far = info.fogFar * (0.45 + 0.55 * daylight);
    const s = env.sunDirection(clock);
    this.sun.position.set(camera.position.x + s.x * 1000, camera.position.y + Math.max(0.05, s.z) * 1000, camera.position.z - s.y * 1000);
    this.sun.target.position.copy(camera.position);

    this.rain.visible = env.weather === 'rain';
    if (this.rain.visible) {
      this.rainOffset = (this.rainOffset + dt * 18) % 40;
      this.rain.position.set(camera.position.x, camera.position.y - 20 - this.rainOffset + 40, camera.position.z);
    }
    return { daylight };
  }
}
