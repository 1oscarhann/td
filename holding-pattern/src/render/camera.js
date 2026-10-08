import * as THREE from 'three';
import { BALANCE } from '../config/balance.js';
import { clamp, damp, dampAngle, wrapAngle, smoother, lerp } from '../core/math.js';

const HALF_W = (BALANCE.map.width * BALANCE.map.tile) / 2;
const HALF_H = (BALANCE.map.height * BALANCE.map.tile) / 2;

// Orbit camera: drag to rotate, right-drag / WASD to pan, scroll to zoom.
// It also owns the radar pose blend (top-down, north up).
export class CameraController {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.target = new THREE.Vector3(0, 0, 60);
    this.az = THREE.MathUtils.degToRad(-28);
    this.pol = THREE.MathUtils.degToRad(52);
    this.dist = 900;
    this.goal = { x: this.target.x, z: this.target.z, az: this.az, pol: this.pol, dist: this.dist };
    this.limits = { polMin: 0.12, polMax: 1.3, distMin: 28, distMax: 2600 };
    this.leftRotates = true; // false while a build tool owns the left button
    this.enabled = true;
    this.keys = new Set();
    this.drag = null;
    this.radarT = 0; // 0 = orbit, 1 = radar (eased by RadarMode)
    this.radarZoom = 1;
    this.radarRadius = BALANCE.flight.radarRadius;
    this.intro = 0;
    this._ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._ray = new THREE.Raycaster();
    this._v = new THREE.Vector3();
    this._ndc = new THREE.Vector2();
    this.bind();
  }

  bind() {
    const dom = this.dom;
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      const rotate = e.button === 1 || (e.button === 0 && (this.leftRotates || e.altKey));
      const pan = e.button === 2;
      if (!rotate && !pan) return;
      if (this.radarT > 0.5 && rotate) return; // radar view stays north-up
      this.drag = { mode: pan ? 'pan' : 'rotate', x: e.clientX, y: e.clientY, id: e.pointerId, moved: 0 };
      if (pan) this.drag.anchor = this.groundAt(e.clientX, e.clientY);
      dom.setPointerCapture?.(e.pointerId);
    });
    dom.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d || e.pointerId !== d.id) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      d.x = e.clientX;
      d.y = e.clientY;
      d.moved += Math.abs(dx) + Math.abs(dy);
      if (d.mode === 'rotate') {
        this.goal.az -= dx * 0.0065;
        this.goal.pol = clamp(this.goal.pol - dy * 0.005, this.limits.polMin, this.limits.polMax);
      } else {
        const scale = this.viewDistance() * 0.0016;
        const s = Math.sin(this.az), c = Math.cos(this.az);
        // screen right = (cos az, -sin az), screen up = (-sin az, -cos az) on the ground
        this.goal.x -= (dx * c + dy * s) * scale;
        this.goal.z -= (-dx * s + dy * c) * scale;
        this.clampGoal();
      }
    });
    const end = (e) => {
      if (this.drag && e.pointerId === this.drag.id) {
        this.lastDragMoved = this.drag.moved;
        this.drag = null;
      }
    };
    dom.addEventListener('pointerup', end);
    dom.addEventListener('pointercancel', end);
    dom.addEventListener(
      'wheel',
      (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        let dy = e.deltaY;
        if (e.deltaMode === 1) dy *= 30;
        const k = Math.exp(clamp(dy, -120, 120) * (e.ctrlKey ? 0.01 : 0.0018));
        if (this.radarT > 0.5) {
          this.radarZoom = clamp(this.radarZoom * k, 0.3, 1.15);
          return;
        }
        const before = this.goal.dist;
        this.goal.dist = clamp(this.goal.dist * k, this.limits.distMin, this.limits.distMax);
        // zoom toward the cursor
        const p = this.groundAt(e.clientX, e.clientY);
        if (p) {
          const f = 1 - this.goal.dist / before;
          this.goal.x += (p.x - this.goal.x) * f;
          this.goal.z += (p.z - this.goal.z) * f;
          this.clampGoal();
        }
      },
      { passive: false },
    );
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  clampGoal() {
    this.goal.x = clamp(this.goal.x, -HALF_W - 200, HALF_W + 200);
    this.goal.z = clamp(this.goal.z, -HALF_H - 200, HALF_H + 260);
  }

  viewDistance() {
    return lerp(this.dist, this.radarDistance(), this.radarT);
  }

  radarDistance() {
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const aspect = Math.min(this.camera.aspect, 1.6);
    const half = Math.min(Math.tan(fov / 2), Math.tan(fov / 2) * aspect);
    return ((this.radarRadius * 1.04) / half) * this.radarZoom;
  }

  groundAt(clientX, clientY, out = new THREE.Vector3()) {
    const rect = this.dom.getBoundingClientRect();
    this._ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this._ray.setFromCamera(this._ndc, this.camera);
    return this._ray.ray.intersectPlane(this._ground, out);
  }

  ray(clientX, clientY) {
    const rect = this.dom.getBoundingClientRect();
    this._ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this._ray.setFromCamera(this._ndc, this.camera);
    return this._ray;
  }

  focusOn(x, z, dist) {
    this.goal.x = x;
    this.goal.z = z;
    if (dist) this.goal.dist = clamp(dist, this.limits.distMin, this.limits.distMax);
    this.clampGoal();
  }

  update(dt, keyboardActive = true) {
    if (keyboardActive && this.enabled && this.radarT < 0.5) {
      const k = this.keys;
      const sp = this.viewDistance() * 0.9 * dt;
      let fx = 0, fz = 0;
      if (k.has('KeyW') || k.has('ArrowUp')) fz -= 1;
      if (k.has('KeyS') || k.has('ArrowDown')) fz += 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) fx -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) fx += 1;
      if (fx || fz) {
        const s = Math.sin(this.az), c = Math.cos(this.az);
        this.goal.x += (fx * c + fz * s) * sp;
        this.goal.z += (-fx * s + fz * c) * sp;
        this.clampGoal();
      }
      if (this.rotateKeys) {
        if (k.has('KeyQ')) this.goal.az += dt * 1.3;
        if (k.has('KeyE')) this.goal.az -= dt * 1.3;
      }
    }
    this.target.x = damp(this.target.x, this.goal.x, 9, dt);
    this.target.z = damp(this.target.z, this.goal.z, 9, dt);
    this.az = dampAngle(this.az, this.goal.az, 9, dt);
    this.pol = damp(this.pol, this.goal.pol, 9, dt);
    this.dist = damp(this.dist, this.goal.dist, 8, dt);
    this.intro = damp(this.intro, 0, 1.2, dt);

    // blend toward the radar pose
    const t = smoother(clamp(this.radarT, 0, 1));
    const az = this.az + wrapAngle(Math.round(this.az / (Math.PI * 2)) * Math.PI * 2 - this.az) * t;
    const pol = lerp(this.pol, 0.0008, t);
    const dist = lerp(this.dist * (1 + this.intro * 0.5), this.radarDistance(), t);
    const tx = lerp(this.target.x, 0, t);
    const tz = lerp(this.target.z, 0, t);
    const azI = az - this.intro * 0.6;

    // never dip below the ground
    let polC = pol;
    const minH = 6;
    if (dist * Math.cos(polC) < minH) polC = Math.acos(clamp(minH / dist, -1, 1));
    const sp = Math.sin(polC);
    this.camera.position.set(tx + dist * sp * Math.sin(azI), dist * Math.cos(polC), tz + dist * sp * Math.cos(azI));
    this.camera.lookAt(tx, 0, tz);
    this.camera.near = clamp(dist * 0.02, 1, 60);
    this.camera.far = dist * 4 + 9000;
    this.camera.updateProjectionMatrix();
  }
}
