import { ICONS } from './icons.js';
import { AIRLINES } from '../config/airlines.js';
import { PLANE_TYPES } from '../config/planeTypes.js';
import { BALANCE } from '../config/balance.js';
import { css } from '../config/palette.js';
import { fmtClock, fmtTimer } from '../core/math.js';
import { S, WAITING_TO_LAND } from '../planes/states.js';

// Card for the selected plane: airline, flight number, route, status, fuel,
// passengers.
export class FlightCard {
  constructor(ui, parent) {
    this.ui = ui;
    this.game = ui.game;
    const el = document.createElement('div');
    el.id = 'card';
    el.className = 'panel hidden';
    parent.appendChild(el);
    this.el = el;
    this.plane = null;
    this.game.events.on('selected', (p) => this.show(p));
    this.game.events.on('planeRemoved', (p) => {
      if (this.plane === p) this.show(null);
    });
  }

  show(p) {
    this.plane = p;
    this.el.classList.toggle('hidden', !p);
    // the card and the departures board share the right side: fold the board
    const board = document.getElementById('board');
    if (board) {
      if (p && !board.classList.contains('collapsed')) {
        board.classList.add('collapsed');
        this.foldedBoard = true;
      } else if (!p && this.foldedBoard) {
        board.classList.remove('collapsed');
        this.foldedBoard = false;
      }
    }
    if (!p) return;
    const a = AIRLINES[p.airline];
    const t = PLANE_TYPES[p.cls];
    this.el.innerHTML = `
      <div class="top"><span class="swatch" style="background:${css(a.livery.tail)}">${ICONS.plane}</span>
        <div><div class="title" id="cNo"></div><div class="airline">${a.name} · ${t.name}</div></div>
        <button class="btn icon ghost x" title="Close (Esc)">${ICONS.close}</button></div>
      <div class="route"><div><div class="code" id="cFromC"></div><div class="nm" id="cFrom"></div></div><div class="arrow"></div><div style="text-align:right"><div class="code" id="cToC"></div><div class="nm" id="cTo"></div></div></div>
      <div class="rows">
        <div class="cell wide"><div class="k">Status</div><div class="v" id="cSt"></div></div>
        <div class="cell" id="cFuelCell"><div class="k">Fuel</div><div class="v" id="cFuel"></div><div class="meter" id="cFuelM"><i></i></div></div>
        <div class="cell"><div class="k">Passengers</div><div class="v" id="cPax"></div></div>
        <div class="cell"><div class="k" id="cTimeK">Scheduled</div><div class="v" id="cTime"></div></div>
        <div class="cell"><div class="k">Stand</div><div class="v" id="cStand"></div></div>
      </div>`;
    this.el.querySelector('.x').onclick = () => this.game.selection.select(null);
    this.el.querySelector('.title').onclick = () => {
      if (this.plane) this.game.camera.focusOn(this.plane.pos.x, this.plane.pos.z);
    };
    this.update(1, true);
  }

  update(dt, force = false) {
    const p = this.plane;
    if (!p) return;
    this.t = (this.t || 0) - dt;
    if (!force && this.t > 0) return;
    this.t = 0.2;
    const f = p.flight;
    const dep = p.isDeparting() || p.state === S.PARKED;
    const q = (id) => this.el.querySelector(id);
    q('#cNo').textContent = dep ? f.outNo : f.inNo;
    const here = ['HOM', 'Here'];
    const from = dep ? here : f.from, to = dep ? f.to : here;
    q('#cFromC').textContent = from[0];
    q('#cFrom').textContent = dep ? 'This airport' : from[1];
    q('#cToC').textContent = to[0];
    q('#cTo').textContent = dep ? to[1] : 'This airport';
    q('#cSt').textContent = p.statusText();
    const waiting = WAITING_TO_LAND.has(p.state) || p.state === S.APPROACH;
    q('#cFuelCell').style.display = waiting ? 'block' : 'none';
    if (waiting) {
      q('#cFuel').textContent = fmtTimer(p.fuel);
      const m = q('#cFuelM');
      m.className = 'meter ' + (p.fuel < BALANCE.fuel.red ? 'red' : p.fuel < BALANCE.fuel.amber ? 'amber' : '');
      m.firstElementChild.style.width = Math.max(0, Math.min(100, (p.fuel / p.fuelMax) * 100)) + '%';
    }
    const seats = PLANE_TYPES[p.cls].seats;
    let onboard;
    if (p.state === S.PARKED) onboard = p.turnaround ? p.turnaround.paxOnboard : 0;
    else if (dep) onboard = f.depBoarded;
    else onboard = f.arrPax;
    q('#cPax').textContent = `${onboard} / ${seats}`;
    q('#cTimeK').textContent = dep ? 'Departs' : 'Arrives';
    const sched = dep ? f.std : f.sta;
    const late = dep && f.etd && f.etd > f.std + BALANCE.turnaround.onTimeGraceMin ? ` (exp ${fmtClock(f.etd)})` : '';
    q('#cTime').textContent = fmtClock(sched) + late;
    const stand = f.standId ? this.game.grid.structures.get(f.standId) : null;
    q('#cStand').textContent = stand ? stand.label : '--';
  }
}

// Floating tags above planes waiting to land (amber/red when fuel is short).
export class PlaneLabels {
  constructor(ui) {
    this.game = ui.game;
    this.root = document.getElementById('labels');
    this.tags = new Map();
  }

  update() {
    const g = this.game;
    const cam = g.renderer.camera;
    const live = new Set();
    const show = (g.radar?.t ?? 0) < 0.3;
    if (show) {
      for (const p of g.planes.values()) {
        if (!(WAITING_TO_LAND.has(p.state) || p.state === S.APPROACH || p.state === S.DIVERTED)) continue;
        const v = p.root.position.clone();
        v.y += 8;
        v.project(cam);
        if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) continue;
        live.add(p.id);
        let tag = this.tags.get(p.id);
        if (!tag) {
          tag = document.createElement('div');
          tag.className = 'plabel';
          this.root.appendChild(tag);
          this.tags.set(p.id, tag);
        }
        const x = ((v.x + 1) / 2) * window.innerWidth, y = ((1 - v.y) / 2) * window.innerHeight;
        tag.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
        const red = p.fuel < BALANCE.fuel.red || p.state === S.DIVERTED, amber = p.fuel < BALANCE.fuel.amber;
        const cls = 'plabel' + (red ? ' red' : amber ? ' amber' : '');
        if (tag.className !== cls) tag.className = cls;
        const txt = p.state === S.DIVERTED ? `${p.flight.inNo} · diverting` : `${p.flight.inNo} · ${fmtTimer(p.fuel)}`;
        if (tag.textContent !== txt) tag.textContent = txt;
      }
    }
    for (const [id, tag] of this.tags) {
      if (!live.has(id)) {
        tag.remove();
        this.tags.delete(id);
      }
    }
  }
}
