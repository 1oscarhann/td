import * as THREE from 'three';
import { WorldMapper } from './coords.js';
import { makeBallastTexture, makeGlowTexture, makeGrassTexture, makePavingTexture } from './textures.js';
import { buildTrack } from './trackMesh.js';
import { SignalView } from './signalMesh.js';
import { GROUND_LEVEL, SKY, buildGround, buildLandscape, buildPlatforms, buildSky, buildSpeedBoards } from './scenery.js';
import { TrainView } from './trainMesh.js';

/** How far ahead of the cab the camera looks, to smooth out kinks in the alignment (m). */
const LOOK_AHEAD_M = 120;
/** Slight downward tilt so the horizon sits above the HUD desk. */
const PITCH_DOWN_M = 4;

/**
 * Everything 3D: the scene, the cab camera and the per-frame updates. Reads simulation state;
 * never changes it.
 */
export class WorldView {
  /**
   * @param {HTMLElement} container
   * @param {import('../route/route.js').Route} route
   * @param {import('../core/settings.js').Settings} settings
   */
  constructor(container, route, settings) {
    this.route = route;
    this.settings = settings;
    this.mapper = new WorldMapper(route);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(SKY.horizon, 400, 5500);
    this.camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.1, 9000);

    this.scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x4d5b33, 1.6));
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
    sun.position.set(-0.4, 0.8, 0.45); // high in the south-west
    this.scene.add(sun);

    const anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const ballast = makeBallastTexture();
    const grass = makeGrassTexture();
    const paving = makePavingTexture();
    for (const t of [ballast, grass, paving]) t.anisotropy = anisotropy;
    this.glow = makeGlowTexture();

    this.sky = buildSky();
    this.ground = buildGround(grass);
    this.scene.add(this.sky, this.ground, buildTrack(route, this.mapper, { ballast }), buildLandscape(route, this.mapper), buildPlatforms(route, this.mapper, paving));

    /** @type {SignalView[]} */
    this.signalViews = [];
    /** @type {TrainView[]} */
    this.trainViews = [];
    this.dynamic = new THREE.Group();
    this.scene.add(this.dynamic);

    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();
    this.swayTime = 0;
    this.look = new THREE.Vector3();
  }

  /**
   * Attach a (new) simulation: signals and other trains depend on it.
   * @param {import('../sim/simulation.js').Simulation} sim
   */
  setSim(sim) {
    this.dynamic.clear();
    const track = this.route.track(sim.trackId);
    this.signalViews = sim.signalling.signals.map((sig) => new SignalView(sig, this.mapper, track, this.glow));
    for (const view of this.signalViews) this.dynamic.add(view.group, view.trackside);
    this.dynamic.add(buildSpeedBoards(this.route, this.mapper, sim.trackId));
    this.trainViews = sim.ai.map((t) => new TrainView(t, this.glow));
    for (const view of this.trainViews) this.dynamic.add(view.group);
  }

  /** @param {import('../core/settings.js').Settings} settings */
  applySettings(settings) {
    this.settings = settings;
    this.camera.fov = settings.fov;
    this.camera.updateProjectionMatrix();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /**
   * @param {import('../sim/simulation.js').Simulation} sim
   * @param {number} alpha
   * @param {number} frameTime real seconds since the last frame
   */
  render(sim, alpha, frameTime) {
    const train = sim.train;
    const cab = sim.spec.cab;
    const dir = train.dir;
    const lateral = this.route.track(sim.trackId).offset + dir * cab.lateralM;
    const front = train.prevPosition + (train.position - train.prevPosition) * alpha;
    const eye = front - dir * cab.setbackM;

    // Gentle sway that grows with speed: the cab isn't bolted to the rails.
    let swayX = 0;
    let swayY = 0;
    if (this.settings.cameraSway) {
      this.swayTime += frameTime;
      const k = Math.min(1, train.speed / 40);
      swayX = k * (0.025 * Math.sin(this.swayTime * 1.3) + 0.008 * Math.sin(this.swayTime * 5.7));
      swayY = k * (0.012 * Math.sin(this.swayTime * 2.1) + 0.004 * Math.sin(this.swayTime * 9.3));
    }
    this.mapper.point(eye, lateral + swayX, cab.eyeHeightM + swayY, this.camera.position);
    this.mapper.point(eye + dir * LOOK_AHEAD_M, lateral, cab.eyeHeightM - PITCH_DOWN_M, this.look);
    this.camera.lookAt(this.look);

    this.sky.position.copy(this.camera.position);
    this.ground.userData.follow(this.camera.position, this.route.elevationAt(eye) + GROUND_LEVEL - 0.02);

    const h = this.renderer.domElement.clientHeight || window.innerHeight;
    for (const view of this.signalViews) view.update(this.camera, h, this.settings.signalGlow);
    sim.ai.forEach((t, i) => this.trainViews[i].update(t, alpha, this.mapper, this.route.track(t.track).offset, this.camera, h));

    this.renderer.render(this.scene, this.camera);
  }
}
