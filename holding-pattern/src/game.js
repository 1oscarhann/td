import { BALANCE } from './config/balance.js';
import { Events } from './core/events.js';
import { Clock } from './core/clock.js';
import { Renderer } from './render/renderer.js';
import { CameraController } from './render/camera.js';
import { Grid } from './world/grid.js';
import { Ground } from './world/ground.js';
import { Scenery } from './world/scenery.js';
import { StructureRenderer } from './build/structures.js';
import { BuildController } from './build/tools.js';
import { Terminal } from './terminal/terminal.js';
import { TerminalMesh } from './terminal/terminalMesh.js';
import { Economy } from './economy/economy.js';
import { Rating } from './rating/rating.js';
import { UI } from './ui/ui.js';
import { TaxiGraph } from './pathfinding/taxiGraph.js';
import { Reservations } from './pathfinding/reservations.js';
import { ATC } from './atc/atc.js';
import { PlaneManager } from './planes/planeManager.js';
import { Turnarounds } from './planes/turnaround.js';
import { Flights } from './economy/flights.js';
import { PassengerManager } from './passengers/passengerManager.js';
import { JetBridges } from './terminal/jetbridge.js';
import { GroundVehicles } from './planes/groundVehicles.js';
import { RoomMeshes } from './terminal/roomMesh.js';
import { Scheduler } from './economy/schedule.js';
import { Contracts } from './economy/contracts.js';
import { Operations } from './economy/ops.js';

// Wires every system together and runs the frame loop.
export class Game {
  constructor(canvas) {
    this.events = new Events();
    this.clock = new Clock(this.events);
    this.renderer = new Renderer(canvas);
    this.camera = new CameraController(this.renderer.camera, canvas);
    this.grid = new Grid(this.events);
    this.ground = new Ground(this.renderer.scene);
    this.scenery = new Scenery(this.renderer.scene);
    this.structures = new StructureRenderer(this.renderer.scene, this.grid, this.events);
    this.terminal = new Terminal(this);
    this.terminalMesh = new TerminalMesh(this.renderer.scene, this);
    this.economy = new Economy(this.events);
    this.rating = new Rating(this.events);
    this.graph = new TaxiGraph(this);
    this.reservations = new Reservations();
    this.atc = new ATC(this);
    this.planes = new PlaneManager(this);
    this.turnarounds = new Turnarounds(this);
    this.flights = new Flights(this);
    this.contracts = new Contracts(this);
    this.scheduler = new Scheduler(this);
    this.ops = new Operations(this);
    this.passengers = new PassengerManager(this);
    this.jetbridges = new JetBridges(this);
    this.vehicles = new GroundVehicles(this);
    this.roomMeshes = new RoomMeshes(this.renderer.scene, this);
    this.build = new BuildController(this);
    this.ui = new UI(this);
    this.selection = new Selection(this);
    this.debugSpawn = (any) => this.planes.debugSpawn(any);
    // simulation systems with update(simDt), in order
    this.systems = [this.scheduler, this.flights, this.atc, this.planes, this.passengers, this.jetbridges, this.vehicles];
    this.time = 0;
    this.simTime = 0;
    this.frame = 0;
    this.started = false;
    this.bindKeys();
  }

  bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (document.body.classList.contains('title')) return;
      if (e.repeat && e.code !== 'KeyQ' && e.code !== 'KeyE') return;
      switch (e.code) {
        case 'Space':
          e.preventDefault();
          this.clock.togglePause();
          break;
        case 'Digit1':
        case 'Digit2':
        case 'Digit3':
          this.clock.setSpeed(+e.code.slice(-1) - 1);
          break;
        case 'KeyR':
          this.radar?.toggle();
          break;
        case 'Escape':
          if (this.build.tool) this.build.setTool(null);
          else if (this.selection?.plane) this.selection.select(null);
          else this.events.emit('openPause');
          break;
        case 'KeyC':
          this.events.emit('openContracts');
          break;
        case 'KeyB':
          this.events.emit('toggleBoard');
          break;
        case 'KeyP':
          if (e.shiftKey) this.debugSpawn?.(e.ctrlKey || e.metaKey);
          break;
        case 'KeyM':
          if (e.shiftKey) this.economy.earn(100000, 'debug');
          break;
      }
    });
  }

  // The clock races through the small hours while the airport sleeps.
  nightBoost() {
    const h = this.clock.hour;
    const T = BALANCE.time;
    const night = h >= T.nightFrom || h < T.nightTo;
    if (!night || this.planes.size || this.passengers.list.length) return 1;
    return T.nightBoost;
  }

  // Is a structure in use (blocks bulldozing)? Returns a reason or null.
  isBusy(s) {
    for (const sys of this.systems) {
      const r = sys.isBusy?.(s);
      if (r) return r;
    }
    return null;
  }

  isTileBusy(tileIdx) {
    for (const sys of this.systems) {
      const r = sys.isTileBusy?.(tileIdx);
      if (r) return r;
    }
    return null;
  }

  // Advance the simulation by `dt` seconds (already scaled by game speed).
  step(dt) {
    const max = BALANCE.time.maxStep;
    let left = dt;
    while (left > 1e-6) {
      const h = Math.min(max, left);
      left -= h;
      this.simTime += h;
      this.clock.advance(h);
      for (const s of this.systems) s.update(h);
    }
  }

  frameUpdate(realDt) {
    this.time += realDt;
    this.frame++;
    const speed = this.started ? this.clock.speed * (this.nightBoost?.() || 1) : 0;
    if (speed > 0) this.step(Math.min(realDt, 0.1) * speed);
    this.camera.update(realDt, !document.body.classList.contains('title'));
    const focus = this.camera.radarT > 0.5 ? { x: 0, z: 0 } : this.camera.target;
    this.renderer.updateShadow(focus, this.camera.viewDistance());
    this.ground.update(realDt, this.renderer.camera, this.build.tool ? this.build.hoverWorld : null);
    this.structures.update();
    const termTool = ['terminal', 'checkin', 'security', 'lounge'].includes(this.build.tool);
    this.terminalMesh.update(realDt, termTool);
    this.scenery.update(realDt);
    this.planes.visualUpdate(realDt, this.time);
    this.roomMeshes.update();
    this.jetbridges.sync();
    this.passengers.render(this.time, (this.radar?.t ?? 0) < 0.55);
    for (const v of this.visuals || []) v.update(realDt);
    this.ui.update(realDt);
    this.renderer.render(this.time);
  }
}

// Which plane is selected (flight card + ring). Click a plane to select it.
export class Selection {
  constructor(game) {
    this.game = game;
    this.plane = null;
    const dom = game.renderer.canvas;
    let down = null;
    dom.addEventListener('pointerdown', (e) => {
      if (e.button === 0) down = { x: e.clientX, y: e.clientY };
    });
    dom.addEventListener('pointerup', (e) => {
      if (e.button !== 0 || !down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 6 || game.build.tool) return;
      const p = game.radar?.active ? game.radar.pickBlip(e.clientX, e.clientY) : game.planes.pick(game.camera.ray(e.clientX, e.clientY));
      this.select(p);
    });
  }
  select(p) {
    if (this.plane === p) return;
    this.plane = p;
    this.game.events.emit('selected', p);
  }
}
