import * as THREE from 'three';
import { WorldMapper } from './coords.js';
import { makeBallastTexture, makeGlowTexture, makeGrassTexture, makePavingTexture } from './textures.js';
import { buildTrack } from './trackMesh.js';
import { SignalView } from './signalMesh.js';
import { CrossingView } from './crossingMesh.js';
import { GROUND_LEVEL, buildBoards, buildFences, buildGround, buildLandscape, buildPlatforms, buildSky, buildStructures } from './scenery.js';
import { buildTerrainMesh, loadTerrain } from './terrain.js';
import { buildBuildings, buildLandmarks, buildRoads, buildTrees, buildWater } from './realScenery.js';
import { TrainView } from './trainMesh.js';
import { Atmosphere } from './atmosphere.js';

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
    this.mapper = new WorldMapper(route.network);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.1, 12000);
    this.sky = buildSky();
    this.scene.add(this.sky);
    this.atmosphere = new Atmosphere(this.scene, this.sky);

    // The train's headlights, for night running and tunnels.
    this.headlight = new THREE.SpotLight(0xfff2d8, 0, 450, Math.PI / 9, 0.5, 1);
    this.scene.add(this.headlight, this.headlight.target);

    const anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = { ballast: makeBallastTexture(), grass: makeGrassTexture(), paving: makePavingTexture() };
    for (const t of Object.values(this.textures)) t.anisotropy = anisotropy;
    this.glow = makeGlowTexture();

    /** @type {import('./terrain.js').Terrain | null} */
    this.terrain = null;
    this.ground = null;
    this.lampHeads = /** @type {THREE.MeshBasicMaterial | null} */ (null);

    /** @type {SignalView[]} */
    this.signalViews = [];
    /** @type {CrossingView[]} */
    this.crossingViews = [];
    /** @type {Map<object, TrainView>} */
    this.trainViews = new Map();
    this.dynamic = new THREE.Group();
    this.scene.add(this.dynamic);
    this.trespasserMeshes = new THREE.Group();
    this.scene.add(this.trespasserMeshes);

    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();
    this.swayTime = 0;
    this.look = new THREE.Vector3();
    this.v = new THREE.Vector3();
  }

  /**
   * Build the static world. Real routes load their terrain and OSM scenery files.
   * @param {(text: string) => void} [progress]
   */
  async build(progress = () => {}) {
    const route = this.route;
    const net = route.network;
    progress('Laying track…');
    this.scene.add(buildTrack(net, this.mapper, this.textures), buildStructures(route, this.mapper), buildFences(net, this.mapper));
    const plats = buildPlatforms(route, this.mapper, this.textures.paving);
    this.scene.add(plats.group);
    this.lampHeads = plats.lampHeads;

    const sc = route.data.scenery ?? {};
    if (sc.terrain && sc.terrainHeader) {
      progress('Shaping the South Downs…');
      const base = route.baseUrl;
      this.terrain = await loadTerrain(new URL(sc.terrain, base).href, sc.terrainHeader);
      /** @type {any} */
      let scenery = { woods: [], riverAreas: [], riverLines: [], buildings: [], roads: [] };
      if (sc.sceneryFile) {
        try {
          const res = await fetch(new URL(sc.sceneryFile, base).href);
          if (res.ok) scenery = await res.json();
        } catch {
          // Scenery is optional: carry on with bare terrain.
        }
      }
      const terrainMesh = buildTerrainMesh(this.terrain, net, route.data.lines, scenery.riverAreas ?? [], this.textures.grass);
      this.scene.add(terrainMesh);
      progress('Filling the River Arun…');
      this.scene.add(buildWater(scenery));
      progress('Building Chichester, Barnham, Ford and Arundel…');
      const buildings = buildBuildings(scenery, this.terrain);
      if (buildings) this.scene.add(buildings);
      const roads = buildRoads(scenery, this.terrain);
      if (roads) this.scene.add(roads);
      progress('Planting trees…');
      this.scene.add(buildTrees(scenery, this.terrain, net));
      this.scene.add(buildLandmarks(sc.landmarks ?? [], this.terrain));
    } else {
      this.ground = buildGround(this.textures.grass);
      this.scene.add(this.ground, buildLandscape(net, this.mapper, sc));
    }
    progress('Ready');
  }

  /**
   * Attach a (new) simulation: signals, crossings, boards and trains depend on it.
   * @param {import('../sim/simulation.js').Simulation} sim
   */
  setSim(sim) {
    this.dynamic.clear();
    this.signalViews = [...sim.signalling.signals.values()].map((sig) => new SignalView(sig, this.mapper, this.glow));
    for (const view of this.signalViews) this.dynamic.add(view.group, view.trackside);
    const ground = this.terrain ? { height: (/** @type {number} */ x, /** @type {number} */ y) => /** @type {import('./terrain.js').Terrain} */ (this.terrain).rawHeight(x, y) } : null;
    this.crossingViews = sim.crossings.crossings.map((lc) => new CrossingView(lc, this.mapper, this.glow, ground));
    for (const view of this.crossingViews) this.dynamic.add(view.group);
    this.dynamic.add(buildBoards(sim.network, this.mapper, sim.trackside));
    this.trainViews = new Map();
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
    const v = sim.player;
    const cab = sim.spec.cab;
    const lag = (1 - alpha) * v.speed * (1 / 60);
    const eye = v.path.behind(lag + cab.setbackM);
    const dir = sim.network.track(eye.track).dir;

    let swayX = 0;
    let swayY = 0;
    if (this.settings.cameraSway) {
      this.swayTime += frameTime;
      const k = Math.min(1, v.speed / 40);
      swayX = k * (0.025 * Math.sin(this.swayTime * 1.3) + 0.008 * Math.sin(this.swayTime * 5.7));
      swayY = k * (0.012 * Math.sin(this.swayTime * 2.1) + 0.004 * Math.sin(this.swayTime * 9.3));
    }
    this.mapper.onTrack(eye, dir * cab.lateralM + swayX, cab.eyeHeightM + swayY, this.camera.position);
    const ahead = sim.network.walk(eye.track, eye.s, LOOK_AHEAD_M);
    const aheadDir = sim.network.track(ahead.track).dir;
    this.mapper.onTrack(ahead, aheadDir * cab.lateralM, cab.eyeHeightM - PITCH_DOWN_M, this.look);
    this.camera.lookAt(this.look);

    this.sky.position.copy(this.camera.position);
    if (this.ground) {
      const line = sim.network.track(eye.track).line;
      /** @type {any} */ (this.ground.userData).follow(this.camera.position, line.elevationAt(eye.s) + GROUND_LEVEL - 0.02);
    }
    const { daylight } = this.atmosphere.update(sim.env, sim.clock, this.camera, frameTime);

    // Headlights at night, in fog and in tunnels (where it's dark whatever the time).
    const dark = daylight < 0.35 || sim.env.weather === 'fog';
    this.headlight.intensity = dark ? 900 : 0;
    this.headlight.position.copy(this.camera.position).add(this.v.set(0, -1.6, 0));
    this.headlight.target.position.copy(this.look);
    if (this.lampHeads) this.lampHeads.color.set(daylight < 0.4 ? 0xfff0c8 : 0x555555);

    const h = this.renderer.domElement.clientHeight || window.innerHeight;
    for (const view of this.signalViews) view.update(this.camera, h, this.settings.signalGlow);
    for (const view of this.crossingViews) view.update(frameTime, this.camera, h);
    this.syncTrains(sim, alpha, h);
    this.syncTrespassers(sim);
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Add views for new AI trains, drop ones that have gone.
   * @param {import('../sim/simulation.js').Simulation} sim
   * @param {number} alpha
   * @param {number} h
   */
  syncTrains(sim, alpha, h) {
    const live = new Set(sim.ai.map((a) => a.vehicle));
    for (const [vehicle, view] of this.trainViews) {
      if (!live.has(/** @type {any} */ (vehicle))) {
        this.dynamic.remove(view.group);
        this.trainViews.delete(vehicle);
      }
    }
    for (const a of sim.ai) {
      let view = this.trainViews.get(a.vehicle);
      if (!view) {
        view = new TrainView(a.vehicle, this.glow);
        this.trainViews.set(a.vehicle, view);
        this.dynamic.add(view.group);
      }
      view.update(alpha, this.mapper, this.camera, h);
    }
  }

  /** @param {import('../sim/simulation.js').Simulation} sim */
  syncTrespassers(sim) {
    const g = this.trespasserMeshes;
    while (g.children.length < sim.trespassers.length) {
      const person = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 1.0, 4, 8), new THREE.MeshLambertMaterial({ color: 0x2b3c6b }));
      body.position.y = 0.9;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshLambertMaterial({ color: 0xd9b08c }));
      head.position.y = 1.65;
      const jacket = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.35), new THREE.MeshLambertMaterial({ color: 0x9a2a2a }));
      jacket.position.y = 1.15;
      person.add(body, head, jacket);
      g.add(person);
    }
    sim.trespassers.forEach((t, i) => {
      const mesh = g.children[i];
      mesh.visible = t.state !== 'gone';
      if (mesh.visible) this.mapper.onTrack({ track: t.track, s: t.s }, t.lateral, -0.2, mesh.position);
    });
  }
}
