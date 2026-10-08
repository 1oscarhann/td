import { ICONS } from './icons.js';
import { AIRLINES } from '../config/airlines.js';
import { PLANE_TYPES } from '../config/planeTypes.js';
import { BALANCE } from '../config/balance.js';
import { css } from '../config/palette.js';
import { fmtTimer } from '../core/math.js';
import { S, STATE_LABEL } from '../planes/states.js';

// Landing queue, always visible on the right. Rows are draggable: the order
// is the order planes are cleared to land. Cleared planes show above.
export class QueuePanel {
  constructor(ui, parent) {
    this.ui = ui;
    this.game = ui.game;
    const el = document.createElement('div');
    el.id = 'queue';
    el.className = 'panel';
    el.innerHTML = `<div class="phead">${ICONS.plane}<span>Landing queue</span><span class="sub" id="qCount"></span></div>
      <div class="list" id="qList"></div>
      <div class="qfoot" id="qFoot">Drag to reorder. The top plane is cleared next.</div>`;
    parent.appendChild(el);
    this.el = el;
    this.$list = el.querySelector('#qList');
    this.$count = el.querySelector('#qCount');
    this.$foot = el.querySelector('#qFoot');
    this.rows = new Map(); // planeId -> row element
    this.drag = null;
    this.timer = 0;
    this.game.events.on('queueChanged', () => (this.timer = 0));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
  }

  statusOf(p) {
    const red = BALANCE.fuel.red, amber = BALANCE.fuel.amber;
    if (p.state === S.APPROACH || p.state === S.LANDING) return { text: `Landing in ${Math.max(0, Math.round(p.touchdownAt - this.game.simTime))}s`, cls: '' };
    if (p.fuel < red) return { text: 'MAYDAY: must land next', cls: 'bad' };
    if (p.state === S.GO_AROUND) return { text: `Go-around${p.ga?.reason ? ': ' + p.ga.reason.toLowerCase() : ''}`, cls: 'bad' };
    const note = p.atcNote;
    if (note && note !== 'Sequenced') return { text: note, cls: note.startsWith('Waiting') || note.startsWith('Needs') || note.startsWith('No') || note.startsWith('Runway') ? 'warn' : '' };
    if (p.fuel < amber) return { text: 'Low fuel', cls: 'warn' };
    if (p.state === S.INBOUND) return { text: note === 'Sequenced' ? 'Inbound · sequenced' : 'Inbound', cls: '' };
    return { text: note === 'Sequenced' ? 'Holding · sequenced' : STATE_LABEL[p.state], cls: '' };
  }

  makeRow(p) {
    const row = document.createElement('div');
    row.className = 'qrow';
    row.dataset.id = p.id;
    const a = AIRLINES[p.airline];
    row.innerHTML = `<span class="grip" title="Drag to reorder">${ICONS.grip}</span><span class="bar" style="background:${css(a.livery.tail)}"></span>
      <div><div class="fl"><span class="no"></span><span class="cls">${PLANE_TYPES[p.cls].short}</span></div><div class="st"></div></div>
      <div class="side"><span class="ft"></span><div class="fuel"><i></i></div><span class="rw"></span></div>`;
    row.querySelector('.grip').addEventListener('pointerdown', (e) => this.onDown(e, p.id, row));
    row.addEventListener('click', (e) => {
      if (e.target.closest('.rwy') || this.justDragged) return;
      const plane = this.game.planes.get(+row.dataset.id);
      if (plane) this.game.selection.select(plane);
    });
    return row;
  }

  onDown(e, id, row) {
    e.preventDefault();
    e.stopPropagation();
    const plane = this.game.planes.get(id);
    if (!plane || !this.game.atc.queue.includes(id)) return;
    const rect = row.getBoundingClientRect();
    const ghost = row.cloneNode(true);
    ghost.classList.add('ghost');
    ghost.style.width = rect.width + 'px';
    ghost.style.left = rect.left + 'px';
    ghost.style.top = rect.top + 'px';
    document.body.appendChild(ghost);
    row.classList.add('dragging');
    this.drag = { id, row, ghost, dy: e.clientY - rect.top, index: this.game.atc.queue.indexOf(id) };
    this.drop = document.createElement('div');
    this.drop.className = 'qdrop';
  }

  onMove(e) {
    const d = this.drag;
    if (!d) return;
    d.ghost.style.top = e.clientY - d.dy + 'px';
    // work out the insertion point among the queued rows
    const queued = this.game.atc.queue.map((id) => this.rows.get(id)).filter(Boolean);
    let index = queued.length;
    for (let i = 0; i < queued.length; i++) {
      const r = queued[i].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) {
        index = i;
        break;
      }
    }
    d.index = index;
    const before = queued[index];
    if (before) this.$list.insertBefore(this.drop, before);
    else if (queued.length) queued[queued.length - 1].after(this.drop);
  }

  onUp() {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    d.ghost.remove();
    d.row.classList.remove('dragging');
    this.drop?.remove();
    const q = this.game.atc.queue;
    const from = q.indexOf(d.id);
    let to = d.index;
    if (from >= 0 && to > from) to--;
    if (from !== to && from >= 0) {
      this.game.atc.move(d.id, to);
      this.game.events.emit('queueReordered', d.id, to);
    }
    this.justDragged = true;
    setTimeout(() => (this.justDragged = false), 50);
    this.timer = 0;
  }

  update(dt) {
    this.timer -= dt;
    if (this.drag || this.timer > 0) return;
    this.timer = 0.25;
    const g = this.game;
    const approaching = [...g.planes.values()].filter((p) => p.state === S.APPROACH || p.state === S.LANDING).sort((a, b) => a.touchdownAt - b.touchdownAt);
    const queued = g.atc.queuedPlanes();
    const order = [...approaching, ...queued];
    const live = new Set(order.map((p) => p.id));
    for (const [id, row] of this.rows) {
      if (!live.has(id)) {
        row.remove();
        this.rows.delete(id);
      }
    }
    const runways = g.grid.runways;
    const sel = g.selection?.plane;
    let prev = null;
    for (const p of order) {
      let row = this.rows.get(p.id);
      if (!row) {
        row = this.makeRow(p);
        this.rows.set(p.id, row);
      }
      // keep DOM order in sync
      if (prev ? prev.nextSibling !== row : this.$list.firstChild !== row) {
        if (prev) prev.after(row);
        else this.$list.prepend(row);
      }
      prev = row;
      const cleared = p.state === S.APPROACH || p.state === S.LANDING;
      row.classList.toggle('sel', sel === p);
      row.style.opacity = cleared ? 0.72 : 1;
      row.querySelector('.grip').style.visibility = cleared ? 'hidden' : 'visible';
      row.querySelector('.no').textContent = p.flight.inNo;
      const st = this.statusOf(p);
      const stEl = row.querySelector('.st');
      stEl.textContent = st.text;
      stEl.className = 'st ' + st.cls;
      const frac = Math.max(0, Math.min(1, p.fuel / Math.max(p.fuelMax, 1)));
      const fuelCls = p.fuel < BALANCE.fuel.red ? 'red' : p.fuel < BALANCE.fuel.amber ? 'amber' : '';
      const fuel = row.querySelector('.fuel');
      fuel.className = 'fuel ' + fuelCls;
      fuel.firstElementChild.style.width = frac * 100 + '%';
      const ft = row.querySelector('.ft');
      ft.textContent = fmtTimer(p.fuel);
      ft.className = 'ft ' + fuelCls;
      // runway picker once there's a choice
      const rw = row.querySelector('.rw');
      const usable = runways.filter((r) => r.length >= PLANE_TYPES[p.cls].runway);
      if (usable.length > 1 && !cleared) {
        const cur = p.runwayId ? g.grid.structures.get(p.runwayId) : null;
        const label = cur ? `RWY ${cur.nums[0]}` : 'RWY auto';
        if (!rw.firstChild || rw.firstChild.textContent !== label) {
          rw.innerHTML = `<button class="rwy" title="Pick a runway for this arrival">${label}</button>`;
          rw.firstChild.onclick = (e) => {
            e.stopPropagation();
            const ids = [null, ...usable.map((r) => r.id)];
            const i = ids.indexOf(p.runwayId ?? null);
            p.runwayId = ids[(i + 1) % ids.length];
            this.timer = 0;
          };
        }
      } else if (rw.firstChild) rw.innerHTML = cleared && p.runway && runways.length > 1 ? `<span class="ft">RWY ${p.runway.nums[0]}</span>` : '';
    }
    this.$count.textContent = order.length ? `${queued.length} waiting` : '';
    if (!order.length) {
      if (!this.$list.querySelector('.empty')) this.$list.innerHTML = `<div class="empty">No arrivals right now. Inbound flights appear here with their fuel. Drag them to set the landing order.</div>`;
    } else this.$list.querySelector('.empty')?.remove();
    this.$foot.style.display = queued.length > 1 ? 'block' : 'none';
  }
}
