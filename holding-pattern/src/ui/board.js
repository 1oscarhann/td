import { ICONS } from './icons.js';
import { fmtClock } from '../core/math.js';
import { BALANCE } from '../config/balance.js';

const COLS = [
  { key: 'time', n: 5 },
  { key: 'flight', n: 6 },
  { key: 'place', n: 11 },
  { key: 'gate', n: 3 },
  { key: 'status', n: 9 },
];
const ROWS = 7;
const FLAP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:';

// Split-flap departures (and arrivals) board, bottom right.
export class Board {
  constructor(ui, root) {
    this.ui = ui;
    this.game = ui.game;
    const el = document.createElement('div');
    el.id = 'board';
    el.className = 'ia';
    el.innerHTML = `
      <div class="bhead">${ICONS.board}<span id="bTitle">Departures</span>
        <div class="tabs"><button data-tab="dep" class="on">Departures</button><button data-tab="arr">Arrivals</button></div>
        <svg class="chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 15l6-6 6 6"/></svg>
      </div>
      <div class="rows">
        <div class="frow h"><span>Time</span><span>Flight</span><span id="bPlace">Destination</span><span>Gate</span><span>Status</span></div>
        <div id="bRows"></div>
        <div class="none" id="bNone">No flights scheduled yet. Build a runway, taxiway and stand to open for business.</div>
      </div>`;
    root.appendChild(el);
    this.el = el;
    this.tab = 'dep';
    this.$rows = el.querySelector('#bRows');
    this.$none = el.querySelector('#bNone');
    this.cells = [];
    for (let r = 0; r < ROWS; r++) {
      const row = document.createElement('div');
      row.className = 'frow';
      const fields = COLS.map((c) => {
        const f = document.createElement('div');
        f.className = 'flap' + (c.key === 'status' ? ' st' : '');
        const spans = [];
        for (let i = 0; i < c.n; i++) {
          const s = document.createElement('span');
          s.textContent = ' ';
          f.appendChild(s);
          spans.push(s);
        }
        row.appendChild(f);
        return { el: f, spans, text: ''.padEnd(c.n) };
      });
      this.$rows.appendChild(row);
      this.cells.push({ row, fields });
    }
    el.querySelector('.bhead').addEventListener('click', (e) => {
      const tab = e.target.closest('[data-tab]');
      if (tab) {
        this.tab = tab.dataset.tab;
        el.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === this.tab));
        el.querySelector('#bTitle').textContent = this.tab === 'dep' ? 'Departures' : 'Arrivals';
        el.querySelector('#bPlace').textContent = this.tab === 'dep' ? 'Destination' : 'From';
        this.timer = 0;
        e.stopPropagation();
        return;
      }
      el.classList.toggle('collapsed');
    });
    this.game.events.on('toggleBoard', () => el.classList.toggle('collapsed'));
    this.timer = 0;
  }

  depStatus(f) {
    const now = this.game.clock.abs;
    const grace = BALANCE.turnaround.onTimeGraceMin;
    if (f.status === 'diverted' || f.status === 'cancelled') return ['Diverted', 'bad'];
    if (f.status === 'departed') return ['Departed', 'dim'];
    if (f.status === 'boarding') return ['Boarding', 'good'];
    const etd = Math.max(f.etd ?? f.std, f.status === 'scheduled' || f.status === 'inbound' ? (f.landedAt ?? f.sta) + BALANCE.turnaround.scheduledMin[f.cls] * 0.8 : 0);
    if ((f.status === 'inbound' && now > f.sta + grace) || etd > f.std + grace || now > f.std + grace) return ['Delayed', 'warn'];
    return ['On time', 'good'];
  }

  arrStatus(f) {
    const now = this.game.clock.abs;
    const plane = f.planeId ? this.game.planes.get(f.planeId) : null;
    if (f.status === 'diverted') return ['Diverted', 'bad'];
    if (f.landedAt) return ['Landed', 'dim'];
    if (plane && (plane.state === 'holding' || plane.state === 'goAround')) return ['Holding', 'warn'];
    if (plane && (plane.state === 'approach' || plane.state === 'landing')) return ['Landing', 'good'];
    if (now > f.sta + BALANCE.turnaround.onTimeGraceMin) return ['Delayed', 'warn'];
    return ['On time', 'good'];
  }

  rowsFor() {
    const now = this.game.clock.abs;
    const list = this.game.flights.list;
    const grid = this.game.grid;
    const gate = (f) => {
      const s = f.standId ? grid.structures.get(f.standId) : null;
      return s ? s.label : '--';
    };
    if (this.tab === 'dep') {
      return list
        .filter((f) => (f.status === 'departed' ? now - (f.pushedAt ?? f.std) < 40 : f.status === 'diverted' ? now - f.std < 60 : true))
        .sort((a, b) => a.std - b.std)
        .slice(0, ROWS)
        .map((f) => {
          const [st, cls] = this.depStatus(f);
          return { time: fmtClock(f.std), flight: f.outNo.replace(' ', ''), place: f.to[1], gate: gate(f), status: st, cls };
        });
    }
    return list
      .filter((f) => (f.landedAt ? now - f.landedAt < 30 : f.status === 'diverted' ? now - f.sta < 60 : true))
      .sort((a, b) => a.sta - b.sta)
      .slice(0, ROWS)
      .map((f) => {
        const [st, cls] = this.arrStatus(f);
        return { time: fmtClock(f.sta), flight: f.inNo.replace(' ', ''), place: f.from[1], gate: gate(f), status: st, cls };
      });
  }

  update(dt) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.6;
    const rows = this.rowsFor();
    this.$none.style.display = rows.length ? 'none' : 'block';
    this.cells.forEach((c, i) => {
      const r = rows[i];
      c.row.style.display = r ? 'grid' : 'none';
      if (!r) return;
      COLS.forEach((col, k) => {
        const f = c.fields[k];
        const txt = String(r[col.key]).toUpperCase().slice(0, col.n).padEnd(col.n);
        if (col.key === 'status') f.el.className = `flap st ${r.cls}`;
        if (txt === f.text) return;
        f.text = txt;
        for (let j = 0; j < col.n; j++) this.flip(f.spans[j], txt[j]);
      });
    });
  }

  // flick through a couple of random characters before settling
  flip(span, ch) {
    const final = ch === ' ' ? ' ' : ch;
    if (span.textContent === final) return;
    if (span._t) clearTimeout(span._t);
    let n = 2 + ((Math.random() * 3) | 0);
    const step = () => {
      span.classList.remove('flip');
      void span.offsetWidth;
      span.classList.add('flip');
      if (n-- > 0) {
        span.textContent = FLAP[(Math.random() * FLAP.length) | 0];
        span._t = setTimeout(step, 55);
      } else {
        span.textContent = final;
        span._t = null;
      }
    };
    step();
  }
}
