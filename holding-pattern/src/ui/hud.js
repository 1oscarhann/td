import { ICONS, star } from './icons.js';
import { money, fmtClock } from '../core/math.js';
import { BALANCE } from '../config/balance.js';

// Top bar: brand, money, rating, date/time, speed, radar, contracts, menu.
export class Hud {
  constructor(ui, root) {
    this.ui = ui;
    this.game = ui.game;
    const el = document.createElement('div');
    el.id = 'topbar';
    el.innerHTML = `
      <div class="panel brand"><span class="logo">${ICONS.plane}</span><span>Holding Pattern</span></div>
      <div class="panel stats">
        <div class="stat"><div><div class="k">Money</div><div class="v" id="money">£0</div></div></div>
        <div class="stat"><div><div class="k">Rating</div><div class="stars" id="stars"></div></div></div>
        <div class="stat"><div class="clock"><div class="k" id="day">Day 1</div><div class="v" id="time">06:00</div></div></div>
      </div>
      <div class="panel controls">
        <button class="btn icon" id="pauseBtn" title="Pause (Space)">${ICONS.pause}</button>
        ${BALANCE.time.speeds.map((s, i) => `<button class="btn spd" data-i="${i}" title="${s}x speed (${i + 1})">${s}×</button>`).join('')}
        <span class="sep"></span>
        <button class="btn icon" id="radarBtn" title="Radar (R)">${ICONS.radar}</button>
        <button class="btn icon" id="contractsBtn" title="Contracts (C)">${ICONS.contract}<span class="badge" id="cBadge" style="display:none">0</span></button>
        <button class="btn icon" id="menuBtn" title="Menu (Esc)">${ICONS.menu}</button>
      </div>`;
    root.appendChild(el);
    this.el = el;
    this.$money = el.querySelector('#money');
    this.$stars = el.querySelector('#stars');
    this.$day = el.querySelector('#day');
    this.$time = el.querySelector('#time');
    this.$pause = el.querySelector('#pauseBtn');
    this.$spd = [...el.querySelectorAll('.spd')];
    this.$badge = el.querySelector('#cBadge');
    this.$radar = el.querySelector('#radarBtn');
    this.$pause.onclick = () => this.game.clock.togglePause();
    this.$spd.forEach((b) => (b.onclick = () => this.game.clock.setSpeed(+b.dataset.i)));
    this.$radar.onclick = () => this.game.radar?.toggle();
    el.querySelector('#contractsBtn').onclick = () => ui.openContracts();
    el.querySelector('#menuBtn').onclick = () => ui.openPause();
    this.game.events.on('speed', () => this.syncSpeed());
    this.game.events.on('money', (delta, cat, silent) => {
      if (!silent && Math.abs(delta) >= 500) {
        this.$money.classList.remove('bump');
        void this.$money.offsetWidth;
        this.$money.classList.add('bump');
      }
    });
    this.last = {};
    this.syncSpeed();
  }

  syncSpeed() {
    const c = this.game.clock;
    this.$pause.innerHTML = c.paused ? ICONS.play : ICONS.pause;
    this.$pause.classList.toggle('on', c.paused);
    this.$spd.forEach((b, i) => b.classList.toggle('on', !c.paused && i === c.speedIndex));
  }

  update() {
    const g = this.game;
    const m = Math.round(g.economy.money);
    if (this.last.money !== m) {
      this.last.money = m;
      this.$money.textContent = money(m);
      this.$money.classList.toggle('neg', m < 0);
    }
    const r = Math.round(g.rating.value * 10) / 10;
    if (this.last.rating !== r) {
      this.last.rating = r;
      let html = '';
      for (let i = 0; i < 5; i++) html += star(Math.max(0, Math.min(1, g.rating.value - i)) * 100, 17);
      this.$stars.innerHTML = html;
      this.$stars.title = `${g.rating.value.toFixed(2)} stars`;
    }
    const day = g.clock.day;
    if (this.last.day !== day) {
      this.last.day = day;
      this.$day.textContent = `Day ${day}`;
    }
    const t = fmtClock(g.clock.minute);
    if (this.last.time !== t) {
      this.last.time = t;
      this.$time.textContent = t;
    }
    const n = g.contracts ? g.contracts.offers.length : 0;
    if (this.last.badge !== n) {
      this.last.badge = n;
      this.$badge.style.display = n ? 'grid' : 'none';
      this.$badge.textContent = n;
    }
    this.$radar.classList.toggle('on', !!g.radar?.active);
  }
}
