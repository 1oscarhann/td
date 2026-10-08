import { BALANCE } from '../config/balance.js';
import { DIRS } from '../world/grid.js';
import { Ghost } from './ghost.js';
import { checkRunway, checkTaxiway, checkStand, checkTerminal, checkRoom, checkBulldoze } from './validate.js';
import { applyRunway, applyTaxiway, applyStand, applyTerminal, applyRoom, applyBulldoze } from './actions.js';

const C = BALANCE.costs;

export const TOOL_DEFS = [
  { id: 'runway', label: 'Runway', group: 'Airside', cost: `£${C.runwayPerTile}/tile`, drag: 'line', hint: 'Drag a straight line. Planes land in the direction you drag.' },
  { id: 'taxiway', label: 'Taxiway', group: 'Airside', cost: `£${C.taxiwayPerTile}/tile`, drag: 'path', hint: 'Drag to draw. Must connect to a runway.' },
  { id: 'stand', label: 'Stand', group: 'Airside', cost: `£${(C.stand / 1000).toFixed(0)}k`, sized: true, rotates: true, hint: 'Remote parking. Its back must face a taxiway.' },
  { id: 'gate', label: 'Gate', group: 'Airside', cost: `£${(C.gate / 1000).toFixed(0)}k`, sized: true, rotates: true, hint: 'Stand with a jet bridge. Back on a taxiway, nose touching the terminal.' },
  { id: 'terminal', label: 'Terminal', group: 'Terminal', cost: `£${C.terminalPerTile}/tile`, drag: 'rect', hint: 'Drag a rectangle of terminal floor. Doors open on the south side.' },
  { id: 'checkin', label: 'Check-in', group: 'Terminal', cost: `£${(C.checkin / 1000).toFixed(0)}k`, rotates: true, hint: 'A desk. Its open end must face terminal floor.' },
  { id: 'security', label: 'Security', group: 'Terminal', cost: `£${(C.security / 1000).toFixed(0)}k`, rotates: true, hint: 'A lane. Needs open floor at both ends.' },
  { id: 'lounge', label: 'Gate lounge', group: 'Terminal', cost: `£${(C.lounge / 1000).toFixed(0)}k`, hint: 'Where passengers wait to board. Put it near your gates.' },
  { id: 'bulldoze', label: 'Bulldoze', group: 'Tools', cost: '50% back', drag: 'rect', hint: 'Drag over anything to remove it. Refunds half.' },
];

// Owns the active build tool: hover, drag, ghost preview and placement.
export class BuildController {
  constructor(game) {
    this.game = game;
    this.ghost = new Ghost(game.renderer.scene);
    this.tool = null;
    this.size = 'S';
    this.rot = 2;
    this.autoRot = true;
    this.hover = null; // tile under cursor
    this.hoverWorld = null;
    this.anchor = null;
    this.result = null;
    this.pointer = { x: 0, y: 0, inside: false };
    this.dragging = false;
    this.bind();
  }

  get def() {
    return TOOL_DEFS.find((t) => t.id === this.tool) || null;
  }

  setTool(id) {
    if (this.tool === id) id = null;
    this.tool = id;
    this.anchor = null;
    this.dragging = false;
    this.autoRot = true;
    this.game.camera.leftRotates = !id;
    this.game.camera.rotateKeys = !id || !this.def?.rotates;
    this.game.ground.showGrid(!!id);
    if (!id) this.ghost.hide();
    this.game.events.emit('toolChanged', id);
    this.refresh();
  }

  setSize(s) {
    this.size = s;
    this.game.events.emit('toolChanged', this.tool);
    this.refresh();
  }

  rotate(dir = 1) {
    this.rot = (this.rot + dir + 4) % 4;
    this.autoRot = false;
    this.refresh();
  }

  bind() {
    const dom = this.game.renderer.canvas;
    dom.addEventListener('pointermove', (e) => {
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      this.pointer.inside = true;
      this.updateHover();
    });
    dom.addEventListener('pointerleave', () => {
      this.pointer.inside = false;
      if (!this.dragging) {
        this.hover = null;
        this.refresh();
      }
    });
    dom.addEventListener('pointerdown', (e) => {
      if (!this.tool || e.altKey) return;
      if (e.button === 2 && this.anchor) {
        // right-click cancels a drag in progress
        this.anchor = null;
        this.dragging = false;
        this.refresh();
        return;
      }
      if (e.button !== 0) return;
      this.updateHover();
      if (!this.hover) return;
      const def = this.def;
      if (def.drag) {
        this.anchor = { ...this.hover };
        this.dragging = true;
        dom.setPointerCapture?.(e.pointerId);
        this.refresh();
      } else {
        this.commit();
      }
    });
    dom.addEventListener('pointerup', (e) => {
      if (e.button !== 0 || !this.dragging) return;
      this.dragging = false;
      this.updateHover();
      this.commit();
      this.anchor = null;
      this.refresh();
    });
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (!this.tool) return;
      if (e.code === 'KeyQ') this.rotate(-1);
      else if (e.code === 'KeyE') this.rotate(1);
    });
  }

  updateHover() {
    const p = this.game.camera.groundAt(this.pointer.x, this.pointer.y);
    if (!p) {
      this.hover = null;
      this.hoverWorld = null;
    } else {
      const t = this.game.grid.tileAt(p.x, p.z);
      this.hoverWorld = p;
      const changed = !this.hover || this.hover.tx !== t.tx || this.hover.tz !== t.tz;
      this.hover = t;
      if (!changed) return;
    }
    this.refresh();
  }

  // re-run validation for the current hover/drag and redraw the ghost
  refresh() {
    const game = this.game;
    if (!this.tool || !this.hover || this.game.radar?.active) {
      this.result = null;
      this.ghost.hide();
      game.events.emit('buildPreview', null);
      return;
    }
    const a = this.anchor || this.hover;
    const b = this.hover;
    let res;
    switch (this.tool) {
      case 'runway':
        res = this.anchor ? checkRunway(game, a, b) : { ok: false, reason: null, tiles: [[b.tx, b.tz, 'ok']], cost: 0, info: 'Click and drag to lay a runway' };
        break;
      case 'taxiway':
        res = checkTaxiway(game, a, b);
        break;
      case 'stand':
      case 'gate':
        res = checkStand(game, b, this.size, this.rot, this.tool === 'gate', this.autoRot);
        break;
      case 'terminal':
        res = checkTerminal(game, a, b);
        break;
      case 'checkin':
      case 'security':
      case 'lounge':
        res = checkRoom(game, this.tool, b, this.rot, this.autoRot);
        break;
      case 'bulldoze':
        res = checkBulldoze(game, a, b);
        break;
    }
    this.result = res;
    this.ghost.show(res.tiles, game.grid, this.tool === 'checkin' || this.tool === 'security' || this.tool === 'lounge' ? 1.0 : 0.6);
    this.ghost.showArrows(this.arrowsFor(res));
    game.events.emit('buildPreview', res);
  }

  arrowsFor(res) {
    const grid = this.game.grid;
    if ((this.tool === 'stand' || this.tool === 'gate') && res.links) {
      const c = (res.n - 1) / 2;
      const [fx, fz] = DIRS[res.rot];
      return [{ x: grid.wx(res.tx + c), z: grid.wz(res.tz + c), yaw: Math.atan2(fx, fz), scale: res.n * 1.1 }];
    }
    if ((this.tool === 'checkin' || this.tool === 'security') && res.tx !== undefined) {
      const [fx, fz] = DIRS[res.rot];
      const cx = grid.wx(res.tx) + ((res.w - 1) * 10) / 2, cz = grid.wz(res.tz) + ((res.h - 1) * 10) / 2;
      // arrow shows the direction passengers walk in (from the open end)
      return [{ x: cx, z: cz, yaw: Math.atan2(-fx, -fz), scale: 1.4 }];
    }
    if (this.tool === 'runway' && res.start && res.length) {
      const s = res.start, e = res.end;
      const dx = Math.sign(e.tx - s.tx), dz = Math.sign(e.tz - s.tz);
      const yaw = Math.atan2(dx, dz);
      const mid = { x: (grid.wx(s.tx) + grid.wx(e.tx)) / 2, z: (grid.wz(s.tz) + grid.wz(e.tz)) / 2 };
      return [
        { x: grid.wx(s.tx) + dx * 30, z: grid.wz(s.tz) + dz * 30, yaw, scale: 3 },
        { x: mid.x, z: mid.z, yaw, scale: 3 },
      ];
    }
    return [];
  }

  commit() {
    const res = this.result;
    const game = this.game;
    if (!res) return;
    if (!res.ok) {
      if (res.reason) game.events.emit('buildRejected', res.reason);
      return;
    }
    switch (this.tool) {
      case 'runway':
        applyRunway(game, res);
        break;
      case 'taxiway':
        applyTaxiway(game, res);
        break;
      case 'stand':
      case 'gate':
        applyStand(game, res);
        break;
      case 'terminal':
        applyTerminal(game, res);
        break;
      case 'checkin':
      case 'security':
      case 'lounge':
        applyRoom(game, res);
        break;
      case 'bulldoze':
        applyBulldoze(game, res);
        break;
    }
    game.events.emit('placed', this.tool, res);
    this.anchor = null;
    this.refresh();
  }
}
