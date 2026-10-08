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
    this.build = new BuildController(this);
    this.ui = new UI(this);
    this.systems = []; // simulation systems with update(simDt)
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
    for (const v of this.visuals || []) v.update(realDt);
    this.ui.update(realDt);
    this.renderer.render(this.time);
  }
}
