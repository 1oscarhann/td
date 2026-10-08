import { AIRLINES } from '../config/airlines.js';
import { PLANE_TYPES } from '../config/planeTypes.js';
import { css } from '../config/palette.js';
import { money, fmtClock } from '../core/math.js';

// Contracts dialog plus the notifications for offers, completions and the
// end-of-day books.
export class ContractsUI {
  constructor(ui) {
    this.ui = ui;
    this.game = ui.game;
    const ev = this.game.events;
    ev.on('openContracts', () => this.open());
    ev.on('contractOffer', (o) => {
      const a = AIRLINES[o.airline];
      ui.toast(`New contract offer from ${a.name}`, { kind: 'gold', icon: 'contract', sub: `${o.perDay} flights a day for ${o.days} days · press C`, ms: 6000 });
    });
    ev.on('contractCompleted', (c, ok, text) => ui.toast(text, { kind: ok ? 'good' : 'warn', icon: 'contract', ms: 6000 }));
    ev.on('contractAccepted', (c) => ui.toast(`${AIRLINES[c.airline].name} contract signed`, { kind: 'good', icon: 'contract', sub: `${c.perDay} flights a day, day ${c.startDay}–${c.endDay}` }));
    ev.on('daySummary', (s) => {
      const net = s.net;
      ui.toast(`Day ${s.day} closed: ${net >= 0 ? '+' : ''}${money(net)}`, {
        kind: net >= 0 ? 'good' : 'bad',
        icon: 'coin',
        sub: `Income ${money(s.income)} · costs ${money(s.expenses)} (wages ${money(s.wages.total)}) · ${s.ops.departures} departures`,
        ms: 7000,
      });
    });
  }

  card(o, active) {
    const a = AIRLINES[o.airline];
    const t = PLANE_TYPES[o.cls];
    const req = this.game.contracts.requirement(o);
    const bar = `<span class="bar" style="background:${css(a.livery.tail)}"></span>`;
    if (active) {
      const pct = o.flown ? Math.round((o.onTime / o.flown) * 100) : 100;
      const day = this.game.clock.day;
      const progress = Math.min(1, Math.max(0, (day - o.startDay) / o.days));
      return `<div class="contract">${bar}<div><div class="nm">${a.name} · ${t.name}</div>
        <div class="d">${o.perDay} a day · days ${o.startDay}–${o.endDay} · <b>${o.flown}</b> flown, <b>${pct}%</b> on time</div>
        <div class="d">Bonus ${money(o.bonusPerFlight)} per on-time departure, ${money(o.completionBonus)} at 80%+ on time</div>
        ${req ? `<div class="req">${req}</div>` : ''}
        <div class="prog"><i style="width:${progress * 100}%"></i></div></div><div></div></div>`;
    }
    return `<div class="contract">${bar}<div><div class="nm">${a.name} wants ${o.perDay} ${t.name.toLowerCase()} flights a day for ${o.days} days</div>
      <div class="d">${a.type} · ${a.blurb}</div>
      <div class="d">Bonus <b>${money(o.bonusPerFlight)}</b> per on-time departure, <b>${money(o.completionBonus)}</b> if 80%+ leave on time</div>
      ${req ? `<div class="req">${req}</div>` : ''}
      <div class="d">Offer ends ${fmtClock(o.expiresAt)}</div></div>
      <div class="acts"><button class="btn primary" data-accept="${o.id}">Accept</button><button class="btn" data-decline="${o.id}">Decline</button></div></div>`;
  }

  open() {
    const c = this.game.contracts;
    const html = `<h2>Contracts</h2>
      <p>Airlines want slots at your airport. Accepted contracts add flights to the timetable. Leave on time to earn the bonuses.</p>
      <div class="sect">Offers</div>
      ${c.offers.length ? c.offers.map((o) => this.card(o, false)).join('') : `<p class="note">No offers right now. New ones arrive each morning at 07:00, and better airlines come calling as your rating rises.</p>`}
      <div class="sect">Active</div>
      ${c.active.length ? c.active.map((o) => this.card(o, true)).join('') : '<p class="note">No active contracts.</p>'}
      <div class="actions"><button class="btn" data-close>Close</button></div>`;
    this.ui.modal.show(html, {
      wide: true,
      key: 'contracts',
      onMount: (el) => {
        el.querySelectorAll('[data-accept]').forEach((b) => (b.onclick = () => {
          c.accept(+b.dataset.accept);
          this.open();
        }));
        el.querySelectorAll('[data-decline]').forEach((b) => (b.onclick = () => {
          c.decline(+b.dataset.decline);
          this.open();
        }));
        el.querySelector('[data-close]').onclick = () => this.ui.modal.close();
      },
    });
  }
}
